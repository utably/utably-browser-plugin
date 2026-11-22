// Computes the extension version from git, the same way the Utably app does
// (apputably scripts/compute-version.sh).
//
// Version = MAJOR.MINOR.PATCH continuing from the highest `version_X.Y.Z` tag.
// Put [minor] or [major] in ANY commit message since that tag to raise the
// bump; otherwise the next release is a patch. The HIGHEST marker wins, so one
// [major] among several [minor]s yields a major.
//
// Escape hatch: [!major] / [!minor] / [!patch] (or bare [!]) FORCE that level.
// Among overrides the LAST one wins, so a later correction supersedes an
// earlier one.
//
// A commit that already carries the highest tag IS that release, so it keeps
// the tag's version instead of bumping past it.
//
// manifest.json and package.json carry the placeholder 0.0.0; the build stamps
// the computed version into the built manifest (scripts/build.mjs).
//
// CLI:
//   node scripts/version.mjs            prints the version
//   node scripts/version.mjs --strict   also fails on a shallow checkout,
//                                       where the scan would be incomplete,
//                                       and writes version/tag to $GITHUB_OUTPUT

import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const TAG_PREFIX = "version_";
export const PLACEHOLDER_VERSION = "0.0.0";

const TAG_PATTERN = /^version_(\d+)\.(\d+)\.(\d+)$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** Highest `version_X.Y.Z` tag by numeric order ("0.10.0" beats "0.9.0"), or null. */
export function latestReleaseTag(tags) {
  let best = null;
  for (const tag of tags) {
    const match = TAG_PATTERN.exec(String(tag).trim());
    if (!match) continue;
    const parts = match.slice(1).map(Number);
    if (!best || compareParts(parts, best.parts) > 0) best = { tag: match[0], parts };
  }
  return best ? best.tag : null;
}

function compareParts(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * The bump the commit messages ask for. `messages` are ordered oldest first,
 * so the last override found is the newest one.
 */
export function bumpFromMessages(messages) {
  const text = messages.join("\n");
  const overrides = text.match(/\[![a-z]*\]/gi) || [];
  const override = overrides.length ? overrides[overrides.length - 1].toLowerCase() : "";
  if (override === "[!major]") return { bump: "major", forcedBy: override };
  if (override === "[!minor]") return { bump: "minor", forcedBy: override };
  if (override === "[!patch]" || override === "[!]") return { bump: "patch", forcedBy: override };

  if (text.includes("[major]")) return { bump: "major", forcedBy: null };
  if (text.includes("[minor]")) return { bump: "minor", forcedBy: null };
  return { bump: "patch", forcedBy: null };
}

/** `previous` is "X.Y.Z"; returns the next version for the given commit messages. */
export function nextVersion(previous, messages) {
  const [major, minor, patch] = previous.split(".").map(Number);
  const { bump, forcedBy } = bumpFromMessages(messages);
  let version;
  if (bump === "major") version = `${major + 1}.0.0`;
  else if (bump === "minor") version = `${major}.${minor + 1}.0`;
  else version = `${major}.${minor}.${patch + 1}`;
  return { version, bump, forcedBy };
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

/**
 * Reads tags and commit messages from the repository at `cwd`.
 * Returns null when git or the repository is unavailable.
 */
export function computeVersion(cwd = projectRoot) {
  const tagList = git(["tag", "-l", `${TAG_PREFIX}*`], cwd);
  if (tagList === null) return null;

  const shallow = (git(["rev-parse", "--is-shallow-repository"], cwd) || "").trim() === "true";
  const latestTag = latestReleaseTag(tagList.split("\n"));
  const previous = latestTag ? latestTag.slice(TAG_PREFIX.length) : PLACEHOLDER_VERSION;
  const range = latestTag ? `${latestTag}..HEAD` : "HEAD";

  // %x00 separates commits, so a blank line inside a message stays inside it.
  const log = git(["log", range, "--reverse", "--pretty=%B%x00"], cwd);
  if (log === null) return null;
  const messages = log.split("\0").map((m) => m.trim()).filter(Boolean);

  if (latestTag && messages.length === 0) {
    return { version: previous, previous, bump: "none", forcedBy: null, commits: 0, latestTag, shallow };
  }
  return { ...nextVersion(previous, messages), previous, commits: messages.length, latestTag, shallow };
}

/**
 * The version a build stamps into the manifest: $UTABLY_PLUGIN_VERSION when
 * set (the release workflow passes the value it tags with), else the version
 * computed from git, else `fallback` (a source copy without git history).
 */
export function resolveBuildVersion({ env = process.env, cwd = projectRoot, fallback = PLACEHOLDER_VERSION } = {}) {
  const fromEnv = (env.UTABLY_PLUGIN_VERSION || "").trim();
  if (fromEnv) {
    if (!VERSION_PATTERN.test(fromEnv)) {
      throw new Error(`UTABLY_PLUGIN_VERSION must look like 1.2.3 (got '${fromEnv}')`);
    }
    return fromEnv;
  }
  const computed = computeVersion(cwd);
  return computed ? computed.version : fallback;
}

function main() {
  const strict = process.argv.includes("--strict");
  const computed = computeVersion();
  if (!computed) {
    console.error("Could not read the git history, so no version was computed.");
    process.exit(1);
  }
  if (strict && computed.shallow) {
    console.error("Shallow checkout: the bump scan would be incomplete. Check out with fetch-depth: 0.");
    process.exit(1);
  }

  const detail = computed.forcedBy ? `${computed.bump}, forced by ${computed.forcedBy}` : computed.bump;
  console.error(
    `Bump: ${detail} (${computed.commits} commit(s) since ${computed.latestTag || "the first commit"})`
  );
  console.log(computed.version);

  if (strict && process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${computed.version}\ntag=${TAG_PREFIX}${computed.version}\n`
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
