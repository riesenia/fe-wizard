import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { rootDir, cancel, fetchEditorPresets } from '../utils.js';

// Default fields from vendor config
const DEFAULT_FIELDS = [
    { key: 'name',  defaultActive: true },
    { key: 'url',   defaultActive: true },
    { key: 'image', defaultActive: true },
];

const FIELD_TYPES = ['text', 'upload', 'editor', 'checkbox'];

// ─── PHP helpers ──────────────────────────────────────────────────────────────

function toPhp(val, indent = 1) {
    const pad = '    '.repeat(indent);
    if (val === false || val === null) return 'false';
    if (val === true) return 'true';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') return `'${val.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    if (typeof val === 'object') {
        const entries = Object.entries(val);
        if (!entries.length) return '[]';
        const lines = entries.map(([k, v]) => `${pad}    '${k}' => ${toPhp(v, indent + 1)},`);
        return `[\n${lines.join('\n')}\n${pad}]`;
    }
    return 'null';
}

function generateBoxEntry(boxKey, config, baseIndent) {
    const pad = '    '.repeat(baseIndent);
    const entries = Object.entries(config)
        .map(([k, v]) => `${pad}    '${k}' => ${toPhp(v, baseIndent + 1)},`)
        .join('\n');
    return `${pad}'${boxKey}' => [\n${entries}\n${pad}],`;
}

function findArrayEnd(text, openPos) {
    let depth = 0;
    for (let i = openPos; i < text.length; i++) {
        if (text[i] === '[') depth++;
        else if (text[i] === ']') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

async function readBoxConfig(section, boxKey) {
    const filePath = join(rootDir, 'config/rshop.php').replace(/'/g, "\\'");
    const escapedKey = boxKey.replace(/'/g, "\\'");
    try {
        const { stdout } = await execa('php', [
            '-r',
            `$c = include '${filePath}'; echo json_encode($c['Admin']['${section}']['${escapedKey}'] ?? null);`,
        ], { cwd: rootDir });
        return JSON.parse(stdout);
    } catch {
        return null;
    }
}

export async function writeBoxConfig(section, boxKey, config) {
    const filePath = join(rootDir, 'config/rshop.php');
    let text = await readFile(filePath, 'utf8');

    const newEntry = generateBoxEntry(boxKey, config, 3);
    const sectionIdx = text.indexOf(`'${section}'`);

    if (sectionIdx === -1) {
        // section doesn't exist — inject into Admin section
        const adminIdx = text.indexOf("'Admin'");
        if (adminIdx === -1) throw new Error("'Admin' key not found in config/rshop.php");
        const adminBracket = text.indexOf('[', adminIdx);
        const adminEnd = findArrayEnd(text, adminBracket);
        text = text.slice(0, adminEnd) + `\n        '${section}' => [\n${newEntry}\n        ],\n    ` + text.slice(adminEnd);
    } else {
        const sectionBracket = text.indexOf('[', sectionIdx);
        const sectionEnd = findArrayEnd(text, sectionBracket);
        const sectionContent = text.slice(sectionBracket, sectionEnd + 1);
        const keyIdx = sectionContent.indexOf(`'${boxKey}'`);

        if (keyIdx === -1) {
            // Add new box entry inside section
            text = text.slice(0, sectionEnd) + `\n${newEntry}\n        ` + text.slice(sectionEnd);
        } else {
            // Replace existing box entry — walk back to consume leading whitespace on the line
            const absKeyIdx = sectionBracket + keyIdx;
            let replaceFrom = absKeyIdx;
            while (replaceFrom > 0 && (text[replaceFrom - 1] === ' ' || text[replaceFrom - 1] === '\t')) {
                replaceFrom--;
            }
            const valueBracket = text.indexOf('[', absKeyIdx);
            const valueEnd = findArrayEnd(text, valueBracket);
            const afterEnd = text[valueEnd + 1] === ',' ? valueEnd + 2 : valueEnd + 1;
            text = text.slice(0, replaceFrom) + newEntry + text.slice(afterEnd);
        }
    }

    await writeFile(filePath, text);
}

// Backward-compat alias used by box.js
export async function writeBoxItemsConfig(boxKey, config) {
    return writeBoxConfig('boxItems', boxKey, config);
}

// ─── Field state helpers ───────────────────────────────────────────────────────

function isFieldActive(key, config) {
    if (!config || !(key in config)) {
        return DEFAULT_FIELDS.find((f) => f.key === key)?.defaultActive ?? false;
    }
    return config[key] !== false;
}

function getCustomFields(config) {
    if (!config) return [];
    return Object.entries(config)
        .filter(([k]) => k.startsWith('module_data.'))
        .map(([k, v]) => ({ key: k, config: v }));
}

// ─── UI ───────────────────────────────────────────────────────────────────────

async function promptNewCustomField(existingKey = null, existingConfig = null) {
    const isEdit = existingKey !== null;
    let suffix;

    if (isEdit) {
        suffix = existingKey.replace('module_data.', '');
        p.log.info(pc.cyan(`Editing: ${existingKey}`));
    } else {
        const input = await p.text({
            message: 'Field key suffix (will be module_data.{suffix}):',
            validate: (val) => {
                if (!val || !val.trim()) return 'Required';
                if (!/^[a-z0-9_]+$/.test(val)) return 'Use lowercase letters, numbers and underscores only';
            },
        });
        if (p.isCancel(input)) cancel();
        suffix = input;
    }

    const label = await p.text({
        message: 'Label:',
        initialValue: existingConfig?.label ?? undefined,
        validate: (val) => (!val || !val.trim() ? 'Required' : undefined),
    });
    if (p.isCancel(label)) cancel();

    const currentType = existingConfig?.type ?? 'text';
    const type = await p.select({
        message: 'Type:',
        options: FIELD_TYPES.map((t) => ({ value: t, label: t })),
        initialValue: currentType,
    });
    if (p.isCancel(type)) cancel();

    let input;
    if (type === 'editor') {
        const editorPresets = await fetchEditorPresets();
        const presetChoice = await p.select({
            message: 'Editor preset:',
            options: [
                ...editorPresets.map((v) => ({ value: v, label: v })),
                { value: 'custom', label: 'Custom...' },
            ],
        });
        if (p.isCancel(presetChoice)) cancel();

        let presetValue = presetChoice;
        if (presetChoice === 'custom') {
            const customPreset = await p.text({
                message: 'Preset name:',
                validate: (val) => (!val || !val.trim() ? 'Required' : undefined),
            });
            if (p.isCancel(customPreset)) cancel();
            presetValue = customPreset.trim();
        }
        input = `{"preset":"${presetValue}"}`;
    }

    const fieldConfig = { label: label.trim() };
    if (type !== 'text') fieldConfig.type = type;
    if (input) fieldConfig.input = input;

    return { key: `module_data.${suffix.trim()}`, config: fieldConfig };
}

async function runFieldsForSection(box, section) {
    const spinner = p.spinner();
    spinner.start('Reading current config...');
    let currentConfig;
    try {
        currentConfig = await readBoxConfig(section, box.boxKey);
        spinner.stop(pc.cyan(currentConfig ? 'Loaded existing config' : 'No config yet, using defaults'));
    } catch (err) {
        spinner.stop(pc.red('Failed to read config'));
        p.log.error(err.message);
        return;
    }

    // ── Default fields toggle ──────────────────────────────────────────────────

    const activeDefaults = DEFAULT_FIELDS
        .filter((f) => isFieldActive(f.key, currentConfig))
        .map((f) => f.key);

    const toggled = await p.multiselect({
        message: 'Default fields (space to toggle, enter to confirm):',
        options: DEFAULT_FIELDS.map((f) => ({ value: f.key, label: f.key })),
        initialValues: activeDefaults,
        required: false,
    });
    if (p.isCancel(toggled)) cancel();

    // Build new config from toggled defaults
    const newConfig = {};

    for (const field of DEFAULT_FIELDS) {
        // active = omit (use vendor default), inactive = false
        if (!toggled.includes(field.key)) {
            newConfig[field.key] = false;
        }
    }

    // ── Custom fields ─────────────────────────────────────────────────────────

    // Carry over keys not managed here (e.g. has_subitems)
    const defaultKeys = new Set(DEFAULT_FIELDS.map((f) => f.key));
    if (currentConfig) {
        for (const [k, v] of Object.entries(currentConfig)) {
            if (!defaultKeys.has(k) && !k.startsWith('module_data.')) {
                newConfig[k] = v;
            }
        }
    }

    // Carry over existing custom fields
    const customFields = getCustomFields(currentConfig);
    for (const { key, config } of customFields) {
        newConfig[key] = config;
    }

    // Manage existing custom fields
    if (customFields.length > 0) {
        while (true) {
            const pick = await p.select({
                message: 'Custom fields:',
                options: [
                    ...customFields.map((f) => ({ value: f.key, label: `${f.key} (${f.config?.label ?? ''})` })),
                    { value: '__done', label: 'Done managing' },
                ],
            });
            if (p.isCancel(pick)) cancel();
            if (pick === '__done') break;

            const action = await p.select({
                message: `"${pick}"`,
                options: [
                    { value: 'keep',   label: 'Keep' },
                    { value: 'edit',   label: 'Edit' },
                    { value: 'remove', label: 'Remove' },
                ],
            });
            if (p.isCancel(action)) cancel();
            if (action === 'remove') {
                delete newConfig[pick];
            } else if (action === 'edit') {
                const field = await promptNewCustomField(pick, newConfig[pick]);
                if (field) {
                    newConfig[pick] = field.config;
                    p.log.info(pc.cyan(`Updated: ${pick}`));
                }
            }
        }
    }

    // Add new custom field
    while (true) {
        const addNew = await p.confirm({ message: 'Add a custom field (module_data.*)?', initialValue: false });
        if (p.isCancel(addNew)) cancel();
        if (!addNew) break;

        const field = await promptNewCustomField();
        if (field) {
            newConfig[field.key] = field.config;
            p.log.info(pc.cyan(`Added: ${field.key}`));
        }
    }

    // ── Write ─────────────────────────────────────────────────────────────────

    spinner.start('Writing config/rshop.php...');
    try {
        await writeBoxConfig(section, box.boxKey, newConfig);
        spinner.stop(pc.cyan('config/rshop.php updated ✨'));
    } catch (err) {
        spinner.stop(pc.red('Failed to write config'));
        p.log.error(err.message);
    }
}

export async function enableBoxSubitems(boxKey, subitemsType) {
    const current = await readBoxConfig('boxItems', boxKey) ?? {};
    await writeBoxConfig('boxItems', boxKey, { ...current, has_subitems: subitemsType });
    if (subitemsType !== 'custom') {
        await writeBoxConfig('boxSubitems', boxKey, { name: false, url: false, image: false });
    }
}

export async function boxHasSubitems(boxKey) {
    const config = await readBoxConfig('boxItems', boxKey);
    return config ? config['has_subitems'] !== undefined && config['has_subitems'] !== false : false;
}

export async function getSeedableFields(section, boxKey) {
    const config = await readBoxConfig(section, boxKey);
    const result = { name: false, url: false, moduleData: {} };

    result.name = !config || !('name' in config) || config['name'] !== false;
    result.url  = !config || !('url'  in config) || config['url']  !== false;

    if (config) {
        for (const [k, v] of Object.entries(config)) {
            if (!k.startsWith('module_data.') || !v || v === false) continue;
            const type = v.type ?? 'text';
            if (type !== 'upload') result.moduleData[k.replace('module_data.', '')] = type;
        }
    }

    return result;
}

export async function getSubitemsType(boxKey) {
    const config = await readBoxConfig('boxItems', boxKey);
    if (!config) return null;
    const val = config['has_subitems'];
    return (val && val !== false) ? val : null;
}

export async function runBoxFields(box) {
    return runFieldsForSection(box, 'boxItems');
}

export async function runBoxSubitemFields(box) {
    return runFieldsForSection(box, 'boxSubitems');
}
