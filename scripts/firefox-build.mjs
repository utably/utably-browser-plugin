import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { zipDirectory } from "./zip.mjs";

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

  // Firefox has never implemented `externally_connectable`, so the key is
  // dead weight here and trips AMO validation. Consequence: the web app
  // cannot message the extension directly on Firefox.
  delete manifest.externally_connectable;

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
      // Required by AMO for new submissions, and shown to the user at
      // install. `websiteContent` covers the job posting text and URL that
      // go to the Utably API when the user presses Save or FitCheck — the
      // only data this extension transmits on its own behalf. Autofill
      // moves profile fields into third-party forms, but that data comes
      // from Utably and is placed by the user, so it is not collection
      // here. Revisit this if the extension ever sends anything else.
      data_collection_permissions: {
        required: ["websiteContent"],
      },
    },
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  // Package the .xpi. Firefox will load the unpacked directory from
  // about:debugging (you pick its manifest.json), but an .xpi is what you
  // need for AMO, for `web-ext sign`, and for anyone installing from a file.
  const xpiPath = path.join(
    path.dirname(FIREFOX_DIR),
    `${path.basename(FIREFOX_DIR)}-${manifest.version}.xpi`
  );
  const { buffer, fileCount } = await zipDirectory(FIREFOX_DIR);
  await writeFile(xpiPath, buffer);

  console.log(`Firefox build generated at ${FIREFOX_DIR}`);
  console.log(`Firefox XPI packaged at ${xpiPath} (${fileCount} files, ${buffer.length} bytes)`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
