# Changelog

All notable changes to the Utably Browser Plugin are documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.18.0] — 2026-09-22

### Added
- **Brand fonts are now bundled.** `popup.css` had always named
  `Red Hat Display` and `Spectral`, but neither was ever shipped — no
  `@font-face`, no font files. Red Hat Display only rendered for people
  who happened to have it installed locally; Spectral never rendered for
  anyone. The latin `woff2` subsets now ship in `assets/fonts/`
  (400/500/600/700/800 sans, 600 serif, ~104 KB total), taken from
  `@fontsource` under the SIL OFL 1.1. Attributions in `NOTICE`.
- **Account menu in the header.** An avatar opens a menu holding Settings
  and Log out. The avatar draws from the profile — photo, else initials,
  else a neutral glyph — and the profile is loaded when the extension is
  opened while signed in, so it is correct without visiting the Profile
  tab first. Reuses the 5-minute session cache, so repeated opens do not
  re-fetch. Disclosed in the privacy modal.
- **Overflow menu in the import action bar.** Capture, Go to Utably and
  Reset moved behind a `⋯` button, leaving `Share | Save to Utably | ⋯`.
  Full keyboard support: Escape, arrows, Home/End, outside-click.
- **Firefox XPI is actually built.** `firefox-build.mjs` only ever copied
  files and rewrote the manifest — the `.xpi` the docs told you to install
  was never produced. Added a dependency-free ZIP writer
  (`scripts/zip.mjs`, Node built-ins only) plus `lint:firefox`,
  `sign:firefox` and `sign:firefox:prod` scripts, and
  `data_collection_permissions` in the Gecko settings, which AMO now
  requires for new submissions.

### Changed
- **Primary buttons use the brand mint.** Nine hardcoded
  `#00545e !important` declarations and a gradient chain are gone,
  replaced by `--utably-mint` on `--utably-ink` with a mint-deep keycap
  edge. Contrast 8.64:1 → 12.28:1.
- **Settings is a page, not an overlay.** It used to sit before
  `authGate`/`appContent` in the DOM and merely un-hide, stacking on top
  of everything. One `applyShell()` now owns which surface is on screen;
  Settings replaces the gate or the tabbed content and has a Done button.
  Logout moved into the account menu.
- **Header fits at every width.** It wrapped at 380px because the 20px
  title plus the action links exceeded the 348px content box. Now a single
  non-wrapping row; the subtitle shows only where it fits (side panel and
  workspace above 440px), and the wordmark steps down below 350px.
- **Auto-fill moved into the Preview panel header**, where it acts on the
  panel it fills, rather than into the overflow menu.
- **Secondary buttons keep their mint wash**, with the border moved to a
  new `--utably-mint-edge` token: 1.83:1 → 3.70:1, clearing WCAG 1.4.11.
- **Touch targets.** View tabs 33 → 44px, Save-as radios 37 → 44px, text
  inputs 39 → 44px, header links 17 → 32px. Checkboxes excluded, since
  `min-height` would have inflated the settings toggle's hidden input.
- **Hero removed** from the import view, reclaiming ~150px.
- Labels are 12px sentence case instead of 11px uppercase letterspaced.
- `fillConfirm.remember` relabelled. It read "Don't ask again on this
  site" but the modal always appears by design — invariant #4 requires
  every recipient origin be shown before every fill. The control records
  consent; the copy now says so.

### Fixed
- **Firefox loaded nothing at all.** `chrome.runtime.onMessageExternal`
  was called unguarded at the top level of `background.js`. Firefox has
  never implemented `externally_connectable`, so that line threw as the
  background script loaded and took the whole extension down. Now
  optional-chained, and the dead manifest key is stripped from the
  Firefox build.
- **"Applied day" rendered unconditionally.** Nothing ever toggled it, so
  users in *Saved* mode saw a date picker asking when they applied to a
  job they had not applied to. Now tied to `setSelectedKind()`.
- **The full-bleed tab bar left a 4px strip down each side** in popup
  mode: `margin: 0 -12px` against `.app`'s `padding: 16px`. The negative
  margin only matched in side-panel mode.
- Header wordmark and subtitle were cut mid-word in side panels narrower
  than ~400px.

