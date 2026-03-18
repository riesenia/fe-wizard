import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { rootDir, toCamelCase, toLowerCamelCase, cancel, FIELD_TYPES, TEXT_FIELD_TYPES, promptEditorPreset, promptSelectOptions, getDbConfig, mysqlArgs } from '../utils.js';

async function configKeyExists(fullKey) {
    const db = await getDbConfig();
    try {
        const { stdout } = await execa('mysql', mysqlArgs(db,
            `SELECT 1 FROM rshop_configurations WHERE configuration_key = '${fullKey}' LIMIT 1`
        ));
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

async function fetchConfigGroups(isText) {
    const db = await getDbConfig();
    const { stdout } = await execa('mysql', mysqlArgs(db,
        `SELECT identifier, name FROM rshop_configuration_groups WHERE is_text = ${isText ? 1 : 0} ORDER BY identifier ASC`
    ));
    return stdout.trim().split('\n').filter(Boolean).map((line) => {
        const [identifier, name] = line.split('\t');
        return { identifier, name };
    });
}

function buildConfigurationsBlock(configs, groupDotted) {
    const entries = configs.map((config) => {
        const fullKey = `${groupDotted}.${config.key}`;
        const lines = [
            `            'configuration_key' => '${fullKey}',`,
            `            'name' => '${config.name}',`,
            `            'value' => '${config.value}',`,
            `            'type' => '${config.type}',`,
        ];

        if (config.public === false) {
            lines.push(`            'public' => 0,`);
        }

        if (config.type === 'editor') {
            lines.push(`            'input' => '{"preset":"${config.preset}"}',`);
        } else if (config.type === 'select') {
            const kendoData = config.options.map((o) => ({ id: o.key, name: o.value }));
            const inputJson = JSON.stringify({ kendo: { dataSource: { data: kendoData } } });
            lines.push(`            'input' => '${inputJson}',`);
        }

        return `        [\n${lines.join('\n')}\n        ]`;
    });

    return entries.join(',\n') + ',';
}

export async function runConfiguration() {
    const isText = await p.confirm({ message: 'Is it a Text configuration?', initialValue: true });
    if (p.isCancel(isText)) cancel();

    const spinner = p.spinner();
    spinner.start('Fetching configuration groups...');
    let groups;
    try {
        groups = await fetchConfigGroups(isText);
        spinner.stop(pc.cyan(`Loaded ${groups.length} group(s)`));
    } catch (err) {
        spinner.stop(pc.red('Failed to fetch configuration groups'));
        p.log.error(err.message);
        process.exit(1);
    }

    const groupOptions = [
        ...groups.map((g) => ({ value: g.identifier, label: `${g.identifier} (${g.name})` })),
        { value: '__new__', label: 'New group...' },
    ];

    const groupChoice = await p.select({ message: 'Configuration group:', options: groupOptions });
    if (p.isCancel(groupChoice)) cancel();

    let group = groupChoice;
    let groupName = null;
    let groupKey = null;
    const isNewGroup = groupChoice === '__new__';

    if (isNewGroup) {
        const keyPattern = isText ? /^text_[a-z][a-z0-9_]*$/ : /^[a-z][a-z0-9_]*$/;
        const keyHint = isText ? 'e.g. text_my_group' : 'e.g. my_group';
        const keyInput = await p.text({
            message: `Group identifier (${keyHint}):`,
            validate: (val) => {
                if (!val || !val.trim()) return 'Identifier is required';
                if (!keyPattern.test(val.trim())) {
                    return isText
                        ? 'Must match ^text_[a-z][a-z0-9_]*$'
                        : 'Must match ^[a-z][a-z0-9_]*$';
                }
            },
        });
        if (p.isCancel(keyInput)) cancel();
        groupKey = keyInput.trim();
        group = groupKey;

        const nameInput = await p.text({
            message: 'Group name:',
            placeholder: 'e.g. Nová skupina',
            validate: (val) => (!val || !val.trim() ? 'Name is required' : undefined),
        });
        if (p.isCancel(nameInput)) cancel();
        groupName = nameInput.trim();
    }

    const languageDependent = await p.confirm({ message: 'Language dependent?', initialValue: true });
    if (p.isCancel(languageDependent)) cancel();

    const shopDependent = await p.confirm({ message: 'Shop dependent?', initialValue: false });
    if (p.isCancel(shopDependent)) cancel();

    const toGroupDotted = (g) => isText
        ? `text.${toLowerCamelCase(g.replace(/^text_/, ''))}`
        : g.replace(/_/g, '.');
    const groupDotted = toGroupDotted(isNewGroup ? groupKey : group);

    const types = isText ? TEXT_FIELD_TYPES : FIELD_TYPES;
    const typeOptions = types.map((t) => ({ value: t, label: t }));

    const configs = [];
    let addMore = true;

    while (addMore) {
        let key;
        while (true) {
            const keyInput = await p.text({
                message: `Configuration key (full: ${groupDotted}.???):`,
                validate: (val) => {
                    if (!val || !val.trim()) return 'Key is required';
                    if (!/^[a-z][a-zA-Z0-9]*$/.test(val.trim())) return 'Must be camelCase (e.g. sliderTitle)';
                    if (configs.some((c) => c.key === val.trim())) return 'Key already used in this migration';
                },
            });
            if (p.isCancel(keyInput)) cancel();
            const fullKey = `${groupDotted}.${keyInput.trim()}`;
            if (await configKeyExists(fullKey)) {
                p.log.warn(pc.cyan(`"${fullKey}" already exists in the database, choose a different key`));
                continue;
            }
            key = keyInput.trim();
            break;
        }

        const name = await p.text({
            message: 'Name:',
            validate: (val) => (!val || !val.trim() ? 'Name is required' : undefined),
        });
        if (p.isCancel(name)) cancel();

        const type = await p.select({ message: 'Type:', options: typeOptions });
        if (p.isCancel(type)) cancel();

        let preset = null;
        if (type === 'editor') {
            preset = await promptEditorPreset();
        }

        let options = null;
        if (type === 'select') {
            options = await promptSelectOptions();
        }

        let value = '';
        if (type === 'bool') {
            const boolChoice = await p.select({
                message: 'Default value:',
                options: [
                    { value: '0', label: 'No' },
                    { value: '1', label: 'Yes' },
                ],
            });
            if (p.isCancel(boolChoice)) cancel();
            value = boolChoice;
        } else if (type === 'select' && options?.length) {
            const selectDefault = await p.select({
                message: 'Default value:',
                options: options.map((o) => ({ value: o.key, label: `${o.key} (${o.value})` })),
            });
            if (p.isCancel(selectDefault)) cancel();
            value = selectDefault;
        } else {
            const validate = type === 'number'
                ? (val) => (val && val.trim() && isNaN(Number(val)) ? 'Must be a number' : undefined)
                : type === 'email'
                ? (val) => (val && val.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? 'Must be a valid email' : undefined)
                : undefined;
            const textVal = await p.text({ message: 'Default value:', defaultValue: '', validate });
            if (p.isCancel(textVal)) cancel();
            value = textVal ?? '';
        }

        let isPublic = true;
        if (!isText) {
            const publicAnswer = await p.confirm({ message: 'Public?', initialValue: true });
            if (p.isCancel(publicAnswer)) cancel();
            isPublic = publicAnswer;
        }

        configs.push({ key: key.trim(), name: name.trim(), value: value ?? '', type, public: isPublic, preset, options });

        const more = await p.confirm({ message: 'Add another configuration?', initialValue: true });
        if (p.isCancel(more)) cancel();
        addMore = more;
    }

    const migrationsDir = join(rootDir, 'config/Migrations');
    const groupCamel = toCamelCase(group);
    let existing = [];
    try {
        const files = await readdir(migrationsDir);
        existing = files.filter((f) => f.includes(`_CustomConfig${groupCamel}`));
    } catch {
        // dir may not exist yet
    }
    const nextN = existing.length + 1;
    const migrationName = `CustomConfig${groupCamel}${nextN}`;

    spinner.start(`Running: bin/cake bake configuration ${migrationName}`);
    try {
        await execa('bin/cake', ['bake', 'configuration', migrationName, '--wizard'], { cwd: rootDir });
    } catch (err) {
        spinner.stop('Failed to run bin/cake bake configuration');
        p.log.error(err.stderr || err.message);
        process.exit(1);
    }

    const allFiles = await readdir(migrationsDir);
    const migrationFile = allFiles
        .filter((f) => f.endsWith(`_${migrationName}.php`))
        .sort()
        .pop();

    if (!migrationFile) {
        spinner.stop('Migration file not found after bake');
        process.exit(1);
    }

    const migrationPath = join(migrationsDir, migrationFile);
    const original = await readFile(migrationPath, 'utf8');

    const configurationsBlock = buildConfigurationsBlock(configs, groupDotted);

    const newGroupBlock = isNewGroup
        ? `        $largestGroupSort = $this->fetchRow('SELECT MAX(sort) AS largestSort FROM rshop_configuration_groups')['largestSort'];\n` +
          `        $this->table('rshop_configuration_groups')\n` +
          `            ->insert([[\n` +
          `                'name' => '${groupName}',\n` +
          `                'identifier' => '${groupKey}',\n` +
          `                'is_text' => ${isText ? 1 : 0},\n` +
          `                'public' => 1,\n` +
          `                'sort' => \\intval($largestGroupSort) + 1\n` +
          `            ]])\n` +
          `            ->save();\n`
        : '';

    const deleteGroupLine = isNewGroup
        ? `\n        $this->execute("DELETE FROM rshop_configuration_groups where identifier = '${group}'");`
        : '';

    const updated = original
        .replace('        ${configurationsBlock}', configurationsBlock)
        .replace('${groupIdentifier}', group)
        .replace('${languageDependent}', languageDependent ? 1 : 0)
        .replace('${shopDependent}', shopDependent ? 1 : 0)
        .replace('        ${newGroupBlock}', newGroupBlock)
        .replace('        ${deleteGroupLine}', deleteGroupLine);

    await writeFile(migrationPath, updated);
    spinner.stop(pc.cyan(`Migration ready: config/Migrations/${migrationFile}`));

    p.note(
        [
            `Group:              ${group}`,
            `Type:               ${isText ? 'text' : 'normal'}`,
            `Language dependent: ${languageDependent ? 'yes' : 'no'}`,
            `Shop dependent:     ${shopDependent ? 'yes' : 'no'}`,
            `Configurations:     ${configs.length}`,
        ].join('\n')
    );

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
}
