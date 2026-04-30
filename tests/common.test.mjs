// Unit tests for webpages/common.js helpers.
//
// common.js is wrapped in an IIFE that attaches its helpers onto
// `globalThis.__utablyExtractCommon`. It also references `document`
// for the DOM helpers (queryFirstText, metaValue, waitForText), which
// we don't have in Node — so we stub a minimal `document` and run the
// IIFE inside a Node vm sandbox. After that, the pure helpers
// (normalize, sanitizeText, cleanTitle) are reachable via
// `__utablyExtractCommon` and can be exercised directly.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

let common;

before(async () => {
  const source = await readFile(path.join(repoRoot, "webpages", "common.js"), "utf8");

  // Minimal DOM stub. None of the pure helpers we test need a real DOM,
  // but common.js defines queryFirstText/metaValue/waitForText which
  // touch `document` and `MutationObserver` at call time. We only need
  // these to not throw at *definition* time — which they don't, since
  // they reference `document` inside function bodies — but the IIFE
  // does touch `globalThis` and the sandbox needs it.
  const sandbox = {
    document: { querySelector: () => null, body: { innerText: "" } },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    Promise: globalThis.Promise,
    RegExp: globalThis.RegExp,
    String: globalThis.String,
    Boolean: globalThis.Boolean,
    Array: globalThis.Array,
    Object: globalThis.Object,
    Error: globalThis.Error,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  common = sandbox.__utablyExtractCommon;
  assert.ok(common, "common.js should expose __utablyExtractCommon on globalThis");
});

test("normalize collapses whitespace and trims", () => {
  assert.equal(common.normalize("  hello   world  "), "hello world");
  assert.equal(common.normalize("line1\n\n\nline2"), "line1 line2");
  assert.equal(common.normalize("\t tabs\t and   spaces "), "tabs and spaces");
});

test("normalize tolerates null and undefined", () => {
  assert.equal(common.normalize(null), "");
  assert.equal(common.normalize(undefined), "");
  assert.equal(common.normalize(""), "");
});

test("sanitizeText strips cookie and boilerplate lines", () => {
  // Matches the boilerplate regexes in webpages/common.js:
  //   - /\b(accept|reject|manage|use of)\s+cookies?\b/i
  //   - /\bcookie\s+(policy|settings|preferences|notice|consent)\b/i
  //   - /privacy policy/i
  //   - /terms of (use|service)/i
  //   - /sign in/i
  //   - /create account/i
  //   - /skip to main/i
  //   - /copyright/i
  //   - /all rights reserved/i
  const input = [
    "About the role",
    "Accept cookies",
    "Cookie Policy",
    "Privacy Policy",
    "Terms of Service",
    "Real job description content goes here.",
    "Sign in",
    "Create Account",
    "Copyright © 2025",
    "All Rights Reserved",
    "Another real paragraph.",
  ].join("\n");

  const output = common.sanitizeText(input);
  assert.match(output, /About the role/);
  assert.match(output, /Real job description content goes here\./);
  assert.match(output, /Another real paragraph\./);
  assert.doesNotMatch(output, /Accept cookies/i);
  assert.doesNotMatch(output, /Cookie Policy/i);
  assert.doesNotMatch(output, /Privacy Policy/i);
  assert.doesNotMatch(output, /Terms of Service/i);
  assert.doesNotMatch(output, /Sign in/i);
  assert.doesNotMatch(output, /Create Account/i);
  assert.doesNotMatch(output, /Copyright/i);
  assert.doesNotMatch(output, /All Rights Reserved/i);
});

test("sanitizeText respects the maxLen cap", () => {
  const long = "a".repeat(30000);
  assert.equal(common.sanitizeText(long).length, 20000);
  assert.equal(common.sanitizeText(long, 500).length, 500);
});

test("sanitizeText handles empty and null input", () => {
  assert.equal(common.sanitizeText(""), "");
  assert.equal(common.sanitizeText(null), "");
  assert.equal(common.sanitizeText(undefined), "");
});

test("cleanTitle strips common separators to the first segment", () => {
  assert.equal(common.cleanTitle("Senior Engineer | Acme Corp"), "Senior Engineer");
  assert.equal(common.cleanTitle("Senior Engineer - Acme Corp"), "Senior Engineer");
  assert.equal(common.cleanTitle("Senior Engineer — Acme Corp"), "Senior Engineer");
  assert.equal(common.cleanTitle("Senior Engineer · Acme Corp"), "Senior Engineer");
});

test("cleanTitle strips 'at Company' suffix when company is known", () => {
  assert.equal(
    common.cleanTitle("Senior Engineer at Acme Corp", "Acme Corp"),
    "Senior Engineer"
  );
  assert.equal(
    common.cleanTitle("Senior Engineer at Acme Corp", "Acme"),
    "Senior Engineer at Acme Corp",
    "partial company match should not match"
  );
});

test("cleanTitle does not truncate to impossibly short fragments", () => {
  // If the split would leave a fragment shorter than 4 chars, keep the original.
  assert.equal(common.cleanTitle("Eng - Acme Corp"), "Eng - Acme Corp");
});

test("cleanTitle handles empty/null input safely", () => {
  assert.equal(common.cleanTitle(""), "");
  assert.equal(common.cleanTitle(null), "");
  assert.equal(common.cleanTitle(undefined), "");
});

test("cleanTitle escapes regex metacharacters in the company name", () => {
  // A company name with regex-special chars must not throw or match wrongly.
  assert.doesNotThrow(() => common.cleanTitle("Engineer at A.B+Co", "A.B+Co"));
  assert.equal(common.cleanTitle("Engineer at A.B+Co", "A.B+Co"), "Engineer");
});
