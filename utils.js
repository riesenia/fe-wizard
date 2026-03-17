import * as p from '@clack/prompts';

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

export function validatePositiveInt(val) {
    if (!val || !val.trim() || isNaN(Number(val)) || Number(val) <= 0)
        return 'Enter a valid positive number';
}
