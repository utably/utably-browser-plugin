# Development

Everything you need to run the extension locally, make a change, and
see the result.

## Table of contents

- [Prerequisites](#prerequisites)
- [Clone and build](#clone-and-build)
- [Load the extension](#load-the-extension)
- [The edit → reload loop](#the-edit--reload-loop)
- [Debugging](#debugging)
- [Multi-browser builds](#multi-browser-builds)
- [Project layout](#project-layout)
- [Build commands](#build-commands)
- [Testing](#testing)
- [Common issues](#common-issues)

---

## Prerequisites

- **Node.js ≥ 18** — only needed for the build scripts. There are no
  runtime `npm` dependencies, so `npm install` is essentially a no-op.
- **A Chromium-based browser** (Chrome, Edge, Brave, Arc) for the
  primary dev loop. Firefox and Safari work too but are slower to
  iterate on.
- **A Utably account** if you want to actually sign in and save jobs.
  You can work on adapters and most UI without signing in.

## Clone and build

```bash
git clone https://github.com/utably/utably-browser-plugin.git
cd utably-browser-plugin
npm run build:chrome
```

The build is pure file copying — no bundler, no transpiler, no
minifier. It runs in well under a second on modern hardware.

Output lands in `dist/utably-browser-plugin-chrome-edge/`.

### Dev vs. prod builds

There are two build variants and it matters which one you sideload:

| Variant | Command | Output | Manifest name | Debug features |
|---|---|---|---|---|
| **Dev** (default) | `npm run build:chrome` | `dist/utably-browser-plugin-chrome-edge/` | `Utably Job Importer (Dev <version>)` | Debug Mode UI, `api.dev.utably.com` + `api.test.utably.com` host permissions, full `console.log` output |
| **Prod** | `npm run build:prod` | `dist/prod/utably-browser-plugin-chrome-edge/` | `Utably Job Importer` | All of the above stripped |

**Never sideload the repo root directly.** The raw `manifest.json` in
the root is the dev variant's source — it declares the dev/test host
permissions so Debug Mode works during development. Always load from
`dist/…` after running a build. For a clean no-debug extension that
matches the Chrome Web Store release, use `npm run build:prod` and
load from `dist/prod/utably-browser-plugin-chrome-edge/`.

## Load the extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on, top right.
3. Click **Load unpacked**.
4. Select `dist/utably-browser-plugin-chrome-edge/`.
5. Pin the Utably icon to the toolbar for easy access (puzzle piece
   menu → pin).
6. Click the icon — the side panel should slide in.

If you see the side panel with a *Connect with Utably* button, you're
good.

## The edit → reload loop

Chrome extensions don't hot-reload, so every change needs three
steps:

1. **Edit** a file under `popup/`, `webpages/`, `background.js`, etc.
2. **Rebuild** the browser target:
   ```bash
   npm run build:chrome
   ```
3. **Reload the extension** at `chrome://extensions` — click the
   reload icon on the Utably card.
4. **Close and reopen the side panel** if you touched `popup/` code
   (the popup caches its module graph for the session).

For service worker changes (`background.js`), also click
**Inspect views → service worker** once before testing — this ensures
the old worker instance is killed.

> **Tip:** Keep `chrome://extensions` open in a tab. You'll reload the
> extension dozens of times a day while iterating on adapters.

## Debugging

### Service worker (`background.js`)

1. Go to `chrome://extensions`.
2. Find Utably → click **Inspect views → service worker**.
3. A DevTools window opens scoped to the worker.
4. Set breakpoints, watch the console, inspect `chrome.storage.local`
   under the **Application** tab.

The service worker goes idle after ~30 seconds of inactivity — when
that happens, DevTools shows "Service worker inactive". Send a message
from the side panel (click anything) to wake it up again.

### Side panel (`popup/`)

1. Open the side panel from the toolbar icon.
2. Right-click inside the side panel → **Inspect**.
3. DevTools opens scoped to the side panel context.
4. Your `popup/*.js` modules are visible under **Sources** → **file://**.

### Content scripts (`content/capture.js`, `webpages/*.js`)

Content scripts run in the **target tab's** context, not the
extension's. To debug:

1. Open DevTools **on the job posting tab** (not on the side panel).
2. In the **Sources** tab, look under **Content scripts** → Utably.
3. Injected scripts appear here after you click Auto-fill.

Add `debugger;` statements liberally while developing adapters —
they'll pause in the target page's DevTools.

### Storage inspection

The extension stores everything in `chrome.storage.local`. To inspect:

1. Inspect the service worker (see above).
2. **Application** tab → **Storage** → **Extension storage** → **Local**.
3. You'll see keys like `extAccessToken`, `utablyDraft`,
   `utablyFitCheckCache`.

To clear all state (useful when auth flows get confused):

```javascript
chrome.storage.local.clear();
```

Paste that into the service worker DevTools console.

### Promise errors are silent in MV3 workers

If you see a message sent to the background worker that never returns,
it usually means an unhandled promise rejection. Wrap suspect handlers
in `try/catch` and log to `console.error` — MV3 service workers
swallow uncaught errors quietly.

## Multi-browser builds

All three browser targets build from the same source.

### Chrome / Edge

```bash
npm run build:chrome
# → dist/utably-browser-plugin-chrome-edge/
```

Load via `chrome://extensions` → **Load unpacked**.

### Firefox

```bash
npm run build:firefox
# → dist/utably-browser-plugin-firefox/ (contains the .xpi)
```

Load via `about:debugging` → **This Firefox** → **Load Temporary
Add-on** → pick the `.xpi`. Firefox temporary add-ons unload on
browser restart — you'll need to reload after closing Firefox.

### Safari

```bash
npm run safari:convert
# → dist/utably-browser-plugin-safari/ (Xcode project)
```

Safari builds require **macOS with Xcode installed**. Open the
generated `.xcodeproj`, build, and run. The Safari app wrapper is
more involved than Chrome/Firefox — don't start here unless you
actually need Safari support.

## Project layout

```
utably-browser-plugin/
├── manifest.json           # MV3 declaration
├── background.js           # Service worker — auth, API calls, tokens
├── popup.html              # Side panel markup
├── popup.css               # Side panel styles
├── popup.js                # Module loader (imports popup/*.js)
├── popup/                  # Side panel logic
│   ├── app.js              # Core controller, FitCheck, event wiring
│   ├── config.js           # Stage URLs, adapter file list
│   ├── dom.js              # Element getters, status helpers
│   ├── extraction.js       # Adapter injection, host permission prompts
│   ├── payload.js          # Builds the Save-to-Utably payload
│   └── settings.js         # Stage/port/debug validation
├── webpages/               # Job board adapters (see docs/adapters.md)
│   ├── common.js           # Shared helpers (normalize, sanitize, ...)
│   ├── router.js           # Adapter registry + routing
│   └── <site>.js           # One file per supported board
├── content/                # Injected content scripts
│   └── capture.js          # Text-capture floating card
├── icons/                  # 16/32/48/128 px extension icons
├── assets/                 # UI imagery
├── scripts/                # Build tools
│   ├── build.mjs           # Chrome/Edge: file copy
│   ├── firefox-build.mjs   # Firefox XPI packaging
│   └── safari-convert.mjs  # Safari Xcode wrapper
├── dist/                   # Build output (git-ignored)
└── docs/                   # This directory
```

## Build commands

| Command | What it does |
|---|---|
| `npm run build:chrome` | Builds the Chrome/Edge target only (fastest). |
| `npm run build:firefox` | Builds Chrome/Edge, then packages Firefox XPI. |
| `npm run safari:convert` | Builds Chrome/Edge, then runs Xcode conversion (macOS only). |
| `npm run build` | Builds all three targets + the production build. Use before tagging a release. |
| `npm run build:prod` | Builds the clean production variant (no debug UI, dev hosts stripped) under `dist/prod/`. |
| `npm run clean` | Removes `dist/`. |
| `npm test` | Runs the test suite via Node's native test runner. |

**For iterating on code, `npm run build:chrome` is all you need.**

## Testing

The project ships with a small test suite under `tests/` covering:

- **Metadata invariants** — `manifest.json` / `package.json` version
  parity, MV3 shape, permission surface, icon sizes.
- **Adapter registry** — static validation that every `webpages/*.js`
  adapter has the required shape, unique id, in-range priority, and is
  registered in `EXTRACTION_SCRIPT_FILES`.
- **`common.js` helpers** — unit tests for `normalize`, `sanitizeText`,
  and `cleanTitle` via a Node `vm` sandbox.
- **Build output** — executes both the dev and prod builds, asserts the
  prod stripper removes dev hosts, hides the Debug Mode UI, and strips
  `console.log/debug/info` while preserving `console.error/warn`.

Run locally:

```bash
npm test
```

The tests use Node's built-in runner (`node --test`, available since
Node 18), so there is nothing to install. CI runs the same command on
Node 18, 20, and 22 via `.github/workflows/test.yml`.

**Write tests for new adapters** is explicitly **not** required — the
adapter shape test covers every file automatically. The most useful
thing you can do for a new adapter is include at least two real job
posting URLs and screenshots of the side-panel review screen in the PR
(see [`../CONTRIBUTING.md`](../CONTRIBUTING.md)).

## Common issues

### "Service worker registration failed"

Usually a syntax error in `background.js`. Check the service worker
DevTools console at `chrome://extensions` → Inspect.

### Auto-fill does nothing / status stays "Extracting..."

1. Check the job posting tab's DevTools console for errors from an
   injected script.
2. Verify the adapter's `canHandle()` actually matches the current
   hostname.
3. If the fallback (`generic.js`) is selected but doesn't work, the
   page probably has no JSON-LD `JobPosting` — consider writing a
   dedicated adapter.

### Connect button opens the Utably page but nothing happens after login

- Verify `manifest.json` has your app origin under
  `externally_connectable.matches`.
- Check the service worker console for external-message errors.
- Allow pop-ups for the extension origin.

### FitCheck shows "locked" for every job

Your Utably account is on the free tier (tier gating is server-side),
or the `/extension/llm` handler is returning a rate-limit. Not a
client bug — check account tier or backend logs.

### Text Capture card doesn't appear

- Toggle **Capture: On** in the side panel.
- Check that `content/capture.js` was injected — Inspect the job
  posting tab, look under **Sources → Content scripts**.
- Some pages have strict CSP that blocks Shadow DOM injection — this
  is a known limitation.

### CSP / "unsafe-eval" error in an adapter

Don't use `eval` or `new Function()` in adapters. The MV3 CSP forbids
them. Stick to DOM queries and helper calls.

---

**Next:**

- [`adapters.md`](adapters.md) — build your first adapter.
- [`architecture.md`](architecture.md) — deeper dive into components.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — PR rules.
