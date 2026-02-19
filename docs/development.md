# Development

## Load extension

1. Open `chrome://extensions`
1. Enable Developer mode
1. Click **Load unpacked**
1. Select `extension/`

After code changes, click **Reload** on the extension card.

## Side panel behavior

- Toolbar icon opens side panel by default.
- If side panel does not open, reload extension and check service worker logs.

## Debug stages

Open extension settings:

1. Enable **Debug mode**
1. Pick stage:
   - `prod`, `dev`, `test`, or `local`
1. For `local`, set port (default `5173`)

## Local stage

- API target remains: `https://api.dev.utably.com`
- App target: `https://app.dev.utably.com:<port>`
- Connect URL: `https://app.dev.utably.com:<port>/extension/connect`

## Host permissions during extraction

- The extension requests per-origin site access at runtime for Auto-fill.
- If denied, extraction is blocked for that site.

## Common issues

## 1) CSP / unsafe-eval error

- Cause: string-eval extraction paths.
- Current implementation is CSP-safe and uses file/function injection only.

## 2) Auto-fill returns weak data

- Confirm correct adapter is selected in status line (`Preview ready (<adapter>)`).
- Add/tune a source adapter in `webpages/`.

## 3) Connect works after reload only

- Verify stage URLs use correct protocol (`https`) and target stage host.
- Verify `manifest.json` `externally_connectable.matches` includes your app origin.
