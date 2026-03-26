import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { rootDir, cancel, text, FIELD_TYPES, promptEditorPreset, promptSelectOptions } from '../utils.js';

// Default fields from vendor config
const DEFAULT_FIELDS = [
    { key: 'name',  defaultActive: true },
    { key: 'url',   defaultActive: true },
    { key: 'image', defaultActive: true },
];

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
    const phpFilePath = join(rootDir, 'config/rshop.php').replace(/'/g, "\\'");
    const escapedKey = boxKey.replace(/'/g, "\\'");
    try {
        const { stdout } = await execa('php', [
            '-r',
            `$c = include '${phpFilePath}'; echo json_encode($c['Admin']['${section}']['${escapedKey}'] ?? null);`,
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

async function promptManageCustomFields(customFields, { getLabel, getEditValue, onEdit, onRemove }) {
    while (true) {
        const pick = await p.select({
            message: 'Custom fields:',
            options: [
                ...customFields.map((f) => ({ value: f.key, label: `${f.key} (${getLabel(f)})` })),
                { value: '__done', label: 'Done managing' },
            ],
        });
        if (p.isCancel(pick)) return;
        if (pick === '__done') break;

        const action = await p.select({
            message: `"${pick}"`,
            options: [
                { value: 'keep',   label: 'Keep' },
                { value: 'edit',   label: 'Edit' },
                { value: 'remove', label: 'Remove' },
            ],
        });
        if (p.isCancel(action)) return;
        if (action === 'remove') {
            onRemove(pick);
        } else if (action === 'edit') {
            const field = await promptNewCustomField(pick, getEditValue(pick));
            if (field) {
                onEdit(pick, field.config);
                p.log.info(pc.cyan(`Updated: ${pick}`));
            }
        }
    }
}

async function promptNewCustomField(existingKey = null, existingConfig = null) {
    const isEdit = existingKey !== null;
    let suffix;

    if (isEdit) {
        suffix = existingKey.replace('module_data.', '');
        p.log.info(pc.cyan(`Editing: ${existingKey}`));
    } else {
        const input = await text({
            message: 'Field key suffix (will be module_data.{suffix}):',
            validate: (val) => {
                if (!val || !val.trim()) return 'Required';
                if (!/^[a-z0-9_]+$/.test(val)) return 'Use lowercase letters, numbers and underscores only';
            },
        });
        if (p.isCancel(input)) return;
        suffix = input;
    }

    const label = await text({
        message: 'Label:',
        initialValue: existingConfig?.label ?? undefined,
        validate: (val) => (!val || !val.trim() ? 'Required' : undefined),
    });
    if (p.isCancel(label)) return;

    const currentType = existingConfig?.type ?? 'text';
    const type = await p.select({
        message: 'Type:',
        options: FIELD_TYPES.map((t) => ({ value: t, label: t })),
        initialValue: currentType,
    });
    if (p.isCancel(type)) return;

    let editorInput = null;
    let selectOptions = null;
    if (type === 'editor') {
        const preset = await promptEditorPreset();
        editorInput = `{"preset":"${preset}"}`;
    } else if (type === 'select') {
        // Resolve initial options from existing config (supports kendo.dataSource.data, options object, and old JSON input formats)
        let initialOptions = [];
        if (existingConfig?.kendo?.dataSource?.data) {
            initialOptions = existingConfig.kendo.dataSource.data.map((item) => ({ key: item.id, value: item.name }));
        } else if (existingConfig?.options && typeof existingConfig.options === 'object') {
            initialOptions = Object.entries(existingConfig.options).map(([k, v]) => ({ key: k, value: v }));
        } else if (existingConfig?.input) {
            try {
                const parsed = JSON.parse(existingConfig.input);
                if (Array.isArray(parsed.options)) initialOptions = parsed.options;
            } catch { /* ignore */ }
        }
        selectOptions = await promptSelectOptions(initialOptions);
    }

    const fieldConfig = { label: label.trim() };
    if (type !== 'text') fieldConfig.type = type;
    if (editorInput) fieldConfig.input = editorInput;
    // Store select options as kendo.dataSource.data array — IDs are stored as string VALUES (not PHP array keys),
    // so PHP integer coercion never occurs and SelectWidget.php receives proper string IDs.
    if (selectOptions) {
        fieldConfig.kendo = { dataSource: { data: selectOptions.map((o) => ({ id: o.key, name: o.value })) } };
    }

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
    if (p.isCancel(toggled)) return;

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
        await promptManageCustomFields(customFields, {
            getLabel: (f) => f.config?.label ?? '',
            getEditValue: (key) => newConfig[key],
            onEdit: (key, config) => { newConfig[key] = config; },
            onRemove: (key) => { delete newConfig[key]; },
        });
    }

    // Add new custom field
    while (true) {
        const addNew = await p.confirm({ message: 'Add a custom field (module_data.*)?', initialValue: false });
        if (p.isCancel(addNew)) return;
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

// ─── Banner fields ─────────────────────────────────────────────────────────────

export const BANNER_ITEM_BLOCKS = [
    { block: 'banner_place_item_main',  fields: ['name', 'description', 'type', 'url', 'target_blank'] },
    { block: 'banner_place_item_files', fields: ['desktop', 'tablet', 'phone'] },
    { block: 'banner_place_item_video', fields: ['video'] },
    { block: 'banner_place_item_other', fields: ['valid_from', 'valid_until'] },
];

async function readVendorBannerDefaults() {
    try {
        const content = await readFile(
            join(rootDir, 'vendor/rshop/admin/config/rshop_admin.php'), 'utf8'
        );

        const bpiIdx = content.indexOf("'bannerPlaceItems'");
        if (bpiIdx === -1) return null;

        const bpiBracket = content.indexOf('[', bpiIdx);
        const bpiSlice = content.slice(bpiBracket, findArrayEnd(content, bpiBracket) + 1);

        const defaultIdx = bpiSlice.indexOf("'default'");
        if (defaultIdx === -1) return null;

        const defaultBracket = bpiSlice.indexOf('[', defaultIdx);
        const defaultSlice = bpiSlice.slice(defaultBracket, findArrayEnd(bpiSlice, defaultBracket) + 1);

        const result = {};
        const blockRegex = /'(banner_place_item_\w+)'\s*=>\s*\[/g;
        let blockMatch;
        while ((blockMatch = blockRegex.exec(defaultSlice)) !== null) {
            const bracketPos = defaultSlice.indexOf('[', blockMatch.index + blockMatch[0].length - 1);
            const blockSlice = defaultSlice.slice(bracketPos, findArrayEnd(defaultSlice, bracketPos) + 1);
            result[blockMatch[1]] = {};
            const fieldRegex = /'(\w+)'\s*=>\s*\[\s*'active'\s*=>\s*(true|false)\s*\]/g;
            let fieldMatch;
            while ((fieldMatch = fieldRegex.exec(blockSlice)) !== null) {
                result[blockMatch[1]][fieldMatch[1]] = { active: fieldMatch[2] === 'true' };
            }
        }

        return result;
    } catch {
        return null;
    }
}

function isBannerFieldActive(block, field, appConfig, vendorDefaults) {
    if (appConfig?.[block]?.[field]?.active !== undefined) return appConfig[block][field].active;
    if (vendorDefaults?.[block]?.[field]?.active !== undefined) return vendorDefaults[block][field].active;
    return true;
}

export async function writeBannerItemsConfig(bannerKey, config) {
    return writeBoxConfig('bannerPlaceItems', bannerKey, config);
}

async function readBannerItemsConfig(bannerKey) {
    return readBoxConfig('bannerPlaceItems', bannerKey);
}

export async function runBannerFields(banner) {
    const spinner = p.spinner();
    spinner.start('Reading current config...');
    let appConfig, vendorDefaults;
    try {
        [appConfig, vendorDefaults] = await Promise.all([
            readBannerItemsConfig(banner.bannerKey),
            readVendorBannerDefaults(),
        ]);
        spinner.stop(pc.cyan(appConfig ? 'Loaded existing config' : 'No config yet, using defaults'));
    } catch (err) {
        spinner.stop(pc.red('Failed to read config'));
        p.log.error(err.message);
        return;
    }

    const newConfig = {};

    for (const { block, fields } of BANNER_ITEM_BLOCKS) {
        const activeFields = fields.filter((field) => isBannerFieldActive(block, field, appConfig, vendorDefaults));

        const toggled = await p.multiselect({
            message: `${block}:`,
            options: fields.map((f) => ({ value: f, label: f })),
            initialValues: activeFields,
            required: false,
        });
        if (p.isCancel(toggled)) return;

        const blockConfig = {};
        for (const field of fields) {
            const vendorDefault = vendorDefaults?.[block]?.[field]?.active ?? true;
            const isChecked = toggled.includes(field);
            // Only write overrides that differ from the vendor default
            if (isChecked !== vendorDefault) {
                blockConfig[field] = { active: isChecked };
            }
        }

        if (Object.keys(blockConfig).length > 0) {
            newConfig[block] = blockConfig;
        }

        if (block === 'banner_place_item_main') {
            // Admin format: { input_options: { label, type, input } } — needed for Hash::merge in form_base.ctp
            const existingAfterMain = appConfig?.banner_place_item_after_main ?? {};
            const customFields = Object.entries(existingAfterMain)
                .filter(([k]) => k.startsWith('module_data.'))
                .map(([k, v]) => ({ key: k, inputOptions: v?.input_options ?? v ?? {} }));

            const afterMainConfig = {};
            for (const { key, inputOptions } of customFields) {
                afterMainConfig[key] = { input_options: inputOptions };
            }

            if (customFields.length > 0) {
                await promptManageCustomFields(customFields, {
                    getLabel: (f) => f.inputOptions?.label ?? '',
                    getEditValue: (key) => afterMainConfig[key]?.input_options,
                    onEdit: (key, config) => { afterMainConfig[key] = { input_options: config }; },
                    onRemove: (key) => { delete afterMainConfig[key]; },
                });
            }

            while (true) {
                const addNew = await p.confirm({ message: 'Add a custom field (module_data.*)?', initialValue: false });
                if (p.isCancel(addNew)) return;
                if (!addNew) break;

                const field = await promptNewCustomField();
                if (field) {
                    afterMainConfig[field.key] = { input_options: field.config };
                    p.log.info(pc.cyan(`Added: ${field.key}`));
                }
            }

            if (Object.keys(afterMainConfig).length > 0) {
                newConfig['banner_place_item_after_main'] = afterMainConfig;
            }
        }
    }

    spinner.start('Writing config/rshop.php...');
    try {
        await writeBannerItemsConfig(banner.bannerKey, newConfig);
        spinner.stop(pc.cyan('config/rshop.php updated ✨'));
    } catch (err) {
        spinner.stop(pc.red('Failed to write config'));
        p.log.error(err.message);
    }
}
