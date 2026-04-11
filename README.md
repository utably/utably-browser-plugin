<h1 align="center">Utably Browser Plugin</h1>

<p align="center">
  <strong>Save any job posting to your Utably application tracker with one click.</strong><br/>
  A privacy-first, open source browser extension for Chrome, Edge, Firefox, and Safari.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License: Apache 2.0"></a>
  <a href="#"><img src="https://img.shields.io/badge/manifest-v3-blue.svg" alt="Manifest V3"></a>
  <a href="#"><img src="https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Firefox%20%7C%20Safari-orange.svg" alt="Browsers"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

<p align="center">
  <a href="#-what-it-does">What it does</a> ·
  <a href="#-install">Install</a> ·
  <a href="#-contribute">Contribute</a> ·
  <a href="docs/faq.md">FAQ</a> ·
  <a href="docs/">Docs</a>
</p>

---

## ✨ What it does

You're on a job posting. You click the Utably toolbar icon. A side panel
slides in with the title, company, location, and description already
filled out. You review, optionally run an AI fit check against your
profile, and click **Save**. That's the whole extension.

- **One-click import** from **17 job boards** including LinkedIn, Indeed,
  Glassdoor, ZipRecruiter, Google Careers, and most Greenhouse/Lever ATS
  pages.
- **AI FitCheck** — a traffic-light score, skills breakdown, and
  qualification analysis for how well a posting matches your Utably
  profile.
- **Text Capture** — select any text on a page, hit copy, and drop it
  into a form field via a floating card.
- **Side panel UI** — no popups, no new tabs, never steals focus.
- **Privacy-first** — reads only the tab you opened, only when you click
  Auto-fill, and never sends data to Utably without an explicit Save.

## 🔓 Why is this open source?

Browser extensions can, in principle, read every page you visit.
"Trust us" is not a good answer to that concern — you should be able to
verify what the extension actually does. Three things follow from that:

1. **Every behavior you care about is auditable.** Auth token handling
   lives in [`background.js`](background.js). Every job-board extractor
   lives in [`webpages/`](webpages/). The content-script surface is in
   [`content/`](content/). Nothing is minified, obfuscated, or hidden.
2. **The LLM runs server-side.** FitCheck calls
   `POST /extension/llm` — there is no third-party AI key in the
   extension, no OpenAI/Anthropic endpoint you didn't consent to. See
   [`docs/fitcheck.md`](docs/fitcheck.md).
3. **Adapters rot fast.** Job boards redesign constantly. An open
   codebase means anyone whose favorite site broke can fix it and send
   a PR — without waiting on us.

See [`docs/faq.md`](docs/faq.md) for the full rationale and
[`SECURITY.md`](SECURITY.md) for the privacy threat model.

## 📦 Install

### For users

Install from the browser stores (live after the Utably public launch):

- **Chrome / Edge** — *Chrome Web Store link coming soon*
- **Firefox** — *AMO listing coming soon*
- **Safari** — *App Store listing coming soon*

