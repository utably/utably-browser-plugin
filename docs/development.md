# Development

## Load Extension (Chrome/Edge)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project root directory (or `dist/utably-browser-plugin-chrome-edge/` after building)
5. After code changes, click **Reload** on the extension card

## Load Extension (Firefox)

1. Run `npm run build` to generate the XPI
2. Open `about:debugging` > "This Firefox" > "Load Temporary Add-on"
3. Select the XPI from `dist/utably-browser-plugin-firefox/`

## Load Extension (Safari)

1. Run `npm run build` to generate the Xcode project
2. Open `dist/utably-browser-plugin-safari/` in Xcode
3. Build and run

## Debug Stages

Open extension settings in the side panel:

1. Enable **Debug mode**
2. Pick target stage: `prod`, `dev`, `test`, or `local`
3. For `local` stage, set the app port (default `5173`)

### Local Stage Routing

- API: `https://api.dev.utably.com` (uses dev backend)
- App: `https://app.dev.utably.com:<port>`
- Connect: `https://app.dev.utably.com:<port>/extension/connect`

## Host Permissions

The extension requests per-origin site access at runtime when Auto-fill is used. If the user denies permission, extraction is blocked for that site.

## Build Commands

| Command | Output |
|---------|--------|
| `npm run build` | Builds all browser targets to `dist/` |
| `npm run clean` | Removes `dist/` |

Build script locations:
- `scripts/build.mjs` — Chrome/Edge (copies runtime files)
- `scripts/firefox-build.mjs` — Firefox XPI packaging
- `scripts/safari-convert.mjs` — Safari Xcode app conversion

## Common Issues

### CSP / unsafe-eval error
- **Cause**: String-eval extraction paths
- **Fix**: Current implementation is CSP-safe using file/function injection only

### Auto-fill returns weak data
- Check which adapter was selected in the status line (`Preview ready (<adapter>)`)
- Add or tune a source adapter in `webpages/`
- Test with the generic fallback to see what JSON-LD or DOM scoring produces

### Connect works only after reload
- Verify stage URLs use `https` protocol
- Verify `manifest.json` `externally_connectable.matches` includes your app origin
- Check service worker logs in `chrome://extensions` for errors

### FitCheck shows "locked" for all users
- Verify the user's subscription tier in the Utably app
- Check that `/extension/llm` endpoint returns tier-appropriate response
- Clear FitCheck cache in `chrome.storage.local` (`utablyFitCheckCache`)

### Text Capture card doesn't appear
- Ensure "Capture: On" is toggled in the side panel
- Check that `content/capture.js` is being injected (requires host permission)
- Verify no CSP on the target page is blocking the Shadow DOM injection
