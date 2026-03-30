import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readdir, writeFile, access, unlink } from 'fs/promises';
import { join } from 'path';
import { rootDir, toCamelCase, cancel, text, validatePositiveInt } from '../utils.js';
import { fetchTypeIds } from './box.js';
import { getSubitemsType, getSeedableFields } from './fields.js';

export async function checkSeedExists(boxKey) {
    const seedClassName = `${toCamelCase(boxKey)}BoxItemsSeed`;
    try {
        await access(join(rootDir, 'config/Seeds', `${seedClassName}.php`));
        return true;
    } catch {
        return false;
    }
}

function cycleIds(ids, count) {
    return Array.from({ length: count }, (_, i) => ids[i % ids.length]);
}

async function resolveIds(type, count, label, allowCycle = true) {
    if (type === 'custom') return null;

    const spinner = p.spinner();
    spinner.start(`Fetching ${label} IDs from database...`);
    const ids = await fetchTypeIds(type, count);

    if (ids.length === 0) {
        spinner.stop(pc.red(`No "${type}" records found in the database`));
        p.log.warn(pc.cyan('Cannot create seed without existing records. Add some data first.'));
        return false;
    }

    if (ids.length >= count) {
        spinner.stop(pc.cyan(`Found ${ids.length} "${type}" record(s)`));
        return ids.slice(0, count);
    }

    spinner.stop(pc.yellow(`Only ${ids.length} of ${count} "${type}" record(s) found`));

    if (!allowCycle) {
        p.log.warn(pc.cyan(`Reduced to ${ids.length} subitems per item (duplicates would violate DB constraints)`));
        return ids;
    }

    const choice = await p.select({
        message: 'How do you want to proceed?',
        options: [
            { value: 'use',   label: `Use only ${ids.length} (reduce to ${ids.length} slot(s))` },
            { value: 'cycle', label: `Repeat IDs cyclically to fill all ${count} slot(s)` },
        ],
    });
    if (p.isCancel(choice)) return;

    return choice === 'cycle' ? cycleIds(ids, count) : ids;
}

// Builds extra PHP key-value pairs for a hardcoded item row (values evaluated in JS, index = i)
function buildExtraFieldStr(i, type, fieldConfig) {
    if (!fieldConfig) return '';
    const parts = [];

    if (type !== 'custom' && fieldConfig.name) parts.push(`'name' => 'Text ${i + 1}'`);
    if (fieldConfig.url) parts.push(`'url' => '#'`);

    if (Object.keys(fieldConfig.moduleData).length > 0) {
        const mdObj = Object.fromEntries(
            Object.entries(fieldConfig.moduleData).map(([k, fType]) => [k, fType === 'checkbox' ? 1 : `Text ${i + 1}`])
        );
        const mdJson = JSON.stringify(mdObj).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        parts.push(`'module_data' => '${mdJson}'`);
    }

    return parts.length ? ', ' + parts.join(', ') : '';
}

// Builds extra PHP key-value pairs for a subitem row inside a PHP loop (values are PHP expressions using $j)
function buildSubExtraPhpFields(subType, subFieldConfig) {
    if (!subFieldConfig) return '';
    const parts = [];

    if (subType !== 'custom' && subFieldConfig.name) parts.push(`'name' => 'Text ' . ($j + 1)`);
    if (subFieldConfig.url) parts.push(`'url' => '#'`);

    if (Object.keys(subFieldConfig.moduleData).length > 0) {
        const phpEntries = Object.entries(subFieldConfig.moduleData)
            .map(([k, fType]) => `'${k}' => ${fType === 'checkbox' ? '1' : `'Text ' . ($j + 1)`}`)
            .join(', ');
        parts.push(`'module_data' => json_encode([${phpEntries}])`);
    }

    return parts.length ? ', ' + parts.join(', ') : '';
}

