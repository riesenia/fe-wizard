import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { cancel, text, rootDir, getDbConfig, mysqlArgs } from '../utils.js';

// ── DB helpers ───────────────────────────────────────────────────────────────

async function query(db, sql) {
    const { stdout } = await execa('mysql', mysqlArgs(db, sql));
    if (!stdout.trim()) return [];
    return stdout
        .trim()
        .split('\n')
        .map((row) => row.split('\t'));
}

async function queryOne(db, sql) {
    const rows = await query(db, sql);
    return rows[0] ?? null;
}

async function exec(db, sql) {
    await execa('mysql', mysqlArgs(db, sql));
}

function esc(val) {
    return String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function clearCaches(table) {
    const s = p.spinner();
    s.start('Clearing ORM cache...');
    try {
        await execa('bin/cake', ['orm_cache', 'clear'], { cwd: rootDir });
        s.stop(pc.cyan('ORM cache cleared ✨'));
    } catch (err) {
        s.stop(pc.red('Failed to clear ORM cache'));
        p.log.error(err.stderr || err.message);
    }

    if (!table) return;

    let prefixes = [];
    try {
        const { stdout } = await execa('bin/cake', ['cache', 'list_prefixes'], { cwd: rootDir });
        prefixes = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    } catch { return; }

    const matching = prefixes.filter((p) => p.includes(table) || table.includes(p));
    for (const prefix of matching) {
        const s2 = p.spinner();
        s2.start(`Clearing cache ${prefix}...`);
        try {
            await execa('bin/cake', ['cache', 'clear', prefix], { cwd: rootDir });
            s2.stop(pc.cyan(`${prefix} cache cleared ✨`));
        } catch (err) {
            s2.stop(pc.red(`Failed to clear ${prefix} cache`));
            p.log.error(err.stderr || err.message);
        }
    }
}

// ── Countries ─────────────────────────────────────────────────────────────────

async function toggleCountries(db, rows) {
    const initialActive = rows.filter(([,,,active]) => active === '1').map(([id]) => id);

    const toggled = await p.multiselect({
        message: 'Toggle active countries (space to check/uncheck, enter to confirm):',
        options: rows.map(([id, name, iso2]) => ({ value: id, label: `${name} (${iso2})` })),
        initialValues: initialActive,
        required: false,
    });
    if (p.isCancel(toggled)) return;

    const toActivate = toggled.filter((id) => !initialActive.includes(id));
    const toDeactivate = initialActive.filter((id) => !toggled.includes(id));

    if (!toActivate.length && !toDeactivate.length) {
        p.log.info('No changes.');
        return;
    }

    const s = p.spinner();
    s.start('Saving changes...');
    try {
        if (toActivate.length) {
            await exec(db, `UPDATE rshop_countries SET active = 1 WHERE id IN (${toActivate.join(',')})`);
        }
        if (toDeactivate.length) {
            await exec(db, `UPDATE rshop_countries SET active = 0 WHERE id IN (${toDeactivate.join(',')})`);
        }
        const summary = [
            toActivate.length && `${toActivate.length} activated`,
            toDeactivate.length && `${toDeactivate.length} deactivated`,
        ].filter(Boolean).join(', ');
        s.stop(pc.cyan(`${summary} ✨`));
        await clearCaches('rshop_countries');
    } catch (err) {
        s.stop(pc.red('Failed'));
        p.log.error(err.message);
        return;
    }

    for (const id of toActivate) {
        const row = rows.find(([rid]) => rid === id);
        if (!row) continue;
        const [, countryName, iso2] = row;
        p.log.info(pc.dim(`Activated: ${countryName} (${iso2})`));

    }
}

async function runSetCountries(db) {
    while (true) {
        let activeCount = 0;
        try {
            const row = await queryOne(db, `SELECT COUNT(*) FROM rshop_countries WHERE active = 1`);
            activeCount = row ? parseInt(row[0]) : 0;
        } catch { /* ignore */ }

        const action = await p.select({
            message: 'Countries:',
            options: [
                { value: 'active', label: `List of active countries (${activeCount})` },
                { value: 'search', label: 'Search 🔎' },
                { value: '__back__', label: '↩ Back' },
            ],
        });
        if (p.isCancel(action)) return;
        if (action === '__back__') return;

        if (action === 'active') {
            const s = p.spinner();
            s.start('Loading active countries...');
            let rows;
            try {
                rows = await query(db,
                    `SELECT id, name, iso2code, active FROM rshop_countries WHERE active = 1 ORDER BY name`
                );
                s.stop(`${rows.length} active countries`);
            } catch (err) {
                s.stop(pc.red('Failed'));
                p.log.error(err.message);
                continue;
            }
            if (!rows.length) { p.log.warn('No active countries.'); continue; }
            await toggleCountries(db, rows);
        }

        if (action === 'search') {
            const filter = await text({
                message: 'Search countries:',
                validate: (v) => (!v || !v.trim() ? 'Enter a search term' : undefined),
            });
            if (p.isCancel(filter)) return;

            const s = p.spinner();
            s.start('Searching...');
            let rows;
            try {
                rows = await query(db,
                    `SELECT id, name, iso2code, active FROM rshop_countries WHERE name LIKE '%${esc(filter.trim())}%' ORDER BY name`
                );
                s.stop(`${rows.length} result(s)`);
            } catch (err) {
                s.stop(pc.red('Failed'));
                p.log.error(err.message);
                continue;
            }
            if (!rows.length) { p.log.warn('No countries found.'); continue; }
            await toggleCountries(db, rows);
        }
    }
}

// ── Languages ─────────────────────────────────────────────────────────────────

async function runSetLanguages(db) {
    while (true) {
        const action = await p.select({
            message: 'Languages:',
            options: [
                { value: 'toggle', label: 'List of languages' },
                { value: 'add',    label: '+ Add' },
                { value: '__back__', label: '↩ Back' },
            ],
        });
        if (p.isCancel(action)) return;
        if (action === '__back__') return;

        if (action === 'add') {
            await addLanguage(db);
            continue;
        }

        // toggle
        const s = p.spinner();
        s.start('Loading languages...');
        let rows;
        try {
            rows = await query(db, `SELECT id, name, code, locale, active FROM rshop_languages ORDER BY name`);
            s.stop(`${rows.length} languages`);
        } catch (err) {
            s.stop(pc.red('Failed'));
            p.log.error(err.message);
            continue;
        }

        if (!rows.length) { p.log.warn('No languages found.'); continue; }

        const initialActive = rows.filter(([,,,,active]) => active === '1').map(([id]) => id);

        const toggled = await p.multiselect({
            message: 'Toggle active languages (space to check/uncheck, enter to confirm):',
            options: rows.map(([id, name,, locale]) => ({ value: id, label: `${name} (${locale})` })),
            initialValues: initialActive,
            required: false,
        });
        if (p.isCancel(toggled)) return;

        const toActivate = toggled.filter((id) => !initialActive.includes(id));
        const toDeactivate = initialActive.filter((id) => !toggled.includes(id));

        if (!toActivate.length && !toDeactivate.length) { p.log.info('No changes.'); continue; }

        const s2 = p.spinner();
        s2.start('Saving changes...');
        try {
            if (toActivate.length) {
                await exec(db, `UPDATE rshop_languages SET active = 1 WHERE id IN (${toActivate.join(',')})`);
            }
            if (toDeactivate.length) {
                await exec(db, `UPDATE rshop_languages SET active = 0 WHERE id IN (${toDeactivate.join(',')})`);
            }
            const summary = [
                toActivate.length && `${toActivate.length} activated`,
                toDeactivate.length && `${toDeactivate.length} deactivated`,
            ].filter(Boolean).join(', ');
            s2.stop(pc.cyan(`${summary} ✨`));
            await clearCaches('rshop_languages');
        } catch (err) {
            s2.stop(pc.red('Failed'));
            p.log.error(err.message);
        }
    }
}

async function addLanguage(db) {
    const locale = await text({
        message: 'Locale (e.g. nl_NL):',
        validate: (val) => {
            if (!val || !val.trim()) return 'Required';
            if (!/^[a-z]{2}_[A-Z]{2}$/.test(val.trim())) return 'Format must be xx_XX (e.g. nl_NL)';
        },
    });
    if (p.isCancel(locale)) return;
    const localeTrimmed = locale.trim();

    const existing = await queryOne(db, `SELECT id, name, active FROM rshop_languages WHERE locale = '${esc(localeTrimmed)}' LIMIT 1`);
    if (existing) {
        if (existing[2] === '1') {
            p.log.warn(`Locale ${pc.cyan(localeTrimmed)} already exists and is active: ${existing[1]}`);
            return localeTrimmed;
        }
        p.log.warn(`Locale ${pc.cyan(localeTrimmed)} already exists but is inactive: ${existing[1]}`);
        const enable = await p.confirm({ message: `Enable ${existing[1]}?`, initialValue: true });
        if (p.isCancel(enable)) return;
        if (enable) {
            await exec(db, `UPDATE rshop_languages SET active = 1 WHERE id = ${existing[0]}`);
            await clearCaches('rshop_languages');
            p.log.success(pc.cyan(`${existing[1]} enabled ✨`));
            return localeTrimmed;
        }
        return;
    }

    const code = localeTrimmed.slice(0, 2).toLowerCase();
    let autoName = code;
    try {
        const raw = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
        autoName = raw.charAt(0).toUpperCase() + raw.slice(1);
    } catch { /* fallback to code */ }

    p.log.info(`Derived: code = ${pc.cyan(code)}, name = ${pc.cyan(autoName)}`);

    const nameInput = await text({
        message: 'Language name (enter to accept derived):',
        initialValue: autoName,
        validate: (val) => (!val || !val.trim() ? 'Required' : undefined),
    });
    if (p.isCancel(nameInput)) return;

    const s = p.spinner();
    s.start('Inserting language...');
    try {
        await exec(db,
            `INSERT INTO rshop_languages (name, code, locale, active) VALUES ('${esc(nameInput.trim())}', '${esc(code)}', '${esc(localeTrimmed)}', 1)`
        );
        s.stop(pc.cyan(`Language ${nameInput.trim()} added ✨`));
        await clearCaches('rshop_languages');
        return localeTrimmed;
    } catch (err) {
        s.stop(pc.red('Failed'));
        p.log.error(err.message);
    }
}

// ── Currencies ────────────────────────────────────────────────────────────────

async function runSetCurrencies(db) {
    while (true) {
        const s = p.spinner();
        s.start('Loading currencies...');
        let rows;
        try {
            rows = await query(db,
                `SELECT id, name, code, symbol_left, symbol_right, decimal_point, thousands_separator, decimals, value, update_from_ecb FROM rshop_currencies ORDER BY name`
            );
            s.stop(`Loaded ${rows.length} currencies`);
        } catch (err) {
            s.stop(pc.red('Failed'));
            p.log.error(err.message);
            return;
        }

        const options = [
            ...rows.map(([id, name, code]) => ({
                value: id,
                label: `${name} (${code})`,
            })),
            { value: '__add__', label: '+ Add' },
            { value: '__back__', label: '↩ Back' },
        ];

        const choice = await p.select({ message: 'Currencies:', options });
        if (p.isCancel(choice)) return;
        if (choice === '__back__') return;

        if (choice === '__add__') {
            await addCurrency(db);
            continue;
        }

        const row = rows.find(([id]) => id === choice);
        await editCurrency(db, row);
    }
}

async function editCurrency(db, [id, name, code, symL, symR, decPt, thousSep, decimals, value, updateFromEcb]) {
    while (true) {
        p.log.info(pc.dim(`${name} (${code}) | rate: ${value} | ECB auto-update: ${updateFromEcb === '1' ? 'on' : 'off'} | ${symL || ''}1.000${symR || ''}`));
        const action = await p.select({
            message: `Edit ${name}:`,
            options: [
                { value: 'rate',    label: 'Edit exchange rate' },
                { value: 'display', label: 'Edit display settings (symbols, separators)' },
                { value: 'delete',  label: pc.red('Delete') },
            ],
        });
        if (p.isCancel(action)) return;

        if (action === 'rate') {
            const ecbOn = updateFromEcb === '1';
            p.log.info(`Current rate: ${pc.cyan(value)} | ECB auto-update: ${ecbOn ? pc.green('on') : pc.dim('off')}`);

            const toggleEcb = await p.confirm({
                message: `ECB auto-update is ${ecbOn ? 'on' : 'off'}. Turn it ${ecbOn ? 'off' : 'on'}?`,
                initialValue: false,
            });
            if (p.isCancel(toggleEcb)) return;

            const newEcb = toggleEcb ? (ecbOn ? 0 : 1) : (ecbOn ? 1 : 0);
            let newRate = value;

            if (!newEcb) {
                const rateInput = await text({
                    message: 'Exchange rate:',
                    initialValue: String(value),
                    validate: (val) => (isNaN(Number(val)) ? 'Must be a number' : undefined),
                });
                if (p.isCancel(rateInput)) return;
                newRate = rateInput.trim();
            }

            const s = p.spinner();
            s.start('Saving...');
            try {
                await exec(db, `UPDATE rshop_currencies SET value = ${Number(newRate)}, update_from_ecb = ${newEcb} WHERE id = ${id}`);
                value = newRate;
                updateFromEcb = String(newEcb);
                s.stop(pc.cyan('Rate updated ✨'));
                await clearCaches('rshop_currencies');
            } catch (err) {
                s.stop(pc.red('Failed'));
                p.log.error(err.message);
            }
        }

        if (action === 'display') {
            const fields = [
                { key: 'symbol_left',          label: 'Symbol left',          current: symL },
                { key: 'symbol_right',         label: 'Symbol right',         current: symR },
                { key: 'decimal_point',        label: 'Decimal point',        current: decPt },
                { key: 'thousands_separator',  label: 'Thousands separator',  current: thousSep },
                { key: 'decimals',             label: 'Decimal places',       current: decimals },
            ];
            const updates = [];
            for (const f of fields) {
                const val = await text({
                    message: `${f.label}:`,
                    initialValue: f.current ?? '',
                });
                if (p.isCancel(val)) return;
                updates.push(`${f.key} = '${esc(val)}'`);
                if (f.key === 'symbol_left') symL = val;
                if (f.key === 'symbol_right') symR = val;
                if (f.key === 'decimal_point') decPt = val;
                if (f.key === 'thousands_separator') thousSep = val;
                if (f.key === 'decimals') decimals = val;
            }
            const s = p.spinner();
            s.start('Saving...');
            try {
                await exec(db, `UPDATE rshop_currencies SET ${updates.join(', ')} WHERE id = ${id}`);
                s.stop(pc.cyan('Display settings updated ✨'));
                await clearCaches('rshop_currencies');
            } catch (err) {
                s.stop(pc.red('Failed'));
                p.log.error(err.message);
            }
        }

        if (action === 'delete') {
            const confirm = await p.confirm({
                message: `Delete currency ${name} (${code})? This cannot be undone.`,
                initialValue: false,
            });
            if (p.isCancel(confirm)) return;
            if (confirm) {
                const s = p.spinner();
                s.start('Deleting...');
                try {
                    await exec(db, `DELETE FROM rshop_currencies WHERE id = ${id}`);
                    s.stop(pc.cyan(`${name} deleted ✨`));
                    await clearCaches('rshop_currencies');
                    return;
                } catch (err) {
                    s.stop(pc.red('Failed'));
                    p.log.error(err.message);
                }
            }
        }
    }
}

async function addCurrency(db) {
    const code = await text({
        message: 'Currency code (3 uppercase letters, e.g. HUF):',
        validate: (v) => (!/^[A-Z]{3}$/.test(v.trim()) ? 'Must be 3 uppercase letters' : undefined),
    });
    if (p.isCancel(code)) return;
    const codeTrimmed = code.trim();

    let autoName = codeTrimmed;
    try {
        autoName = new Intl.DisplayNames(['en'], { type: 'currency' }).of(codeTrimmed) ?? codeTrimmed;
    } catch { /* fallback to code */ }

    p.log.info(`Derived name: ${pc.cyan(autoName)}`);

    const nameInput = await text({
        message: 'Currency name (enter to accept derived):',
        initialValue: autoName,
        validate: (v) => (!v.trim() ? 'Required' : undefined),
    });
    if (p.isCancel(nameInput)) return;

    const symLeft = await text({ message: 'Symbol left (e.g. €, leave blank if none):' });
    if (p.isCancel(symLeft)) return;

    const symRight = await text({ message: 'Symbol right (leave blank if none):' });
    if (p.isCancel(symRight)) return;

    const decimals = await text({
        message: 'Decimal places:',
        initialValue: '2',
        validate: (v) => (isNaN(Number(v)) ? 'Must be a number' : undefined),
    });
    if (p.isCancel(decimals)) return;

    const s = p.spinner();
    s.start('Inserting currency...');
    try {
        await exec(db,
            `INSERT INTO rshop_currencies (name, code, symbol_left, symbol_right, decimal_point, thousands_separator, decimals, value, update_from_ecb) ` +
            `VALUES ('${esc(nameInput.trim())}', '${esc(codeTrimmed)}', '${esc(symLeft)}', '${esc(symRight)}', ',', '', ${Number(decimals)}, 1, 1)`
        );
        s.stop(pc.cyan(`Currency ${nameInput.trim()} added ✨`));
        await clearCaches('rshop_currencies');
        return codeTrimmed;
    } catch (err) {
        s.stop(pc.red('Failed'));
        p.log.error(err.message);
    }
}

// ── frontend.php helpers ──────────────────────────────────────────────────────

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

function parseDomains(text) {
    const domainsIdx = text.indexOf("'domains'");
    if (domainsIdx === -1) return { domains: [], start: -1, end: -1 };

    const bracketStart = text.indexOf('[', domainsIdx);
    if (bracketStart === -1) return { domains: [], start: -1, end: -1 };

    const bracketEnd = findArrayEnd(text, bracketStart);
    const block = text.slice(bracketStart, bracketEnd + 1);

    const domains = [];
    // find each sub-array [ ... ]
    let i = 1; // skip outer [
    while (i < block.length) {
        if (block[i] === '[') {
            const entryEnd = findArrayEnd(block, i);
            const entry = block.slice(i, entryEnd + 1);
            const domain = {};
            const urlMatch = entry.match(/'url'\s*=>\s*'([^']*)'/);
            const nameMatch = entry.match(/'name'\s*=>\s*'([^']*)'/);
            const codeMatch = entry.match(/'code'\s*=>\s*'([^']*)'/);
            const activeMatch = entry.match(/'active'\s*=>\s*(true|false)/);

            if (urlMatch) domain.url = urlMatch[1];
            if (nameMatch) domain.name = nameMatch[1];
            if (codeMatch) domain.code = codeMatch[1];
            domain.active = activeMatch ? activeMatch[1] !== 'false' : true;

            if (domain.url) domains.push(domain);
            i = entryEnd + 1;
        } else {
            i++;
        }
    }

    return { domains, start: bracketStart, end: bracketEnd };
}

