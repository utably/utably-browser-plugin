# Utably Job Importer (Chrome Extension)

Utably Chrome extension (Manifest V3) for importing job postings into Utably with a user-reviewed side-panel workflow.

## Features

- Sidebar-first UX (toolbar icon opens side panel)
- Secure connect flow (one-time code -> short-lived extension tokens)
- Auto-fill via adapter-based extractors (`googlejobs`, `indeed`, `linkedin`, `generic`)
- User review/edit before sending data to backend
- Stage-aware routing (`prod`, `dev`, `test`, `local`)
- Local mode supports configurable app port (`https://app.dev.utably.com:<port>`)

## Quick Start

1. Build runtime bundle:
1. `cd extension && npm run build`
1. Open `chrome://extensions`
1. Enable **Developer mode**
1. Click **Load unpacked**
1. Select `extension/dist/`
1. Click the Utably icon in Chrome toolbar

## Stage Settings

Open **Settings** in the side panel.

- `Debug mode`: enables non-prod stages
- `Target stage`: `prod`, `dev`, `test`, `local`
- `Local app port`: shown only for `local` stage (default `5173`)

`local` stage routing:
- App: `https://app.dev.utably.com:<port>`
- Connect: `https://app.dev.utably.com:<port>/extension/connect`
- API: `https://api.dev.utably.com`

## Project Structure

```text
extension/
  package.json
  scripts/
    build.mjs
  dist/                  # build output for load unpacked
  manifest.json
  background.js
  popup.html
  popup.css
  popup.js
  popup/
    app.js
    config.js
    dom.js
    extraction.js
    payload.js
    settings.js
  webpages/
    common.js
    router.js
    googlejobs.js
    linkedin.js
    indeed.js
    generic.js
  docs/
    README.md
    architecture.md
    adapters.md
    development.md
    branching.md
```

## Build Commands

- `npm run build`: copies runtime extension files into `dist/`
- `npm run clean`: removes `dist/`

## Documentation

- [Docs index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Adapters](docs/adapters.md)
- [Development](docs/development.md)
- [Branching and Promotion Guard](docs/branching.md)

## Notes

- Data is only sent when user clicks **Save to Utably**.
- LinkedIn runs in manual-description mode by design.
- Host access for extraction is requested per-origin at runtime.

## Repo Migration Note

This folder includes a repo-ready GitHub scaffold under `extension/.github/`:

- `extension/.github/workflows/promotion-guard.yml`
- `extension/.github/CODEOWNERS`

When moved into its own repository, place these files at root `.github/`.
