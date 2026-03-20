#!/usr/bin/env node
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { runQuiz } from './commands/quiz.js';
import { cancel, setupBackNavigation } from './utils.js';
setupBackNavigation();
import { runBox, fetchAllBoxes, fetchBoxTypes } from './commands/box.js';
import { runBoxFields, runBoxSubitemFields, boxHasSubitems, enableBoxSubitems, runBannerFields } from './commands/fields.js';
import { runBoxSeed, checkSeedExists } from './commands/seed.js';
import { runConfiguration } from './commands/config.js';
import { runBanner, fetchAllBanners } from './commands/banner.js';
import { runProdWizard } from './commands/prod.js';
import { runInitWizard } from './commands/init.js';

const mode = process.argv[2] ?? 'dev';

if (!['dev', 'prod', 'init'].includes(mode)) {
    console.error(`Unknown mode: "${mode}". Valid modes: dev, prod, init`);
    process.exit(1);
}

if (mode === 'prod') {
    await runProdWizard();
    process.exit(0);
}

if (mode === 'init') {
    await runInitWizard();
    process.exit(0);
}

async function runDevWizard() {

p.intro(pc.bold('Welcome to rWizard ✨ '));

async function boxActions(box) {
    const done = new Set();

    if (await checkSeedExists(box.boxKey)) done.add('seed');
    let hasSubitems = await boxHasSubitems(box.boxKey);

    const label = (value, text) => done.has(value) ? `${text} ${pc.green('✓')}` : text;

    while (true) {
        const options = [
            { value: 'fields',         label: label('fields',         'Update boxItems fields') },
            ...(hasSubitems
                ? [{ value: 'subitemFields', label: label('subitemFields', 'Update boxSubitems fields') }]
                : [{ value: 'enableSubitems', label: 'Enable boxSubitems' }]),
            { value: 'seed',           label: label('seed',           'Create seed data') },
            { value: 'bye',            label: 'Bye-bye 👋' },
        ];

        const action = await p.select({
            message: `📦 "${box.name}" — what's next?`,
            options,
        });

        if (p.isCancel(action)) return;

        if (action === 'bye') {
            p.outro(pc.dim('See you next time!'));
            process.exit(0);
        }

        if (action === 'fields') {
            await runBoxFields(box);
            done.add('fields');
        } else if (action === 'subitemFields') {
            await runBoxSubitemFields(box);
            done.add('subitemFields');
        } else if (action === 'enableSubitems') {
            const spinner = p.spinner();
            spinner.start('Fetching box types...');
            let types;
            try {
                types = await fetchBoxTypes();
                spinner.stop(pc.cyan(`Loaded ${types.length} box types`));
            } catch (err) {
                spinner.stop(pc.red('Failed to fetch box types'));
                p.log.error(err.message);
                continue;
            }

            const subitemsType = await p.select({
                message: 'Subitem type:',
                options: types.map((t) => ({ value: t, label: t })),
            });
            if (p.isCancel(subitemsType)) return;

            spinner.start('Saving to config/rshop.php...');
            try {
                await enableBoxSubitems(box.boxKey, subitemsType);
                spinner.stop(pc.cyan('config/rshop.php updated ✨'));
                hasSubitems = true;
            } catch (err) {
                spinner.stop(pc.red('Failed to write config'));
                p.log.error(err.message);
            }
        } else if (action === 'seed') {
            await runBoxSeed(box.boxKey, box.type, box.limit);
            done.add('seed');
        }
    }
}

async function bannerActions(banner) {
    const done = new Set();
    const label = (value, text) => done.has(value) ? `${text} ${pc.green('✓')}` : text;

    while (true) {
        const action = await p.select({
            message: `🎯 "${banner.name}" — what's next?`,
            options: [
                { value: 'fields', label: label('fields', 'Update bannerPlaceItems fields') },
                { value: 'bye',    label: 'Bye-bye 👋' },
            ],
        });

        if (p.isCancel(action)) return;

        if (action === 'bye') {
            p.outro(pc.dim('See you next time!'));
            process.exit(0);
        }

        if (action === 'fields') {
            await runBannerFields(banner);
            done.add('fields');
        }
    }
}

async function bannerMenu() {
    while (true) {
        const action = await p.select({
            message: 'Banner place',
            options: [
                { value: 'create', label: 'Create' },
                { value: 'edit',   label: 'Edit' },
            ],
        });

        if (p.isCancel(action)) return;

        if (action === 'create') {
            const banner = await runBanner();
            await bannerActions(banner);
        } else if (action === 'edit') {
            const spinner = p.spinner();
            spinner.start('Loading banners...');
            let banners;
            try {
                banners = await fetchAllBanners();
                spinner.stop(pc.cyan(`Loaded ${banners.length} banners`));
            } catch (err) {
                spinner.stop(pc.red('Failed to load banners'));
                p.log.error(err.message);
                continue;
            }

            const bannerKey = await p.select({
                message: 'Select a banner place',
                options: banners.map((b) => ({ value: b.bannerKey, label: `${b.bannerKey} (${b.name})` })),
            });
            if (p.isCancel(bannerKey)) return;

            const banner = banners.find((b) => b.bannerKey === bannerKey);
            await bannerActions(banner);
        }
    }
}

async function boxMenu() {
    while (true) {
        const action = await p.select({
            message: 'Box',
            options: [
                { value: 'create', label: 'Create' },
                { value: 'edit',   label: 'Edit' },
            ],
        });

        if (p.isCancel(action)) return;

        if (action === 'create') {
            const box = await runBox();
            await boxActions(box);
        } else if (action === 'edit') {
            const spinner = p.spinner();
            spinner.start('Loading boxes...');
            let boxes;
            try {
                boxes = await fetchAllBoxes();
                spinner.stop(pc.cyan(`Loaded ${boxes.length} boxes`));
            } catch (err) {
                spinner.stop(pc.red('Failed to load boxes'));
                p.log.error(err.message);
                continue;
            }

            const boxKey = await p.select({
                message: 'Select a box',
                options: boxes.map((b) => ({ value: b.boxKey, label: `${b.boxKey} (${b.name})` })),
            });
            if (p.isCancel(boxKey)) return;

            const box = boxes.find((b) => b.boxKey === boxKey);
            await boxActions(box);
        }
    }
}

const action = await p.select({
    message: 'Hi! With what can I help you?',
    options: [
        { value: 'box',    label: 'Box' },
        { value: 'banner', label: 'Banner place' },
        { value: 'config', label: 'Configuration' },
        { value: 'quiz',   label: "I'm bored" },
    ],
});

if (p.isCancel(action)) return;
if (action) {
    if (action === 'box')         await boxMenu();
    else if (action === 'banner') await bannerMenu();
    else if (action === 'config') await runConfiguration();
    else if (action === 'quiz')   await runQuiz();
}

p.outro(pc.dim('See you next time!'));

} // end runDevWizard

await runDevWizard();
