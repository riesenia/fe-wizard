import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import clipboard from 'clipboardy';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { rootDir, toCamelCase, toLowerCamelCase, cancel, text, getDbConfig, mysqlArgs, promptLimit } from '../utils.js';
import { writeBoxItemsConfig, writeBoxConfig } from './fields.js';

function typeToTable(type) {
    if (type.endsWith('y')) return `rshop_${type.slice(0, -1)}ies`;
    return `rshop_${type}s`;
}

export async function fetchTypeIds(type, limit) {
    const db = await getDbConfig();
    const table = typeToTable(type);
    try {
        const { stdout } = await execa('mysql', mysqlArgs(db, `SELECT id FROM \`${table}\` ORDER BY id ASC LIMIT ${limit}`));
        return stdout.trim().split('\n').filter(Boolean).map(Number);
    } catch {
        return [];
    }
}

export async function fetchBoxTypes() {
    const db = await getDbConfig();
    const { stdout } = await execa('mysql', mysqlArgs(db, "SHOW COLUMNS FROM rshop_boxes LIKE 'type'"));

    const match = stdout.match(/enum\(([^)]+)\)/);
    if (!match) throw new Error('Could not parse enum types from rshop_boxes.type');

    const types = match[1].split(',').map((v) => v.replace(/'/g, '').trim());
    const others = types.filter((t) => t !== 'custom').sort();
    return ['custom', ...others];
}

export async function fetchAllBoxes() {
    const db = await getDbConfig();
    const { stdout } = await execa('mysql', mysqlArgs(db, 'SELECT box_key, name, type FROM rshop_boxes ORDER BY box_key ASC'));

    return stdout.trim().split('\n').filter(Boolean).map((line) => {
        const [boxKey, name, type] = line.split('\t');
        return { boxKey, name, type };
    });
}

async function fetchBoxByKey(boxKey) {
    const db = await getDbConfig();
    const { stdout } = await execa('mysql', mysqlArgs(db, `SELECT name, type FROM rshop_boxes WHERE box_key = '${boxKey}' LIMIT 1`));

    if (!stdout.trim()) return null;
    const [name, type] = stdout.trim().split('\t');
    return { name, type };
}

export async function runBox() {
    let boxKey;

    while (true) {
        const input = await text({
            message: 'Box key (e.g. footer-columns):',
            validate: (val) => {
                if (!val || !val.trim()) return 'Box key is required';
                if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(val))
                    return 'Use lowercase letters, numbers and hyphens only (e.g. my-box)';
            },
        });
        if (p.isCancel(input)) return;

        const spinner = p.spinner();
        spinner.start('Checking database...');

        let existing;
        try {
            existing = await fetchBoxByKey(input);
            spinner.stop(existing
                ? pc.cyan(`Box "${existing.name}" (type: ${existing.type}) already exists with this key`)
                : pc.cyan('Box key is available'));
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
                return { name: existing.name, boxKey: input, type: existing.type };
            }

            continue;
        }

        boxKey = input;
        break;
    }

    const name = await text({
        message: 'Box name:',
        validate: (val) => (!val || !val.trim() ? 'Name is required' : undefined),
    });
    if (p.isCancel(name)) return;

    const spinner = p.spinner();
    spinner.start('Fetching box types from database...');

    let types;
    try {
        types = await fetchBoxTypes();
        spinner.stop(pc.cyan(`Loaded ${types.length} box types`));
    } catch (err) {
        spinner.stop(pc.red('Failed to fetch box types from database'));
        p.log.error(err.message);
        process.exit(1);
    }

    const type = await p.select({
        message: 'Box type:',
        options: types.map((t) => ({ value: t, label: t })),
    });
    if (p.isCancel(type)) return;

    const limit = await promptLimit([4, 12, 24]);

    const hasSubitems = await p.confirm({ message: 'Does it have subitems?' });
    if (p.isCancel(hasSubitems)) return;

    let subitemsType = null;
    if (hasSubitems) {
        subitemsType = await p.select({
            message: 'Subitem type:',
            options: types.map((t) => ({ value: t, label: t })),
        });
        if (p.isCancel(subitemsType)) return;
    }

    const migrationName = `CustomBox${toCamelCase(boxKey)}`;
    const templateFileName = boxKey.replace(/-/g, '_');

    spinner.start(`Running: bin/cake bake boxes ${migrationName} --wizard`);

    try {
        await execa('bin/cake', ['bake', 'boxes', migrationName, '--wizard'], { cwd: rootDir });
    } catch (err) {
        spinner.stop('Failed to run bin/cake bake boxes');
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
    const updated = original
        .replace('${name}', name)
        .replace('${type}', type)
        .replace('${boxKey}', boxKey);
    await writeFile(migrationPath, updated);

    const createdFiles = [`config/Migrations/${migrationFile}`];

    const templateDir = join(rootDir, 'src/Template/Plugin/Rshop/Frontend/Cell/Box');
    await mkdir(templateDir, { recursive: true });
    await writeFile(join(templateDir, `${templateFileName}.ctp`), buildTemplate(boxKey, type, subitemsType));
    createdFiles.push(`src/Template/Plugin/Rshop/Frontend/Cell/Box/${templateFileName}.ctp`);

    const scssDir = join(rootDir, 'resources/css/components/boxes');
    await mkdir(scssDir, { recursive: true });
    const scssFileName = `_${templateFileName}.scss`;
    await writeFile(join(scssDir, scssFileName), buildScss(boxKey));
    createdFiles.push(`resources/css/components/boxes/${scssFileName}`);

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

    if (type !== 'custom' || subitemsType) {
        spinner.start('Saving config to config/rshop.php...');
        try {
            const boxConfig = {};
            if (type !== 'custom') {
                boxConfig.name = false;
                boxConfig.url = false;
                boxConfig.image = false;
            }
            if (subitemsType) boxConfig.has_subitems = subitemsType;
            await writeBoxItemsConfig(boxKey, boxConfig);

            if (subitemsType && subitemsType !== 'custom') {
                await writeBoxConfig('boxSubitems', boxKey, { name: false, url: false, image: false });
            }

            spinner.stop(pc.cyan('config/rshop.php updated'));
        } catch (err) {
            spinner.stop(pc.red('Failed to write config/rshop.php'));
            p.log.error(err.message);
        }
    }

    const varName = `${toLowerCamelCase(boxKey)}Box`;
    const example =
        `$${varName} = $this->cell('Rshop/Frontend.Box', ['${boxKey}', ['limit' => ${limit}]], [\n` +
        `    'customTemplate' => '${templateFileName}',\n` +
        `    'cache' => [\n` +
        `        'config' => 'rshop_boxes',\n` +
        `        'key' => '${boxKey}'\n` +
        `    ]\n` +
        `])->__toString();`;

    await clipboard.write(example);
    p.note(example, pc.cyan('Usage example (copied to clipboard)'));

    return { name, boxKey, type, limit };
}

