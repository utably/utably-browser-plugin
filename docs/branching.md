# Branching and Promotion Guard

This extension follows the same promotion model as the main project.

## Branches

- `utably-dev`
- `utably-test`
- `utably-staging`
- `utably-prod`

## Allowed promotion path

1. `utably-dev` -> `utably-test`
1. `utably-test` -> `utably-staging`
1. `utably-staging` -> `utably-prod`

Direct promotion that skips stages is blocked by the promotion guard workflow.

## Workflow file

- `.github/workflows/promotion-guard.yml`

When this folder is moved to its own repository, keep that workflow at repo root `.github/workflows/`.
