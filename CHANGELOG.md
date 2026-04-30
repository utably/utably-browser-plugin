# Changelog

All notable changes to the Utably Browser Plugin are documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
