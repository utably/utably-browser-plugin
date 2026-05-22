# Changelog

All notable changes to the Utably Browser Plugin are documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.16.0] — 2026-05-16

### Added
- **Saved tab** in the side panel — third surface alongside Import and My
  profile. Lists the user's imported applications as cards with a colored
  initials-logo, title, company, location, time-since-saved, and a status
  badge (Saved / Applied / Interview / Offer / Rejected). Filter chips for
  All / Saved / Applied / Interview with live counts. Per-card click-to-copy
  for Title / Company / URL and an Open button that jumps to the
  application in the Utably web app. No client-side persistence — list is
  fetched fresh on tab open or Refresh.
- **Saved-tab search bar** — debounced (120ms) substring match across
  title / company / location / source / host, combined with the filter
  chip selection.
- **Saved-tab status `<select>`** — per-card status changer with
  optimistic UI: writes through `PATCH /extension/applications/{id}`
  (whitelisted statuses only) and rolls back on backend failure.
- **Saved-tab Posting button** — was clipboard-copy of the URL; now
  opens the posting page directly in a new tab.
- **Saved-tab FitCheck score badge** — three states:
  - **scored** (tone-colored chip with the existing score),
  - **runnable** (dashed mint chip — clicking re-runs FitCheck via
    `UTABLY_FITCHECK` and persists the result via
    `PATCH /extension/applications/{id}` with `{ fitAnalysis }`),
  - **disabled** (dashed grey — application has no `jobText`, tooltip
    asks the user to re-import the job).
  Clicking a scored badge opens the same FitCheck modal the Import tab
  uses. `popup/saved.js` normalizes the persisted shape
  (`fitSummary` / `confidence` / `strengths` / `gaps`) into the raw LLM
  shape (`summary` / `overallScore` / `topStrengths` / `topConcerns`)
  the modal expects.
- **Branded per-section FitCheck lock** — every empty section in the
  FitCheck modal now renders a branded SVG lock
  (`assets/lock-basic.svg`, gradient teal/mint padlock with "BASIC"
  plaque) plus "Upgrade to unlock" text. The whole overlay is a
  clickable `<button>` that opens `/subscription/plans` (was
  `/settings/subscription`) on the user's current stage. Blurred
  content under the lock has `user-select: none` and `pointer-events:
  none` so clipboard, right-click copy, and drag-select are all
  blocked. New locale keys: `fitcheck.locked.text`,
  `fitcheck.upgradeTitle`, `fitcheck.upgradeCta`.
- **Attachments section** on the profile tab — lists the user's
  personal-data files (CVs, certificates, school/university
  transcripts, employment references). Last section on the tab,
  default-collapsed, filtered to `cv` + `certificate` kinds
  (Zeugnisse / Arbeitszeugnisse / Zertifikate all map to
  `certificate`). Each card has:
  - **Upload to page** — direct DataTransfer injection into a matching
    `<input type="file">` on the active page. Auto-falls-back to
    **place mode** when no input matches: the content script highlights
    every plausible drop target (file inputs + heuristic-matched
    dropzone divs) and synthesizes the full
    `dragenter` → `dragover` → `drop` event sequence with a crafted
    DataTransfer when the user clicks one. 60-second timeout, ESC
    cancels.
  - **Download** — saves the file to the user's Downloads folder via
    the `downloads` permission (added). Escape hatch for sites where
    injection or place mode fails.
- **`downloads` permission** in `manifest.json` to support the Attachments
  download button. Justified in the manifest permissions test.
- **Design system port** from `claude.ai/design` handoff bundle —
  Utably brand tokens (mint / ink / cream / paper), Red Hat Display
  weights, new dark-header tab bar, redesigned profile card with mascot
  hero, identity strip, tone-colored section icon badges, click-to-copy
  pills on every value, role/education cards with collapsible per-field
  rows, role description + company description blocks, skill / language /
  certification chips. White panel background.
- **Profile photo** in the identity avatar — backend presigns the
  `users/{userId}/personal-data/pictures/...` S3 key and the plugin
  renders it with `referrerPolicy="no-referrer"` and an initials fallback.
- **Profile variants merge** — backend `/extension/profile` resolves the
  user's preferred locale variant (from `?locale=` query param, falling
  back to `profileVariants.defaultLocale`), merges variant-only fields
  (`academic_title`, `title`, skills, licenses, certificates, experience
  titles/positions/descriptions/achievements, education degrees/fields/
  descriptions) on top of the base profile, walking ordered variants so
  legacy base values are never read. Plugin passes its UI locale and
  keys its in-memory cache by locale.
