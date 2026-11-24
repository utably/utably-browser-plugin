import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const CHROME_EDGE_DIR = process.env.UTABLY_SOURCE_DIR
  ? path.resolve(process.env.UTABLY_SOURCE_DIR)
  : path.join(projectRoot, "dist", "utably-browser-plugin-chrome-edge");
const SAFARI_INPUT_DIR = process.env.UTABLY_SAFARI_TMP
  ? path.resolve(process.env.UTABLY_SAFARI_TMP)
  : path.join(projectRoot, ".tmp", "safari-dist");
const DEFAULT_PROJECT_LOCATION = process.env.UTABLY_OUT_DIR
  ? path.resolve(process.env.UTABLY_OUT_DIR)
  : path.join(projectRoot, "dist", "utably-browser-plugin-safari");
const DEFAULT_APP_NAME = "Utably Job Importer";
const DEFAULT_BUNDLE_ID = "com.utably.importer";
// The converter ships only with full Xcode. When xcode-select points at the
// standalone Command Line Tools, fall back to Xcode in its default location.
const FALLBACK_DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer";

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function createSafariInput() {
  await rm(SAFARI_INPUT_DIR, { recursive: true, force: true });
  await mkdir(SAFARI_INPUT_DIR, { recursive: true });
  await cp(CHROME_EDGE_DIR, SAFARI_INPUT_DIR, { recursive: true });

  const manifestPath = path.join(SAFARI_INPUT_DIR, "manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);

  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  manifest.permissions = permissions.filter((permission) => permission !== "sidePanel");
  delete manifest.side_panel;
  manifest.action = {
    ...(manifest.action && typeof manifest.action === "object" ? manifest.action : {}),
    default_popup: "popup.html",
  };
  if (manifest.background && typeof manifest.background === "object") {
    delete manifest.background.type;
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest.version;
}

// The converter hardcodes MARKETING_VERSION 1.0; stamp the extension's
// version so the Xcode project matches the Chrome and Firefox builds.
// Handles both project formats: project.pbxproj (`KEY = value;`) and the
// newer project.xcproj (`"KEY": "value"`).
async function stampProjectVersion(projectLocation, version) {
  if (!/^\d+(\.\d+){0,2}$/.test(version || "")) return;
  const entries = await readdir(projectLocation, { recursive: true });
  const projectFiles = entries.filter((entry) =>
    /\.xcodeproj[\\/]project\.(pbxproj|xcproj)$/.test(entry)
  );
  let stampedCount = 0;
  for (const relPath of projectFiles) {
    const projectFile = path.join(projectLocation, relPath);
    const raw = await readFile(projectFile, "utf8");
    const stamped = raw
      .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
      .replace(/"MARKETING_VERSION": "[^"]*"/g, `"MARKETING_VERSION": "${version}"`);
    if (stamped !== raw) {
      await writeFile(projectFile, stamped, "utf8");
      stampedCount += 1;
    }
  }
  if (stampedCount === 0) {
    console.warn(`Warning: could not stamp version ${version} into the Xcode project; set it manually.`);
  }
}

function runConverter({ projectLocation, appName, bundleId, env }) {
  const args = [
    "safari-web-extension-converter",
    SAFARI_INPUT_DIR,
    "--project-location",
    projectLocation,
    "--app-name",
    appName,
    "--bundle-identifier",
    bundleId,
    "--no-prompt",
    "--no-open",
    "--force",
    "--copy-resources",
  ];

  const result = spawnSync("xcrun", args, { stdio: "inherit", env });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Converter failed with exit code ${result.status}.`);
  }
}

// Returns the environment to run xcrun with, or null if the converter can't be found.
function resolveConverterEnv() {
  const candidates = [process.env, { ...process.env, DEVELOPER_DIR: FALLBACK_DEVELOPER_DIR }];
  for (const env of candidates) {
    const result = spawnSync("xcrun", ["--find", "safari-web-extension-converter"], {
      stdio: "pipe",
      encoding: "utf8",
      env,
    });
    if (result.status === 0) return env;
  }
  return null;
}

async function main() {
  const projectLocation = path.resolve(getArgValue("--project-location", DEFAULT_PROJECT_LOCATION));
  const appName = getArgValue("--app-name", DEFAULT_APP_NAME);
  const bundleId = getArgValue("--bundle-identifier", DEFAULT_BUNDLE_ID);
  const optional = hasFlag("--optional");

  const env = resolveConverterEnv();
  if (!env) {
    if (optional) {
      console.log("Skipping Safari conversion: safari-web-extension-converter is not available on this machine.");
      return;
    }
    throw new Error('Missing converter. Install Xcode (the standalone Command Line Tools do not include it) so "xcrun safari-web-extension-converter" is available.');
  }

  const version = await createSafariInput();
  await mkdir(projectLocation, { recursive: true });
  runConverter({ projectLocation, appName, bundleId, env });
  await stampProjectVersion(projectLocation, version);

  console.log(`Safari project generated at ${projectLocation}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
