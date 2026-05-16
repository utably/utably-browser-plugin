# Security Policy

Thank you for helping keep the Utably Browser Plugin and its users safe.

## Supported Versions

Only the **latest released version** of the extension is supported for
security fixes. Older builds distributed via the Chrome Web Store, Firefox
Add-ons, or Safari App Extensions auto-update to the latest release — please
update before reporting.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| older   | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via one of the following channels:

- **Email:** `security@utably.com` — goes to a dedicated, monitored mailbox.
- **GitHub Security Advisories:** use the "Report a vulnerability" button in
  the [Security tab](https://github.com/utably/utably-browser-plugin/security)
  of this repository (preferred for structured disclosure).

Please include:

1. A description of the issue and its potential impact.
2. Steps to reproduce, ideally including the target job board URL or the
   specific adapter involved.
3. The extension version, browser, and operating system.
4. Any proof-of-concept code (please do not include real user credentials or
   personal data).

You can expect an initial acknowledgement within **3 business days** and a
substantive response within **10 business days**. We aim to ship fixes for
confirmed high-severity issues within **30 days** of triage.

## Scope

**In scope**

- The extension source in this repository: `background.js`, `popup/**`,
  `content/**`, `webpages/**`, `scripts/**`, and `manifest.json`.
- Auth token handling, storage, and rotation logic in `background.js`.
- Content-script injection surface (host permission prompts, adapter
  extraction, text-capture UI).
- Build output in `dist/` when produced from an unmodified checkout.

**Out of scope**

- The Utably backend API (`api.utably.com`). Report backend-side issues to
  the same `security@utably.com` address — they are tracked in a separate
  private repository and are not part of this project.
- Vulnerabilities in browser vendors (Chrome, Firefox, Safari, Edge) or in
  the browser extension runtime itself — please report those upstream.
- Issues in third-party job board websites that the extension extracts from.
  Adapter code only *reads* public DOM content on pages the user has
  explicitly opened; bugs in those sites should be reported to the site
  owner.
- Social engineering, physical attacks, denial-of-service, or spam.
- Vulnerabilities in forked builds that have modified the extension source,
  replaced the backend endpoints, or shipped under a different identity.

## Safe Harbor

We will not take legal action against researchers who:

- Act in good faith and avoid privacy violations, data destruction, and
  service disruption.
- Make a reasonable effort to contact us before public disclosure and give
  us a reasonable window to respond.
- Do not access, modify, or exfiltrate user data belonging to anyone other
  than themselves (or a consenting test account they control).

## Threat Model Notes

For context, the extension's design assumes:

- The Utably backend is the trust anchor for identity. The extension holds
  short-lived access tokens and longer-lived refresh tokens in
  `chrome.storage.local`. Tokens are only issued after the user completes an
  authenticated session in the Utably web app.
- Host permissions for job boards are declared as `optional_host_permissions`
  and requested **at runtime from a user gesture**, not granted at install
  time. On first use of Auto-fill or Capture the browser shows the native
  Chrome permission prompt; the user must approve it before any page content
  is read. If the user declines, Auto-fill and Capture fail loudly with an
  actionable error message.
- The extension never auto-submits data. All imports, FitCheck requests, and
  autofill operations require an explicit user click.
- LinkedIn adapter runs in **manual-description mode** by design and does not
  auto-scrape posting descriptions.

Reports that break these assumptions (e.g., token exfiltration from storage,
silent host permission escalation, bypass of the user-click requirement) are
considered high severity.

## Profile Autofill Threat Model

Profile autofill is the only path in this extension where **user PII flows
from Utably to a third-party origin**. It carries a different threat model
than job-data import (which flows third-party → Utably). The invariants below
are load-bearing — reports that defeat any of them are high severity.

**Invariant 1 — Profile data is fetched only on user gesture.**
`GET /extension/profile` is called from the *My profile* tab open event,
the *Refresh* button, or as the first step of *Fill this page*. There is
no background fetch, no preload, and no fetch from `background.js` outside
those explicit message handlers.

**Invariant 2 — Profile data is not persisted to disk.**
The profile cache lives in `chrome.storage.session` (MV3 in-memory store,
wiped on browser restart). If `chrome.storage.session` is unavailable in the
host browser, the cache is disabled — no fallback to disk-backed storage.
The five-minute TTL is enforced on every read. Logout, *Clear cache*, and the
defensive install hook all wipe any legacy `chrome.storage.local` entry from
older builds.

**Invariant 3 — Every recipient origin is shown to the user before fill.**
The consent modal lists every host whose frame matched a fill adapter and
holds at least one matched field. Sub-frame hosts are rendered with a visible
`iframe` tag and a red border. The list is built from the dry-run report and
rendered with `document.createElement` + `textContent` — no path constructs
DOM from frame-supplied strings via `innerHTML`.

**Invariant 4 — Frames that appear after consent cannot fill.**
At apply time, each frame validates its hostname against the user-consented
hosts list passed in by the side panel. A frame whose host is not on the list
returns `aborted: host_not_consented` and applies nothing.

**Invariant 5 — Plan / verify / apply runs in one synchronous frame
execution (TOCTOU bound).** Each adapter calls `buildPlan(...)`, compares the
canonical field set to the consented one, then calls `applyPlan(...)` in the
same `chrome.scripting.executeScript` call. There is no awaitable boundary
between verification and mutation. If the field set differs from what the
user consented to, the frame returns `aborted: page_changed` and applies
nothing; the side panel re-runs the preview and re-prompts.

**Invariant 6 — The generic fill adapter is top-frame-only.**
`content/fill/generic.js` `canHandle()` returns `true` only when
`window === window.top`. Unknown sub-frames (ad networks, tracking iframes,
arbitrary third-party widgets) cannot match the generic adapter even if their
DOM contains an input named "email". ATS-specific adapters
(`greenhouse.js`, `lever.js`, `ashby.js`) remain frame-agnostic but are
pinned to known TLD+1 suffixes.

**Invariant 7 — Only empty inputs are filled.**
`tryFill` and `applyPlan` both bail if the target `<input>` has a non-empty
trimmed value. User-entered data is never overwritten.

**Invariant 8 — The backend response is uncacheable by intermediates.**
`GET /extension/profile` returns `Cache-Control: private, no-store` and
`Pragma: no-cache`. Server side enforces a per-user rate cap on profile
reads (separate counter from job-import quota) and logs each read in
CloudWatch as a DSGVO Art. 30 record of processing.

Bypassing any of the above (e.g., a code path that fills without rendering
the consent modal, a frame that fills despite not being in the consented
host list, a way to coerce the cache onto disk) is in scope for the
high-severity bounty bracket.

## Application List & Attachments Threat Model

The *Saved* tab and the *Attachments* section on the profile tab read the
user's own application history and personal-data file index from the Utably
backend. Neither surface ever sends PII to a third-party origin; these are
strictly user-to-Utably reads. The invariants below complement (and reuse)
the profile-autofill ones above.

**Invariant 9 — Reads happen only on user gesture.**
`GET /extension/applications` fires on Saved tab open or Refresh click.
`GET /extension/attachments` fires after the profile load completes. There
is no background poll, no preload outside of an explicit message handler.

**Invariant 10 — Application list is render-only.**
The Saved tab is rendered in the side panel only. The list is never
injected into a page, never copied into form fields automatically, never
passed to a content script. Per-card "Copy" actions write to the user's
clipboard (same as the profile tab); the "Open" button opens the Utably
web app — never a third-party URL.

**Invariant 11 — No client-side persistence of the application list.**
`cachedApplications` lives in the side-panel JS context only. Closing the
side panel collects the array. There is no `chrome.storage.local` or
`chrome.storage.session` write for application data, no IndexedDB, no
file-system cache. Each tab open re-fetches.

**Invariant 12 — Attachment uploads never auto-submit.**
The DataTransfer + DragEvent injection in `content/fill/attachments.js`
populates the file input. Form submission requires the user's own click on
the destination site's submit button. The plugin never dispatches a
`submit` event.

**Invariant 13 — Attachment bytes leave Utably only on consent.**
The presigned S3 URL is included in the `/extension/attachments`
response (TTL: 5 minutes). The bytes are fetched by the service worker
*only* when the user clicks **Upload to page** or **Download**, and *only*
after the per-host consent modal is confirmed. The 12 MB cap in
`runFormFill` prevents accidental large-payload transfers.

**Invariant 14 — Place-mode hosts must be the active top frame.**
`dropmode.js` runs in the top frame only and cross-checks `location.hostname`
against the user-consented host before synthesizing any drop event. A frame
whose host doesn't match aborts with `host_not_consented`.

**Invariant 15 — Backend S3 access is IAM-scoped per user, not just
code-scoped.** The `applicationsAPI` lambda has **no direct S3 grant**. At
the start of each `/extension/profile` and `/extension/attachments`
request, the lambda calls `sts:AssumeRole` on a dedicated role with a
session policy narrowing S3 ops to `users/{userId}/*`. The resulting
temporary credentials (15-minute lifetime) are used for both the
`ListBucket` and `GetObject`/presign calls. Even a full RCE on the lambda
runtime cannot read another user's prefix — the AWS API itself rejects it.
The code-layer prefix check (`key.startsWith('users/{userId}/')`) is
retained as belt-and-suspenders.

Reports that defeat any invariant (e.g., a code path that lists
applications without a user click, a way to surface the list in a content
script, an attachment upload that bypasses the consent modal) are high
severity.
