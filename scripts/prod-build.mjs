// Produces a production-only variant of the extension under dist/prod/.
// Strips debug-only features:
//   - removes dev/test entries from manifest.json (host_permissions, externally_connectable)
//   - removes the Debug Mode UI (settings panel, stage selector, local port) from popup.html
//   - removes console.log / console.debug / console.info statements from JS files
//   - copies the result into dist/prod/utably-browser-plugin-chrome-edge
// Then re-runs the firefox and safari transforms against the prod chrome-edge build.

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const DEV_CHROME_EDGE_DIR = path.join(projectRoot, "dist", "utably-browser-plugin-chrome-edge");
const PROD_DIR = path.join(projectRoot, "dist", "prod");
const PROD_CHROME_EDGE_DIR = path.join(PROD_DIR, "utably-browser-plugin-chrome-edge");
const PROD_FIREFOX_DIR = path.join(PROD_DIR, "utably-browser-plugin-firefox");
const PROD_SAFARI_DIR = path.join(PROD_DIR, "utably-browser-plugin-safari");

const DEV_HOST_PATTERNS = [
  /^https?:\/\/(api|app)\.dev\.utably\.com\/?\*?$/,
  /^https?:\/\/(api|app)\.test\.utably\.com\/?\*?$/,
];

function isDevHostEntry(entry) {
  return DEV_HOST_PATTERNS.some((re) => re.test(entry));
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function transformManifest() {
  const manifestPath = path.join(PROD_CHROME_EDGE_DIR, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  // Prod build ships under the clean public name.
  manifest.name = "Utably Job Importer";

  if (Array.isArray(manifest.host_permissions)) {
    manifest.host_permissions = manifest.host_permissions.filter((h) => !isDevHostEntry(h));
  }
  if (manifest.externally_connectable && Array.isArray(manifest.externally_connectable.matches)) {
    manifest.externally_connectable.matches = manifest.externally_connectable.matches.filter(
      (h) => !isDevHostEntry(h)
    );
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function transformPopupHtml() {
  const popupPath = path.join(PROD_CHROME_EDGE_DIR, "popup.html");
  let html = await readFile(popupPath, "utf8");

  // IMPORTANT: do not remove #toggleSettings or #settings from the DOM.
  // popup.js looks them up in dom.js and binds listeners; if they are gone,
  // `els.toggleSettings.addEventListener` throws and the entire popup init
  // halts (no Privacy / Connect / Logout handlers wired).
  //
  // Instead, hide the toggle button and the settings panel via inline
  // styles so they exist in the DOM but cannot be reached by the user.
  html = html.replace(
    /<button id="toggleSettings" class="link">/,
    '<button id="toggleSettings" class="link" style="display:none !important">'
  );
  html = html.replace(
    /<div id="settings" class="panel hidden">/,
    '<div id="settings" class="panel hidden" style="display:none !important">'
  );

  await writeFile(popupPath, html, "utf8");
}

async function walkJsFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkJsFiles(full)));
    } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
      out.push(full);
    }
  }
  return out;
}

function stripConsoleLogs(source) {
  // Removes statements like: console.log(...); console.debug(...); console.info(...);
  // Conservatively matches a single statement on one logical line. Multi-line calls
  // are matched via a balanced-paren regex up to the closing );
  return source.replace(
    /(^|[\s;{}])console\.(log|debug|info)\s*\([^;]*?\);?/gm,
    (_match, prefix) => prefix
  );
}

async function stripConsoleFromJsFiles() {
  const files = await walkJsFiles(PROD_CHROME_EDGE_DIR);
  for (const file of files) {
    const original = await readFile(file, "utf8");
    const stripped = stripConsoleLogs(original);
    if (stripped !== original) {
      await writeFile(file, stripped, "utf8");
    }
  }
}

function runNode(scriptRelPath, env) {
  const result = spawnSync(
    process.execPath,
    [path.join(projectRoot, scriptRelPath), ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, ...env },
    }
  );
  if (result.status !== 0) {
    throw new Error(`${scriptRelPath} failed with exit code ${result.status}`);
  }
}

async function main() {
  if (!(await pathExists(DEV_CHROME_EDGE_DIR))) {
    throw new Error(
      `Expected ${DEV_CHROME_EDGE_DIR} to exist. Run 'npm run build:chrome' first.`
    );
  }

  await rm(PROD_DIR, { recursive: true, force: true });
  await mkdir(PROD_CHROME_EDGE_DIR, { recursive: true });
  await cp(DEV_CHROME_EDGE_DIR, PROD_CHROME_EDGE_DIR, { recursive: true });

  await transformManifest();
  await transformPopupHtml();
  await stripConsoleFromJsFiles();

  console.log(`Built prod Chrome+Edge extension at ${PROD_CHROME_EDGE_DIR}`);

  runNode("scripts/firefox-build.mjs", {
    UTABLY_SOURCE_DIR: PROD_CHROME_EDGE_DIR,
    UTABLY_OUT_DIR: PROD_FIREFOX_DIR,
  });

  runNode("scripts/safari-convert.mjs", {
    UTABLY_SOURCE_DIR: PROD_CHROME_EDGE_DIR,
    UTABLY_OUT_DIR: PROD_SAFARI_DIR,
    UTABLY_SAFARI_TMP: path.join(projectRoot, ".tmp", "safari-prod-dist"),
  });
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
