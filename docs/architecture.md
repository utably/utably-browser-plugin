# Architecture

## Runtime components

1. `manifest.json` (MV3)
1. `background.js` service worker
1. Side panel UI (`popup.html`, `popup.css`, `popup.js`)
1. Popup app modules (`popup/`)
1. Extraction adapters (`webpages/`)

## User flow

1. User clicks the Utably extension icon.
1. Chrome opens the side panel (`openPanelOnActionClick`).
1. If not authenticated:
1. User clicks **Connect with Utably**.
1. Extension opens `https://app.<stage>.utably.com/extension/connect` (or local stage URL).
1. App sends `UTABLY_EXTERNAL_CONNECT` message back to extension.
1. Background exchanges one-time code for short-lived access + refresh tokens.
1. If authenticated:
1. User clicks **Auto-fill**.
1. Side panel injects extractor scripts from `webpages/`.
1. Router picks best adapter and returns normalized job payload.
1. User reviews fields and clicks **Save to Utably**.
1. Background sends payload to `/extension/import-job`.

## Files of interest

- `background.js`
- `popup/app.js`
- `popup/settings.js`
- `popup/extraction.js`
- `popup/payload.js`
- `webpages/router.js`
- `webpages/generic.js`

## Auth and token model

- Tokens are stored in `chrome.storage.local`.
- Access token is short-lived.
- Refresh token is rotated by `/extension/token/refresh`.
- Logout calls `/extension/token/revoke` and clears local storage.

## Stage behavior

- `prod`:
  - API: `https://api.utably.com`
  - App: `https://app.utably.com`
- `dev`:
  - API: `https://api.dev.utably.com`
  - App: `https://app.dev.utably.com`
- `test`:
  - API: `https://api.test.utably.com`
  - App: `https://app.test.utably.com`
- `local`:
  - API: `https://api.dev.utably.com`
  - App: `https://app.dev.utably.com:<port>`
