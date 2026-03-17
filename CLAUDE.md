# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package

**Name:** `r-wizard`
**Entry point:** `wizard.js` (ESM, `#!/usr/bin/env node`)
**CLI bin:** `r-wizard`

## Commands

- Run locally: `node wizard.js`
- Install deps: `npm install`
- Register global symlink: `npm link`

## Local Dev Workflow (linking to `app`)

```bash
# One-time setup
cd /Users/igorsloboda/Devel/npm-packages/r-wizard
npm install && npm link

cd /Users/igorsloboda/Devel/www/app
npm link r-wizard
```

Then run from app: `npm run wizard` (requires `"wizard": "r-wizard"` in app/package.json scripts).

Changes in `r-wizard/` are reflected immediately — no re-link needed.

## Architecture

Plain ESM CLI using `@clack/prompts` for interactive terminal UI.

- `wizard.js` — entry point, top-level menu, `boxMenu()` and `boxActions()` orchestration
- `utils.js` — shared helpers: `rootDir`, `toCamelCase`, `toLowerCamelCase`, `cancel`, `validatePositiveInt`
- `commands/box.js` — box creation flow: DB queries, migration bake, template/SCSS generation
- `commands/fields.js` — field config management, PHP config read/write (`config/rshop.php`)
- `commands/seed.js` — seed file generation and execution
- `commands/quiz.js` — Taylor Swift quiz easter egg

**Dependencies:** `@clack/prompts` (UI), `picocolors` (colors), `execa` (shell commands), `clipboardy` (clipboard)
