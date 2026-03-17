# r-wizard

Interactive CLI wizard for scaffolding and configuring rShop boxes.

## What it does

- **Create a box** — runs `bin/cake bake boxes`, generates migration, `.ctp` template, and SCSS file, applies migration, writes initial config to `config/rshop.php`
- **Edit an existing box** — load any box from the database and manage its config
- **Update boxItems fields** — toggle default fields (name, url, image) and manage custom `module_data.*` fields in `config/rshop.php`
- **Update boxSubitems fields** — same as above for the `boxSubitems` section
- **Enable boxSubitems** — add `has_subitems` to a box config and optionally set field defaults
- **Create seed data** — scaffolds a `config/Seeds/*.php` file and optionally runs it

## Requirements

- Node.js 18+
- Access to the rShop app directory (run from its root, or symlink via `npm link`)
- `mysql` CLI available in `$PATH`
- `php` CLI available in `$PATH`

## Setup

```bash
# Install dependencies
npm install

# Register as a global CLI (one-time)
npm link

# Link into your app project
cd /path/to/app
npm link r-wizard
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

Changes in `r-wizard/` are reflected immediately — no re-link needed after the initial setup.
