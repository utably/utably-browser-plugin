# Extraction Adapters

The extension uses an adapter-based extraction system under `webpages/`.

## How It Works

1. `webpages/common.js` provides shared helpers (`normalize`, `sanitizeText`, `metaValue`, `waitForText`, `cleanTitle`)
2. Each adapter registers itself in `globalThis.__utablyExtractorRegistry`
3. `webpages/router.js` sorts adapters by `priority` (highest first)
4. First adapter where `canHandle()` returns `true` is selected
5. Router calls `extract(ctx)` and returns normalized payload

## Extracted Fields

```javascript
{
  title: string,        // Job title
  company: string,      // Company name
  location: string,     // Job location
  recruiterName: string, // Recruiter name (if available)
  description: string,  // Job description (HTML or text)
  isLinkedIn?: boolean  // Flag for LinkedIn manual-description mode
}
```

## All Adapters (17)

| Priority | Adapter | Source | Notes |
|----------|---------|--------|-------|
| 100 | `linkedin.js` | LinkedIn | Metadata only; description is manual entry by design |
| 95 | `indeed.js` | Indeed | Full extraction |
| 95 | `googlejobs.js` | Google Careers | Detail page parser |
| 90 | `glassdoor.js` | Glassdoor | Full extraction |
| 90 | `ziprecruiter.js` | ZipRecruiter | Full extraction |
| 90 | `monster.js` | Monster | Full extraction |
| 90 | `careerbuilder.js` | CareerBuilder | Full extraction |
| 90 | `dice.js` | Dice | Tech jobs |
| 90 | `wellfound.js` | Wellfound (AngelList) | Startup jobs |
| 90 | `handshake.js` | Handshake | Student/early career |
| 90 | `usajobs.js` | USA Jobs | Federal government |
| 90 | `ukportals.js` | UK Job Portals | UK-specific boards |
| 80 | `ats.js` | ATS-hosted | Greenhouse, Lever, Workday, etc. |
| 80 | `builtin.js` | BuiltIn | Tech community |
| 70 | `simplyhired.js` | SimplyHired | Aggregator |
| 70 | `remoteok.js` | RemoteOK | Remote jobs |
| 10 | `generic.js` | Any page | Fallback: JSON-LD `JobPosting` + DOM scoring + mutation observer |

## Adding a New Adapter

1. Create `webpages/<source>.js`
2. Implement `canHandle()` and `extract(ctx)`
3. Register in the global registry:

```javascript
globalThis.__utablyExtractorRegistry.push({
  id: "newsource",
  priority: 70,
  canHandle,
  extract,
});
```

4. Add the file path to `EXTRACTION_SCRIPT_FILES` in `popup/config.js`

## Priority Guidelines

| Range | Use For |
|-------|---------|
| 90-100 | Strict host/path adapters (exact source match) |
| 70-89 | Source family or ATS adapters |
| 10 | Generic fallback only |

## Safety Rules

- **Never auto-send data** — extraction only fills preview fields
- Keep description capped and boilerplate-filtered
- Avoid full-page dump when structured content is available
- Use `sanitizeText()` from `common.js` for all extracted text
