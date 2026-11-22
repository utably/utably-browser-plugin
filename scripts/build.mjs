import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveBuildVersion } from './version.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');
const distDir = path.join(extensionRoot, 'dist');
const chromeEdgeDir = path.join(distDir, 'utably-browser-plugin-chrome-edge');

const runtimePaths = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'popup',
  'webpages',
  'content',
  'assets',
  'icons'
];

async function ensureRuntimePath(relPath) {
  const fullPath = path.join(extensionRoot, relPath);
  try {
    await stat(fullPath);
  } catch {
    throw new Error(`Missing runtime path: ${relPath}`);
  }
}

async function copyRuntimePath(relPath) {
  const src = path.join(extensionRoot, relPath);
  const dst = path.join(chromeEdgeDir, relPath);
  await cp(src, dst, { recursive: true });
}

// The source manifest carries the placeholder 0.0.0. The built manifest gets
// the version computed from git (scripts/version.mjs); the Firefox, Safari and
// prod builds all start from this output, so they carry the same version.
//
// The name is decorated so sideloaded dev builds are visibly distinct from the
// Chrome Web Store release ("Utably Job Importer"). prod-build.mjs overwrites
// it back to the clean name for store builds.
async function stampDevManifest() {
  const manifestPath = path.join(chromeEdgeDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = resolveBuildVersion({ fallback: manifest.version });
  manifest.name = `${manifest.name} (Dev ${manifest.version})`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest.version;
}

async function main() {
  for (const runtimePath of runtimePaths) {
    await ensureRuntimePath(runtimePath);
  }

  await rm(distDir, { recursive: true, force: true });
  await mkdir(chromeEdgeDir, { recursive: true });

  for (const runtimePath of runtimePaths) {
    await copyRuntimePath(runtimePath);
  }

  const version = await stampDevManifest();

  console.log(`Built Chrome+Edge extension ${version} at ${chromeEdgeDir}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