### Security
- No new caches. The profile still lives only in `chrome.storage.session`
  and is wiped when the browser closes; nothing was added to
  `storage.local` (`docs/fill.md` invariant #8).

### Documentation
- Rewrote the Firefox section of `docs/development.md`: both install
  routes, why `about:addons` reports an unsigned build as unverified, the
  signing commands, and a warning that `npm test` runs `build.mjs`, which
  begins with `rm -rf dist` and therefore deletes the `.xpi`.

## [0.17.0] — 2026-08-18

### Added
- **Send a job to a friend without saving it first.** A new *Send to a
  friend* action next to *Save to Utably* passes the captured posting
  straight to someone in your circle. It lands in the job-tip inbox they
  already have, and it does **not** create an application in your own
  list — it takes no application-quota slot, logs no application XP, and
  runs no duplicate check. (Friendship points work as they do for any
  shared tip: they follow the recipient marking that they applied.)
- New endpoints `POST /extension/share-drafts` and
  `GET /extension/share-drafts/{id}` — see [`docs/api.md`](docs/api.md).

### Security
- The extension parks the captured posting and hands off to the web app,
  which performs the share under the user's own session with the
  recipients picked there. The extension token deliberately gains **no**
  ability to write into another user's inbox: a stolen token's reach
  stays confined to its own account, as it is today. Only posting fields
  travel (title, company, location, link, posting text) — never notes,
  recruiter or FitCheck data.
- Parked postings carry a short TTL (15 minutes) and are deleted once
  shared.

## [0.16.2] — 2026-07-29

### Security
- **Password-typed fields are excluded from autofill.** `password` was
  missing from the fillable-input blocklist, so a mislabeled
  password-typed field could in principle have received profile data
  during a fill. Autofill never reads field values; this closes the
  write path too.

### Changed
- Product name unified to **"Utably Job Importer"** in the side-panel
  header, HTML title, and privacy modal (was still "Utably Import" in
  places).
- Privacy-modal copy corrected to match the implementation: the profile
  cache lives in in-memory session storage (not local storage), and
  site consents are cleared in bulk / auto-expire after 30 days — the
  copy previously described a per-site revoke that doesn't exist.
- Public docs trimmed of internal backend details (`SECURITY.md`
  Invariant 15, 0.16.0 changelog entry); the per-user IAM-scoping
  guarantee remains documented.
- `docs/adapters.md`: removed two stale adapter rows (SimplyHired,
  RemoteOK) whose files don't exist.
- CI: promotion-guard now rejects promotion PRs originating from forks;
  removed a dead branch trigger from the test workflow.

## [0.16.1] — 2026-07-28

### Fixed
- **Stage switches now disconnect cleanly.** Changing the target stage (or
  toggling Debug mode) revokes the previous stage's tokens against the API
  that issued them and clears all cached data. Previously the extension kept
  the old stage's tokens and reused them against the newly selected API.
- **Profile cache is scoped to the connected API.** The 5-minute autofill
  profile cache now records which API it was fetched from and is rejected on
  mismatch, and it is wiped on every new connect — so reconnecting on a
  different stage or as a different account can no longer show the previous
  profile.

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
- **Backend S3 access is now IAM-scoped per user** across every backend
  service that touches user PII, not just the extension paths. Each
  request assumes a dedicated role with a session policy narrowing S3
  ops to the requesting user's own prefix; resulting credentials are
  short-lived. Even a full compromise of a backend service cannot read
  or write another user's data — rejection is enforced by the AWS API
  itself, with the existing code-layer prefix check kept as
  belt-and-suspenders. See `SECURITY.md` Invariant 15.

## [0.1.5] — Pre-open-source baseline

Last internal release before the open source prep work above. Shipped
to internal testers with all 17 adapters, FitCheck, text capture, and
multi-browser build targets.

Earlier history was tracked internally and is preserved in the git
log.

---

[Unreleased]: https://github.com/utably/utably-browser-plugin/compare/version_0.17.0...HEAD
[0.17.0]: https://github.com/utably/utably-browser-plugin/compare/version_0.16.2...version_0.17.0
[0.16.2]: https://github.com/utably/utably-browser-plugin/compare/version_0.16.1...version_0.16.2
[0.16.1]: https://github.com/utably/utably-browser-plugin/compare/version_0.16.0...version_0.16.1
[0.16.0]: https://github.com/utably/utably-browser-plugin/releases/tag/version_0.16.0
[0.1.5]: https://github.com/utably/utably-browser-plugin/commits/utably-prod
