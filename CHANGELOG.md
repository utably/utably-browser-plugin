# Changelog

All notable changes to the Utably Browser Plugin are documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Profile autofill** for Greenhouse, Lever, and Ashby application
  forms. New *My profile* tab in the side panel shows your Utably
  profile (contact, top experiences, skills); a *Fill this page*
  button injects the relevant fields into the active job application
  form. Every fill is gated by a consent modal that lists every
  recipient host (including iframes, tagged as such) and every field
  that will be filled. Generic fallback adapter is restricted to the
  top frame so unknown iframes (ads, trackers) cannot receive PII.
  See [`docs/fill.md`](docs/fill.md).
- **TOCTOU-safe apply**: each fill adapter plans, verifies against the
  user-consented field set, and applies in one synchronous frame
  execution. If the page mutated between consent and apply, the fill
  aborts with `PAGE_CHANGED`; the side panel re-runs the preview and
  asks the user to consent against the new field set (capped at 3
  attempts before giving up).
- **Autofill privacy settings**: counter for sites you've allowed
  autofill on, *Clear consents* button (revokes all stored per-site
  consents), and *Clear cache* button (wipes the in-memory profile
  cache).
- New backend contract: `GET /extension/profile` returns a minimised
  fillable subset (contact, address, top experiences/educations,
  skills, social links). See [`docs/api.md`](docs/api.md). Server side
  rate-limits to 20 requests/min/user, audits each read in CloudWatch
  for DSGVO Art. 30 records-of-processing, and responds with
  `Cache-Control: private, no-store`.
- **Further notes** field in the side panel preview, between the source
  URL and the duplicate-notice block. Free-form text, autosaved to the
  draft in `chrome.storage.local` like the other fields, and forwarded
  in the import payload as `notes`. The backend trims and caps it at
  20,000 chars before storing it on the application record; longer
  input is silently truncated. Localized as "Further notes" / "Weitere
  Notizen". Not auto-extracted from the page — user-only.
- `LICENSE` (Apache-2.0), `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md`,
  `CHANGELOG.md` for the open source release.
- `docs/faq.md` — contributor FAQ.
- 10-minute "write your first adapter" walkthrough in
  [`docs/adapters.md`](docs/adapters.md).
- GitHub issue templates (bug report, adapter request) and a pull
  request template with an adapter-testing checklist.
- Path-scoped `CODEOWNERS` requiring Utably maintainer review on
  security-sensitive paths.

### Changed
- README restructured for an open source audience with a contributor
  on-ramp, install-for-users vs install-for-contributors split, and an
  architecture overview.
- `docs/development.md` rewritten to walk through local setup,
  debugging the service worker, and multi-browser build targets.
- `docs/branching.md` rewritten for external contributors.
- `docs/adapters.md` expanded with worked example, broken-adapter fix
  playbook, and explicit safety rules.

### Removed
- Verbose debug logging from the side panel and service worker code
  paths.
- A stale non-production origin from `manifest.json`
  `externally_connectable`.

### Security
- Profile cache moved from `chrome.storage.local` (disk-backed) to
  `chrome.storage.session` (in-memory, wiped on browser restart). No
  PII at rest. Defensive cleanup wipes any legacy `local` entry on
  install.
- Cross-frame leak prevented: ATS-specific fill adapters are pinned to
  their TLD+1 suffix (`greenhouse.io`, `lever.co`, `ashbyhq.com`); the
  generic fallback only runs in the top frame. Frames that appear
  *after* the user consented refuse to fill.
- Consent modal renders host names via `document.createElement` +
  `textContent` (no `innerHTML` with frame data) to prevent any
  hypothetical XSS via hostile hostnames.
- Published security disclosure policy in `SECURITY.md` with
  `security@utably.com` as the contact mailbox.

## [0.1.5] — Pre-open-source baseline

Last internal release before the open source prep work above. Shipped
to internal testers with all 17 adapters, FitCheck, text capture, and
multi-browser build targets.

Earlier history was tracked internally and is preserved in the git
log.

---

[Unreleased]: https://github.com/utably/utably-browser-plugin/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/utably/utably-browser-plugin/releases/tag/v0.1.5