> **Heads up:** You need a Utably account to actually save jobs. The
> extension is a thin client for [utably.com](https://utably.com) — it's
> not useful against other services without the backend. See
> [Fork & self-host](#fork--self-host) below.

### For contributors and self-builders

```bash
git clone https://github.com/utably/utably-browser-plugin.git
cd utably-browser-plugin
npm run build:chrome
```

Then in Chrome/Edge:

1. Open `chrome://extensions` (or `edge://extensions`)
2. Toggle **Developer mode** on
3. Click **Load unpacked** and select `dist/utably-browser-plugin-chrome-edge/`
4. Click the Utably icon in the toolbar

Firefox and Safari build steps live in
[`docs/development.md`](docs/development.md). There are **no runtime
dependencies** — the extension is hand-rolled vanilla JS, so
`npm install` is a no-op and the build is pure file copying.

## 🧭 How to use it

1. **Click the toolbar icon** → the side panel opens.
2. **Not connected?** Click *Connect with Utably*. You'll be taken to
   the Utably web app to approve the connection. Tokens come back to
   the extension and live in `chrome.storage.local`.
3. **Open a job posting** on any supported site.
4. **Click Auto-fill.** The extension requests per-origin permission
   (first time only), injects the adapter, and populates the form.
5. **Review the fields** — edit anything the adapter got wrong.
6. *(Optional)* **Click FitCheck** for an AI analysis of how well the
   posting matches your profile.
7. **Click Save to Utably.** Done.

LinkedIn runs in **manual-description mode** by design: the extension
only fills metadata (title, company, location) and you paste the
description yourself. This is intentional — see
[`docs/fitcheck.md`](docs/fitcheck.md).

## 🌐 Supported job boards

| Priority | Adapter | Source |
|:-:|---|---|
| 100 | [`linkedin.js`](webpages/linkedin.js) | LinkedIn (metadata only, manual description) |
| 95 | [`indeed.js`](webpages/indeed.js) | Indeed |
| 95 | [`googlejobs.js`](webpages/googlejobs.js) | Google Careers |
| 90 | [`glassdoor.js`](webpages/glassdoor.js) | Glassdoor |
| 90 | [`ziprecruiter.js`](webpages/ziprecruiter.js) | ZipRecruiter |
| 90 | [`monster.js`](webpages/monster.js) | Monster |
| 90 | [`careerbuilder.js`](webpages/careerbuilder.js) | CareerBuilder |
| 90 | [`dice.js`](webpages/dice.js) | Dice |
| 90 | [`wellfound.js`](webpages/wellfound.js) | Wellfound (AngelList) |
| 90 | [`handshake.js`](webpages/handshake.js) | Handshake |
| 90 | [`usajobs.js`](webpages/usajobs.js) | USA Jobs |
| 90 | [`ukPortals.js`](webpages/ukPortals.js) | UK job portals |
| 80 | [`atsHosted.js`](webpages/atsHosted.js) | Greenhouse, Lever, Workday, and other ATS hosts |
| 80 | [`builtin.js`](webpages/builtin.js) | BuiltIn |
| 70 | [`simplyhired.js`](webpages/simplyhired.js) | SimplyHired |
| 70 | [`remoteok.js`](webpages/remoteok.js) | RemoteOK |
| 10 | [`generic.js`](webpages/generic.js) | Fallback (JSON-LD `JobPosting` + DOM scoring) |

**Your favorite site missing or broken?**
Open an [adapter request](../../issues/new?template=adapter_request.yml)
or submit a PR — adapters are the easiest way to contribute. See the
[10-minute adapter walkthrough](docs/adapters.md#write-your-first-adapter-in-10-minutes).

## 🤝 Contribute

We explicitly want outside contributions. The highest-leverage thing
you can do is **fix or add a job-board adapter**, because adapters
break whenever a site ships a redesign.

**Good first issues:**

- A site you use every day that isn't in the table above → new adapter.
- A site in the table above that's returning wrong/empty fields → fix
  the selectors.
- [`webpages/generic.js`](webpages/generic.js) could always be smarter
  about boilerplate filtering and nested JSON-LD.

**Before you start:**

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) — it covers the adapter
   anatomy, priority numbers, the testing checklist, and the PR rules.
2. Read the [10-minute adapter walkthrough](docs/adapters.md#write-your-first-adapter-in-10-minutes)
   — copy-paste-able starting point.
3. Check the [FAQ](docs/faq.md) — it probably answers your question.

**What we will merge quickly:** adapter fixes, new adapters, bug fixes
in popup UI, docs improvements, build-script improvements.

**What needs discussion first:** new host permissions, new backend
endpoints, runtime dependencies, UI rewrites, changes to the auth flow.
Open an issue before coding these up so you don't waste effort on
something we can't take.

**What we won't take:** rebranded forks, re-skins, re-pointing to a
different backend (fork it instead — see [Fork & self-host](#fork--self-host)),
integrations with LLM providers that bypass `/extension/llm`.

**Security issues** → do not open a public issue. See
[`SECURITY.md`](SECURITY.md).

## 🏗️ How it works (for contributors)

The short version:

```
┌─────────────┐    inject     ┌─────────────┐   extract    ┌──────────┐
│ Side panel  │ ─────────────▶│ Content     │ ────────────▶│ Job page │
│ (popup.js)  │               │ scripts     │              │          │
└──────┬──────┘               │ (webpages/) │              └──────────┘
       │                      └─────────────┘
       │ fill form + review
       ▼
┌─────────────┐   auth'd API  ┌─────────────┐
│ Background  │ ─────────────▶│ Utably API  │
│ service     │               │ /extension/*│
│ worker      │◀──────────────│             │
└─────────────┘     tokens    └─────────────┘
```

- **`manifest.json`** — Manifest V3 declaration.
- **`background.js`** — service worker, auth, API calls, token rotation.
- **`popup.html` + `popup/`** — the side panel UI and its controllers.
- **`webpages/`** — one adapter per supported job board, plus
  `router.js` which picks the highest-priority match for the current
  page.
- **`content/`** — content scripts (only `capture.js` is wired up
  today).
- **`scripts/`** — build tools (zero-dependency file copying).

Deeper dive in [`docs/architecture.md`](docs/architecture.md).

## 🔐 Privacy & security

- **Only reads pages you open**, only when you click Auto-fill, and
  only on that tab.
- **Per-origin host permissions** requested at runtime, not granted at
  install time. You can revoke them at any time in browser settings.
- **No background crawling.** The extension does nothing while you
  don't have the side panel open.
- **No credential capture.** The extension never touches password
  fields, cookies on third-party sites, or browser sync data.
- **Tokens** live in `chrome.storage.local` with short-lived access +
  rotating refresh tokens.
- **LinkedIn description** is manual entry by design — we don't
  auto-scrape posting descriptions on LinkedIn.

Full threat model in [`SECURITY.md`](SECURITY.md).

## 🍴 Fork & self-host

You're welcome to fork this extension, but you should know what you're
signing up for. This extension is a **thin client** — most of the value
lives in the Utably backend (profile matching, FitCheck LLM, duplicate
detection, application storage). Forks must:

1. **Implement compatible `/extension/*` endpoints** on your own
   backend. See [`docs/api.md`](docs/api.md) for the contract.
2. **Replace the brand assets** in `icons/` and `assets/` — these are
   Utably trademarks and are not covered by the Apache-2.0 license.
   See [`NOTICE`](NOTICE).
3. **Change the extension ID** and publish under your own name on the
   Chrome Web Store / AMO / App Store.
4. **Not imply endorsement by Utably.**

Utably does not provide support, credentials, uptime guarantees, or
adapter parity for third-party forks.

## 📚 Documentation

| Document | Purpose |
|---|---|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to contribute, PR rules, adapter checklist |
| [`SECURITY.md`](SECURITY.md) | Reporting vulnerabilities, threat model, scope |
| [`docs/faq.md`](docs/faq.md) | Common contributor and user questions |
| [`docs/development.md`](docs/development.md) | Local setup, debugging, multi-browser build |
| [`docs/adapters.md`](docs/adapters.md) | Adapter system + 10-minute walkthrough |
| [`docs/architecture.md`](docs/architecture.md) | Runtime components, auth flow, storage |
| [`docs/api.md`](docs/api.md) | Backend API contract |
| [`docs/fitcheck.md`](docs/fitcheck.md) | FitCheck response shape and tier gating |
| [`docs/branching.md`](docs/branching.md) | Branch strategy for external contributors |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes |

## 📄 License

Code in this repository is licensed under the
[**Apache License 2.0**](LICENSE).

**Not covered by that license:** Utably trademarks, the Utably logo,
and the brand assets in `icons/` and `assets/`. See [`NOTICE`](NOTICE)
for trademark terms. The Utably backend API is proprietary and is not
part of this open source release.

---

<p align="center">
  Built by <a href="https://utably.com">Utably</a>.<br/>
  If this extension saved you time, <a href="CONTRIBUTING.md">contribute an adapter</a>
  — that's how it stays useful.
</p>
