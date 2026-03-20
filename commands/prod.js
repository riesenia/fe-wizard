import * as p from '@clack/prompts';
import pc from 'picocolors';
import { cancel } from '../utils.js';

export async function runProdWizard() {
    p.intro(pc.bold('Welcome to rWizard ✨ ') + pc.dim('[prod]'));

    const action = await p.select({
        message: 'Hi! With what can I help you?',
        options: [
            { value: 'seed', label: 'Seed data (TBD)' },
        ],
    });

    if (p.isCancel(action)) return;

    if (action === 'seed') {
        p.log.info('Coming soon');
    }

    p.outro(pc.dim('See you next time!'));
}
