import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function main() {
  for (const runtimePath of runtimePaths) {
    await ensureRuntimePath(runtimePath);
  }

  await rm(distDir, { recursive: true, force: true });
  await mkdir(chromeEdgeDir, { recursive: true });

  for (const runtimePath of runtimePaths) {
    await copyRuntimePath(runtimePath);
  }

  console.log(`Built Chrome+Edge extension at ${chromeEdgeDir}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
