import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { isPasteOnlyHost } from "../popup/pasteOnlyHosts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const blocked = [
  "www.linkedin.com",
  "linkedin.com",
  "de.linkedin.com",
  "www.indeed.com",
  "de.indeed.com",
  "indeed.co.uk",
  "www.glassdoor.com",
  "www.glassdoor.de",
  "glassdoor.co.uk",
  "www.stepstone.de",
  "stepstone.com",
  "www.stepstone.at",
  "www.xing.com",
  "xing.com",
];

const allowed = [
  "jobs.google.com",
  "www.ziprecruiter.com",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "www.monster.com",
  "notlinkedin.com",
  "indeednot.com",
  "example.com",
];

test("isPasteOnlyHost blocks Indeed, Glassdoor, LinkedIn, StepStone and XING", () => {
  for (const host of blocked) {
    assert.equal(isPasteOnlyHost(host), true, host);
  }
});

test("isPasteOnlyHost allows other job boards", () => {
  for (const host of allowed) {
    assert.equal(isPasteOnlyHost(host), false, host);
  }
  assert.equal(isPasteOnlyHost(""), false);
  assert.equal(isPasteOnlyHost(null), false);
});

test("webpages/common.js exposes the same isPasteOnlyHost behavior", async () => {
  const source = await readFile(path.join(repoRoot, "webpages", "common.js"), "utf8");
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
  const common = sandbox.__utablyExtractCommon;
  assert.equal(typeof common.isPasteOnlyHost, "function");
  for (const host of blocked) {
    assert.equal(common.isPasteOnlyHost(host), true, host);
  }
  for (const host of allowed) {
    assert.equal(common.isPasteOnlyHost(host), false, host);
  }
});

test("router.js returns paste-only without calling adapters on blocked hosts", async () => {
  const source = await readFile(path.join(repoRoot, "webpages", "router.js"), "utf8");
  let extractCalled = false;
  const sandbox = {
    location: { hostname: "www.indeed.com", href: "https://www.indeed.com/viewjob?jk=1" },
  };
  sandbox.globalThis = sandbox;
  sandbox.__utablyExtractCommon = { isPasteOnlyHost };
  sandbox.__utablyExtractorRegistry = [
    {
      id: "indeed",
      priority: 80,
      canHandle: () => true,
      extract: async () => {
        extractCalled = true;
        return { title: "should not run", description: "leaked" };
      },
    },
  ];
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const result = await sandbox.__utablyRunExtract();
  assert.equal(extractCalled, false, "no adapter may read the DOM on a paste-only host");
  assert.equal(result.pasteOnly, true);
  assert.equal(result.adapter, "paste-only");
  assert.equal(result.title, "");
  assert.equal(result.description, "");
});
