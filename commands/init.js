import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { cancel, text, rootDir, getDbConfig, mysqlArgs } from '../utils.js';
import { runFontFamilies } from './fonts.js';
import { runLocales } from './locales.js';
import { runInitSeed, runPostSeedSteps } from './seed-init.js';
import { runFigmaMenu } from './figma.js';

const LOGIN_CTP_REL = 'src/Template/Plugin/Rshop/Core/AdminUsers/login.ctp';

// ── DB helpers ──────────────────────────────────────────────────────────────

async function readDbConfigValue(key) {
    try {
        const db = await getDbConfig();
        const { stdout } = await execa('mysql', mysqlArgs(db,
            `SELECT value FROM rshop_configurations WHERE configuration_key = '${key}' LIMIT 1`
        ));
        const val = stdout.trim();
        return val.length > 0 && val !== 'NULL' ? val : null;
    } catch {
        return null;
    }
}

async function writeDbConfigValue(key, value) {
    const db = await getDbConfig();
    await execa('mysql', mysqlArgs(db,
        `UPDATE rshop_configurations SET value = '${value.replace(/'/g, "\\'")}' WHERE configuration_key = '${key}'`
    ));
}

// ── login.ctp handling ───────────────────────────────────────────────────────

const CONFIGURE_ASSIGN = `$this->assign('login_header_client', Configure::read('Rshop.store.name'))`;
const USE_CONFIGURE    = `use Cake\\Core\\Configure;`;
const LOGIN_HEADER_RE  = /\$this->assign\('login_header_client',\s*(.+)\);/;

function withUseStatement(content) {
    if (content.includes(USE_CONFIGURE)) return content;
    return content.replace(/^<\?php\n?/, `<?php\n${USE_CONFIGURE}\n`);
}

async function handleLoginCtp(storeName) {
    const filePath = join(rootDir, LOGIN_CTP_REL);

    let content;
    try {
        content = await readFile(filePath, 'utf8');
    } catch {
        // File doesn't exist — create it
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath,
            `<?php\n` +
            `${USE_CONFIGURE}\n` +
            `\n` +
            `$this->extend('login_base');\n` +
            `\n` +
            `${CONFIGURE_ASSIGN};\n`
        );
        p.log.success(pc.cyan(`${LOGIN_CTP_REL} created ✨`));
        return;
    }

    // Already using Configure::read correctly — nothing to do
    if (content.includes(CONFIGURE_ASSIGN)) {
        p.log.info(`login_header_client already configured correctly`);
        return;
    }

    const match = content.match(LOGIN_HEADER_RE);

    if (!match) {
        // File exists but login_header_client not set — append it
        let newContent = withUseStatement(content);
        const assignLine = `${CONFIGURE_ASSIGN};\n`;
        newContent = newContent.endsWith('\n') ? newContent + assignLine : newContent + '\n' + assignLine;
        await writeFile(filePath, newContent);
        p.log.success(pc.cyan(`login_header_client added to ${LOGIN_CTP_REL} ✨`));
        return;
    }

    // File has login_header_client set to something else — inform and offer to update
    const currentExpression = match[1];
    p.log.warn(
        `${LOGIN_CTP_REL} has login_header_client = ${pc.cyan(currentExpression)}\n` +
        `        store.name in DB = ${pc.cyan(storeName)}`
    );
    const update = await p.confirm({
        message: `Update to use Configure::read('Rshop.store.name')?`,
        initialValue: true,
    });
    if (p.isCancel(update)) return;

    if (update) {
        let newContent = withUseStatement(content);
        newContent = newContent.replace(LOGIN_HEADER_RE, `${CONFIGURE_ASSIGN};`);
        await writeFile(filePath, newContent);
        p.log.success(pc.cyan(`${LOGIN_CTP_REL} updated ✨`));
    }
}

// ── Config definitions ───────────────────────────────────────────────────────

const BASE_CONFIGS = [
    {
        key: 'store.name',
        label: 'Store name',
        dbKey: 'store.name',
    },
    {
        key: 'store.email',
        label: 'Store email',
        dbKey: 'store.email',
    },
    {
        key: 'store.phone',
        label: 'Store phone',
        dbKey: 'store.phone',
    },
    {
        key: 'adminTheme',
        label: 'Admin theme',
        dbKey: 'adminTheme',
        options: [
            { value: 'production', label: 'Production' },
            { value: 'test',       label: 'Test' },
            { value: 'local',      label: 'Local' },
        ],
    },
];

// ── Base configurations menu ─────────────────────────────────────────────────

