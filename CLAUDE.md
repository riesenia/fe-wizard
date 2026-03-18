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
- `utils.js` — shared helpers: `rootDir`, `toCamelCase`, `toLowerCamelCase`, `cancel`, `validatePositiveInt`, `fetchEditorPresets`
- `commands/box.js` — box creation flow: DB queries (`fetchAllBoxes`, `fetchBoxTypes`, `fetchTypeIds`), migration bake, template/SCSS generation
- `commands/fields.js` — field config management, PHP config read/write (`config/rshop.php`); exports `getSeedableFields`, `getSubitemsType`, `boxHasSubitems`
- `commands/seed.js` — seed file generation: resolves real DB IDs for non-custom types, handles subitems, cycles IDs when count exceeds available records, respects active field config
- `commands/config.js` — configuration migration flow: fetches DB groups filtered by `is_text`, loops to define configurations (key, name, type, preset/options, value, public), bakes migration via `bin/cake bake configuration`, replaces placeholders in generated file; supports new group creation
- `commands/quiz.js` — Taylor Swift quiz easter egg

## Editor presets

`fetchEditorPresets()` in `utils.js` parses TinyMCE preset names from two files (no PHP execution):
- `vendor/rshop/admin/config/rshop_admin.php` — keys of `TinyMCE.configs` array (excluding `default`)
- `config/rshop.php` — top-level keys matching `TinyMCE.configs.{name}` where value is an array

## Configuration twig template

`vendor/rshop/rshop/src/Core/Template/Bake/Migrations/configuration.twig` uses `${placeholder}` variables replaced by `commands/config.js` after bake:
- `${configurationsBlock}` — full `$_configurations` PHP array
- `${groupIdentifier}`, `${languageDependent}`, `${shopDependent}`
- `${newGroupBlock}` — group insert SQL (only for new groups)
- `${deleteGroupLine}` — group delete SQL in `down()` (only for new groups)

## groupDotted conversion

For text groups (`is_text = 1`): `text_header_footer` → `text.headerFooter` (part after `text_` is camelCased as one unit).
For normal groups: underscores replaced with dots (`my_group` → `my.group`).

**Dependencies:** `@clack/prompts` (UI), `picocolors` (colors), `execa` (shell commands), `clipboardy` (clipboard)