function buildSeedSubitemsBlock(itemCount, subType, subIds, perItem, subFieldConfig) {
    const fetchItems = `$this->fetchAll('SELECT id FROM rshop_box_items WHERE box_id = ' . $box['id'] . ' ORDER BY sort ASC')`;

    const extraPHP = buildSubExtraPhpFields(subType, subFieldConfig);

    if (subType === 'custom') {
        return `
        $boxItems = ${fetchItems};

        $subData = [];
        foreach ($boxItems as $boxItem) {
            for ($j = 0; $j < ${perItem}; $j++) {
                $subData[] = ['box_item_id' => $boxItem['id'], 'name' => 'Subitem ' . ($j + 1)${extraPHP}, 'sort' => $j + 1, 'language_active' => 1, 'active' => 1];
            }
        }

        $this->table('rshop_box_subitems')->insert($subData)->save();`;
    }

    const phpSubIds = `[${subIds.join(', ')}]`;

    return `
        $boxItems = ${fetchItems};

        $subIds = ${phpSubIds};

        $subData = [];
        foreach ($boxItems as $boxItem) {
            foreach ($subIds as $j => $subId) {
                $subData[] = ['box_item_id' => $boxItem['id'], '${subType}_id' => $subId${extraPHP}, 'sort' => $j + 1, 'language_active' => 1, 'active' => 1];
            }
        }

        $this->table('rshop_box_subitems')->insert($subData)->save();`;
}

function buildSeedContent(seedClassName, boxKey, type, itemIds, itemCount, subOpts, fieldConfig) {
    const count = itemIds ? itemIds.length : itemCount;

    const dataRows = Array.from({ length: count }, (_, i) => {
        const typeField = type === 'custom'
            ? `'name' => 'Item ${i + 1}', `
            : `'${type}_id' => ${itemIds[i]}, `;
        const extra = buildExtraFieldStr(i, type, fieldConfig);
        const subitemsMeta = subOpts ? `'has_subitems' => 1, 'subitems_type' => '${subOpts.type}', ` : '';
        return `            ['box_id' => $box['id'], ${typeField}${subitemsMeta}'sort' => ${i + 1}${extra}, 'language_active' => 1, 'active' => 1],`;
    }).join('\n');

    const cleanupSubitems = subOpts
        ? `\n            $itemIds = implode(',', array_column($existing, 'id'));\n            $this->execute('DELETE FROM rshop_box_subitems WHERE box_item_id IN (' . $itemIds . ')');`
        : '';

    const subBlock = subOpts
        ? buildSeedSubitemsBlock(count, subOpts.type, subOpts.ids, subOpts.perItem, subOpts.fieldConfig)
        : '';

    return `<?php
use Migrations\\AbstractSeed;

class ${seedClassName} extends AbstractSeed
{
    public function run()
    {
        $box = $this->fetchRow("SELECT id FROM rshop_boxes WHERE box_key = '${boxKey}'");

        if (!$box) {
            return;
        }

        $existing = $this->fetchAll('SELECT id FROM rshop_box_items WHERE box_id = ' . $box['id']);

        if (!empty($existing)) {${cleanupSubitems}
            $this->execute('DELETE FROM rshop_box_items WHERE box_id = ' . $box['id']);
        }

        $data = [
${dataRows}
        ];

        $this->table('rshop_box_items')->insert($data)->save();${subBlock}
    }
}
`;
}

