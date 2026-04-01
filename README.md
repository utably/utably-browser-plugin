# Utably Browser Plugin

> Manifest V3 browser extension for importing job postings into Utably with a user-reviewed side-panel workflow. Supports **Chrome, Firefox, Safari, and Edge**.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](#)
[![Version](https://img.shields.io/badge/Version-0.1.3-green.svg)](#)
[![Browsers](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Firefox%20%7C%20Safari%20%7C%20Edge-orange.svg)](#)

## Features

- **Side-panel workflow**: Toolbar icon opens a review panel — no popups or new tabs
- **17 job board adapters**: Auto-extracts job data from LinkedIn, Indeed, Google Jobs, Glassdoor, ZipRecruiter, Monster, and more
- **FitCheck**: LLM-powered job fit analysis with traffic-light scoring, skills breakdown, and qualification assessment (tier-gated)
- **Text Capture**: Select and copy text on any page to assign it to form fields via a floating card overlay
- **Secure auth**: One-time code exchange flow with short-lived access tokens and refresh rotation
- **Duplicate detection**: Checks for existing applications before import
- **Stage-aware routing**: Supports `prod`, `dev`, `test`, and `local` environments
- **Multi-browser**: Chrome/Edge (primary), Firefox (XPI), Safari (Xcode app conversion)
- **Privacy-first**: No background crawling, no credential capture, data sent only on explicit user action

## Quick Start

### Chrome / Edge
```bash
npm run build
```
1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `dist/utably-browser-plugin-chrome-edge/`
5. Click the Utably icon in the toolbar

### Firefox
```bash
npm run build    # generates .xpi in dist/
```
Load via `about:debugging` > "This Firefox" > "Load Temporary Add-on".

### Safari
```bash
npm run build    # generates Xcode project in dist/utably-browser-plugin-safari/
```
Open the Xcode project and build/run.

## User Flow

1. Click toolbar icon -> side panel opens
2. **Not authenticated?** Click "Connect with Utably" -> OAuth flow via Utably app
3. **Authenticated?** Navigate to a job posting and click "Auto-fill"
4. Review extracted fields (title, company, location, description, recruiter)
5. Optionally run **FitCheck** for AI-powered job fit analysis
6. Click **Save to Utably** to import the application

## FitCheck (AI Job Fit Analysis)

LLM-powered analysis of how well a job posting matches the user's profile:

- **Traffic light indicator**: Perfect / Good / Partial / Review Needed
- **Overall fit score** (0-100)
- **Qualification analysis** with supporting signals
- **Skills breakdown**: Matching skills, gaps, and bonus skills
- **Preferences alignment**: Salary, location, remote work
- **Work style fit** assessment
- **Top strengths and concerns** summary
- Tier-gated: Free users see limited insights with upgrade prompt
- 24-hour client-side cache (max 20 results)

## Text Capture

- Toggle "Capture: On" in the side panel
- Select text on any page and copy (Ctrl/Cmd+C)
- A floating card appears with the captured text
- Assign it to any form field (Title, Company, Location, Recruiter, Description)
- Auto-dismisses after 9 seconds if unused
- Uses Shadow DOM for style isolation

## Supported Job Boards (17 Adapters)

| Priority | Adapter | Source |
|----------|---------|--------|
| 100 | `linkedin.js` | LinkedIn (metadata only, manual description) |
| 95 | `indeed.js` | Indeed |
| 95 | `googlejobs.js` | Google Careers |
| 90 | `glassdoor.js` | Glassdoor |
| 90 | `ziprecruiter.js` | ZipRecruiter |
| 90 | `monster.js` | Monster |
| 90 | `careerbuilder.js` | CareerBuilder |
| 90 | `dice.js` | Dice |
| 90 | `wellfound.js` | Wellfound (AngelList) |
| 90 | `handshake.js` | Handshake |
| 90 | `usajobs.js` | USA Jobs |
| 90 | `ukportals.js` | UK Job Portals |
| 80 | `ats.js` | ATS-hosted pages (Greenhouse, Lever, etc.) |
| 80 | `builtin.js` | BuiltIn |
| 70 | `simplyhired.js` | SimplyHired |
| 70 | `remoteok.js` | RemoteOK |
| 10 | `generic.js` | Fallback (JSON-LD parsing + DOM scoring) |

## Project Structure

```
utably-browser-plugin/
├── manifest.json              # MV3 configuration
├── background.js              # Service worker (auth, API calls, token management)
├── popup.html                 # Side panel markup
├── popup.css                  # Side panel styles
├── popup.js                   # Module loader
├── popup/                     # App logic modules
│   ├── app.js                 # Core app, FitCheck controller, event listeners
│   ├── config.js              # Stage URLs, extraction script list
│   ├── dom.js                 # DOM element getters, status helpers
│   ├── extraction.js          # Adapter injection, host permission requests
│   ├── payload.js             # Payload builders (import + FitCheck)
│   └── settings.js            # Stage/port validation, debug toggle
├── webpages/                  # Job board extraction adapters
│   ├── common.js              # Shared helpers (normalize, sanitize, meta, wait)
│   ├── router.js              # Adapter registry, priority sorting, routing
│   ├── linkedin.js            # LinkedIn adapter
│   ├── indeed.js              # Indeed adapter
│   ├── googlejobs.js          # Google Careers adapter
│   ├── glassdoor.js           # Glassdoor adapter
│   ├── ziprecruiter.js        # ZipRecruiter adapter
│   ├── monster.js             # Monster adapter
│   ├── careerbuilder.js       # CareerBuilder adapter
│   ├── dice.js                # Dice adapter
│   ├── wellfound.js           # Wellfound adapter
│   ├── handshake.js           # Handshake adapter
│   ├── usajobs.js             # USA Jobs adapter
│   ├── ukportals.js           # UK Job Portals adapter
│   ├── ats.js                 # ATS-hosted adapter
│   ├── builtin.js             # BuiltIn adapter
│   ├── simplyhired.js         # SimplyHired adapter
│   ├── remoteok.js            # RemoteOK adapter
│   └── generic.js             # Fallback adapter (JSON-LD + DOM scoring)
├── content/                   # Injected content scripts
│   ├── capture.js             # Text capture UI + event listeners
│   └── extract.js             # Reserved for future use
├── assets/                    # UI images
├── icons/                     # Extension icons (16, 32, 48, 128px)
├── scripts/                   # Build tools
│   ├── build.mjs              # Chrome/Edge build
│   ├── firefox-build.mjs      # Firefox XPI packaging
│   └── safari-convert.mjs     # Safari app conversion
├── dist/                      # Build outputs
│   ├── utably-browser-plugin-chrome-edge/
│   ├── utably-browser-plugin-firefox/
│   └── utably-browser-plugin-safari/
├── docs/                      # Documentation
└── package.json
```

## API Endpoints

All authenticated endpoints require `Authorization: Bearer <accessToken>`.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/extension/connect/session/start` | Initiate auth polling session |
| GET | `/extension/connect/session/status` | Poll for connection status |
| POST | `/extension/token/exchange` | Exchange one-time code for tokens |
| POST | `/extension/token/refresh` | Refresh access token |
| POST | `/extension/token/revoke` | Revoke token and clear auth |
| POST | `/extension/import-job` | Submit application payload |
| POST | `/extension/import-job/duplicate-check` | Check for duplicate application |
| POST | `/extension/llm` | FitCheck analysis (mode: "fitcheck") |

## Stage Settings

Open **Settings** in the side panel:

| Stage | API | App |
|-------|-----|-----|
| `prod` | `https://api.utably.com` | `https://app.utably.com` |
| `dev` | `https://api.dev.utably.com` | `https://app.dev.utably.com` |
| `test` | `https://api.test.utably.com` | `https://app.test.utably.com` |
| `local` | `https://api.dev.utably.com` | `https://app.dev.utably.com:<port>` |

- **Debug mode**: Enables non-prod stage selection
- **Local port**: Configurable (default `5173`)

## Build Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Build for all browsers (Chrome/Edge + Firefox XPI + Safari) |
| `npm run clean` | Remove `dist/` |

## Security & Privacy

- Data is **only sent when the user clicks Save to Utably**
- No background data crawling or credential capture
- Host access for extraction is **requested per-origin at runtime**
- Tokens stored in `chrome.storage.local` with short-lived access + refresh rotation
- LinkedIn runs in **manual-description mode** by design (no auto-extraction of description)

## Documentation

- [Docs Index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Adapters](docs/adapters.md)
- [API Reference](docs/api.md)
- [FitCheck](docs/fitcheck.md)
- [Development](docs/development.md)
- [Branching](docs/branching.md)
