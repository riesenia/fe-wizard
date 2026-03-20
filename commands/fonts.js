import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { cancel, rootDir } from '../utils.js';

const FONTS_DIR_REL  = 'public/fonts';
const FONTS_SCSS_REL = 'resources/css/common/_fonts.scss';
const ICOMOON        = 'icomoon';
const BROWSER_UA     = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Font folder names have spaces stripped: "TikTok Sans" → "TikTokSans"
function folderName(name) {
    return name.replace(/\s+/g, '');
}

// ── URL tracking ─────────────────────────────────────────────────────────────

function escapeRe(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readFontUrl(fontName, content) {
    const m = content.match(new RegExp(`^// @font-url\\[${escapeRe(fontName)}\\]:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
}

function writeFontUrl(fontName, url, content) {
    const line    = `// @font-url[${fontName}]: ${url}`;
    const existing = new RegExp(`^// @font-url\\[${escapeRe(fontName)}\\]:\\s*.+$`, 'm');

    if (existing.test(content)) {
        return content.replace(existing, line);
    }

    // Insert after the last @use line, or at the very top
    const useMatches = [...content.matchAll(/^@use[^\n]*\n/gm)];
    if (useMatches.length) {
        const last = useMatches[useMatches.length - 1];
        const idx  = last.index + last[0].length;
        return content.slice(0, idx) + line + '\n' + content.slice(idx);
    }

    return line + '\n' + content;
}

// ── SCSS parsing ─────────────────────────────────────────────────────────────

function extractProp(body, prop) {
    const m = body.match(new RegExp(`${prop}:\\s*([^;\\n]+)`));
    return m ? m[1].trim() : null;
}

function parseScssBlocks(content) {
    const blocks = [];

    // Active @font-face blocks
    const activeRe = /\/\*\s*([^*\n]+?)\s*\*\/\n@font-face\s*\{([\s\S]*?\n)\}/g;
    let m;
    while ((m = activeRe.exec(content)) !== null) {
        const body   = m[2];
        const family = extractProp(body, 'font-family')?.replace(/['"]/g, '');
        if (!family) continue;
        blocks.push({
            setName: m[1].trim(),
            family,
            weight: extractProp(body, 'font-weight'),
            style:  extractProp(body, 'font-style') ?? 'normal',
            unicodeRange: extractProp(body, 'unicode-range'),
            commented: false,
            raw: m[0],
        });
    }

    // Commented @font-face blocks
    const commentedRe = /\/\*\s*([^*\n]+?)\s*\*\/\n((?:\/\/[^\n]*(?:\n|$))+)/g;
    while ((m = commentedRe.exec(content)) !== null) {
        const stripped = m[2].replace(/^\/\/ ?/gm, '');
        const family   = extractProp(stripped, 'font-family')?.replace(/['"]/g, '');
        if (!family) continue;
        blocks.push({
            setName: m[1].trim(),
            family,
            weight: extractProp(stripped, 'font-weight'),
            style:  extractProp(stripped, 'font-style') ?? 'normal',
            unicodeRange: extractProp(stripped, 'unicode-range'),
            commented: true,
            raw: m[0],
        });
    }

    return blocks;
}

function groupByFamily(blocks) {
    const map = new Map();
    for (const block of blocks) {
        if (!map.has(block.family)) map.set(block.family, []);
        map.get(block.family).push(block);
    }
    return map;
}

// ── Block transforms ─────────────────────────────────────────────────────────

function commentBlock(raw) {
    const lines = raw.split('\n');
    return [lines[0], ...lines.slice(1).map(l => `// ${l}`)].join('\n');
}

function uncommentBlock(raw) {
    const lines = raw.split('\n');
    return [lines[0], ...lines.slice(1).map(l => l.replace(/^\/\/ ?/, ''))].join('\n');
}

// Avoid `$` special meaning in replacement string
function safeReplace(content, search, replacement) {
    return content.replace(search, () => replacement);
}

// ── Font detection ───────────────────────────────────────────────────────────

async function detectFonts() {
    const fontsPath = join(rootDir, FONTS_DIR_REL);
    const scssPath  = join(rootDir, FONTS_SCSS_REL);

    let folders = [];
    try {
        const entries = await readdir(fontsPath, { withFileTypes: true });
        folders = entries
            .filter(e => e.isDirectory() && e.name !== ICOMOON)
            .map(e => e.name);
    } catch { /* directory missing */ }

    let scssContent = '';
    try {
        scssContent = await readFile(scssPath, 'utf8');
    } catch { /* file missing */ }

    const blocks   = parseScssBlocks(scssContent);
    const byFamily = groupByFamily(blocks);

    // Start from SCSS families, then add folders that don't map to any family
    const allNames = new Set(byFamily.keys());
    for (const folder of folders) {
        const matched = [...byFamily.keys()].some(f => folderName(f) === folder);
        if (!matched) allNames.add(folder);
    }

    const fonts = await Promise.all([...allNames].map(async (name) => {
        const fontBlocks = byFamily.get(name) ?? [];
        const fFolder    = folderName(name);
        let files = [];
        try {
            files = (await readdir(join(fontsPath, fFolder))).filter(f => f.endsWith('.woff2'));
        } catch { /* folder missing */ }

        const status = fontBlocks.length === 0   ? 'no-definition'
            : fontBlocks.some(b => !b.commented) ? 'enabled'
            : 'disabled';

        return {
            name,
            blocks: fontBlocks,
            files,
            folderExists: folders.includes(fFolder),
            status,
            savedUrl: readFontUrl(name, scssContent),
        };
    }));

    return { fonts, scssContent };
}

// ── Google Fonts ─────────────────────────────────────────────────────────────

async function fetchGoogleFontsBlocks(url) {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const css = await res.text();

    const blocks = [];
    const re = /\/\*\s*([^*\n]+?)\s*\*\/\s*\n@font-face\s*\{([\s\S]*?\n)\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
        const body         = m[2];
        const family       = extractProp(body, 'font-family')?.replace(/['"]/g, '');
        const weight       = extractProp(body, 'font-weight');
        const style        = extractProp(body, 'font-style') ?? 'normal';
        const unicodeRange = extractProp(body, 'unicode-range');
        const srcMatch     = body.match(/url\(['"]?([^'")\s]+\.woff2)['"]?\)/);
        if (family && srcMatch) {
            blocks.push({ setName: m[1].trim(), family, weight, style, unicodeRange, srcUrl: srcMatch[1] });
        }
    }
    return blocks;
}

async function downloadBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

function buildScssBlock(fontName, setName, weight, style, unicodeRange) {
    const slug      = fontName.toLowerCase().replace(/\s+/g, '-');
    const setSlug   = setName.toLowerCase().replace(/\s+/g, '-');
    const styleSlug = style !== 'normal' ? `${style}-` : '';
    const file      = `${slug}-${styleSlug}${setSlug}.woff2`;
    return (
        `/* ${setName} */\n` +
        `@font-face {\n` +
        `  font-family: '${fontName}';\n` +
        `  font-style: ${style};\n` +
        `  font-weight: ${weight};\n` +
        `  font-display: swap;\n` +
        `  src: url("#{$p_fonts}${folderName(fontName)}/${file}") format('woff2');\n` +
        `  unicode-range: ${unicodeRange};\n` +
        `}`
    );
}

// ── Shared download + SCSS write ─────────────────────────────────────────────

async function downloadAndApply(fontName, url, existingBlocks = []) {
    const spinner = p.spinner();
    spinner.start('Fetching font info from Google Fonts...');
    let blocks;
    try {
        blocks = await fetchGoogleFontsBlocks(url);
        spinner.stop(pc.cyan(`Found ${blocks.length} variant(s) for "${fontName}"`));
    } catch (err) {
        spinner.stop(pc.red('Failed to fetch'));
        p.log.error(err.message);
        return false;
    }

    if (!blocks.length) {
        p.log.warn('No @font-face blocks found in the response');
        return false;
    }

    const fontDir  = join(rootDir, FONTS_DIR_REL, folderName(fontName));
    await mkdir(fontDir, { recursive: true });

    const slug       = fontName.toLowerCase().replace(/\s+/g, '-');
    const scssBlocks = [];

    for (const block of blocks) {
        const setSlug   = block.setName.toLowerCase().replace(/\s+/g, '-');
        const styleSlug = block.style !== 'normal' ? `${block.style}-` : '';
        const fileName  = `${slug}-${styleSlug}${setSlug}.woff2`;

        spinner.start(`Downloading ${fileName}...`);
        try {
            const buf = await downloadBuffer(block.srcUrl);
            await writeFile(join(fontDir, fileName), buf);
            spinner.stop(pc.cyan(`${fileName} saved`));
            scssBlocks.push(buildScssBlock(fontName, block.setName, block.weight, block.style, block.unicodeRange));
        } catch (err) {
            spinner.stop(pc.red(`Failed: ${fileName}`));
            p.log.error(err.message);
        }
    }

    if (!scssBlocks.length) {
        p.log.warn('No files were downloaded successfully');
        return false;
    }

    const scssPath = join(rootDir, FONTS_SCSS_REL);
    let content    = await readFile(scssPath, 'utf8').catch(() => '');

    // Remove existing blocks for this font (refetch case)
    for (const block of existingBlocks) {
        content = content.replace(`\n${block.raw}`, '').replace(block.raw, '');
    }
    if (existingBlocks.length) {
        content = content.replace(/\n{3,}/g, '\n\n');
    }

    // Append new blocks and save URL
    content = content.trimEnd() + '\n\n' + scssBlocks.join('\n\n') + '\n';
    content = writeFontUrl(fontName, url, content);

    await writeFile(scssPath, content);
    p.log.success(pc.cyan(`${scssBlocks.length} @font-face block(s) written to ${FONTS_SCSS_REL} ✨`));
    return true;
}

// ── Add / Refetch ─────────────────────────────────────────────────────────────

async function askGoogleFontsUrl(savedUrl) {
    if (savedUrl) {
        const choice = await p.select({
            message: 'Google Fonts URL:',
            options: [
                { value: 'saved', label: `Use saved: ${pc.dim(savedUrl)}` },
                { value: 'new',   label: 'Enter a new URL' },
            ],
        });
        if (p.isCancel(choice)) return;
        if (choice === 'saved') return savedUrl;
    }

    const url = await p.text({
        message: 'Google Fonts URL:',
        placeholder: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@...',
        validate: (val) => {
            if (!val?.trim()) return 'URL is required';
            if (!val.includes('fonts.googleapis.com')) return 'Must be a fonts.googleapis.com URL';
        },
    });
    if (p.isCancel(url)) return;
    return url.trim();
}

async function addNewFont() {
    const url = await askGoogleFontsUrl(null);

    // Peek at the font name before confirming download
    const spinner = p.spinner();
    spinner.start('Fetching font info...');
    let blocks;
    try {
        blocks = await fetchGoogleFontsBlocks(url);
        spinner.stop(pc.cyan(`Found ${blocks.length} variant(s) for "${blocks[0]?.family}"`));
    } catch (err) {
        spinner.stop(pc.red('Failed to fetch'));
        p.log.error(err.message);
        return;
    }

    if (!blocks.length) {
        p.log.warn('No @font-face blocks found in the response');
        return;
    }

    const fontName = blocks[0].family;
    p.note(
        [
            `Font:     ${fontName}`,
            `Sets:     ${[...new Set(blocks.map(b => b.setName))].join(', ')}`,
            `Weights:  ${[...new Set(blocks.map(b => b.weight))].join(', ')}`,
            `Variants: ${blocks.length}`,
        ].join('\n'),
        'Font details'
    );

    const confirm = await p.confirm({ message: `Download and add "${fontName}"?`, initialValue: true });
    if (p.isCancel(confirm)) return;
    if (!confirm) return;

    await downloadAndApply(fontName, url);
}

async function refetchFont(font) {
    const url = await askGoogleFontsUrl(font.savedUrl);
    await downloadAndApply(font.name, url, font.blocks);
}

// ── Font actions ─────────────────────────────────────────────────────────────

function statusLabel(status) {
    if (status === 'enabled')  return pc.green('enabled');
    if (status === 'disabled') return pc.yellow('disabled');
    return pc.dim('no definition');
}

async function handleFontActions(font) {
    const sets = font.blocks.length
        ? font.blocks.map(b => b.setName + (b.commented ? pc.dim(' (off)') : ''))
        : font.files.map(f => f.replace(/^[^-]+-/, '').replace(/\.woff2$/, ''));

    const weights = [...new Set(font.blocks.map(b => b.weight).filter(Boolean))];

    p.note(
        [
            `Status:  ${statusLabel(font.status)}`,
            sets.length    ? `Sets:    ${sets.join(', ')}`    : null,
            weights.length ? `Weights: ${weights.join(', ')}` : null,
            font.folderExists
                ? `Folder:  ${FONTS_DIR_REL}/${folderName(font.name)}/`
                : `Folder:  ${pc.dim('missing')}`,
            font.savedUrl  ? `URL:     ${pc.dim(font.savedUrl)}` : null,
        ].filter(Boolean).join('\n'),
        font.name
    );

    const options = [];
    if (font.status === 'disabled') options.push({ value: 'enable',  label: 'Enable font' });
    if (font.status === 'enabled')  options.push({ value: 'disable', label: 'Disable font' });
    options.push({ value: 'refetch', label: 'Refetch from Google Fonts' });
    if (font.blocks.length || font.folderExists) options.push({ value: 'remove', label: pc.red('Remove font') });
    options.push({ value: 'back', label: '↩ Back' });

    const action = await p.select({ message: `"${font.name}" — what's next?`, options });
    if (p.isCancel(action)) return;
    if (action === 'back') return;

    if (action === 'refetch') {
        await refetchFont(font);
        return;
    }

    const scssPath = join(rootDir, FONTS_SCSS_REL);
    let content    = await readFile(scssPath, 'utf8').catch(() => '');

    if (action === 'enable') {
        for (const block of font.blocks.filter(b => b.commented)) {
            content = safeReplace(content, block.raw, uncommentBlock(block.raw));
        }
        await writeFile(scssPath, content);
        p.log.success(pc.cyan(`"${font.name}" enabled ✨`));
        return;
    }

    if (action === 'disable') {
        for (const block of font.blocks.filter(b => !b.commented)) {
            content = safeReplace(content, block.raw, commentBlock(block.raw));
        }
        await writeFile(scssPath, content);
        p.log.success(pc.cyan(`"${font.name}" disabled`));
        return;
    }

    if (action === 'remove') {
        const confirm = await p.confirm({
            message: `Delete all files and SCSS definitions for "${font.name}"?`,
            initialValue: false,
        });
        if (p.isCancel(confirm)) return;
        if (!confirm) return;

        for (const block of font.blocks) {
            content = content.replace(`\n${block.raw}`, '').replace(block.raw, '');
        }
        // Remove the saved URL comment too
        content = content.replace(new RegExp(`\n// @font-url\\[${escapeRe(font.name)}\\]:[^\n]*`, ''), '');
        content = content.replace(/\n{3,}/g, '\n\n');
        await writeFile(scssPath, content);

        if (font.folderExists) {
            await rm(join(rootDir, FONTS_DIR_REL, folderName(font.name)), { recursive: true, force: true });
            p.log.success(pc.cyan(`${FONTS_DIR_REL}/${folderName(font.name)}/ deleted`));
        }
        p.log.success(pc.cyan(`"${font.name}" removed from ${FONTS_SCSS_REL} ✨`));
    }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function runFontFamilies() {
    while (true) {
        const spinner = p.spinner();
        spinner.start('Scanning fonts...');
        let fonts;
        try {
            ({ fonts } = await detectFonts());
            spinner.stop(`Found ${fonts.length} font family/families`);
        } catch (err) {
            spinner.stop(pc.red('Failed to scan fonts'));
            p.log.error(err.message);
            return;
        }

        const options = [
            ...fonts.map(f => ({
                value: f.name,
                label: `${f.name} [${statusLabel(f.status)}]`,
            })),
            { value: '__add__',  label: '+ Add' },
            { value: '__back__', label: '↩ Back' },
        ];

        const choice = await p.select({ message: 'Font families:', options });
        if (p.isCancel(choice)) return;
        if (choice === '__back__') return;

        if (choice === '__add__') {
            await addNewFont();
            continue;
        }

        await handleFontActions(fonts.find(f => f.name === choice));
        // re-scan on next loop iteration
    }
}
