// Adapter registry integrity.
//
// Adapters are the primary contribution surface for this extension, and
// they're also the surface most likely to break quietly — a contributor
// adds a file under webpages/ but forgets to register it in
// popup/config.js's EXTRACTION_SCRIPT_FILES, or registers it in the
// wrong order, or ships an adapter without the required shape.
//
// These tests catch all three classes of bug via static source analysis.
// We deliberately do NOT execute adapter code here: adapters call
// `document.querySelector` etc., which only works in a real DOM. The
// router.js runtime executes them; our job is to check file shape,
// registry parity, and priority sanity.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const webpagesDir = path.join(repoRoot, "webpages");

// common.js and router.js are not adapters — they are infrastructure.
const NON_ADAPTER_FILES = new Set(["common.js", "router.js"]);

async function listAdapterFiles() {
  const entries = await readdir(webpagesDir);
  return entries.filter((f) => f.endsWith(".js") && !NON_ADAPTER_FILES.has(f)).sort();
}

async function readAdapterSource(file) {
  return readFile(path.join(webpagesDir, file), "utf8");
}

// Parse out the `id:` and `priority:` values the adapter registers.
// We use regex rather than a real parser because the adapter shape is
// a simple object literal inside an IIFE.
function parseRegistration(source) {
  const pushMatch = source.match(
    /__utablyExtractorRegistry\.push\s*\(\s*\{([\s\S]*?)\}\s*\)/
  );
  if (!pushMatch) return null;
  const body = pushMatch[1];
  const idMatch = body.match(/\bid\s*:\s*['"]([^'"]+)['"]/);
  const priorityMatch = body.match(/\bpriority\s*:\s*(\d+)/);
  return {
    id: idMatch?.[1] || null,
    priority: priorityMatch ? Number(priorityMatch[1]) : null,
    hasCanHandle: /\bcanHandle\b/.test(body),
    hasExtract: /\bextract\b/.test(body),
  };
}

test("every webpages/*.js adapter is wrapped in an IIFE", async () => {
  const files = await listAdapterFiles();
  assert.ok(files.length > 0, "expected at least one adapter");
  for (const file of files) {
    const source = await readAdapterSource(file);
    assert.match(
      source,
      /^\s*\(\s*\(\s*\)\s*=>\s*\{/,
      `${file} must start with an IIFE "(() => {"`
    );
    assert.match(source, /\}\s*\)\s*\(\s*\)\s*;?\s*$/, `${file} must end with "})();"`);
  }
});

test("every adapter registers itself on the extractor registry", async () => {
  const files = await listAdapterFiles();
  for (const file of files) {
    const source = await readAdapterSource(file);
    const registration = parseRegistration(source);
    assert.ok(registration, `${file} must call __utablyExtractorRegistry.push({...})`);
    assert.ok(registration.id, `${file} must declare an id`);
    assert.ok(
      typeof registration.priority === "number" && Number.isFinite(registration.priority),
      `${file} must declare a numeric priority`
    );
    assert.ok(registration.hasCanHandle, `${file} must declare canHandle`);
    assert.ok(registration.hasExtract, `${file} must declare extract`);
  }
});

test("adapter ids are unique", async () => {
  const files = await listAdapterFiles();
  const seen = new Map();
  for (const file of files) {
    const source = await readAdapterSource(file);
    const { id } = parseRegistration(source) || {};
    if (!id) continue;
    assert.ok(
      !seen.has(id),
      `adapter id "${id}" is used by both ${seen.get(id)} and ${file}`
    );
    seen.set(id, file);
  }
});

test("adapter priorities are within a sane range", async () => {
  const files = await listAdapterFiles();
  for (const file of files) {
    const source = await readAdapterSource(file);
    const { id, priority } = parseRegistration(source) || {};
    if (priority == null) continue;
    // Priorities must be non-negative integers <= 100. Priority 10 is
    // reserved for the generic fallback (see dedicated test below);
    // everything else must be strictly greater so the fallback always
    // loses to a real adapter that can handle the page.
    assert.ok(
      Number.isInteger(priority) && priority >= 0 && priority <= 100,
      `${file} (id=${id}) has out-of-range priority ${priority}; allowed: integer in [0, 100]`
    );
    if (id !== "generic") {
      assert.ok(
        priority > 10,
        `${file} (id=${id}) must have priority > 10 so the generic fallback loses to it`
      );
    }
  }
});

test("the generic fallback has the lowest priority", async () => {
  const source = await readAdapterSource("generic.js");
  const { id, priority } = parseRegistration(source) || {};
  assert.equal(id, "generic", "generic.js must register id 'generic'");
  assert.equal(priority, 10, "generic.js must have priority 10");

  // Also verify it's the only priority-10 adapter.
  const files = await listAdapterFiles();
  const tens = [];
  for (const file of files) {
    const src = await readAdapterSource(file);
    const p = parseRegistration(src)?.priority;
    if (p === 10) tens.push(file);
  }
  assert.deepEqual(tens, ["generic.js"], "only generic.js may use priority 10");
});

test("popup/config.js EXTRACTION_SCRIPT_FILES lists every adapter file", async () => {
  const adapterFiles = await listAdapterFiles();
  const configSource = await readFile(path.join(repoRoot, "popup", "config.js"), "utf8");
  const arrayMatch = configSource.match(/EXTRACTION_SCRIPT_FILES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(arrayMatch, "EXTRACTION_SCRIPT_FILES array not found in popup/config.js");
  const listed = [...arrayMatch[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);

  // common.js must be first (initializes the registry global).
  assert.equal(
    listed[0],
    "webpages/common.js",
    "webpages/common.js must be listed first in EXTRACTION_SCRIPT_FILES"
  );
  // router.js must be last (consumes the registry).
  assert.equal(
    listed[listed.length - 1],
    "webpages/router.js",
    "webpages/router.js must be listed last in EXTRACTION_SCRIPT_FILES"
  );

  // Every adapter file on disk must be listed.
  const listedSet = new Set(listed);
  for (const file of adapterFiles) {
    assert.ok(
      listedSet.has(`webpages/${file}`),
      `webpages/${file} exists on disk but is not in EXTRACTION_SCRIPT_FILES`
    );
  }
  // No file in the list should be missing from disk.
  for (const entry of listed) {
    if (!entry.startsWith("webpages/")) continue;
    const base = entry.slice("webpages/".length);
    if (NON_ADAPTER_FILES.has(base)) continue;
    assert.ok(
      adapterFiles.includes(base),
      `${entry} is listed in EXTRACTION_SCRIPT_FILES but does not exist on disk`
    );
  }
});

test("adapters do not introduce new fetch() calls", async () => {
  // Adapters are supposed to read the DOM only. A stray fetch() would
  // exfiltrate data without going through background.js — which is
  // explicitly forbidden by CONTRIBUTING.md.
  const files = await listAdapterFiles();
  for (const file of files) {
    const source = await readAdapterSource(file);
    // Strip comments and strings before checking, to avoid false positives.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
    assert.ok(
      !/\bfetch\s*\(/.test(stripped),
      `${file} contains a fetch() call — adapters must not make network requests`
    );
    assert.ok(
      !/\bXMLHttpRequest\b/.test(stripped),
      `${file} uses XMLHttpRequest — adapters must not make network requests`
    );
  }
});
