import * as p from '@clack/prompts';
import { readFile } from 'fs/promises';
import { join } from 'path';

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