- **`GET /extension/applications`** — backend endpoint returning a
  minimised application list (no notes/fitAnalysis/recruiter/attachments)
  for the Saved tab. Same auth, rate limit, audit log, and Cache-Control
  posture as `/extension/profile`. See `docs/api.md`.
- **`GET /extension/applications/{id}`** — single-application read used
  by the Saved tab's FitCheck rerun flow to fetch `jobText` and the
  current `fitAnalysis` before opening the modal.
- **`PATCH /extension/applications/{id}`** — partial update accepting
  only `{ status }` from a whitelist (`Saved` / `Applied` /
  `Interview` / `Offer` / `Rejected`) and/or `{ fitAnalysis }`. Audit
  log line per mutation. Used by the Saved-tab status selector and
  FitCheck rerun.
- **`GET /extension/attachments`** — backend endpoint listing files under
  `users/{userId}/personal-data/` (CVs, photos, certificates, exports
  excluded) with 5-minute presigned URLs. Capped at 50 files. Same
  privacy posture as the other extension reads.
- **`Cache-Control: private, no-store` on PII responses** —
  `/extension/profile`, `/extension/attachments`, `/extension/applications`
  all set the header so no intermediate cache (CDN, proxy, browser HTTP
  cache) retains PII.
- **`chrome.storage.session` for the profile cache** — PII no longer
  written to disk-backed storage. Falls back to no-cache if
  `storage.session` is unavailable rather than silently downgrading. One-
  time install hook wipes any legacy `chrome.storage.local` entry.
- **Per-domain consent storage** for the autofill flow, with 30-day TTL
  and a "Clear consents" / "Clear cache" pair under Settings → Autofill
  privacy. Consents wiped on logout alongside auth.
- **Place-mode synthesized drop** — `content/fill/dropmode.js` extends
  attachment uploads to custom drop-zone widgets (Workday-style) that
  don't expose a writable `<input type="file">`. Heuristic match on
  class / data-testid / aria / inner text. 60-second timeout, ESC
  cancels. Documented in `docs/fill.md`.
- **TOCTOU-safe autofill** — adapters now plan, verify against the
  user-consented field set, and apply in one synchronous frame execution.
  If the page mutates between consent and apply, the fill aborts with
  `PAGE_CHANGED` and the side panel re-prompts (capped at 3 attempts).
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

### Fixed
- **Attachment download extension** — presigned URLs for
  `/extension/attachments` now set `ResponseContentType` and
  `ResponseContentDisposition`, so PDFs save with the correct
  extension. Previously a CV stored with an S3 mime mismatch was
  written to disk as `resume.pdf.txt`.

### Removed
- Verbose debug logging from the side panel and service worker code
  paths.
- A stale non-production origin from `manifest.json`
  `externally_connectable`.

### Security
- New `SECURITY.md` invariants (9–14) covering the Saved tab and
  Attachments flows: gesture-gated reads, render-only application list
  (never injected into pages), no client persistence of the list,
  attachment uploads never auto-submit, attachment bytes leave Utably
  only on per-host consent, place-mode is top-frame-only with host
  cross-check.
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
- **Backend S3 access is now IAM-scoped per user across all eight
  user-PII lambdas**, not just the extension paths. Each request
  assumes a dedicated role with a session policy narrowing S3 ops to
  `users/{userId}/*`; resulting credentials live 15 minutes max and
  are cached per warm container. Covers `applicationsAPI`,
  `utablyAPI_v2`, `imageUpload`, `dataGovernanceAPI`,
  `dataDeletionWorker`, `pdfExport` (Puppeteer), `profileImport`, and
  `postSignupTriggerStripeID`. Even a full RCE on any of these
  lambdas cannot read or write another user's prefix — rejection is
  enforced by the AWS API itself, with the existing code-layer prefix
  check kept as belt-and-suspenders. See `SECURITY.md` Invariant 15.

## [0.1.5] — Pre-open-source baseline

Last internal release before the open source prep work above. Shipped
to internal testers with all 17 adapters, FitCheck, text capture, and
multi-browser build targets.

Earlier history was tracked internally and is preserved in the git
log.

---

[Unreleased]: https://github.com/utably/utably-browser-plugin/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/utably/utably-browser-plugin/compare/v0.1.5...v0.16.0
[0.1.5]: https://github.com/utably/utably-browser-plugin/releases/tag/v0.1.5