function parseProjectName(text) {
    const match = text.match(/'name'\s*=>\s*'([^']*)'/);
    return match ? match[1] : 'project';
}

function getDomainsIndent(text) {
    const domainsIdx = text.indexOf("'domains'");
    if (domainsIdx === -1) return '        '; // fallback 8 spaces
    const lineStart = text.lastIndexOf('\n', domainsIdx) + 1;
    let spaces = 0;
    for (let i = lineStart; i < domainsIdx; i++) {
        if (text[i] === ' ') spaces++;
        else if (text[i] === '\t') spaces += 4;
        else break;
    }
    return ' '.repeat(spaces);
}

function serializeDomains(domains, baseIndent = '        ') {
    const entryIndent = baseIndent + '    ';
    const keyIndent   = baseIndent + '        ';
    const entries = domains.map((d) => {
        const active = d.active === false ? 'false' : 'true';
        return `${entryIndent}[\n${keyIndent}'url' => '${d.url}',\n${keyIndent}'name' => '${d.name}',\n${keyIndent}'code' => '${d.code}',\n${keyIndent}'active' => ${active},\n${entryIndent}]`;
    });
    return `[\n${entries.join(',\n')},\n${baseIndent}]`;
}

async function readFrontendPhp() {
    const path = join(rootDir, 'config/frontend.php');
    try {
        return await readFile(path, 'utf8');
    } catch {
        return null;
    }
}

