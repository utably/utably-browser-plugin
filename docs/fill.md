# Profile Autofill

Profile autofill is the only path in this extension where **PII flows from
Utably to a third-party origin** (Greenhouse, Lever, Ashby, or — via the
top-frame generic fallback — any site you explicitly consent to). This doc
covers the design, the security invariants, and how to write or fix a fill
adapter.

If you're looking for the **extract** adapters (job-data import flowing
*into* Utably), see [`adapters.md`](adapters.md) — they're a separate
system with a different threat model.

## Table of contents

- [What this is](#what-this-is)
- [End-to-end flow](#end-to-end-flow)
- [Adapter system](#adapter-system)
- [The `runAdapter` contract](#the-runadapter-contract)
- [Security invariants](#security-invariants)
- [Add a new fill adapter](#add-a-new-fill-adapter)
- [Things you must not do](#things-you-must-not-do)
- [What this is *not*](#what-this-is-not)

---

## What this is

The user opens an application form (Greenhouse, Lever, Ashby), opens the
side panel's *My profile* tab, and clicks **Fill this page**. The
extension reads their Utably profile, asks for per-fill consent showing
*every* recipient host, and only then injects values into matching form
inputs.

This is **not** a general-purpose password-manager-style autofiller. It is
intentionally narrow:

- Only the ATSes we have dedicated adapters for + the user-consented top
  frame.
- Only contact, employment, education, and social-link fields. No
  uploads, no custom-question answers, no submissions.
- Never overwrites a non-empty input.

## End-to-end flow

```
┌────────────────┐                                  ┌────────────────┐
│ Side panel     │                                  │ Active tab     │
│ profile.js     │                                  │ (all frames)   │
└────────┬───────┘                                  └───────┬────────┘
         │                                                  │
         │   1. UTABLY_FILL_PREVIEW (tabId)                 │
         ├─────────────► background.js ─────────────────────│
         │              fetch profile,                      │
         │              runFormFill({dryRun: true})         │
         │              ┌─inject content/fill/*  ──────────►│
         │              │                                   │ dry-run
         │              │     report per frame:             │ in each frame:
         │              │     {host, fields, isTopFrame}    │ ── buildPlan
         │              │                                   │ ── return
         │   ◄───────── aggregate per host ─────────────────│    (no DOM
         │                                                  │     mutation)
         │   2. Modal: show recipient hosts + fields        │
         │   3. User confirms                               │
         │                                                  │
         │   4. UTABLY_FILL_PAGE (tabId, expectedHosts)     │
         ├─────────────► background.js ─────────────────────│
         │              runFormFill({                       │
         │                dryRun: false,                    │
         │                expectedHosts                     │
         │              })                                  │
         │                                                  │ in each frame:
         │                                                  │ ── buildPlan
         │                                                  │ ── verify
         │                                                  │    against
         │                                                  │    expectedFields
         │                                                  │ ── applyPlan
         │                                                  │    (or abort
         │                                                  │     if mismatch)
         │   ◄───────── report or PAGE_CHANGED ─────────────│
         │                                                  │
         │   5. If PAGE_CHANGED: loop back to step 1        │
         │      (capped at 3 attempts).                     │
```

Two passes intentionally. The first pass shows the user exactly what will
happen; the second pass verifies the plan hasn't drifted before mutating
anything.

## Adapter system

Fill adapters live in [`content/fill/`](../content/fill/) and are loaded
in this order:

1. [`common.js`](../content/fill/common.js) — helpers + the `runAdapter`
   harness. Sets up `globalThis.__utablyFillRegistry` and
   `globalThis.__utablyFillCommon`.
2. [`greenhouse.js`](../content/fill/greenhouse.js) — priority 50, pins
   to `*.greenhouse.io`.
3. [`lever.js`](../content/fill/lever.js) — priority 50, pins to
   `*.lever.co`.
4. [`ashby.js`](../content/fill/ashby.js) — priority 50, pins to
   `*.ashbyhq.com`.
5. [`generic.js`](../content/fill/generic.js) — priority 1, **top frame
   only** (`window === window.top`).
6. [`router.js`](../content/fill/router.js) — defines
   `globalThis.__utablyRunFill(profile, options)`.

The router runs once per frame. It picks the highest-priority adapter
whose `canHandle()` returns true. There is **no fall-through** — exactly
one adapter handles a given frame, or none does.

Each adapter is an IIFE that pushes a record into the registry:

```javascript
globalThis.__utablyFillRegistry.push({
  id: "greenhouse",
  priority: 50,
  canHandle: () => /* boolean */,
  fill: (profile, ctx, options) =>
    ctx.runAdapter({ id: "greenhouse", profile, ctx, options, keyForElement }),
});
```

`keyForElement(el, ctx)` returns one of the canonical field keys
(`firstName`, `email`, `phone`, `linkedin`, …) or `null`. That's the
entire customization surface for an ATS adapter — everything else lives
in `runAdapter`.

## The `runAdapter` contract

`runAdapter` is the harness that gives every adapter the same plan /
verify / apply behaviour. It is defined in
[`common.js`](../content/fill/common.js). The pseudocode:

```javascript
function runAdapter({ id, profile, ctx, options, keyForElement }) {
  const plan = buildPlan(profile, keyForElement, ctx);
  //   ↑ iterates visible, fillable, empty inputs
  //     and assembles {el, key, value} for each matched field.

  const planFields = plan.map(p => p.key);

  if (options.dryRun) {
    return { adapter: id, host, isTopFrame, filled: 0, fields: planFields };
  }

  if (options.expectedFields) {
    if (canonicalFieldSet(planFields) !== canonicalFieldSet(options.expectedFields)) {
      return { ...base, aborted: true, reason: "page_changed", planFields };
    }
  }

  const { filled, fields } = applyPlan(plan);
  //   ↑ re-checks each element is still in the DOM and still empty,
  //     then calls setNativeValue + dispatches input/change events.

  return { adapter: id, host, isTopFrame, filled, fields };
}
```

The dry-run and the apply pass run **the same `buildPlan`** logic. The
dry-run report and the apply report are therefore expected to match
under a non-malicious page. If they don't, the page mutated between the
two passes and we abort.

`applyPlan` re-checks each element at apply time (`isConnected`, still
empty) — closing any microtask-scale race inside the same synchronous
execution.

## Security invariants

The threat model expands on these — this is the contributor summary.

1. **Plan, verify, and apply run in a single `chrome.scripting.executeScript`
   invocation per frame.** There is no awaitable boundary between
   verification and mutation.
2. **Generic adapter runs only in the top frame.** Unknown iframes (ads,
   trackers, third-party widgets) cannot match the generic fallback.
3. **ATS adapters are pinned to known TLD+1 suffixes.** Subdomain takeover
   protection: if you fork and add an adapter, do **not** use loose
   patterns like `host.includes("co")`.
4. **Every recipient origin is shown to the user before fill.** The
   consent modal renders host names via `document.createElement` +
   `textContent`. Never serialize host data into `innerHTML`.
5. **Frames that appear after the user consented refuse to fill.** The
   router compares each frame's host against `options.expectedHosts` and
   returns `aborted: host_not_consented` if not on the list.
6. **Only empty inputs are filled.** `tryFill` and `applyPlan` both bail
   if `(el.value || "").trim()` is non-empty.
7. **The fill must not auto-submit the form.** Apply writes values and
   dispatches `input` + `change` events for framework compatibility,
   and stops there. The user clicks submit.
8. **The profile cache lives in `chrome.storage.session`.** Never write
   profile data to `chrome.storage.local` or `IndexedDB`. If you add a
   new cache, ask first.

The `SECURITY.md` *Profile Autofill Threat Model* section is the
authoritative version of this list. Reports that defeat any invariant
are high-severity.

## Add a new fill adapter

Skip this section unless your favourite ATS isn't covered by Greenhouse,
Lever, or Ashby. The bar for adding adapters here is higher than for
extract adapters because each one expands the autofill blast radius.

Open an issue first. Once that's agreed:

1. Create `content/fill/<ats-name>.js` with the IIFE skeleton above.
2. Make `canHandle()` pin to the TLD+1 suffix(es) you trust. Never use
   substring contains without an anchor.
3. Write a `keyForElement(el, ctx)` that prefers stable attributes
   (`el.id`, `el.name`, `data-testid`) and falls back to
   `ctx.inferFieldKey(ctx.describeField(el))`.
4. Push the adapter to `globalThis.__utablyFillRegistry` with priority
   50 (matches the existing ATSes; the top of the registry is reserved).
5. Add the file to `FILL_SCRIPT_FILES` in
   [`background.js`](../background.js) so it gets injected. Order
   matters: `common.js` first, your adapter before `generic.js`,
   `router.js` last.
6. Test against at least one live job posting on that ATS, on a
   logged-out account. Verify the consent modal shows the right host
   and the right fields. Verify that adding a hidden `<input
   name="first_name">` to the page via DevTools between preview and
   apply causes the fill to abort with `PAGE_CHANGED`.

## Things you must not do

These will be rejected at review:

- Filling inputs without going through `runAdapter`.
- Reading `value` from filled inputs after applying. The extension does
  not need to know what it just wrote; reading it back creates a
  reflection sink.
- Using `el.dispatchEvent(new Event("submit"))` or
  `form.requestSubmit()` from a fill adapter. We never submit on the
  user's behalf.
- Persisting profile data in `chrome.storage.local`, `localStorage`,
  `sessionStorage`, `IndexedDB`, or any disk-backed store.
- Adding `host_permissions` for `*.greenhouse.io` etc. The autofill
  flow uses the existing user-gesture `optional_host_permissions` grant
  — site-specific declared permissions would silently scope-creep.
- Removing or weakening the consent modal. If you think the modal is
  too verbose, propose UX changes in an issue; don't bypass it.

## What this is *not*

- **Not a password manager.** The extension never reads or writes
  password fields. Use a real password manager.
- **Not a resume parser for the destination site.** The fields we fill
  are the structured ones that already exist on the form. We don't
  POST a CV PDF.
- **Not a way to apply to many jobs at once.** Each fill requires a
  user gesture (click), a consent, and a confirmation. There is no
  bulk-apply mode and we have no plans to add one.

## Attachment upload

Profile-tab attachment cards (CVs, certificates, references) reuse the
same `chrome.scripting.executeScript` injection surface as the text-field
adapters, but they hand the destination page a real file object rather
than a string value. Three paths, in order of preference:

### 1. Direct file-input injection

[`content/fill/attachments.js`](../content/fill/attachments.js) builds a
`DataTransfer`, calls `dataTransfer.items.add(file)`, and assigns
`input.files = dataTransfer.files` on a matching `<input type="file">`.
A native `change` event is dispatched so React/Vue form bindings pick
the value up. The script picks the file input by visibility, type
filter (`accept="..."` match), and proximity to upload-button text;
ambiguous pages prompt the user to click the target.

### 2. Place mode (synthesized drop)

If no `<input type="file">` matches, the side panel falls back to
[`content/fill/dropmode.js`](../content/fill/dropmode.js). The script:

1. Runs in the **top frame only** and cross-checks `location.hostname`
   against the user-consented host before starting.
2. Highlights every plausible drop target (heuristic-matched dropzone
   `<div>` / `<label>` elements by class, `data-testid`, `aria-*`,
   inner text).
3. Waits up to 60 seconds for the user to click one. ESC cancels.
4. On click, synthesizes a full `dragenter` → `dragover` → `drop` event
   sequence with a `DataTransfer` whose `.files` contains the chosen
   attachment. The page sees the same DOM events it would see from a
   real OS-level drag.

There is no awaitable boundary inside the synthesized sequence; the
events fire in one microtask burst. The user's click is the gesture
that authorizes the drop. Place mode never auto-submits and never
fires `submit` on the surrounding form.

### 3. Download

Every attachment card has a **Download** button that saves the file to
the user's Downloads folder via `chrome.downloads.download` (added
`downloads` permission). Use this when the destination form's upload
UI is broken or unrecognized; the user uploads from disk manually.

### Security invariants

Reuses every invariant from the profile-fill flow, plus:

- **No auto-submit.** Like text fills, attachment uploads only populate
  the input — the user clicks submit.
- **Bytes leave Utably only on consent.** The presigned S3 URL
  (5-minute TTL) is fetched by the service worker after the per-host
  consent modal is confirmed, not before. A 12 MB cap in `runFormFill`
  guards against accidental large-payload transfers.
- **Place mode is top-frame-only.** Sub-frames cannot synthesize drops;
  see [`SECURITY.md`](../SECURITY.md) Invariant 14.
