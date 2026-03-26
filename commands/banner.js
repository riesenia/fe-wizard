import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import clipboard from 'clipboardy';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { rootDir, toCamelCase, toLowerCamelCase, cancel, text, getDbConfig, mysqlArgs, promptLimit } from '../utils.js';

const BANNER_OPTIONS = [
    'select_category', 'select_product', 'select_campaign',
    'show_all', 'random', 'products_banner', 'products_listing_banner',
    'campaigns_banner', 'language_active',
];


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
        const input = await text({
            message: 'Banner key (e.g. homepage-top):',
            validate: (val) => {
                if (!val || !val.trim()) return 'Banner key is required';
                if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(val))
                    return 'Use lowercase letters, numbers and hyphens only (e.g. my-banner)';
            },
        });
        if (p.isCancel(input)) return;

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
            if (p.isCancel(choice)) return;

            if (choice === 'load') {
                return { name: existing.name, bannerKey: input, limit: null };
            }

            continue;
        }

        bannerKey = input;
        break;
    }

    const name = await text({
        message: 'Banner name:',
        validate: (val) => (!val || !val.trim() ? 'Name is required' : undefined),
    });
    if (p.isCancel(name)) return;

    const options = await p.multiselect({
        message: 'Banner options:',
        options: BANNER_OPTIONS.map((o) => ({ value: o, label: o })),
        initialValues: ['language_active'],
        required: false,
    });
    if (p.isCancel(options)) return;

    const limit = await promptLimit([1, 2, 4, 12]);

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

    const scssDir = join(rootDir, 'resources/css/components/banners');
    await mkdir(scssDir, { recursive: true });
    const scssFileName = `_${templateFileName}.scss`;
    await writeFile(join(scssDir, scssFileName), buildScss(bannerKey));
    createdFiles.push(`resources/css/components/banners/${scssFileName}`);

    spinner.stop(pc.cyan('Created files:'));
    createdFiles.forEach((f) => p.log.info(pc.dim(`  ${f}`)));

    const runMigrate = await p.confirm({ message: 'Run migrations now?', initialValue: true });
    if (p.isCancel(runMigrate)) return;

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


function buildScss(bannerKey) {
    return `@use "./../../init" as *;\n\n.c-${bannerKey} {\n}\n`;
}

function buildTemplate(bannerKey) {
    return `<?php
if (empty($items)) {
    return;
}
?>

<div class="c-${bannerKey}">
    <?php
    foreach ($items as $item) {
        ?>
        <div class="c-${bannerKey}__item">
            <?= $item->name; ?>
        </div>
        <?php
    }
    ?>
</div>
`;
}
