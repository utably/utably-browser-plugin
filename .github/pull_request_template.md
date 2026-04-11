<!--
Thanks for contributing! Please fill out the sections below.

External contributors: open this PR against the **default branch**
(do NOT target `utably-dev`, `utably-test`, `utably-staging`, or
`utably-prod` — those are internal promotion branches, and Utably
maintainers handle promotion after merge). See docs/branching.md.
-->

## What does this change?

<!-- One or two sentences describing the change and its motivation. -->

## Type of change

- [ ] Adapter fix / new adapter
- [ ] Bug fix (non-adapter)
- [ ] Build / tooling change
- [ ] Documentation
- [ ] Other (describe):

## Adapter testing (if applicable)

<!-- Fill this out only if this PR touches files in webpages/ -->

- **Adapter ID:**
- **Site domain:**
- **Priority:**
- **Test postings (at least 2 public URLs):**
  1.
  2.

Screenshots of the side-panel review screen showing extracted fields:

<!-- Drag-drop screenshots here. -->

### Adapter checklist

- [ ] Extracts `title`, `company`, `location`, and `description` correctly
- [ ] Returns `null` on non-posting pages of the same site
- [ ] No new `host_permissions` in `manifest.json`
- [ ] No new `fetch()` calls inside the adapter
- [ ] No sensitive data logged to the console
- [ ] Uses `common.*` helpers where appropriate
- [ ] Added to `EXTRACTION_SCRIPT_FILES` in `popup/config.js` if new

## General checklist

- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] My commits are signed off (`git commit -s`) per the DCO
- [ ] I have tested the build locally (`npm run build`)
- [ ] This PR does not introduce new runtime dependencies
- [ ] This PR does not introduce new backend endpoints
- [ ] This PR does not broaden the extension's permissions model
