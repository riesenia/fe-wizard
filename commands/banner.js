import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import clipboard from 'clipboardy';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { rootDir, toCamelCase, toLowerCamelCase, cancel, validatePositiveInt } from '../utils.js';

const BANNER_OPTIONS = [
    'select_category', 'select_product', 'select_campaign',
    'show_all', 'random', 'products_banner', 'products_listing_banner',
    'campaigns_banner', 'language_active',
];

function parseEnv(content) {
    const result = {};
    for (const line of content.split('\n')) {
        const match = line.match(/^export\s+(\w+)=["']?([^"'\n#]*)["']?/);
        if (match) result[match[1]] = match[2].trim().replace(/["']/g, '');
    }
    return result;
}

async function getDbConfig() {
    const envContent = await readFile(join(rootDir, 'config/.env'), 'utf8');
    const env = parseEnv(envContent);
    const { DB_HOST = '127.0.0.1', DB_PORT = '3306', DB_USER = 'root', DB_PASS = 'root', DB_NAME } = env;
    return { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME };
}

function mysqlArgs({ DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME }, query) {
    return [`-h${DB_HOST}`, `-P${DB_PORT}`, `-u${DB_USER}`, `-p${DB_PASS}`, DB_NAME, '-e', query, '--skip-column-names'];
}

export async function fetchAllBanners() {
    const db = await getDbConfig();
    const { stdout } = await execa('mysql', mysqlArgs(db, 'SELECT banner_key, name FROM rshop_banner_places ORDER BY banner_key ASC'));

    return stdout.trim().split('\n').filter(Boolean).map((line) => {
        const [bannerKey, name] = line.split('\t');
        return { bannerKey, name };
    });
}

async function fetchBannerByKey(bannerKey) {
    const db = await getDbConfig();
    const { stdout } = await execa('mysql', mysqlArgs(db, `SELECT name FROM rshop_banner_places WHERE banner_key = '${bannerKey}' LIMIT 1`));

    if (!stdout.trim()) return null;
    const name = stdout.trim();
    return { name };
}

export async function runBanner() {
    let bannerKey;

    while (true) {
        const input = await p.text({
            message: 'Banner key (e.g. homepage-top):',
            validate: (val) => {
                if (!val || !val.trim()) return 'Banner key is required';
                if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(val))
                    return 'Use lowercase letters, numbers and hyphens only (e.g. my-banner)';
            },
        });
        if (p.isCancel(input)) cancel();

        const spinner = p.spinner();
        spinner.start('Checking database...');

        let existing;
        try {
            existing = await fetchBannerByKey(input);
            spinner.stop(existing
                ? pc.cyan(`Banner "${existing.name}" already exists with this key`)
                : pc.cyan('Banner key is available'));
        } catch (err) {
            spinner.stop(pc.red('Failed to check database'));
            p.log.error(err.message);
            process.exit(1);
        }

        if (existing) {
            const choice = await p.select({
                message: 'What do you want to do?',
                options: [
                    { value: 'load',   label: `Load actions for "${existing.name}"` },
                    { value: 'rename', label: 'Use a different key' },
                ],
            });
            if (p.isCancel(choice)) cancel();

            if (choice === 'load') {
                return { name: existing.name, bannerKey: input, limit: null };
            }

            continue;
        }

        bannerKey = input;
        break;
    }

    const name = await p.text({
        message: 'Banner name:',
        validate: (val) => (!val || !val.trim() ? 'Name is required' : undefined),
    });
    if (p.isCancel(name)) cancel();

    const options = await p.multiselect({
        message: 'Banner options:',
        options: BANNER_OPTIONS.map((o) => ({ value: o, label: o })),
        initialValues: ['language_active'],
        required: false,
    });
    if (p.isCancel(options)) cancel();

    const limitChoice = await p.select({
        message: "What's the limit?",
        options: [
            { value: '1',      label: '1' },
            { value: '2',      label: '2' },
            { value: '4',      label: '4' },
            { value: '12',     label: '12' },
            { value: 'custom', label: 'Custom' },
        ],
    });
    if (p.isCancel(limitChoice)) cancel();

    let limit;
    if (limitChoice === 'custom') {
        const customLimit = await p.text({
            message: 'Enter limit:',
            validate: validatePositiveInt,
        });
        if (p.isCancel(customLimit)) cancel();
        limit = customLimit.trim();
    } else {
        limit = limitChoice;
    }

    const migrationName = `CustomBanner${toCamelCase(bannerKey)}`;
    const templateFileName = bannerKey.replace(/-/g, '_');

    const spinner = p.spinner();
    spinner.start(`Running: bin/cake bake banners ${migrationName}`);

    try {
        await execa('bin/cake', ['bake', 'banners', migrationName, '--wizard'], { cwd: rootDir });
    } catch (err) {
        spinner.stop('Failed to run bin/cake bake banners');
        p.log.error(err.stderr || err.message);
        process.exit(1);
    }

    const migrationsDir = join(rootDir, 'config/Migrations');
    const files = await readdir(migrationsDir);
    const migrationFile = files
        .filter((f) => f.endsWith(`_${migrationName}.php`))
        .sort()
        .pop();

    if (!migrationFile) {
        spinner.stop('Migration file not found after bake');
        process.exit(1);
    }

    const migrationPath = join(migrationsDir, migrationFile);
    const original = await readFile(migrationPath, 'utf8');

    let updated = original
        .replace('${name}', name.trim().replace(/'/g, "\\'"))
        .replace('${bannerKey}', bannerKey);
    for (const o of BANNER_OPTIONS) {
        updated = updated.replace(`\${${o}}`, options.includes(o) ? 1 : 0);
    }
    await writeFile(migrationPath, updated);

    const createdFiles = [`config/Migrations/${migrationFile}`];

    const templateDir = join(rootDir, 'src/Template/Plugin/Rshop/Frontend/Cell/Banner');
    await mkdir(templateDir, { recursive: true });
    await writeFile(join(templateDir, `${templateFileName}.ctp`), buildTemplate(bannerKey));
    createdFiles.push(`src/Template/Plugin/Rshop/Frontend/Cell/Banner/${templateFileName}.ctp`);

    spinner.stop(pc.cyan('Created files:'));
    createdFiles.forEach((f) => p.log.info(pc.dim(`  ${f}`)));

    const runMigrate = await p.confirm({ message: 'Run migrations now?', initialValue: true });
    if (p.isCancel(runMigrate)) cancel();

    if (runMigrate) {
        spinner.start('Running: bin/cake migrations migrate');
        try {
            await execa('bin/cake', ['migrations', 'migrate'], { cwd: rootDir });
            spinner.stop(pc.cyan('Migration applied!'));
        } catch (err) {
            spinner.stop(pc.red('Migration failed'));
            p.log.error(err.stderr || err.message);
        }
    }

    const varName = `${toLowerCamelCase(bannerKey)}Banner`;
    const example =
        `$${varName} = $this->cell('Rshop/Frontend.Banner', ['${bannerKey}', ['limit' => ${limit}]], [\n` +
        `    'customTemplate' => '${templateFileName}',\n` +
        `    'cache' => [\n` +
        `        'config' => 'rshop_banners',\n` +
        `        'key' => '${bannerKey}'\n` +
        `    ]\n` +
        `])->__toString();`;

    await clipboard.write(example);
    p.note(example, pc.cyan('Usage example (copied to clipboard)'));

    return { name, bannerKey, limit };
}


function buildTemplate(bannerKey) {
    return `<div class="c-${bannerKey}">
    <?php foreach ($items as $item) { ?>
    <div class="c-${bannerKey}__item"></div>
    <?php } ?>
</div>
`;
}