async function writeFrontendPhp(text) {
    const path = join(rootDir, 'config/frontend.php');
    await writeFile(path, text);
}

function updateDomainsInText(text, domains) {
    const { start, end } = parseDomains(text);
    const baseIndent = getDomainsIndent(text);
    const serialized = serializeDomains(domains, baseIndent);
    if (start === -1) {
        const eshopIdx = text.indexOf("'Eshop'");
        if (eshopIdx === -1) throw new Error("'Eshop' key not found in config/frontend.php");
        const eshopBracket = text.indexOf('[', eshopIdx);
        const eshopEnd = findArrayEnd(text, eshopBracket);
        return text.slice(0, eshopEnd) + `\n${baseIndent}'domains' => ${serialized},\n${baseIndent.slice(4)}` + text.slice(eshopEnd);
    }
    return text.slice(0, start) + serialized + text.slice(end + 1);
}

// ── SettingsMiddleware.php helpers ────────────────────────────────────────────

const MIDDLEWARE_REL = 'src/Routing/Middleware/SettingsMiddleware.php';
const APPLICATION_REL = 'src/Application.php';

function generateMiddleware(domains, multishop) {
    const cases = domains.map((d) => generateCase(d, multishop)).join('\n\n');
    const multishopUse = multishop ? `\nuse Rshop\\Core\\Multishop\\Multishop;` : '';
    const shopIdDefault = multishop ? `\n        $shopId = 1;` : '';
    const shopReturn = multishop ? `\n            'shopId' => $shopId,` : '';
    const shopInvoke = multishop ? `\n        Multishop::setShop($settings['shopId'], true);` : '';

    return `<?php

namespace App\\Routing\\Middleware;

use Cake\\Core\\Configure;
use Cake\\Http\\ServerRequest;
use Psr\\Http\\Message\\ResponseInterface;
use Rshop\\Admin\\Routing\\RshopClassChecker;${multishopUse}

class SettingsMiddleware
{
    /**
     * Get settings by domain name.
     */
    public static function getSettings(string $domain): array
    {
        $locale = 'sk_SK';
        $languageId = 1;
        $currency = 'EUR';
        $currencyId = 1;
        $countryId = 1;${shopIdDefault}
        $configuration = null;

        switch ($domain) {
${cases}
        }

        return [
            'locale' => $locale,
            'languageId' => $languageId,
            'currency' => $currency,
            'currencyId' => $currencyId,
            'countryId' => $countryId,
            'configuration' => $configuration,${shopReturn}
        ];
    }

    /**
     * Set settings.
     */
    public function __invoke(ServerRequest $request, ResponseInterface $response, callable $next): ResponseInterface
    {
        $settings = static::getSettings(\\strpos($_SERVER['REQUEST_URI'] ?? '', '/admin') === 0 ? '' : ($_SERVER['SERVER_NAME'] ?? ''));

        $request->getSession()->write('Rshop/Frontend.locale', $settings['locale']);
        $request->getSession()->write('language_id', $settings['languageId']);
        $request->getSession()->write('currency', RshopClassChecker::getTable('Currencies')->fetchById($settings['currencyId']));

        Configure::write('Eshop.defaultCountryId', $settings['countryId']);
        Configure::write('Rshop.defaultCurrency', $settings['currency']);
        Configure::write('Rshop.actualCurrencyId', $settings['currencyId']);

        Configure::load('rshop');
        Configure::load('frontend');
${shopInvoke}
        $response = $next($request, $response);

        return $response;
    }
}
`;
}

