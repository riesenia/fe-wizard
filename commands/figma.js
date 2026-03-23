import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { rootDir, text } from '../utils.js';

const WIZARD_CONFIG_FILE = join(rootDir, 'config/.wizard.json');

async function loadConfig() {
    try {
        return JSON.parse(await readFile(WIZARD_CONFIG_FILE, 'utf8'));
    } catch {
        return {};
    }
}

async function saveConfig(data) {
    await writeFile(WIZARD_CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function askForUrl(initialValue = '') {
    return text({
        message: 'Figma URL:',
        placeholder: 'Draft (code)',
        initialValue,
        validate: (v) => (!v || !v.trim() ? 'URL is required' : undefined),
    });
}

export async function runFigmaMenu() {
    while (true) {
        const config = await loadConfig();
        const figmaUrl = config.figmaUrl ?? null;

        p.note(
            `URL: ${figmaUrl ? pc.cyan(figmaUrl) : pc.dim('not set')}`,
            'Figma'
        );

        const options = [
            { value: 'fetch',     label: 'Fetch variables' },
            ...(figmaUrl ? [{ value: 'change-url', label: 'Change URL' }] : []),
            { value: '__back__',  label: '↩ Back' },
        ];

        const action = await p.select({ message: 'Figma', options });
        if (p.isCancel(action) || action === '__back__') return;

        if (action === 'change-url') {
            const input = await askForUrl(figmaUrl);
            if (p.isCancel(input)) continue;
            await saveConfig({ ...config, figmaUrl: input.trim() });
            continue;
        }

        if (action === 'fetch') {
            let url = figmaUrl;

            if (!url) {
                const input = await askForUrl();
                if (p.isCancel(input)) continue;
                url = input.trim();
                await saveConfig({ ...config, figmaUrl: url });
            }

            const prompt =
`Use the Figma MCP tool get_variable_defs to fetch variables from this Figma URL: ${url}

Then update resources/css/common/_variables.scss in two places:

1. /** COLOR PALETTES */ :root block — the file uses SCSS @each loops mapping shade numbers to hex values, producing CSS custom properties like --c-grey-500, --c-primary-300 etc. The group names (grey, primary, etc.) come from the Figma variable collection group names — map them to lowercase kebab-case. Keep the exact @each loop structure intact. Only replace hex color values.

2. /* font size */ $font-sizes SCSS map inside the first /** PROJECT VARIABLES */ :root block — it has named size keys (xxxs, xxs, xs, s, m, ml, l, lxl, xl, xxl, xxxl) each with desktop and mobile rem values. Map the Figma Typography variables to these keys by matching size names or scale order. Values are in rem (1rem = 10px), so convert px to rem if needed. Keep the exact map structure intact.

Do not touch any other part of the file.`;

            p.note(
                `1. Open the Figma file in the ${pc.bold('Figma desktop app')}\n` +
                `2. Navigate to the variables/design tokens page\n` +
                `3. ${pc.bold('Select any layer')} on the canvas\n` +
                `4. Come back here and confirm`,
                'Before continuing'
            );

            const ready = await p.confirm({ message: 'Ready?', initialValue: true });
            if (p.isCancel(ready) || !ready) continue;

            const spinner = p.spinner();
            spinner.start('Fetching Figma variables...');
            try {
                const result = await execa('claude', [
                    '-p', prompt,
                    '--allowedTools', 'mcp__figma__get_variable_defs,Read,Edit',
                ], { cwd: rootDir, all: true });
                spinner.stop(pc.cyan('Variables updated ✨'));
                if (result.all) p.log.info(result.all);
            } catch (err) {
                spinner.stop(pc.red('Failed to fetch variables'));
                p.log.error(err.all || err.stderr || err.message);
            }
        }
    }
}
