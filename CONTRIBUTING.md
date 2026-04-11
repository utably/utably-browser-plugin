# Contributing to the Utably Browser Plugin

Thanks for your interest in contributing! This extension has a uniquely
community-friendly surface: **job board adapters**. Job boards change their
HTML frequently, so adapter fixes and new-site additions are the single most
valuable contribution type.

## Quick Links

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Adding or fixing a job board adapter](#adding-or-fixing-a-job-board-adapter)
- [Pull request guidelines](#pull-request-guidelines)
- [Out of scope](#out-of-scope)

## Code of Conduct

Be kind. Assume good intent. Don't harass contributors. Disagreements about
technical direction are fine; personal attacks are not. Utably maintainers
will enforce this at their discretion.

## Ways to contribute

1. **Fix a broken adapter.** A job board changed its markup, extraction
   started returning empty fields — you track it down and fix the selectors.
2. **Add a new adapter.** A job board with a meaningful user base isn't
   supported yet — you write a new adapter module under `webpages/`.
3. **Improve the generic fallback.** `webpages/generic.js` uses JSON-LD
   parsing and DOM scoring — improvements here benefit every unlisted site.
4. **Bug fixes** in popup UI, service worker, or build scripts.
5. **Documentation** improvements in `README.md` or `docs/`.

Feature ideas that expand the extension's scope (new backend endpoints, new
host permissions, new content-script surfaces) should be **discussed in an
issue first** — see [Out of scope](#out-of-scope).

## Development setup

**Prerequisites:** Node.js ≥ 18, a Chromium-based browser for testing.

```bash
git clone https://github.com/utably/utably-browser-plugin.git
cd utably-browser-plugin
npm run build:chrome
```

Then in Chrome/Edge:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `dist/utably-browser-plugin-chrome-edge/`

For Firefox/Safari builds see the `README.md`.

### Running against a non-production backend

The extension supports **Debug mode** in Settings, which unlocks non-prod
stage selection (`dev`, `test`, `local`). You'll need an authenticated
account on the corresponding Utably environment.

**Heads-up for forks:** The backend API (`api.utably.com`) is proprietary
and not part of this open source release. If you fork this extension to use
against your own backend, you'll need to implement compatible endpoints
(see `docs/api.md`) and point the stage URLs at your own hosts. Utably does
not provide credentials, support, or uptime guarantees for third-party forks.

## Adding or fixing a job board adapter

Adapters live in `webpages/` and follow a shared registry pattern.

### Adapter anatomy

Each adapter is a standalone IIFE that registers itself on a global registry:

```js
(() => {
  const registry = (globalThis.__utablyExtractorRegistry ||= []);
  registry.push({
    id: "myboard",
    priority: 90,                  // see priority table below
    canHandle() {
      return location.hostname.includes("myboard.com");
    },
    async extract(common) {
      // Return { title, company, location, description, recruiterName }
      // or null to let the next adapter try.
      const title = common.textFrom('h1[data-testid="job-title"]');
      if (!title) return null;
      return {
        title,
        company: common.textFrom('[data-testid="company"]'),
        location: common.textFrom('[data-testid="location"]'),
        description: common.html('[data-testid="description"]'),
        recruiterName: "",
      };
    },
  });
})();
```

The `common` helper (from `webpages/common.js`) provides `textFrom`,
`html`, `meta`, `wait`, and a few normalization utilities. Prefer using
these over direct DOM access so behavior stays consistent across adapters.

### Priority numbering

The router tries higher-priority adapters first.

| Range   | When to use                                                    |
| ------- | -------------------------------------------------------------- |
| 100     | Reserved for LinkedIn (manual-description mode, special cased) |
| 90–95   | Major dedicated job boards (Indeed, Glassdoor, Monster, ...)   |
| 80      | ATS hosts and tier-2 boards                                    |
| 70      | Long-tail boards                                               |
| 10      | Reserved for the generic fallback                              |

**Do not invent priorities above 95** unless you are proposing a
LinkedIn-style special case — open an issue to discuss first.

### Registering a new adapter

1. Create `webpages/myboard.js` following the pattern above.
2. Add its filename to `EXTRACTION_SCRIPT_FILES` in `popup/config.js`,
   keeping the list ordered roughly by priority.
3. Build and reload the extension.
4. Test against **at least two real job postings** on that site (different
   companies, different countries if applicable). Attach screenshots of
   the side-panel review screen to your PR.

### Adapter testing checklist

Please verify your adapter before opening a PR:

- [ ] Extracts `title`, `company`, `location`, and `description` on a
      representative posting.
- [ ] Returns `null` when run on a non-posting page of the same site
      (search results, homepage) so routing falls through correctly.
- [ ] Does not request any new host permissions — user consent is requested
      per-origin at runtime from the existing flow.
- [ ] Does not introduce any `fetch()` calls. Adapters only read the DOM.
- [ ] Does not log sensitive data or user input to the console.
- [ ] Handles the page loading asynchronously (use `common.wait`) if
      content is injected after navigation.

## Pull request guidelines

- **One concern per PR.** Adapter PRs should touch one adapter. Don't bundle
  unrelated UI changes.
- **No new runtime dependencies.** The extension is deliberately
  dependency-free — Node built-ins only for build scripts. If you think you
  need a dependency, open an issue first.
- **No new `host_permissions` entries in `manifest.json`** without prior
  discussion. The current model requests host access per-origin at runtime
  via `chrome.permissions.request()`; we want to keep it that way.
- **No new backend endpoints.** The extension consumes the existing
  `/extension/*` API. New endpoint proposals belong in an issue.
- **Preserve the "no background crawling" invariant.** The extension only
  reads DOM content on pages the user has explicitly opened, and only sends
  data to the backend on explicit user action.
- **Commit sign-off (DCO).** Sign your commits with `git commit -s` to
  certify you wrote the change (or have the right to submit it) under
  Apache-2.0. See https://developercertificate.org/.
- **Keep the history clean.** Squash WIP commits before requesting review.

## Out of scope

The following changes will generally be closed — not because they're bad
ideas, but because they don't fit the open source surface of this project:

- Changes that require new backend endpoints or backend behavior.
- Changes that broaden `manifest.json` permissions.
- Changes to `icons/` or `assets/` — these are Utably brand assets and are
  not community-editable (see `NOTICE`).
- Re-skins, rebrands, or white-label support. Fork the extension, replace
  the brand assets with your own, and operate your own backend if that's
  what you need.
- Integrations with LLM providers that bypass `/extension/llm`. FitCheck
  runs server-side on purpose.

## Questions

- **Bug reports:** open a GitHub issue using the "Bug" template.
- **Broken/missing adapter:** open a GitHub issue using the "Adapter
  request" template with a link to a real job posting.
- **Security issues:** see [`SECURITY.md`](SECURITY.md). Do not open a
  public issue for vulnerabilities.

Thanks for making the extension better!