async function runBaseConfigurations() {
    const spinner = p.spinner();
    spinner.start('Loading current values from DB...');
    const values = await Promise.all(BASE_CONFIGS.map((c) => readDbConfigValue(c.dbKey)));
    spinner.stop('Loaded');

    while (true) {
        const options = [
            ...BASE_CONFIGS.map((config, i) => ({
                value: config.key,
                label: `${config.label}: ${values[i] !== null ? pc.cyan(values[i]) : pc.dim('not set')}`,
            })),
            { value: '__back__', label: '↩ Back' },
        ];

        const choice = await p.select({
            message: 'Base configurations — select to edit:',
            options,
        });
        if (p.isCancel(choice)) return;
        if (choice === '__back__') return;

        const idx = BASE_CONFIGS.findIndex((c) => c.key === choice);
        const config = BASE_CONFIGS[idx];

        let trimmed;
        if (config.options) {
            const picked = await p.select({
                message: `${config.label}:`,
                options: config.options,
                initialValue: values[idx] ?? config.options[0].value,
            });
            if (p.isCancel(picked)) return;
            trimmed = picked;
        } else {
            const newValue = await text({
                message: `${config.label}:`,
                initialValue: values[idx] ?? '',
                validate: (val) => (!val || !val.trim() ? 'Value is required' : undefined),
            });
            if (p.isCancel(newValue)) return;
            trimmed = newValue.trim();
        }

        const s = p.spinner();
        s.start('Saving to DB...');
        try {
            await writeDbConfigValue(config.dbKey, trimmed);
            values[idx] = trimmed;
            s.stop(pc.cyan(`${config.dbKey} saved ✨`));
        } catch (err) {
            s.stop(pc.red('Failed to save to DB'));
            p.log.error(err.message);
            continue;
        }

        // After-save actions per config key
        if (config.key === 'store.name') {
            await handleLoginCtp(trimmed);
        }

        const cs = p.spinner();
        cs.start('Running bin/cake orm_cache clear...');
        try {
            await execa('bin/cake', ['orm_cache', 'clear'], { cwd: rootDir });
            cs.stop(pc.cyan('ORM cache cleared ✨'));
        } catch (err) {
            cs.stop(pc.red('Failed to clear ORM cache'));
            p.log.error(err.stderr || err.message);
        }

        cs.start('Running bin/cake cache clear rshop_configurations...');
        try {
            await execa('bin/cake', ['cache', 'clear', 'rshop_configurations'], { cwd: rootDir });
            cs.stop(pc.cyan('rshop_configurations cache cleared ✨'));
        } catch (err) {
            cs.stop(pc.red('Failed to clear rshop_configurations cache'));
            p.log.error(err.stderr || err.message);
        }
    }
}

// ── Elastic Search menu ──────────────────────────────────────────────────────

const ELASTIC_INFO_KEYS = [
    { key: 'search.active',  label: 'Active' },
    { key: 'search.elastic', label: 'Address' },
    { key: 'search.index',   label: 'Search index' },
];

