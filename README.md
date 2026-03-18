# @riesenia/r-wizard

Interactive CLI wizard for scaffolding and configuring rShop boxes, banners, and configurations.

## What it does

**Box**
- **Create a box** — runs `bin/cake bake boxes`, generates migration, `.ctp` template, and SCSS file, applies migration, writes initial config to `config/rshop.php`
- **Edit an existing box** — load any box from the database and manage its config
- **Update boxItems fields** — toggle default fields and manage custom `module_data.*` fields in `config/rshop.php`
- **Update boxSubitems fields** — same as above for the `boxSubitems` section
- **Enable boxSubitems** — add subitems support to a box config
- **Create seed data** — scaffolds a `config/Seeds/*.php` file and optionally runs it

**Banner place**
- **Create a banner place** — runs `bin/cake bake banners`, generates migration, `.ctp` template, and SCSS file, applies migration, outputs a ready-to-use PHP snippet copied to clipboard
- **Edit an existing banner place** — load any banner from the database and manage its field config

**Configuration**
- Define configuration entries (key, name, type, preset/options, value, public flag) for an existing or new group, bakes a migration via `bin/cake bake configuration`

## Requirements

- Node.js 18+
- Access to the rShop app directory (run from its root)
- `mysql` CLI available in `$PATH`

## Setup

```bash
npm install -g @riesenia/r-wizard
```

Add to `app/package.json` scripts:

```json
"wizard": "r-wizard"
```

Then run from the app root:

```bash
npm run wizard
```

## Local development

```bash
cd /path/to/r-wizard
npm install && npm link

cd /path/to/app
npm link @riesenia/r-wizard
```

Changes in `r-wizard/` are reflected immediately — no re-link needed after the initial setup.
