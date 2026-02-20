import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const CHROME_EDGE_DIR = path.join(projectRoot, "dist", "utably-browser-plugin-chrome-edge");
const SAFARI_INPUT_DIR = path.join(projectRoot, ".tmp", "safari-dist");
const DEFAULT_PROJECT_LOCATION = path.join(projectRoot, "dist", "utably-browser-plugin-safari");
const DEFAULT_APP_NAME = "Utably Job Importer";
const DEFAULT_BUNDLE_ID = "com.utably.importer";

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
}

function runConverter({ projectLocation, appName, bundleId }) {
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
  ];

  const result = spawnSync("xcrun", args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Converter failed with exit code ${result.status}.`);
  }
}

function isConverterAvailable() {
  const result = spawnSync("xcrun", ["--find", "safari-web-extension-converter"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  return result.status === 0;
}

async function main() {
  const projectLocation = path.resolve(getArgValue("--project-location", DEFAULT_PROJECT_LOCATION));
  const appName = getArgValue("--app-name", DEFAULT_APP_NAME);
  const bundleId = getArgValue("--bundle-identifier", DEFAULT_BUNDLE_ID);
  const optional = hasFlag("--optional");

  if (!isConverterAvailable()) {
    if (optional) {
      console.log("Skipping Safari conversion: safari-web-extension-converter is not available on this machine.");
      return;
    }
    throw new Error('Missing converter. Install Xcode Command Line Tools so "xcrun safari-web-extension-converter" is available.');
  }

  await createSafariInput();
  await mkdir(projectLocation, { recursive: true });
  runConverter({ projectLocation, appName, bundleId });

  console.log(`Safari project generated at ${projectLocation}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
