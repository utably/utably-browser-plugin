// Unit tests for popup/company.js — the pure helpers behind the company
// typeahead and the cache-only company logos.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cleanCompanyDomain,
  companyLogoUrl,
  domainForCompanyValue,
  normalizeCompanyQuery,
  normalizeCompanySuggestions,
  takeNamesToResolve,
  companyMatchKey,
  matchingCompanySuggestion,
} from "../popup/company.js";

test("normalizeCompanyQuery needs at least two characters after trimming", () => {
  assert.equal(normalizeCompanyQuery(""), "");
  assert.equal(normalizeCompanyQuery("  U "), "");
  assert.equal(normalizeCompanyQuery("  Ut  "), "Ut");
  assert.equal(normalizeCompanyQuery("Utably   GmbH"), "Utably GmbH");
  assert.equal(normalizeCompanyQuery(null), "");
});

test("cleanCompanyDomain reduces input to a bare host or nothing", () => {
  assert.equal(cleanCompanyDomain("utably.com"), "utably.com");
  assert.equal(cleanCompanyDomain("https://www.Utably.com/jobs?x=1"), "utably.com");
  assert.equal(cleanCompanyDomain("app.utably.com:443"), "app.utably.com");
  assert.equal(cleanCompanyDomain("utably"), "");
  assert.equal(cleanCompanyDomain("utably.com\"><script>"), "");
  assert.equal(cleanCompanyDomain("a b.com"), "");
  assert.equal(cleanCompanyDomain(undefined), "");
});

test("companyLogoUrl always asks the cache only", () => {
  const url = companyLogoUrl("https://api.utably.com/", "https://www.utably.com");
  assert.equal(url, "https://api.utably.com/openDataProxy/favicon?domain=utably.com&src=cache");
  assert.equal(companyLogoUrl("", "utably.com"), "");
  assert.equal(companyLogoUrl("https://api.utably.com", "not a domain"), "");
});

test("domainForCompanyValue keeps the domain only while the text equals the pick", () => {
  const pick = { name: "Utably", domain: "utably.com" };
  assert.equal(domainForCompanyValue("Utably", pick), "utably.com");
  assert.equal(domainForCompanyValue("  Utably  ", pick), "utably.com");
  assert.equal(domainForCompanyValue("Utably UG", pick), "");
  assert.equal(domainForCompanyValue("", pick), "");
  assert.equal(domainForCompanyValue("Utably", null), "");
});

test("normalizeCompanySuggestions cleans, dedupes and caps rows", () => {
  const rows = [
    { name: " Utably ", domain: "utably.com" },
    { name: "Utably", domain: "https://utably.com/" },
    { name: "", domain: "x.com" },
    { name: "Utably Labs", domain: "bad domain" },
    null,
    { name: "Utably Studio", domain: "studio.utably.com" },
  ];
  assert.deepEqual(normalizeCompanySuggestions(rows), [
    { name: "Utably", domain: "utably.com" },
    { name: "Utably Labs", domain: "" },
    { name: "Utably Studio", domain: "studio.utably.com" },
  ]);
  assert.equal(normalizeCompanySuggestions(rows, 1).length, 1);
  assert.deepEqual(normalizeCompanySuggestions(undefined), []);
});

test("takeNamesToResolve asks each name once, in batches of at most 20", () => {
  const asked = new Set();
  const names = Array.from({ length: 45 }, (_, i) => `Utably ${i}`);
  const batches = takeNamesToResolve([...names, "U", "", "Utably 0"], asked);
  assert.deepEqual(batches.map((b) => b.length), [20, 20, 5]);
  assert.equal(asked.size, 45);
  assert.deepEqual(takeNamesToResolve(names, asked), []);
});

test("companyMatchKey ignores legal forms, case, accents and punctuation", () => {
  assert.equal(companyMatchKey("Utably GmbH"), "utably");
  assert.equal(companyMatchKey("UTABLY UG (haftungsbeschränkt)"), "utably");
  assert.equal(companyMatchKey("Peri-Werk A. Schwörer GmbH & Co. KG"), "peri werk a schworer");
  assert.equal(companyMatchKey("Carglass® GmbH"), "carglass");
  assert.equal(companyMatchKey("GmbH"), "");
});

test("matchingCompanySuggestion takes only a clear name match with a domain", () => {
  const rows = [
    { name: "Utably Labs", domain: "utablylabs.com" },
    { name: "Utably", domain: "utably.com" },
  ];
  assert.deepEqual(matchingCompanySuggestion("Utably GmbH", rows), { name: "Utably", domain: "utably.com" });
  assert.equal(matchingCompanySuggestion("Utably Consulting", rows), null);
  assert.equal(matchingCompanySuggestion("Utably", [{ name: "Utably", domain: "" }]), null);
  assert.equal(matchingCompanySuggestion("", rows), null);
  assert.equal(matchingCompanySuggestion("Utably", null), null);
});
