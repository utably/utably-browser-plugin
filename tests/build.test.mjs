// Build output tests.
//
// The build system has two variants and they must stay structurally
// distinct:
//
//   - Dev build (scripts/build.mjs): copies files to
//     dist/utably-browser-plugin-chrome-edge/ and decorates the manifest
//     name with "(Dev <version>)" so sideloaded dev instances are
//     visibly distinct from the store release. Dev/test host
//     permissions are preserved so Debug Mode can reach them.
//
//   - Prod build (scripts/prod-build.mjs): reads the dev output, strips
//     dev/test hosts, hides the Debug Mode UI, strips console.log/debug/info
//     from JS files, and writes the result to
//     dist/prod/utably-browser-plugin-chrome-edge/.
//
// These tests execute both builds and assert the invariants. A broken
// prod stripper is a security-adjacent regression — it could ship a
// public extension with dev host permissions enabled — so we verify
// explicitly.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const devDir = path.join(repoRoot, "dist", "utably-browser-plugin-chrome-edge");
const prodDir = path.join(repoRoot, "dist", "prod", "utably-browser-plugin-chrome-edge");

async function readJson(p) {
  return JSON.parse(await readFile(p, "utf8"));
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function runNodeScript(script) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, script), "--optional"], {
    cwd: repoRoot,
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${script} failed with exit code ${result.status}\n` +
        `stdout: ${result.stdout?.toString() || ""}\n` +
        `stderr: ${result.stderr?.toString() || ""}`
    );
  }
}

// Recursively walk a directory, yielding absolute file paths.
async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

before(async () => {
  runNodeScript("scripts/build.mjs");
  runNodeScript("scripts/prod-build.mjs");
  assert.ok(await exists(devDir), "dev build output dir should exist");
  assert.ok(await exists(prodDir), "prod build output dir should exist");
});

test("dev build decorates the manifest name with (Dev <version>)", async () => {
  const manifest = await readJson(path.join(devDir, "manifest.json"));
  const pkg = await readJson(path.join(repoRoot, "package.json"));
  assert.equal(manifest.name, `Utably Job Importer (Dev ${pkg.version})`);
});

test("dev build preserves dev/test host permissions", async () => {
  const manifest = await readJson(path.join(devDir, "manifest.json"));
  assert.ok(
    manifest.host_permissions.includes("https://api.dev.utably.com/*"),
    "dev build should keep api.dev.utably.com"
  );
  assert.ok(
    manifest.host_permissions.includes("https://api.test.utably.com/*"),
    "dev build should keep api.test.utably.com"
  );
});

test("prod build ships the clean public manifest name", async () => {
  const manifest = await readJson(path.join(prodDir, "manifest.json"));
  assert.equal(manifest.name, "Utably Job Importer");
  assert.doesNotMatch(manifest.name, /\bdev\b/i);
});

test("prod build strips dev/test host permissions", async () => {
  const manifest = await readJson(path.join(prodDir, "manifest.json"));
  assert.deepEqual(manifest.host_permissions, ["https://api.utably.com/*"]);
});

test("prod build strips dev/test externally_connectable matches", async () => {
  const manifest = await readJson(path.join(prodDir, "manifest.json"));
  assert.deepEqual(manifest.externally_connectable.matches, ["https://app.utably.com/*"]);
});

test("prod build hides the Debug Mode UI in popup.html", async () => {
  const html = await readFile(path.join(prodDir, "popup.html"), "utf8");
  // The debug UI elements must still be in the DOM (popup.js binds to
  // them) but must be hidden with inline display:none !important.
  assert.match(
    html,
    /<button id="toggleSettings"[^>]*style="display:none !important"/,
    "prod popup.html should hide the settings toggle button"
  );
  assert.match(
    html,
    /<div id="settings"[^>]*style="display:none !important"/,
    "prod popup.html should hide the settings panel"
  );
});

test("prod build strips console.log / console.debug / console.info from JS files", async () => {
  const jsFiles = (await walk(prodDir)).filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
  assert.ok(jsFiles.length > 0, "expected at least one JS file in prod build");
  for (const file of jsFiles) {
    const source = await readFile(file, "utf8");
    const rel = path.relative(prodDir, file);
    assert.ok(
      !/console\.log\s*\(/.test(source),
      `${rel} still contains console.log after prod strip`
    );
    assert.ok(
      !/console\.debug\s*\(/.test(source),
      `${rel} still contains console.debug after prod strip`
    );
    assert.ok(
      !/console\.info\s*\(/.test(source),
      `${rel} still contains console.info after prod strip`
    );
  }
});

test("prod build preserves console.error and console.warn for diagnostics", async () => {
  // We explicitly don't want to strip error/warn — losing those silences
  // the service worker. Sanity-check that at least one survives.
  const jsFiles = (await walk(prodDir)).filter((f) => f.endsWith(".js"));
  let foundErrorOrWarn = false;
  for (const file of jsFiles) {
    const source = await readFile(file, "utf8");
    if (/console\.(error|warn)\s*\(/.test(source)) {
      foundErrorOrWarn = true;
      break;
    }
  }
  assert.ok(
    foundErrorOrWarn,
    "prod build should still contain console.error/console.warn calls for diagnostics"
  );
});

test("dev and prod builds both copy the full runtime surface", async () => {
  const required = [
    "manifest.json",
    "background.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "popup",
    "webpages",
    "content",
    "assets",
    "icons",
  ];
  for (const variant of [devDir, prodDir]) {
    for (const rel of required) {
      assert.ok(
        await exists(path.join(variant, rel)),
        `${path.relative(repoRoot, variant)} is missing required path: ${rel}`
      );
    }
  }
});