function buildScss(boxKey) {
    return `@use "./../../init" as *;\n\n.c-${boxKey} {\n}\n`;
}

function buildSubitemsBlock(cssClass, varName, subitemsType) {
    const innerLoop = subitemsType === 'custom'
        ? `foreach ($subItems as $subItem) {
                        echo $subItem->name;
                    }`
        : `foreach ($subItems as $subItem) {
                        if (!$subItem->${subitemsType}) {
                            continue;
                        }
                        $${subitemsType} = $subItem->${subitemsType};
                        echo $${subitemsType}->name;
                    }`;
    return `
            <?php
            $subItems = $${varName}->box_subitems;
            if ($subItems) {
                ?>
                <div class="${cssClass}__item__subitems">
                    <?php
                    ${innerLoop}
                    ?>
                </div>
                <?php
            }
            ?>`;
}

function buildTemplate(boxKey, type, subitemsType = null) {
    const cssClass = `c-${boxKey}`;
    const subitems = subitemsType ? buildSubitemsBlock(cssClass, type === 'custom' ? 'item' : type, subitemsType) : '';

    if (type === 'custom') {
        return `<?php
if (empty($items)) {
    return;
}
?>

<div class="${cssClass}">
    <?php
    foreach ($items as $item) {
        ?>
        <div class="${cssClass}__item">
            <?= $item->name ?>${subitems}
        </div>
        <?php
    }
    ?>
</div>
`;
    }

    return `<?php
if (empty($box->box_items)) {
    return;
}
?>

<div class="${cssClass}">
    <?php
    foreach ($box->box_items as $boxItem) {
        if (!$boxItem->${type}) {
            continue;
        }

        $${type} = $boxItem->${type};
        ?>
        <div class="${cssClass}__item">
            <?= $${type}->name ?>${subitems}
        </div>
        <?php
    }
    ?>
</div>
`;
}