export async function runBoxSeed(boxKey, type, limit) {
    const seedName = `${toCamelCase(boxKey)}BoxItems`;
    const seedClassName = `${seedName}Seed`;

    const exists = await checkSeedExists(boxKey);
    if (exists) {
        p.log.warn(pc.cyan(`Seed "${seedClassName}.php" already exists`));
        const overwrite = await p.confirm({ message: 'Overwrite?' });
        if (p.isCancel(overwrite)) return;
        if (!overwrite) return;
        await unlink(join(rootDir, 'config/Seeds', `${seedClassName}.php`));
    }

    // ── Item count ────────────────────────────────────────────────────────────

    const predefined = [4, 12];
    const limitNum = limit ? Number(limit) : null;
    const nums = limitNum && !predefined.includes(limitNum)
        ? [...predefined, limitNum].sort((a, b) => a - b)
        : predefined;

    const countChoice = await p.select({
        message: 'How many seed items?',
        options: [
            ...nums.map((n) => ({ value: String(n), label: n === limitNum ? `${n} (limit)` : String(n) })),
            { value: 'custom', label: 'Custom' },
        ],
    });
    if (p.isCancel(countChoice)) return;

    let count;
    if (countChoice === 'custom') {
        const customCount = await text({ message: 'Enter count:', validate: validatePositiveInt });
        if (p.isCancel(customCount)) return;
        count = Number(customCount);
    } else {
        count = Number(countChoice);
    }

    // ── Resolve item IDs (query DB for non-custom types) ──────────────────────

    const itemIds = await resolveIds(type, count, 'item');
    if (itemIds === false) return;

    const effectiveCount = itemIds ? itemIds.length : count;

    const fieldConfig = await getSeedableFields('boxItems', boxKey);

    // ── Subitems ──────────────────────────────────────────────────────────────

    const subitemsType = await getSubitemsType(boxKey);
    let subOpts = null;

    if (subitemsType) {
        const subCountChoice = await p.select({
            message: 'How many subitems per item?',
            options: [
                { value: '4',  label: '4' },
                { value: '8',  label: '8' },
                { value: '12', label: '12' },
                { value: 'custom', label: 'Custom' },
            ],
        });
        if (p.isCancel(subCountChoice)) return;

        let perItem;
        if (subCountChoice === 'custom') {
            const customSub = await text({ message: 'Enter subitems per item:', validate: validatePositiveInt });
            if (p.isCancel(customSub)) return;
            perItem = Number(customSub);
        } else {
            perItem = Number(subCountChoice);
        }

        const subitemIds = await resolveIds(subitemsType, perItem, 'subitem', false);
        if (subitemIds === false) return;

        const subFieldConfig = await getSeedableFields('boxSubitems', boxKey);
        const effectivePerItem = subitemIds ? subitemIds.length : perItem;
        subOpts = { type: subitemsType, ids: subitemIds, perItem: effectivePerItem, fieldConfig: subFieldConfig };
    }

    // ── Bake + write ──────────────────────────────────────────────────────────

    const spinner = p.spinner();
    spinner.start(`Running: bin/cake bake seed ${seedName}`);

    try {
        await execa('bin/cake', ['bake', 'seed', seedName], { cwd: rootDir });
    } catch (err) {
        spinner.stop('Failed to run bin/cake bake seed');
        p.log.error(err.stderr || err.message);
        process.exit(1);
    }

    const seedsDir = join(rootDir, 'config/Seeds');
    const files = await readdir(seedsDir);
    const seedFile = files.find((f) => f === `${seedClassName}.php`);

    if (!seedFile) {
        spinner.stop('Seed file not found after bake');
        process.exit(1);
    }

    await writeFile(
        join(seedsDir, seedFile),
        buildSeedContent(seedClassName, boxKey, type, itemIds, effectiveCount, subOpts, fieldConfig),
    );
    spinner.stop(`Created: config/Seeds/${seedFile}`);

    // ── Optionally run ────────────────────────────────────────────────────────

    const runNow = await p.confirm({ message: 'Run seed now?' });
    if (p.isCancel(runNow)) return;

    if (runNow) {
        await execSeed(seedClassName);
    }
}

async function execSeed(seedClassName) {
    const spinner = p.spinner();
    spinner.start(`Running: bin/cake migrations seed --seed ${seedClassName}`);
    try {
        await execa('bin/cake', ['migrations', 'seed', '--seed', seedClassName], { cwd: rootDir });
        spinner.stop('Seed applied! ✨');
    } catch (err) {
        spinner.stop('Seed failed');
        p.log.error(err.stderr || err.message);
    }
}

export async function runSeedOnly(boxKey) {
    const seedClassName = `${toCamelCase(boxKey)}BoxItemsSeed`;
    await execSeed(seedClassName);
}
