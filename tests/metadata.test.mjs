// Metadata invariants — manifest.json and package.json must stay in sync
// and stay within the declared permission surface.
//
// These tests protect against three common regressions:
//   1. Version drift between package.json and manifest.json (a release
//      tag that doesn't match what the extension actually reports).
//   2. Accidental broadening of host_permissions (e.g. someone adds
//      "<all_urls>" to make local testing easier and forgets).
//   3. The canonical manifest shipping with a dev-only "Dev" suffix in
//      the name field — prod-build strips it, but the canonical source
//      should already be clean.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function readJson(rel) {
  return JSON.parse(await readFile(path.join(repoRoot, rel), "utf8"));
}

test("manifest.json uses Manifest V3", async () => {
  const manifest = await readJson("manifest.json");
  assert.equal(manifest.manifest_version, 3);
});

test("manifest.json ships with a clean, non-dev name", async () => {
  const manifest = await readJson("manifest.json");
  assert.equal(
    manifest.name,
    "Utably Job Importer",
    "Canonical manifest name should be clean; build.mjs appends the dev suffix at build time."
  );
  assert.doesNotMatch(manifest.name, /\bdev\b/i, "Canonical name must not contain 'Dev'");
});

test("manifest.json version matches package.json version", async () => {
  const manifest = await readJson("manifest.json");
  const pkg = await readJson("package.json");
  assert.equal(
    manifest.version,
    pkg.version,
    `manifest.json version (${manifest.version}) must match package.json version (${pkg.version})`
  );
});

test("manifest.json declares all required icon sizes", async () => {
  const manifest = await readJson("manifest.json");
  for (const size of ["16", "32", "48", "128"]) {
    assert.ok(manifest.icons?.[size], `missing icon for size ${size}`);
  }
});

test("manifest.json declares the expected minimal permissions", async () => {
  const manifest = await readJson("manifest.json");
  // `downloads` is required so users can save their own CV/cover-letter/photo
  // back out to disk when a job application form's upload widget rejects the
  // extension's synthesized DataTransfer injection. See docs/fill.md.
  const required = new Set(["activeTab", "scripting", "storage", "sidePanel", "tabs", "downloads"]);
  const actual = new Set(manifest.permissions || []);
  for (const perm of required) {
    assert.ok(actual.has(perm), `missing required permission: ${perm}`);
  }
  // Block permissions that are almost never appropriate and would widen the
  // review surface dramatically.
  const forbidden = [
    "<all_urls>",
    "webRequest",
    "webRequestBlocking",
    "cookies",
    "management",
    "debugger",
    "proxy",
    "privacy",
    "history",
    "bookmarks",
    "nativeMessaging",
  ];
  for (const perm of forbidden) {
    assert.ok(!actual.has(perm), `forbidden permission granted: ${perm}`);
  }
});

test("manifest.json host_permissions are scoped to *.utably.com", async () => {
  const manifest = await readJson("manifest.json");
  const hosts = manifest.host_permissions || [];
  assert.ok(hosts.length > 0, "expected at least one host permission");
  for (const host of hosts) {
    // Allow any subdomain depth under utably.com (api.utably.com,
    // api.dev.utably.com, api.test.utably.com). No wildcards, no
    // other TLDs, no http.
    assert.match(
      host,
      /^https:\/\/[a-z0-9.-]+\.utably\.com\/\*$/,
      `host_permission "${host}" must be an https://<sub>.utably.com/* URL`
    );
  }
  assert.ok(
    hosts.includes("https://api.utably.com/*"),
    "prod api.utably.com host permission is required"
  );
});

test("manifest.json declares optional_host_permissions for runtime broad-host prompt", async () => {
  // The extension requests broad host access at runtime from within a user
  // gesture (first Auto-fill or Capture click), so the field must exist and
  // be exactly ["*://*/*"]. Narrowing it would break the runtime prompt for
  // arbitrary job boards; widening it (e.g. adding file:///*) would expand
  // the review surface without purpose.
  const manifest = await readJson("manifest.json");
  assert.deepEqual(
    manifest.optional_host_permissions,
    ["*://*/*"],
    "optional_host_permissions must be exactly ['*://*/*'] — this is what popup/app.js requests at runtime"
  );
});

test("manifest.json externally_connectable is scoped to *.utably.com", async () => {
  const manifest = await readJson("manifest.json");
  const matches = manifest.externally_connectable?.matches || [];
  assert.ok(matches.length > 0, "expected at least one externally_connectable match");
  for (const match of matches) {
    assert.match(
      match,
      /^https:\/\/[a-z0-9.-]+\.utably\.com\/\*$/,
      `externally_connectable match "${match}" must be an https://<sub>.utably.com/* URL`
    );
  }
});

test("manifest.json background worker is declared as a module", async () => {
  const manifest = await readJson("manifest.json");
  assert.equal(manifest.background?.service_worker, "background.js");
  assert.equal(manifest.background?.type, "module");
});

test("manifest.json declares a side panel entry point", async () => {
  const manifest = await readJson("manifest.json");
  assert.ok(manifest.side_panel?.default_path, "side_panel.default_path is required");
});

test("package.json OSS metadata is correct", async () => {
  const pkg = await readJson("package.json");
  assert.equal(pkg.license, "Apache-2.0", "license must be Apache-2.0");
  assert.equal(pkg.private, false, 'package.json must not be "private: true" for OSS release');
  assert.ok(pkg.repository?.url?.includes("utably-browser-plugin"), "repository.url required");
  assert.ok(pkg.bugs?.url?.includes("utably-browser-plugin"), "bugs.url required");
  assert.match(pkg.engines?.node || "", />=\s*22/, "engines.node must require Node >= 22");
});

// The extension has ONE privacy policy: the main Utably policy's extension
// section (utably/utably-browser-plugin#57). The popup, the README and every
// store listing point at the same URLs; the anchors are the heading slugs of
// the legal Markdown in utably-marketing, so they are pinned here verbatim.
const LEGAL_LINKS = {
  privacy: "https://utably.com/legal/privacy-policy#browser-extension-utably-job-importer",
  terms: "https://utably.com/legal/terms-of-service#5a-browser-extension-utably-job-importer",
  cookie: "https://utably.com/legal/cookie-policy",
  imprint: "https://utably.com/legal/imprint",
};

test("popup.html links the canonical legal pages, nothing else under /legal/", async () => {
  const html = await readFile(path.join(repoRoot, "popup.html"), "utf8");
  for (const [name, url] of Object.entries(LEGAL_LINKS)) {
    assert.ok(html.includes(`href="${url}"`), `popup.html must link the ${name} page at ${url}`);
  }
  const legalHrefs = [...html.matchAll(/href="(https:\/\/utably\.com\/legal\/[^"]*)"/g)].map((m) => m[1]);
  const unexpected = legalHrefs.filter((href) => !Object.values(LEGAL_LINKS).includes(href));
  assert.deepEqual(unexpected, [], "every /legal/ link in the popup must be one of the canonical URLs");
});

test("README and the dev docs name the same privacy policy as the popup", async () => {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
  const dev = await readFile(path.join(repoRoot, "docs/development.md"), "utf8");
  assert.ok(readme.includes(LEGAL_LINKS.privacy));
  assert.ok(dev.includes(LEGAL_LINKS.privacy));
  assert.ok(dev.includes("https://utably.com/legal/privacy-policy`"), "the store field takes the plain policy URL");
});
