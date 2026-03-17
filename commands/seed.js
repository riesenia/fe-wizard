import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { readdir, writeFile, access, unlink } from 'fs/promises';
import { join } from 'path';
import { rootDir, toCamelCase, cancel } from '../utils.js';

export async function checkSeedExists(boxKey) {
    const seedClassName = `${toCamelCase(boxKey)}BoxItemsSeed`;
    try {
        await access(join(rootDir, 'config/Seeds', `${seedClassName}.php`));
        return true;
    } catch {
        return false;
    }
}

function buildSeedContent(seedClassName, boxKey, type, count) {
    const dataRows = Array.from({ length: count }, (_, i) => {
        const typeIdField = type !== 'custom' ? `'${type}_id' => ${i + 1}, ` : `'name' => 'Item ${i + 1}', `;
        return `            ['box_id' => $box['id'], ${typeIdField}'sort' => ${i + 1}, 'language_active' => 1, 'active' => 1],`;
    }).join('\n');

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

        if (!empty($existing)) {
            $this->execute('DELETE FROM rshop_box_items WHERE box_id = ' . $box['id']);
        }

        $data = [
${dataRows}
        ];

        $this->table('rshop_box_items')->insert($data)->save();
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
        if (p.isCancel(overwrite)) cancel();
        if (!overwrite) return;
        await unlink(join(rootDir, 'config/Seeds', `${seedClassName}.php`));
    }

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
    if (p.isCancel(countChoice)) cancel();

    let count;
    if (countChoice === 'custom') {
        const customCount = await p.text({
            message: 'Enter count:',
            validate: (val) => {
                if (!val || !val.trim() || isNaN(Number(val)) || Number(val) <= 0)
                    return 'Enter a valid positive number';
            },
        });
        if (p.isCancel(customCount)) cancel();
        count = Number(customCount);
    } else {
        count = Number(countChoice);
    }

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

    await writeFile(join(seedsDir, seedFile), buildSeedContent(seedClassName, boxKey, type, count));
    spinner.stop(`Created: config/Seeds/${seedFile}`);

    const runNow = await p.confirm({ message: 'Run seed now?' });
    if (p.isCancel(runNow)) cancel();

    if (runNow) {
        spinner.start(`Running: bin/cake migrations seed --seed ${seedClassName}`);
        try {
            await execa('bin/cake', ['migrations', 'seed', '--seed', seedClassName], { cwd: rootDir });
            spinner.stop('Seed applied! ✨');
        } catch (err) {
            spinner.stop('Seed failed');
            p.log.error(err.stderr || err.message);
        }
    }
}
