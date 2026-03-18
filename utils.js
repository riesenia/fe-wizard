import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const FIELD_TYPES      = ['text', 'textarea', 'editor', 'email', 'bool', 'number', 'tel', 'password', 'select', 'color'];
export const TEXT_FIELD_TYPES = ['text', 'textarea', 'editor'];

export const rootDir = process.cwd();

export function toCamelCase(str) {
    return str
        .split(/[-_]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

export function toLowerCamelCase(str) {
    const pascal = toCamelCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function cancel(msg = 'Cancelled.') {
    p.cancel(msg);
    process.exit(0);
}

export async function fetchEditorPresets() {
    const presets = [];

    // From vendor rshop_admin.php — keys of TinyMCE.configs (excluding 'default')
    try {
        const adminContent = await readFile(
            join(rootDir, 'vendor/rshop/admin/config/rshop_admin.php'), 'utf8'
        );
        const startIdx = adminContent.indexOf("'TinyMCE.configs'");
        if (startIdx !== -1) {
            const bracketIdx = adminContent.indexOf('[', startIdx);
            let depth = 0;
            let i = bracketIdx;
            while (i < adminContent.length) {
                if (adminContent[i] === '[') depth++;
                else if (adminContent[i] === ']') {
                    depth--;
                    if (depth === 0) break;
                } else if (depth === 1 && adminContent[i] === "'") {
                    const keyMatch = adminContent.slice(i).match(/^'([^']+)'\s*=>\s*\[/);
                    if (keyMatch && keyMatch[1] !== 'default') presets.push(keyMatch[1]);
                }
                i++;
            }
        }
    } catch { /* file missing */ }

    // From app rshop.php — 'TinyMCE.configs.{name}' => [ (array values, not scalar overrides)
    try {
        const appContent = await readFile(join(rootDir, 'config/rshop.php'), 'utf8');
        const regex = /^'TinyMCE\.configs\.([^.']+)'\s*=>\s*\[/mg;
        let match;
        while ((match = regex.exec(appContent)) !== null) {
            if (!presets.includes(match[1])) presets.push(match[1]);
        }
    } catch { /* file missing */ }

    return presets;
}

export function validatePositiveInt(val) {
    if (!val || !val.trim() || isNaN(Number(val)) || Number(val) <= 0)
        return 'Enter a valid positive number';
}

export async function promptEditorPreset() {
    const editorPresets = await fetchEditorPresets();
    const presetChoice = await p.select({
        message: 'Editor preset:',
        options: [
            ...editorPresets.map((v) => ({ value: v, label: v })),
            { value: 'custom', label: 'Custom...' },
        ],
    });
    if (p.isCancel(presetChoice)) cancel();

    if (presetChoice === 'custom') {
        const customPreset = await p.text({
            message: 'Preset name:',
            validate: (val) => (!val || !val.trim() ? 'Required' : undefined),
        });
        if (p.isCancel(customPreset)) cancel();
        return customPreset.trim();
    }
    return presetChoice;
}

export async function promptSelectOptions(initialOptions = []) {
    const options = [...initialOptions];
    if (options.length > 0) {
        p.log.info(pc.cyan(`Current options: ${options.map((o) => `${o.key}=${o.value}`).join(', ')}`));
        const keepExisting = await p.confirm({ message: 'Keep existing options?', initialValue: true });
        if (p.isCancel(keepExisting)) cancel();
        if (!keepExisting) options.length = 0;
    }
    let addOption = true;
    while (addOption) {
        const optionNum = options.length + 1;
        const optionKey = await p.text({
            message: `Select option ${optionNum} — key:`,
            validate: (val) => {
                if (!val || !val.trim()) return 'Key is required';
                if (options.some((o) => o.key === val.trim())) return 'Key already used';
            },
        });
        if (p.isCancel(optionKey)) cancel();

        const optionLabel = await p.text({
            message: `Select option ${optionNum} — label:`,
            validate: (val) => (!val || !val.trim() ? 'Label is required' : undefined),
        });
        if (p.isCancel(optionLabel)) cancel();

        options.push({ key: optionKey.trim(), value: optionLabel.trim() });

        const more = await p.confirm({ message: 'Add another option?', initialValue: true });
        if (p.isCancel(more)) cancel();
        addOption = more;
    }
    return options;
}
