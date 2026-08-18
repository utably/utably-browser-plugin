# FAQ

Common questions about the Utably Browser Plugin — for users, for
contributors, and for folks who are skeptical of browser extensions in
general (a healthy instinct).

## Table of contents

- [Using the extension](#using-the-extension)
- [Privacy and security](#privacy-and-security)
- [Contributing](#contributing)
- [Building and debugging](#building-and-debugging)
- [Open source and licensing](#open-source-and-licensing)
- [Forks and self-hosting](#forks-and-self-hosting)

---

## Using the extension

### Do I need a Utably account?

Yes. The extension imports jobs **into** your Utably tracker — without
an account there's nothing for it to save to. Sign up at
[utably.com](https://utably.com).

### Which browsers are supported?

Chrome and Edge (primary target), Firefox (XPI), and Safari (Xcode app
wrapper). All four are built from the same source with different
packaging scripts under [`scripts/`](../scripts/).

### Why doesn't it auto-extract the description on LinkedIn?

Intentional. LinkedIn's terms of service and anti-scraping posture make
automated description extraction a bad idea, so the LinkedIn adapter
only fills metadata (title, company, location) and you paste the
description in manually. Every other adapter does the full extraction.

### Why is FitCheck locked on my free plan?

FitCheck is tier-gated on the backend. Free users see the traffic-light
summary with limited details; premium users see the full skills
breakdown, qualification analysis, and preferences alignment. The
locking happens server-side — see [`fitcheck.md`](fitcheck.md).

### Auto-fill filled the wrong fields. What do I do?

1. **Check the adapter name** shown in the side panel status line —
   something like *"Preview ready (indeed)"*. If it says *"generic"*,
   the site-specific adapter didn't match and the fallback ran.
2. **If you're on a supported site**, the selectors probably broke
   after a redesign. Please open an
   [adapter request](../../../issues/new?template=adapter_request.yml)
   with the URL, or even better, [fix the adapter](adapters.md#fixing-a-broken-adapter)
   and send a PR.
3. **If the site isn't in the table**, the generic fallback is doing
   its best. A site-specific adapter would work better — see the
   [10-minute walkthrough](adapters.md#write-your-first-adapter-in-10-minutes).

### What is the Saved tab?

The third side-panel tab (after Import and My profile). It lists the
applications you've already saved to Utably as cards with title,
company, location, source, and time-since-saved. From a card you can:

- **Filter** by status (All / Saved / Applied / Interview) and
  **search** across title / company / location / source / host.
- **Change status** via the per-card `<select>`. The change writes
  through to the backend immediately and rolls back if the request
  fails.
- **Copy** the title, company, or open the original posting URL.
- **Open** the application in the Utably web app.
- **Re-run FitCheck** by clicking the score chip on the card — opens
  the same FitCheck modal the Import tab uses. The chip is greyed out
  if the application has no stored `jobText` (re-import the job from
  its posting page to enable it).

The list isn't cached on disk; closing the side panel discards it and
the next open re-fetches.

### How does the Attachments upload work?

In **My profile**, the Attachments section lists your stored CVs and
certificates. Each card has two actions:

1. **Upload to page** — the extension finds a matching
   `<input type="file">` on the active page and injects the file via
   `DataTransfer`. If no input matches (custom Workday-style drop
   zones), the side panel switches to **place mode**: every plausible
   drop target on the page is highlighted, you click one, and the
   extension synthesizes a real drag-and-drop event sequence onto it.
   The destination site receives the same DOM events it would see
   from a manual desktop drag.
2. **Download** — saves the file to your Downloads folder. Use this
   when the page's upload widget is broken or unrecognized.

The extension never submits the form for you. After the file is
attached you still click the page's own submit button.

### Can I use it against a non-production Utably environment?

Yes, if you're a Utably developer with an account on a dev/test stage.
Open Settings in the side panel, enable **Debug mode**, and pick the
target stage. External contributors should leave this off.

---

## Privacy and security

### What data does the extension send to Utably?

Only what you explicitly submit:

- **On Save to Utably:** the job title, company, location, description
  text, URL, anything you typed in the **Further notes** field, and any
  other manual edits you made in the side panel.
- **On FitCheck:** the same payload above, plus a request for LLM
  analysis. The extension itself has no access to your Utably profile
  data — the LLM reads it server-side.
- **On opening the *My profile* tab or clicking *Fill this page*:** the
  extension fetches a minimised fillable subset of your Utably profile
  via `GET /extension/profile` (see [`api.md`](api.md)). This is the
  *only* path where profile data leaves Utably's server, and it lands
  in the extension only — never in a third-party site without an
  additional explicit consent.
- **Nothing else.** No browsing history, no cookies from other sites,
  no form data outside the side panel, no passwords.

### What data does the extension send to third-party sites (autofill)?

Only what you explicitly approve, per fill, per recipient host. The flow is:

1. You click *Fill this page* in the *My profile* tab.
2. The extension runs a **dry-run** that finds matching form fields in
   every frame on the page, but mutates nothing.
3. A consent modal shows every host that would receive data, with an
   `iframe` tag on sub-frame hosts, plus the list of fields each would
   get.
4. If you confirm, the extension re-checks the page (TOCTOU verify) and
   only then writes values into the form inputs. If the page changed
   between consent and apply, the fill aborts and you're re-prompted.
5. Once filled, the destination site can read the values — same as if
   you'd typed them. The extension never submits the form for you.

See [`fill.md`](fill.md) for the security invariants.

### Does the extension run in the background?

No. The service worker (`background.js`) is a standard MV3 worker that
wakes up only when:

- You click the toolbar icon or use the side panel.
- You complete a Connect flow from the Utably web app.
- The browser dispatches an auth-related message from the web app.

There is no polling, no periodic alarm, no tab listener that scans
pages you didn't ask it to.

### What host permissions does it need?

The extension declares only **Utably API hosts** in `manifest.json`:

```
https://api.utably.com/*
https://api.dev.utably.com/*
https://api.test.utably.com/*
```

Access to job-board sites is requested **at runtime, per-origin**, the
first time you click Auto-fill on that site. You can revoke these
permissions at any time from `chrome://extensions`.

### Where is my Utably profile data cached?

In `chrome.storage.session` — an MV3 in-memory store that is **wiped on
browser restart and never written to disk**. The cache has a 5-minute
TTL and is also cleared when you log out or click *Clear cache* in
*Settings → Autofill privacy*. If your browser doesn't provide
`chrome.storage.session`, caching is disabled (the extension simply
re-fetches on each preview) — there is no disk fallback. See
[`architecture.md`](architecture.md#storage-keys).

### Where are my auth tokens stored?

In `chrome.storage.local`, which is per-extension local storage
accessible only to this extension's service worker and popup. Tokens
are:

- **Short-lived access token** (minutes), auto-refreshed with 30-second
  skew.
- **Rotating refresh token** — replaced on every successful refresh.
- **Cleared on revoke** — clicking Disconnect in the side panel calls
  `/extension/token/revoke` and wipes the storage keys.

See [`architecture.md`](architecture.md#auth--token-model) for the
full flow.

### I found a security issue. Where do I report it?

**Do not open a public GitHub issue.** See [`SECURITY.md`](../SECURITY.md).

---

## Contributing

### I want to contribute but I'm not sure what to work on.

**Start with adapters.** They're the most valuable contribution surface
because job boards redesign constantly and each fix makes the extension
better for real users.

- Use the extension on a site you care about. If extraction is wrong,
  you've just found your first issue.
- Skim [`adapters.md`](adapters.md) — the worked example gives you a
  copy-paste-able starting point.
- If you prefer non-adapter work, look at UI bugs in `popup/app.js` or
  improvements to `webpages/generic.js` (the fallback).

### How long do PRs take to review?

- **Adapter fixes** and new adapters: usually fast, because the
  blast radius is small.
- **Non-adapter changes** (popup, background, build): slower, because
  they need more careful review. Please open an issue first for
  anything non-trivial so we can tell you upfront whether it's in
  scope.

### Why is there no TypeScript / React / build step?

Because we don't need them. The extension is ~3,600 lines of plain JS,
it runs directly in a browser, and keeping it dependency-free means:

- No supply-chain risk from transitive npm packages.
- No build cache to invalidate — edit a file, reload the extension,
  done.
- Security review is possible without reasoning about a bundler.
- Forks and self-hosters don't inherit a toolchain.

If you genuinely need TS or a bundler for a specific change, open an
issue and make the case. We're not dogmatic but the bar is high.

### Do I need to sign a CLA?

No. We use a **DCO** (Developer Certificate of Origin) instead — sign
your commits with `git commit -s`. That's enough. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md#pull-request-guidelines).

### Can I add a dependency?

Almost certainly no. Open an issue first with the use case and we'll
discuss. The extension has zero runtime dependencies on purpose.

### Can I add a new `host_permissions` entry?

No without discussion. The current model requests site access
per-origin at runtime via `chrome.permissions.request()`, and we want
to keep that property. If you think you need a declared host
permission, open an issue.

---

## Building and debugging

### `npm run build` fails with a Safari error.

Safari builds require Xcode on macOS. If you're on Linux or Windows,
use `npm run build:chrome` or `npm run build:firefox` instead —
`npm run build` tries all three targets.

### My changes don't show up after editing.

Chrome extensions don't hot-reload. After editing a file:

1. Run the build for your target (`npm run build:chrome`).
2. Go to `chrome://extensions`.
3. Click the **Reload** icon on the Utably card.
4. Close and reopen the side panel (the popup caches the module graph).

For service worker changes (`background.js`), also click
**Inspect → Service worker** to kill the old worker instance.

### The service worker is stuck / shows errors.

Open `chrome://extensions`, find Utably, click **Inspect views →
service worker**, check the console and stack traces. You can force a
restart by toggling the extension off and on.

### Connect button does nothing.

Usually one of:

- The Utably web app is not reachable on the current stage — check
  you're authenticated at `https://app.utably.com` (or the stage you
  picked in Settings).
- The `externally_connectable` origins in `manifest.json` don't
  include your app origin — check if you changed the manifest.
- Pop-up blocker ate the auth window — allow pop-ups for the extension.

### FitCheck returns "locked" for every job.

Your Utably account is on the free tier, or the `/extension/llm`
backend is rate-limiting. Verify tier in the Utably app. If you're
working against a dev stage, check backend logs for the
`/extension/llm` handler.

---

## Open source and licensing

### Why Apache-2.0 and not MIT?

Apache-2.0 gives us two things MIT doesn't:

1. **Explicit patent grant.** Contributors grant a patent license for
   their contribution, which protects everyone downstream from
   submarine patent claims.
2. **Trademark carve-out.** Apache-2.0 Section 6 explicitly does not
   grant trademark rights, which makes the Utably/logo ownership
   unambiguous. See [`NOTICE`](../NOTICE).

Most large OSS projects from companies (Kubernetes, TensorFlow,
Airflow, Terraform until recently) use Apache-2.0 for these reasons.

### Can I use Utably's name and logo in my fork?

No. Apache-2.0 does not grant trademark rights, and `NOTICE`
explicitly reserves them. If you publish a fork to an extension store,
change the name and replace the icons in `icons/` and `assets/` with
your own before publishing. See [Fork & self-host](#forks-and-self-hosting)
below.

### Can I use the adapter code in a different project?

Yes, subject to Apache-2.0. You need to:

- Include the Apache-2.0 license text.
- Preserve copyright and attribution notices from the files you copy.
- Note prominently that you changed the files (if you modified them).

See Section 4 of [`LICENSE`](../LICENSE) for the exact terms.

---

## Forks and self-hosting

### Can I fork this to use with my own backend?

Yes, technically. Practically, you're rebuilding most of the product:

- You'll need `/extension/connect/session/{start,status}`,
  `/extension/token/{exchange,refresh,revoke,issue}`,
  `/extension/import-job`, `/extension/import-job/duplicate-check`,
  `/extension/share-drafts`, and `/extension/llm` — see
  [`api.md`](api.md).
- You'll need to run your own LLM for FitCheck.
- You'll need to store applications, detect duplicates, and manage user
  accounts.
- You'll need to replace every Utably brand asset.

At that point, you're maintaining a full product. Fine if that's what
you want — but the extension on its own is not very useful.

### Will you merge PRs that make forking easier?

Within reason. PRs that refactor hardcoded Utably URLs into a
configurable constant, or that make the brand assets easier to swap,
are welcome if they don't complicate the main build. PRs that add a
"white-label mode" or a runtime backend-selector are not in scope —
that's what a fork is for.

### Will Utably provide support for my fork?

No. See the disclaimers in [`NOTICE`](../NOTICE) and
[`CONTRIBUTING.md`](../CONTRIBUTING.md#out-of-scope). The open source
surface is the extension code, not Utably's backend or the Utably team.

---

**Didn't answer your question?** Open a
[discussion](../../../discussions) or a regular issue with the
question label. We'd rather expand this FAQ than answer the same
question over and over.
