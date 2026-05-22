# Extraction Adapters

Adapters are the single most important contribution surface in this
project. A job board ships a redesign, a selector stops matching, an
adapter silently returns empty fields, and real users notice within
minutes. **Every fix is directly useful.**

If this is your first time contributing, read the
[10-minute walkthrough](#write-your-first-adapter-in-10-minutes)
below. It'll get you from zero to a working adapter PR without you
needing to understand the rest of the system first.

## Table of contents

- [How the adapter system works](#how-the-adapter-system-works)
- [The `common` helpers](#the-common-helpers)
- [Write your first adapter in 10 minutes](#write-your-first-adapter-in-10-minutes)
- [Fixing a broken adapter](#fixing-a-broken-adapter)
- [Priority guidelines](#priority-guidelines)
- [Safety rules](#safety-rules)
- [All current adapters](#all-current-adapters)

---

## How the adapter system works

When you click **Auto-fill** in the side panel, the extension:

1. Asks for per-origin permission on the current tab (first time only).
2. Injects [`webpages/common.js`](../webpages/common.js) first — this
   defines helpers and an empty `globalThis.__utablyExtractorRegistry`
   array.
3. Injects every other adapter file listed in
   [`popup/config.js`](../popup/config.js) → `EXTRACTION_SCRIPT_FILES`.
   Each adapter is an **IIFE** that pushes itself onto the registry.
4. Finally injects [`webpages/router.js`](../webpages/router.js), which
   defines `globalThis.__utablyRunExtract()`.
5. The side panel calls `__utablyRunExtract()`. The router sorts the
   registry by **highest priority first**, then for each adapter:
   - Calls `canHandle()` → skip if false.
   - Calls `extract(common)` → if it returns a non-null payload, that
     payload wins.
6. If no adapter matches, [`generic.js`](../webpages/generic.js)
   (priority 10) runs as a fallback using JSON-LD `JobPosting` parsing
   and DOM scoring.

The payload shape is always:

```javascript
{
  title: string,         // Job title
  company: string,       // Company name
  location: string,      // Job location
  recruiterName: string, // Recruiter name (if available)
  description: string,   // Sanitized job description text
  isLinkedIn?: boolean   // Only for the LinkedIn adapter
}
```

The router adds the source `url`, `host`, and `adapter` id on top of
this before handing it back to the side panel.

## The `common` helpers

Every adapter receives a `common` object (often destructured as `ctx`)
with these helpers from [`webpages/common.js`](../webpages/common.js):

| Helper | Signature | What it does |
|---|---|---|
| `normalize` | `(str) => string` | Collapses whitespace and trims. Use on anything user-visible. |
| `sanitizeText` | `(text, maxLen=20000) => string` | Strips cookie banners, footer boilerplate, and common noise. Truncates to `maxLen`. **Always run descriptions through this.** |
| `queryFirstText` | `(selectors[]) => string` | Tries each CSS selector in order and returns the first non-empty `textContent`. Good for fallback selectors across A/B variants. |
| `metaValue` | `(key, attr="name") => string` | Reads `<meta name="key">` or `<meta property="key">` — useful for `og:title`, `og:site_name`, etc. |
| `waitForText` | `(regex, timeout=3500) => Promise<boolean>` | Waits up to `timeout` ms for text matching `regex` to appear in the DOM. Use for SPAs that hydrate after navigation. |
| `cleanTitle` | `(rawTitle, companyName) => string` | Strips common title suffixes (`" - Indeed"`, `" | LinkedIn"`, `" at Company"`) and picks the first meaningful segment. |

**Prefer helpers over direct DOM access.** They already handle the
cases you haven't thought of yet (empty nodes, whitespace-only text,
nested spans, etc.).

## Write your first adapter in 10 minutes

Let's write an adapter for a fictional site, `jobsly.example`. The
same pattern works for any real board.

### Step 1 — Study the target page

Open a real job posting in your browser and use DevTools to find
stable selectors for each field. Look for:

- `data-testid`, `data-qa`, or `data-test` attributes (most reliable).
- Semantic tags (`<h1>`, `<address>`).
- `aria-label` attributes.
- `<meta property="og:*">` tags as a fallback for title/company.

**Avoid** selecting by class name alone — class names change between
deploys and are usually hashed (`_4gfdh7`).

For our fake Jobsly page, let's say you find:

```html
<h1 data-testid="job-title">Senior Backend Engineer</h1>
<a data-testid="company-link">Acme Corp</a>
<span data-testid="job-location">Berlin, Germany</span>
<section data-testid="job-description"> ...description HTML... </section>
```

### Step 2 — Create the adapter file

Create [`webpages/jobsly.js`](#) with this starting template:

```javascript
(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("jobsly.example");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;

    const company = queryFirstText([
      "[data-testid='company-link']",
      "meta[property='og:site_name']",
    ]);

    const rawTitle =
      queryFirstText(["h1[data-testid='job-title']"]) ||
      metaValue("og:title", "property") ||
      document.title;

    const location = queryFirstText([
      "[data-testid='job-location']",
    ]);

    const description = sanitizeText(
      queryFirstText(["[data-testid='job-description']"])
    );

    // Return null if the page isn't a job posting — lets the router
    // fall through to the next adapter or the generic fallback.
    if (!rawTitle || !description) return null;

    return {
      title: cleanTitle(rawTitle, company),
      company,
      location,
      recruiterName: "",
      description,
    };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "jobsly",
    priority: 90,
    canHandle,
    extract,
  });
})();
```

### Step 3 — Register it with the loader

Open [`popup/config.js`](../popup/config.js) and add your file to
`EXTRACTION_SCRIPT_FILES`. Order matters only loosely — the router
sorts by priority at runtime — but keep the list readable:

```diff
 export const EXTRACTION_SCRIPT_FILES = [
   "webpages/common.js",
   "webpages/googlejobs.js",
   "webpages/linkedin.js",
   "webpages/indeed.js",
+  "webpages/jobsly.js",
   "webpages/glassdoor.js",
   // ...
 ];
```

### Step 4 — Build and test

```bash
npm run build:chrome
```

Then in Chrome:

1. `chrome://extensions` → **Reload** the Utably card.
2. Open a real Jobsly posting in a fresh tab.
3. Click the Utably icon → **Auto-fill**.
4. First time on this site, the extension asks for permission to read
   `jobsly.example` — grant it.
5. Check the side-panel status line. You should see:
   **"Preview ready (jobsly)"**.
6. Verify `title`, `company`, `location`, and `description` are
   populated correctly.

### Step 5 — Test the edge cases

Before opening a PR, verify your adapter handles these cases:

- [ ] **Two different postings** on the same site — different companies,
      different title formats.
- [ ] **A non-posting page** on the same site (search results,
      homepage). Your `canHandle()` should still return `true`, but
      `extract()` should return `null` so the router falls through.
- [ ] **Slow-hydrating SPA**: if the posting loads async, use
      `await waitForText(/Apply now|Job details/)` before running
      your selectors.
- [ ] **Description sanitization**: confirm `sanitizeText` stripped the
      cookie banner, footer, and "Sign in" buttons.
- [ ] **Console is clean**: no errors, no warnings, no data leaks.

### Step 6 — Open the PR

```bash
git checkout -b adapter/jobsly
git add webpages/jobsly.js popup/config.js
git commit -s -m "feat(adapters): add Jobsly adapter"
git push origin adapter/jobsly
```

Then open a PR using the "Adapter request" checklist in
[`.github/pull_request_template.md`](../.github/pull_request_template.md).

Attach screenshots of the side panel showing the extracted fields on
two different postings, paste the URLs of the postings you tested, and
you're done.

---

## Fixing a broken adapter

If a supported site started returning wrong or empty fields, the flow
is almost the same but shorter:

1. **Confirm the adapter is actually running.** Check the side panel
   status line after Auto-fill. If it says *"Preview ready (generic)"*,
   `canHandle()` isn't matching — the site probably changed its
   hostname or moved to a subdomain.
2. **Open the live posting in DevTools** and find the new selectors
   for the broken fields. The old ones are in the adapter file;
   compare side-by-side.
3. **Add the new selector as a fallback**, don't replace the old one.
   `queryFirstText` tries selectors in order, so keeping the old
   selector first lets the adapter work on both variants until the
   rollout is complete:

   ```javascript
   const title = queryFirstText([
     "h1[data-testid='new-title-2024']",   // new, post-redesign
     "h1[data-testid='jobsearch-JobInfoHeader-title']", // old
     ".jobsearch-JobInfoHeader-title",     // even older
   ]);
   ```

4. **Test on at least two postings**, rebuild, reload, and open the PR.

A good bug fix PR title is
`fix(adapters): repair indeed title extraction after 2024-06 redesign`.

---

## Priority guidelines

The router sorts by priority descending, so **higher priority wins**.
Use these ranges:

| Range | When to use |
|---|---|
| **100** | Reserved for LinkedIn. Do not reuse. |
| **90–95** | Strict host-specific adapters for major job boards (Indeed, Glassdoor, Monster, ZipRecruiter). `canHandle()` should match a specific hostname. |
| **80** | ATS hosts that serve many company career pages from a shared domain (Greenhouse, Lever, Workday). Priority 80 keeps them below board-specific adapters even when a company also posts to Indeed. |
| **70** | Long-tail aggregators and niche boards. |
| **10** | Reserved for the generic fallback. Do not reuse. |

**Rule of thumb:** if you're adding a **new dedicated adapter**, use
90. If you're adding a **new ATS-style wildcard**, use 80. Nothing
else should appear at priority ≥ 95 without an issue discussing why.

## Safety rules

Every adapter must follow these rules or the PR will be rejected:

1. **Never auto-send data.** Adapters only populate preview fields.
   Sending data to any backend is the side panel's job, gated on a
   user click.
2. **Never `fetch()` from an adapter.** Read the DOM. That's it.
3. **Never touch password fields, cookies, or browser storage.**
4. **Never log sensitive data.** No user input, no full descriptions,
   no profile data to `console.*`. Legitimate `console.warn` for
   recoverable errors is fine.
5. **Run all extracted text through `sanitizeText`** — it strips
   cookie banners and legal boilerplate that would otherwise pollute
   the description.
6. **Cap extraction size.** `sanitizeText` truncates to 20KB by
   default. If you need a different cap, pass it explicitly:
   `sanitizeText(text, 8000)`.
7. **Return `null` on non-posting pages.** Search results, homepages,
   and 404s should all return `null` so the router can fall through
   cleanly.
8. **Do not request new host permissions** in `manifest.json`. Site
   access is requested at runtime.

## All current adapters

| Priority | Adapter | Source | Notes |
|:-:|---|---|---|
| 100 | [`linkedin.js`](../webpages/linkedin.js) | LinkedIn | Metadata only; description is manual entry by design. |
| 95 | [`googlejobs.js`](../webpages/googlejobs.js) | Google Careers | Detail page parser. |
| 80 | [`indeed.js`](../webpages/indeed.js) | Indeed | Full extraction. |
| 90 | [`glassdoor.js`](../webpages/glassdoor.js) | Glassdoor | Full extraction. |
| 90 | [`ziprecruiter.js`](../webpages/ziprecruiter.js) | ZipRecruiter | Full extraction. |
| 90 | [`monster.js`](../webpages/monster.js) | Monster | Full extraction. |
| 90 | [`careerbuilder.js`](../webpages/careerbuilder.js) | CareerBuilder | Full extraction. |
| 90 | [`dice.js`](../webpages/dice.js) | Dice | Tech jobs. |
| 90 | [`wellfound.js`](../webpages/wellfound.js) | Wellfound (AngelList) | Startup jobs. |
| 90 | [`handshake.js`](../webpages/handshake.js) | Handshake | Student / early career. |
| 90 | [`usajobs.js`](../webpages/usajobs.js) | USA Jobs | Federal government. |
| 90 | [`ukPortals.js`](../webpages/ukPortals.js) | UK job portals | UK-specific boards. |
| 80 | [`atsHosted.js`](../webpages/atsHosted.js) | Greenhouse, Lever, Workday, etc. | Shared-host ATS adapter. |
| 80 | [`builtin.js`](../webpages/builtin.js) | BuiltIn | Tech community. |
| 70 | [`simplyhired.js`](../webpages/simplyhired.js) | SimplyHired | Aggregator. |
| 70 | [`remoteok.js`](../webpages/remoteok.js) | RemoteOK | Remote-only. |
| 10 | [`generic.js`](../webpages/generic.js) | Any page | Fallback using JSON-LD `JobPosting`, DOM scoring, and a mutation observer. |

---

**Next steps:**

- [`development.md`](development.md) — local dev setup and debugging.
- [`faq.md`](faq.md) — common contributor questions.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — PR rules and checklist.