async function runElasticSearch() {
    while (true) {
        const spinner = p.spinner();
        spinner.start('Loading Elastic Search config from DB...');
        const values = await Promise.all(ELASTIC_INFO_KEYS.map((c) => readDbConfigValue(c.key)));
        spinner.stop('Loaded');

        const indexValue = values[ELASTIC_INFO_KEYS.findIndex((c) => c.key === 'search.index')];
        let lastReindex = null;
        if (indexValue) {
            const m = indexValue.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
            if (m) lastReindex = `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
        }

        p.note(
            [
                ...ELASTIC_INFO_KEYS.map((c, i) =>
                    `${c.label}: ${values[i] !== null ? pc.cyan(values[i]) : pc.dim('not set')}`
                ),
                lastReindex ? `Last reindex: ${pc.cyan(lastReindex)}` : `Last reindex: ${pc.dim('unknown')}`,
            ].join('\n'),
            'Elastic Search'
        );

        const action = await p.select({
            message: 'Elastic Search',
            options: [
                { value: 'set',      label: 'Set ElasticSearch configs' },
                { value: 'reindex',  label: 'Run reindex' },
                { value: '__back__', label: '↩ Back' },
            ],
        });
        if (p.isCancel(action) || action === '__back__') return;

        if (action === 'set') {
            for (let i = 0; i < ELASTIC_INFO_KEYS.length; i++) {
                const config = ELASTIC_INFO_KEYS[i];
                if (config.key === 'search.index') continue;

                if (config.key === 'search.active') {
                    const active = await p.confirm({
                        message: `${config.label}:`,
                        initialValue: values[i] === '1',
                    });
                    if (p.isCancel(active)) break;
                    const val = active ? '1' : '0';
                    try {
                        await writeDbConfigValue(config.key, val);
                        values[i] = val;
                    } catch (err) {
                        p.log.error(`Failed to save ${config.key}: ${err.message}`);
                    }
                } else {
                    const isPath = config.key === 'search.elastic';
                    const newValue = await text({
                        message: `${config.label}:`,
                        initialValue: values[i] ?? (isPath ? 'localhost:9200' : ''),
                        validate: (val) => (!val || !val.trim() ? 'Value is required' : undefined),
                    });
                    if (p.isCancel(newValue)) break;
                    const trimmed = newValue.trim();
                    try {
                        await writeDbConfigValue(config.key, trimmed);
                        values[i] = trimmed;
                        p.log.success(pc.cyan(`${config.key} saved ✨`));
                    } catch (err) {
                        p.log.error(`Failed to save ${config.key}: ${err.message}`);
                    }
                }
            }

            const cs = p.spinner();
            cs.start('Running bin/cake orm_cache clear...');
            try {
                await execa('bin/cake', ['orm_cache', 'clear'], { cwd: rootDir });
                cs.stop(pc.cyan('ORM cache cleared ✨'));
            } catch (err) {
                cs.stop(pc.red('Failed to clear ORM cache'));
                p.log.error(err.stderr || err.message);
            }

            cs.start('Running bin/cake cache clear rshop_configurations...');
            try {
                await execa('bin/cake', ['cache', 'clear', 'rshop_configurations'], { cwd: rootDir });
                cs.stop(pc.cyan('rshop_configurations cache cleared ✨'));
            } catch (err) {
                cs.stop(pc.red('Failed to clear rshop_configurations cache'));
                p.log.error(err.stderr || err.message);
            }
        }

        if (action === 'reindex') {
            const elasticIdx = ELASTIC_INFO_KEYS.findIndex((c) => c.key === 'search.elastic');
            if (!values[elasticIdx]) {
                p.log.warn('Reindex preskočený — search.elastic (Address) nie je nakonfigurovaný.');
            } else {
                const s = p.spinner();
                s.start('Spúšťam reindex...');
                try {
                    const result = await execa('bin/cake', ['rshop:reindex'], { cwd: rootDir, all: true });
                    s.stop(pc.cyan('Reindex dokončený ✨'));
                    if (result.all) p.log.info(result.all);
                } catch (err) {
                    s.stop(pc.red('Reindex zlyhal'));
                    p.log.error(err.all || err.stderr || err.message);
                }
            }
        }
    }
}

// ── Seeds menu ───────────────────────────────────────────────────────────────

async function runSeedsMenu() {
    while (true) {
        const action = await p.select({
            message: 'Seeds',
            options: [
                { value: 'seed-init', label: 'Create Init seed' },
                { value: 'run-seed',  label: 'Run Init seed' },
                { value: '__back__',  label: '↩ Back' },
            ],
        });
        if (p.isCancel(action)) return;
        if (action === '__back__') return;
        if (action === 'seed-init') await runInitSeed();
        if (action === 'run-seed') {
            const spinner = p.spinner();
            spinner.start('Spúšťam seed...');
            try {
                const result = await execa('bin/cake', ['BasicSeed.basic_seed', '--file', 'seed_init.php'], {
                    cwd: rootDir,
                    all: true,
                });
                spinner.stop(pc.cyan('Seed úspešne dokončený ✨'));
                if (result.all) p.log.info(result.all);
            } catch (err) {
                spinner.stop(pc.red('Seed zlyhal'));
                p.log.error(err.all || err.stderr || err.message);
                continue;
            }
            await runPostSeedSteps();
        }
    }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function runInitWizard() {
    p.intro(pc.bold('Welcome to rWizard ✨ ') + pc.dim('[init]'));

    while (true) {
        const action = await p.select({
            message: 'Hi! With what can I help you?',
            options: [
                { value: 'base-config', label: 'Base Configurations' },
                { value: 'elastic',     label: 'ElasticSearch' },
                { value: 'fonts',       label: 'Font Families' },
                { value: 'locales',     label: 'Domains, Countries, Currencies, Languages & Multishop' },
                { value: 'seeds',       label: 'Seeds' },
                // { value: 'figma',       label: 'Figma' },
                { value: 'bye',         label: 'Bye-bye 👋' },
            ],
        });
        if (p.isCancel(action)) return;

        if (action === 'bye') break;
        if (action === 'base-config') await runBaseConfigurations();
        if (action === 'elastic')     await runElasticSearch();
        if (action === 'fonts')       await runFontFamilies();
        if (action === 'locales')     await runLocales();
        if (action === 'seeds')       await runSeedsMenu();
        // if (action === 'figma')       await runFigmaMenu();
    }

    p.outro(pc.dim('See you next time!'));
}
