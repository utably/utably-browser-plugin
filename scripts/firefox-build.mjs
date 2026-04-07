import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const CHROME_EDGE_DIR = process.env.UTABLY_SOURCE_DIR
  ? path.resolve(process.env.UTABLY_SOURCE_DIR)
  : path.join(projectRoot, "dist", "utably-browser-plugin-chrome-edge");
const FIREFOX_DIR = process.env.UTABLY_OUT_DIR
  ? path.resolve(process.env.UTABLY_OUT_DIR)
  : path.join(projectRoot, "dist", "utably-browser-plugin-firefox");
const DEFAULT_GECKO_ID = "utably-job-importer@utably.com";

function getArgValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

async function main() {
  const geckoId = getArgValue("--gecko-id", DEFAULT_GECKO_ID);

  await rm(FIREFOX_DIR, { recursive: true, force: true });
  await mkdir(FIREFOX_DIR, { recursive: true });
  await cp(CHROME_EDGE_DIR, FIREFOX_DIR, { recursive: true });

  const manifestPath = path.join(FIREFOX_DIR, "manifest.json");
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
    const workerFile = typeof manifest.background.service_worker === "string" ? manifest.background.service_worker : "";
    manifest.background = {
      scripts: [workerFile || "background.js"],
    };
  }

  manifest.browser_specific_settings = {
    ...(manifest.browser_specific_settings && typeof manifest.browser_specific_settings === "object"
      ? manifest.browser_specific_settings
      : {}),
    gecko: {
      ...((manifest.browser_specific_settings &&
        manifest.browser_specific_settings.gecko &&
        typeof manifest.browser_specific_settings.gecko === "object"
        ? manifest.browser_specific_settings.gecko
        : {})),
      id: geckoId,
    },
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Firefox build generated at ${FIREFOX_DIR}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