function generateCase(domain, multishop) {
    const variants = buildDomainVariants(domain);
    const caseLines = variants.map((v) => `            case '${v}':`).join('\n');
    const assignments = buildAssignments(domain, multishop);
    return `            // ${domain.name} (${domain.code})\n${caseLines}\n${assignments}\n                break;`;
}

function buildDomainVariants(domain) {
    const url = domain.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const variants = [url];

    // dev patterns based on domain name
    if (domain._devVariants) return domain._devVariants;

    return variants;
}

function buildAssignments(domain, multishop) {
    const lines = [];
    if (domain.locale) lines.push(`                $locale = '${domain.locale}';`);
    if (domain.languageId) lines.push(`                $languageId = ${domain.languageId};`);
    if (domain.countryId) lines.push(`                $countryId = ${domain.countryId};`);
    if (domain.currency) lines.push(`                $currency = '${domain.currency}';`);
    if (domain.currencyId) lines.push(`                $currencyId = ${domain.currencyId};`);
    if (multishop && domain.shopId) lines.push(`                $shopId = ${domain.shopId};`);
    return lines.join('\n');
}

function parseMiddlewareCases(text) {
    // Returns map: code -> { caseLines: string[], assignments: {} }
    const switchMatch = text.match(/switch\s*\(\$domain\)\s*\{([\s\S]*)\}/);
    if (!switchMatch) return {};
    const body = switchMatch[1];

    const cases = {};
    // Match comment lines like "// name (code)"
    const commentRe = /\/\/\s*(.+?)\s*\(([^)]+)\)\s*\n([\s\S]*?)break;/g;
    let m;
    while ((m = commentRe.exec(body)) !== null) {
        const code = m[2].trim();
        const block = m[3];
        // extract case strings
        const caseStrings = [];
        const caseRe = /case\s*'([^']+)':/g;
        let cm;
        while ((cm = caseRe.exec(block)) !== null) caseStrings.push(cm[1]);
        // extract assignments
        const assignments = {};
        const assignRe = /\$(\w+)\s*=\s*([^;]+);/g;
        let am;
        while ((am = assignRe.exec(block)) !== null) assignments[am[1]] = am[2].trim().replace(/^'|'$/g, '');
        cases[code] = { caseStrings, assignments };
    }
    return cases;
}

