# Extraction Adapters

The extension uses adapter-based extraction under `webpages/`.

## How it works

1. `webpages/common.js` registers shared helpers.
1. Each adapter registers itself in `globalThis.__utablyExtractorRegistry`.
1. `webpages/router.js` sorts adapters by `priority` and picks the first `canHandle()` match.
1. Router returns normalized payload:
   - `title`
   - `company`
   - `location`
   - `recruiterName`
   - `description`
   - `isLinkedIn` (optional)

## Existing adapters

- `googlejobs.js` (Google Careers detail page)
- `linkedin.js` (manual-description mode, basic metadata only)
- `indeed.js`
- `generic.js` (fallback)

## Adding a new adapter

1. Create `webpages/<source>.js`.
1. Implement:
   - `canHandle()`
   - `extract(ctx)`
1. Register:

```js
globalThis.__utablyExtractorRegistry.push({
  id: "newsource",
  priority: 70,
  canHandle,
  extract,
});
```

1. Add file to `EXTRACTION_SCRIPT_FILES` in `popup/config.js`.

## Priority guidance

- 90-100: strict host/path adapters (exact source)
- 60-89: source family adapters
- 10: generic fallback

## Safety rules

- Never auto-send data. Extraction only fills preview fields.
- Keep description capped and boilerplate-filtered.
- Avoid full-page dump when structured content exists.
