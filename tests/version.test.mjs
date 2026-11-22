// Version rules (scripts/version.mjs): the next version continues from the
// highest version_X.Y.Z tag; commit markers pick the bump.

import { test } from "node:test";
import assert from "node:assert/strict";

import { bumpFromMessages, latestReleaseTag, nextVersion, resolveBuildVersion } from "../scripts/version.mjs";

test("latest tag is picked by number, not by text", () => {
  assert.equal(latestReleaseTag(["version_0.9.0", "version_0.10.0", "version_0.2.11"]), "version_0.10.0");
});

test("tags of another shape are ignored", () => {
  assert.equal(latestReleaseTag(["v1.0.0", "version_1.0", "version_0.18.2-rc1", "version_0.18.2", ""]), "version_0.18.2");
  assert.equal(latestReleaseTag(["v1.0.0"]), null);
});

test("no marker is a patch", () => {
  assert.deepEqual(nextVersion("0.18.2", ["Fix the popup width"]), {
    version: "0.18.3",
    bump: "patch",
    forcedBy: null,
  });
});

test("[minor] and [major] reset the lower parts", () => {
  assert.equal(nextVersion("0.18.2", ["Attachments view [minor]"]).version, "0.19.0");
  assert.equal(nextVersion("0.18.2", ["New sign-in [major]"]).version, "1.0.0");
});

test("the highest marker wins, wherever it sits", () => {
  const messages = ["a [minor]", "Merge pull request #7\n\nbody with [major] inside", "b [minor]"];
  assert.equal(nextVersion("1.4.9", messages).version, "2.0.0");
});

test("an override beats the markers, and the newest override wins", () => {
  assert.deepEqual(bumpFromMessages(["x [major]", "y [!minor]"]), { bump: "minor", forcedBy: "[!minor]" });
  assert.deepEqual(bumpFromMessages(["x [!major]", "y [!PATCH]"]), { bump: "patch", forcedBy: "[!patch]" });
  assert.deepEqual(bumpFromMessages(["x [minor]", "y [!]"]), { bump: "patch", forcedBy: "[!]" });
});

test("an unknown override is ignored", () => {
  assert.deepEqual(bumpFromMessages(["x [minor]", "y [!huge]"]), { bump: "minor", forcedBy: null });
});

test("the build takes the version the release workflow passes in", () => {
  assert.equal(resolveBuildVersion({ env: { UTABLY_PLUGIN_VERSION: "0.18.3" } }), "0.18.3");
  assert.throws(() => resolveBuildVersion({ env: { UTABLY_PLUGIN_VERSION: "version_0.18.3" } }), /1\.2\.3/);
});

test("without git history the build falls back", () => {
  assert.equal(resolveBuildVersion({ env: {}, cwd: "/", fallback: "0.0.0" }), "0.0.0");
});
