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

Plain ESM CLI using `@clack/prompts` for interactive terminal UI. Single entry point `wizard.js` invoked as `r-wizard` bin.
