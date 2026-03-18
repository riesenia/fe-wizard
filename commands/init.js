import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { cancel, rootDir, getDbConfig, mysqlArgs } from '../utils.js';
import { runFontFamilies } from './fonts.js';

const LOGIN_CTP_REL = 'src/Template/Plugin/Rshop/Core/AdminUsers/login.ctp';

// ── DB helpers ──────────────────────────────────────────────────────────────

async function readDbConfigValue(key) {
    try {
        const db = await getDbConfig();
        const { stdout } = await execa('mysql', mysqlArgs(db,
            `SELECT value FROM rshop_configurations WHERE configuration_key = '${key}' LIMIT 1`
        ));
        const val = stdout.trim();
        return val.length > 0 ? val : null;
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
    if (p.isCancel(update)) cancel();

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
            { value: '__back__', label: 'Back' },
        ];

        const choice = await p.select({
            message: 'Base configurations — select to edit:',
            options,
        });
        if (p.isCancel(choice)) cancel();
        if (choice === '__back__') return;

        const idx = BASE_CONFIGS.findIndex((c) => c.key === choice);
        const config = BASE_CONFIGS[idx];

        const newValue = await p.text({
            message: `${config.label}:`,
            initialValue: values[idx] ?? '',
            validate: (val) => (!val || !val.trim() ? 'Value is required' : undefined),
        });
        if (p.isCancel(newValue)) cancel();
        const trimmed = newValue.trim();

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

// ── Entry point ──────────────────────────────────────────────────────────────

export async function runInitWizard() {
    p.intro(pc.bold('Welcome to rWizard ✨ ') + pc.dim('[init]'));

    while (true) {
        const action = await p.select({
            message: 'Hi! With what can I help you?',
            options: [
                { value: 'base-config', label: 'Set base Configurations' },
                { value: 'fonts',       label: 'Set Font Families' },
                { value: 'bye',         label: 'Bye-bye 👋' },
            ],
        });
        if (p.isCancel(action)) cancel();

        if (action === 'bye') break;
        if (action === 'base-config') await runBaseConfigurations();
        if (action === 'fonts')       await runFontFamilies();
    }

    p.outro(pc.dim('See you next time!'));
}