function rebuildMiddlewareSwitch(domains, parsedCases, multishop) {
    return domains.map((d) => {
        const existing = parsedCases[d.code];
        const domainWithSettings = { ...d };

        if (existing) {
            // Preserve existing case URL variants from the file
            domainWithSettings._devVariants = existing.caseStrings;
            if (!domainWithSettings.locale && existing.assignments.locale) domainWithSettings.locale = existing.assignments.locale;
            if (!domainWithSettings.languageId && existing.assignments.languageId) domainWithSettings.languageId = parseInt(existing.assignments.languageId);
            if (!domainWithSettings.countryId && existing.assignments.countryId) domainWithSettings.countryId = parseInt(existing.assignments.countryId);
            if (!domainWithSettings.currency && existing.assignments.currency) domainWithSettings.currency = existing.assignments.currency;
            if (!domainWithSettings.currencyId && existing.assignments.currencyId) domainWithSettings.currencyId = parseInt(existing.assignments.currencyId);
            if (multishop && !domainWithSettings.shopId && existing.assignments.shopId) domainWithSettings.shopId = parseInt(existing.assignments.shopId);
        } else if (!domainWithSettings._devVariants?.length) {
            // New domain with no dev variants — fall back to bare URL only
            domainWithSettings._devVariants = [d.url.replace(/^https?:\/\//, '').replace(/\/$/, '')];
        }

        return generateCase(domainWithSettings, multishop);
    }).join('\n\n');
}

async function updateMiddlewareFile(domains, multishop) {
    const path = join(rootDir, MIDDLEWARE_REL);
    let text;
    try {
        text = await readFile(path, 'utf8');
    } catch {
        // Create from scratch
        const content = generateMiddleware(domains, multishop);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content);
        p.log.success(pc.cyan(`${MIDDLEWARE_REL} created ✨`));
        await updateApplicationPhp();
        return;
    }

    // Update switch cases
    const parsedCases = parseMiddlewareCases(text);
    const newCases = rebuildMiddlewareSwitch(domains, parsedCases, multishop);

    // Locate switch body using brace counting
    const switchMatch = text.match(/switch\s*\(\$domain\)\s*\{/);
    if (!switchMatch) {
        p.log.warn('Could not locate switch($domain) in SettingsMiddleware.php — skipping update');
        await writeFile(path, text);
        return;
    }
    const switchOpenPos = text.indexOf('{', switchMatch.index + switchMatch[0].length - 1);
    let depth = 0, switchClosePos = -1;
    for (let i = switchOpenPos; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { switchClosePos = i; break; } }
    }
    const updated = switchClosePos === -1 ? text
        : text.slice(0, switchOpenPos + 1) + '\n' + newCases + '\n        ' + text.slice(switchClosePos);

    await writeFile(path, updated);
    p.log.success(pc.cyan(`${MIDDLEWARE_REL} updated ✨`));
}

async function updateApplicationPhp() {
    const path = join(rootDir, APPLICATION_REL);
    let text;
    try {
        text = await readFile(path, 'utf8');
    } catch {
        p.log.warn(`${APPLICATION_REL} not found — please add SettingsMiddleware manually`);
        return;
    }

    const useStatement = `use App\\Routing\\Middleware\\SettingsMiddleware;`;
    const middlewareLine = `->add(new SettingsMiddleware())`;

    if (text.includes('SettingsMiddleware')) {
        p.log.info('SettingsMiddleware already registered in Application.php');
        return;
    }

    // Add use statement after last existing use statement
    text = text.replace(/(use [^\n]+;\n)(?!use )/, `$1${useStatement}\n`);

    // Add ->add(new SettingsMiddleware()) before ->add(new RoutingMiddleware
    text = text.replace(
        /(->add\(new RoutingMiddleware)/,
        `->add(new SettingsMiddleware())\n\n            // add routing middleware\n            $1`
    );

    await writeFile(path, text);
    p.log.success(pc.cyan(`${APPLICATION_REL} updated ✨`));
}

// ── Set Domains ────────────────────────────────────────────────────────────────

async function runSetDomains(db, multishop) {
    while (true) {
        const s = p.spinner();
        s.start('Reading frontend.php...');
        let phpContent = await readFrontendPhp();
        if (!phpContent) {
            s.stop(pc.yellow('config/frontend.php not found'));
            p.log.warn('Please create config/frontend.php first');
            return;
        }
        const { domains } = parseDomains(phpContent);
        const projectName = parseProjectName(phpContent);
        s.stop(`Loaded ${domains.length} domain(s)`);

        const options = [
            ...domains.map((d) => ({
                value: d.url,
                label: `${d.name} (${d.code}) [${d.active ? pc.green('active') : pc.dim('inactive')}]`,
            })),
            { value: '__add__', label: '+ Add' },
            { value: '__back__', label: '↩ Back' },
        ];

        const choice = await p.select({ message: 'Domains:', options });
        if (p.isCancel(choice)) return;
        if (choice === '__back__') return;

        if (choice === '__add__') {
            await addDomain(db, domains, phpContent, projectName, multishop);
            continue;
        }

        const domain = domains.find((d) => d.url === choice);
        const modified = await editDomain(db, domain, domains, multishop);
        if (modified) {
            const idx = domains.findIndex((d) => d.url === choice);
            if (modified === '__removed__') {
                domains.splice(idx, 1);
            } else {
                domains[idx] = modified;
            }
            const newText = updateDomainsInText(phpContent, domains);
            await writeFrontendPhp(newText);
            p.log.success(pc.cyan('config/frontend.php updated ✨'));
            await updateMiddlewareFile(domains, multishop);
        }
    }
}

async function editDomain(db, domain, allDomains, multishop) {
    p.note(
        `url:    ${domain.url}\n` +
        `name:   ${domain.name}\n` +
        `code:   ${domain.code}\n` +
        `active: ${domain.active ? 'yes' : 'no'}` +
        (domain.locale ? `\nlocale: ${domain.locale}` : '') +
        (domain.languageId ? `\nlanguage: ${domain.languageId}` : '') +
        (domain.countryId ? `\ncountry: ${domain.countryId}` : '') +
        (domain.currency ? `\ncurrency: ${domain.currency}` : ''),
        'Domain details'
    );

    while (true) {
        const action = await p.select({
            message: `Edit ${domain.name}:`,
            options: [
                { value: 'toggle',   label: `Toggle active (currently: ${domain.active ? 'active' : 'inactive'})` },
                { value: 'language', label: 'Set default language' },
                { value: 'country',  label: 'Set country' },
                { value: 'currency', label: 'Set currency' },
                { value: 'remove',   label: pc.red('Remove domain') },
            ],
        });
        if (p.isCancel(action)) return;

        if (action === 'toggle') {
            domain.active = !domain.active;
            return domain;
        }

        if (action === 'language') {
            const rows = await query(db, `SELECT id, name, locale FROM rshop_languages WHERE active = 1 ORDER BY name`);
            if (!rows.length) { p.log.warn('No active languages found'); continue; }
            const lang = await p.select({
                message: 'Default language:',
                options: rows.map(([id, name, locale]) => ({ value: id, label: `${name} (${locale})`, meta: { locale } })),
            });
            if (p.isCancel(lang)) return;
            const row = rows.find(([id]) => id === lang);
            domain.languageId = parseInt(lang);
            domain.locale = row[2];
            p.log.success(pc.cyan(`Language set to ${row[1]} (${row[2]})`));
            return domain;
        }

        if (action === 'country') {
            const filter = await text({ message: 'Filter countries (leave blank for all):', placeholder: '' });
            if (p.isCancel(filter)) return;
            const where = filter && filter.trim() ? `AND name LIKE '%${esc(filter.trim())}%'` : '';
            const rows = await query(db, `SELECT id, name, iso2code FROM rshop_countries WHERE active = 1 ${where} ORDER BY name`);
            if (!rows.length) { p.log.warn('No active countries found'); continue; }
            const country = await p.select({
                message: 'Country:',
                options: rows.map(([id, name, iso2]) => ({ value: id, label: `${name} (${iso2})` })),
            });
            if (p.isCancel(country)) return;
            const row = rows.find(([id]) => id === country);
            domain.countryId = parseInt(country);
            p.log.success(pc.cyan(`Country set to ${row[1]}`));
            return domain;
        }

        if (action === 'currency') {
            const rows = await query(db, `SELECT id, name, code FROM rshop_currencies ORDER BY name`);
            if (!rows.length) { p.log.warn('No currencies found'); continue; }
            const curr = await p.select({
                message: 'Currency:',
                options: rows.map(([id, name, code]) => ({ value: id, label: `${name} (${code})` })),
            });
            if (p.isCancel(curr)) return;
            const row = rows.find(([id]) => id === curr);
            domain.currencyId = parseInt(curr);
            domain.currency = row[2];
            p.log.success(pc.cyan(`Currency set to ${row[1]} (${row[2]})`));
            return domain;
        }

        if (action === 'remove') {
            const confirm = await p.confirm({
                message: `Remove domain ${domain.name}? This will update frontend.php and SettingsMiddleware.php.`,
                initialValue: false,
            });
            if (p.isCancel(confirm)) return;
            if (confirm) return '__removed__';
        }
    }
}

async function addDomain(db, domains, phpContent, projectName, multishop) {
    const urlInput = await text({
        message: 'Domain (e.g. myshop.com):',
        validate: (v) => (!v.trim() ? 'Required' : undefined),
    });
    if (p.isCancel(urlInput)) return;
    const bare = urlInput.trim().replace(/^https?:\/\/(www\.)?/, '');
    const url = `https://www.${bare}`;
    const name = bare;
    const domainBase = bare.split('.')[0];
    p.log.info(pc.dim(`URL: ${url} | name: ${name}`));

    // Select language — code derived from locale
    let langRows = await query(db, `SELECT id, name, locale FROM rshop_languages WHERE active = 1 ORDER BY name`);
    let languageId = null, locale = null, codeTrimmed = null;
    let langPick;
    do {
        langPick = await p.select({
            message: 'Default language:',
            options: [
                ...langRows.map(([id, nm, lc]) => ({ value: id, label: `${nm} (${lc})` })),
                { value: '__add__', label: 'Add new language...' },
                { value: '__skip__', label: 'Skip' },
            ],
        });
        if (p.isCancel(langPick)) return;
        if (langPick === '__add__') {
            const addedLocale = await addLanguage(db);
            langRows = await query(db, `SELECT id, name, locale FROM rshop_languages WHERE active = 1 ORDER BY name`);
            if (addedLocale) {
                const added = langRows.find(([, , lc]) => lc === addedLocale);
                if (added) { langPick = added[0]; break; }
            }
        }
    } while (langPick === '__add__');
    if (langPick !== '__skip__') {
        const lr = langRows.find(([id]) => id === langPick);
        languageId = parseInt(langPick);
        locale = lr[2];
        codeTrimmed = locale.slice(0, 2).toLowerCase();
        p.log.info(pc.dim(`Code derived from locale: ${codeTrimmed}`));
    }

    // Auto-derive dev variants
    if (codeTrimmed) {
        const devVariant1 = `${projectName}-${codeTrimmed}.rshop.sk`;
        const devVariant2 = `${projectName}-${codeTrimmed}.local.test`;
        p.log.info(pc.dim(`Dev variants: ${devVariant1}, ${devVariant2}`));
    }

    // Select country
    let countryRows = await query(db, `SELECT id, name, iso2code FROM rshop_countries WHERE active = 1 ORDER BY name`);
    let countryId = null;
    let countryPick;
    do {
        countryPick = await p.select({
            message: 'Country:',
            options: [
                ...countryRows.map(([id, nm, iso2]) => ({ value: id, label: `${nm} (${iso2})` })),
                { value: '__enable__', label: 'Enable a country...' },
                { value: '__skip__', label: 'Skip' },
            ],
        });
        if (p.isCancel(countryPick)) return;
        if (countryPick === '__enable__') {
            await runSetCountries(db);
            countryRows = await query(db, `SELECT id, name, iso2code FROM rshop_countries WHERE active = 1 ORDER BY name`);
        }
    } while (countryPick === '__enable__');
    if (countryPick !== '__skip__') {
        countryId = parseInt(countryPick);
    }

    // Select currency
    let currRows = await query(db, `SELECT id, name, code FROM rshop_currencies ORDER BY name`);
    let currencyId = null, currency = null;
    let currPick;
    do {
        currPick = await p.select({
            message: 'Currency:',
            options: [
                ...currRows.map(([id, nm, cd]) => ({ value: id, label: `${nm} (${cd})` })),
                { value: '__add__', label: 'Add new currency...' },
                { value: '__skip__', label: 'Skip' },
            ],
        });
        if (p.isCancel(currPick)) return;
        if (currPick === '__add__') {
            const addedCode = await addCurrency(db);
            currRows = await query(db, `SELECT id, name, code FROM rshop_currencies ORDER BY name`);
            if (addedCode) {
                const added = currRows.find(([, , cd]) => cd === addedCode);
                if (added) { currPick = added[0]; break; }
            }
        }
    } while (currPick === '__add__');
    if (currPick !== '__skip__') {
        const cr = currRows.find(([id]) => id === currPick);
        currencyId = parseInt(currPick);
        currency = cr[2];
    }

    const newDomain = {
        url: url.trim(),
        name: name.trim(),
        code: codeTrimmed,
        active: true,
        locale,
        languageId,
        countryId,
        currencyId,
        currency,
        _devVariants: [
            url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
            ...(codeTrimmed ? [
                `${domainBase}-${codeTrimmed}.rshop.sk`,
                `${domainBase}-${codeTrimmed}.local.test`,
            ] : []),
        ],
    };

    domains.push(newDomain);

    const newText = updateDomainsInText(phpContent, domains);
    await writeFrontendPhp(newText);
    p.log.success(pc.cyan('config/frontend.php updated ✨'));
    await updateMiddlewareFile(domains, multishop);
}

// ── Set Shops ─────────────────────────────────────────────────────────────────

async function runSetShops(db) {
    while (true) {
        const s = p.spinner();
        s.start('Loading shops...');
        let rows;
        try {
            rows = await query(db, `SELECT id, name, active FROM rshop_shops ORDER BY id`);
            s.stop(`Loaded ${rows.length} shops`);
        } catch (err) {
            s.stop(pc.red('Failed'));
            p.log.error(err.message);
            return;
        }

        const options = [
            ...rows.map(([id, name, active]) => ({
                value: id,
                label: `${name} [${active === '1' ? pc.green('active') : pc.dim('inactive')}]`,
            })),
        ];

        const choice = await p.select({ message: 'Shops:', options });
        if (p.isCancel(choice)) return;

        const row = rows.find(([id]) => id === choice);
        const currentActive = row[2] === '1';

        const toggle = await p.confirm({
            message: `${row[1]} is ${currentActive ? 'active' : 'inactive'}. Toggle?`,
            initialValue: true,
        });
        if (p.isCancel(toggle)) return;

        if (toggle) {
            const s2 = p.spinner();
            s2.start('Updating...');
            try {
                await exec(db, `UPDATE rshop_shops SET active = ${currentActive ? 0 : 1} WHERE id = ${choice}`);
                s2.stop(pc.cyan(`${row[1]} is now ${currentActive ? 'inactive' : 'active'} ✨`));
                await clearCaches('rshop_shops');
            } catch (err) {
                s2.stop(pc.red('Failed'));
                p.log.error(err.message);
            }
        }
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runLocales() {
    let db;
    try {
        db = await getDbConfig();
    } catch (err) {
        p.log.error(`Cannot read DB config: ${err.message}`);
        return;
    }

    // Check if multishop is active
    let multishop = false;
    try {
        const row = await queryOne(db,
            `SELECT value FROM rshop_configurations WHERE configuration_key = 'multishop' LIMIT 1`
        );
        multishop = row && row[0] && row[0] !== '0' && row[0] !== '';
    } catch { /* table might not exist */ }

    while (true) {
        const options = [
            { value: 'domains', label: 'Domains' },
            { value: 'countries', label: 'Countries' },
            { value: 'languages', label: 'Languages' },
            { value: 'currencies', label: 'Currencies' },
            ...(multishop ? [{ value: 'shops', label: 'Shops' }] : []),
            { value: '__back__', label: '↩ Back' },
        ];

        const action = await p.select({ message: 'Locales & Domains:', options });
        if (p.isCancel(action)) return;
        if (action === '__back__') return;

        if (action === 'countries') await runSetCountries(db);
        if (action === 'languages') await runSetLanguages(db);
        if (action === 'currencies') await runSetCurrencies(db);
        if (action === 'domains') await runSetDomains(db, multishop);
        if (action === 'shops') await runSetShops(db);
    }
}
