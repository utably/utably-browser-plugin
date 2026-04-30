# Branching

## For external contributors

If you are contributing from outside Utably:

1. **Fork** this repository to your own GitHub account.
2. **Create a topic branch** off the default branch (e.g.
   `fix/indeed-adapter-selector`, `adapter/myboard`).
3. **Open a pull request** against the default branch of
   `utably/utably-browser-plugin`.
4. A Utably maintainer will review. Adapter PRs typically merge quickly;
   anything that touches `background.js`, `manifest.json`, or the build
   scripts may take longer.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for PR requirements.

## For Utably maintainers

This repository uses an internal promotion model across environment
branches (`utably-dev` → `utably-test` → `utably-staging` → `utably-prod`).
The promotion-guard workflow at `.github/workflows/promotion-guard.yml`
enforces the allowed promotion pairs.

External contributors do **not** need to target these branches — they are
Utably-internal and a maintainer will handle promotion after merging your
PR into the default branch.
