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

## Modes

`wizard.js` dispatches on `process.argv[2]`:

| Command | Mode |
|---|---|
| `r-wizard` or `r-wizard dev` | dev (default) |
| `r-wizard prod` | production tasks |
| `r-wizard init` | project initialization |

Unknown modes print an error and exit with code 1.

## Architecture

Plain ESM CLI using `@clack/prompts` for interactive terminal UI.

- `wizard.js` — entry point, mode dispatch; dev mode wraps all existing dev logic in `runDevWizard()`; routes `prod`/`init` to their command files
- `utils.js` — shared helpers and UI primitives:
  - `rootDir`, `toCamelCase`, `toLowerCamelCase`, `cancel`, `validatePositiveInt`
  - `FIELD_TYPES`, `TEXT_FIELD_TYPES` — field type constants
  - `getDbConfig()` — reads DB credentials from `config/.env`
  - `mysqlArgs()` — builds mysql CLI args array
  - `fetchEditorPresets()` — parses TinyMCE preset names
  - `promptLimit(presets)` — interactive limit selector with preset shortcuts + custom
  - `promptEditorPreset()` — interactive editor preset selector
  - `promptSelectOptions(initialOptions)` — interactive builder for select-type key/value pairs

### Dev mode commands (`commands/`)

- `commands/box.js` — box creation flow: DB queries (`fetchAllBoxes`, `fetchBoxTypes`, `fetchTypeIds`), migration bake, template/SCSS generation
- `commands/banner.js` — banner place creation flow: key input with DB uniqueness check, name, options (`BANNER_OPTIONS`), limit, `bin/cake bake banners`, migration placeholder replacement (`${name}`, `${bannerKey}`, per-option flags), template/SCSS generation, optional migration run, clipboard usage example; exports `runBanner`, `fetchAllBanners`
- `commands/fields.js` — field config management, PHP config read/write (`config/rshop.php`):
  - Box: `runBoxFields`, `runBoxSubitemFields`, `writeBoxConfig`, `writeBoxItemsConfig`, `enableBoxSubitems`, `boxHasSubitems`, `getSeedableFields`, `getSubitemsType`
  - Banner: `runBannerFields`, `writeBannerItemsConfig`, `BANNER_ITEM_BLOCKS`
- `commands/seed.js` — seed file generation: resolves real DB IDs for non-custom types, handles subitems, cycles IDs when count exceeds available records, respects active field config
- `commands/config.js` — configuration migration flow: fetches DB groups filtered by `is_text`, loops to define configurations (key, name, type, preset/options, value, public), bakes migration via `bin/cake bake configuration`, replaces placeholders in generated file; supports new group creation
- `commands/quiz.js` — Taylor Swift quiz easter egg

### Prod mode (`commands/prod.js`)

- `runProdWizard()` — stub menu with "Seed data (TBD)" placeholder

### Init mode (`commands/init.js` + `commands/fonts.js`)

Entry: `runInitWizard()` — main menu with two options:

**Set base Configurations**
- Reads/writes values in `rshop_configurations` DB table (via mysql CLI)
- Defined configs: `store.name`, `store.email`, `store.phone`
- After each save: runs `bin/cake orm_cache clear` and `bin/cake cache clear rshop_configurations`
- After saving `store.name`: handles `src/Template/Plugin/Rshop/Core/AdminUsers/login.ctp`:
  - File missing → creates it with `use Cake\Core\Configure;` + `Configure::read('Rshop.store.name')`
  - File exists, no `login_header_client` → appends the assign line (injects `use` if needed)
  - File exists, already uses `Configure::read('Rshop.store.name')` → informs user, no change
  - File exists, different value → shows current value, offers to update to `Configure::read` format

**Set Font Families** (`commands/fonts.js`, `runFontFamilies()`)
- Scans `public/fonts/` (skipping `icomoon`) and parses `resources/css/common/_fonts.scss`
- Folder naming: spaces stripped from font family name — `"TikTok Sans"` → `TikTokSans/`
- File naming: `fontslug-[styleslug-]setslug.woff2` — italic gets `italic-` infix, normal has no infix (e.g. `inter-italic-cyrillic.woff2`, `inter-cyrillic.woff2`)
- Font URL saved as `// @font-url[FontName]: <url>` comment in `_fonts.scss` after the last `@use` line
- Font statuses: `enabled` (has active blocks), `disabled` (all blocks commented), `no-definition` (folder only)
- Actions per font: Enable / Disable / Refetch / Remove
  - **Enable/Disable**: comments or uncomments all `@font-face` blocks for that family
  - **Refetch**: offers saved URL or prompts for new one; re-downloads all files, replaces SCSS blocks
  - **Remove**: confirm (default No), deletes folder + removes all blocks and `@font-url` comment from SCSS
- **Add new font family**: prompts for Google Fonts URL, fetches CSS with Chrome UA (to get woff2), shows font details note, confirms, downloads files, appends `@font-face` blocks to `_fonts.scss`
- SCSS `@font-face` format uses `$p_fonts` variable: `url("#{$p_fonts}FontName/file.woff2")`
- `safeReplace()` wraps `String.replace` with a function replacer to prevent `$` in SCSS content from being misinterpreted as replacement pattern special chars
- Active block regex uses `[\s\S]*?\n` body (not `[^}]+`) to correctly handle `#{$p_fonts}` SCSS interpolation containing `}`

## Editor presets

`fetchEditorPresets()` in `utils.js` parses TinyMCE preset names from two files (no PHP execution):
- `vendor/rshop/admin/config/rshop_admin.php` — keys of `TinyMCE.configs` array (excluding `default`)
- `config/rshop.php` — top-level keys matching `TinyMCE.configs.{name}` where value is an array

`promptEditorPreset()` wraps `fetchEditorPresets()` into an interactive `p.select` with a "Custom..." fallback.

## Configuration bake template

`vendor/rshop/rshop/src/Core/Template/Bake/Migrations/configuration.twig` uses `${placeholder}` variables replaced by `commands/config.js` after bake:
- `${configurationsBlock}` — full `$_configurations` PHP array
- `${groupIdentifier}`, `${languageDependent}`, `${shopDependent}`
- `${newGroupBlock}` — group insert SQL (only for new groups)
- `${deleteGroupLine}` — group delete SQL in `down()` (only for new groups)

## groupDotted conversion

For text groups (`is_text = 1`): `text_header_footer` → `text.headerFooter` (part after `text_` is camelCased as one unit).
For normal groups: underscores replaced with dots (`my_group` → `my.group`).

**Dependencies:** `@clack/prompts` (UI), `picocolors` (colors), `execa` (shell commands), `clipboardy` (clipboard)
