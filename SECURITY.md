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
- The extension never auto-submits data. All imports and FitCheck requests
  require an explicit user click.
- LinkedIn adapter runs in **manual-description mode** by design and does not
  auto-scrape posting descriptions.

Reports that break these assumptions (e.g., token exfiltration from storage,
silent host permission escalation, bypass of the user-click requirement) are
considered high severity.
