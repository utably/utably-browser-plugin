// Unit tests for popup/location.js — country picker + city suggestions.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COUNTRY_CODES,
  buildJobLocation,
  countryCodeFromText,
  countryFlag,
  countryName,
  normalizeCitySuggestions,
  parseJobLocation,
} from "../popup/location.js";

test("the country list matches the app's 250 ISO codes", () => {
  assert.equal(COUNTRY_CODES.length, 250);
  assert.equal(new Set(COUNTRY_CODES).size, 250);
});

test("country names, flags and codes from names", () => {
  assert.equal(countryName("de", "en"), "Germany");
  assert.equal(countryName("DE", "de"), "Deutschland");
  assert.equal(countryName("ZZ", "en"), "");
  assert.equal(countryFlag("de"), "🇩🇪");
  assert.equal(countryCodeFromText("Deutschland"), "DE");
  assert.equal(countryCodeFromText("germany"), "DE");
  assert.equal(countryCodeFromText("USA"), "US");
  assert.equal(countryCodeFromText("Berlin"), "");
});

test("parseJobLocation splits off a trailing country and keeps the rest", () => {
  assert.deepEqual(parseJobLocation("Berlin, Germany"), { city: "Berlin", country: "DE" });
  assert.deepEqual(parseJobLocation("Munich, Bavaria, Deutschland"), { city: "Munich", country: "DE" });
  assert.deepEqual(parseJobLocation("Remote"), { city: "Remote", country: "" });
  assert.deepEqual(parseJobLocation("Austin, TX"), { city: "Austin", country: "" });
  assert.deepEqual(parseJobLocation("Germany"), { city: "", country: "DE" });
  assert.deepEqual(parseJobLocation(""), { city: "", country: "" });
});

test("buildJobLocation writes the line the app reads back", () => {
  assert.equal(buildJobLocation({ city: "Berlin", country: "DE" }, "en"), "Berlin, Germany");
  assert.equal(buildJobLocation({ city: "Berlin", country: "DE" }, "de"), "Berlin, Deutschland");
  assert.equal(buildJobLocation({ city: "Remote", country: "" }, "en"), "Remote");
  assert.equal(buildJobLocation({ city: "", country: "AT" }, "en"), "Austria");
  const round = parseJobLocation(buildJobLocation({ city: "Ulm", country: "DE" }, "de"));
  assert.deepEqual(round, { city: "Ulm", country: "DE" });
});

test("normalizeCitySuggestions turns provider rows into city + country", () => {
  const rows = [
    { placeId: "a", title: "Ulm", label: "Ulm, Deutschland" },
    { placeId: "b", title: "Ulm", label: "Ulm, Deutschland" },
    { placeId: "c", title: "Berlin, Deutschland", label: "10115 Berlin, Deutschland" },
    { placeId: "d", title: "", label: "" },
  ];
  assert.deepEqual(normalizeCitySuggestions(rows), [
    { city: "Ulm", country: "DE", label: "Ulm, Deutschland" },
    { city: "Berlin", country: "DE", label: "10115 Berlin, Deutschland" },
  ]);
  assert.deepEqual(normalizeCitySuggestions([{ title: "Graz", label: "Graz" }], "at"), [
    { city: "Graz", country: "AT", label: "Graz" },
  ]);
  assert.deepEqual(normalizeCitySuggestions(null), []);
});

import { normalizeStreetSuggestions, placeToJobLocation, searchCountries, streetLine } from "../popup/location.js";
import { rankJobTitles } from "../popup/jobTitle.js";

test("searchCountries finds a country by its English or German name", () => {
  assert.deepEqual(searchCountries("german", "de")[0], { code: "DE", name: "Deutschland", also: "Germany" });
  assert.deepEqual(searchCountries("deutsch", "en")[0], { code: "DE", name: "Germany", also: "Deutschland" });
  assert.deepEqual(searchCountries("Germany", "en")[0], { code: "DE", name: "Germany", also: "" });
  assert.equal(searchCountries("öster", "en")[0].code, "AT");
  assert.equal(searchCountries("osterreich", "de")[0].code, "AT");
  assert.equal(searchCountries("usa", "en")[0].code, "US");
  assert.equal(searchCountries("ch", "en")[0].code, "CH");
  assert.ok(searchCountries("united", "en").some((c) => c.code === "GB"));
  assert.deepEqual(searchCountries("", "en"), []);
  assert.deepEqual(searchCountries("xyzzy", "en"), []);
});

test("a picked address fills street, postal code, city and country", () => {
  assert.equal(streetLine({ street: "Hauptstraße", house_number: "1", country: "DE" }), "Hauptstraße 1");
  assert.equal(streetLine({ street: "Downing Street", house_number: "10", country: "GB" }), "10 Downing Street");
  assert.deepEqual(
    placeToJobLocation({ street: "Hauptstraße", house_number: "1", zip: "10115", city: "Berlin", country: "DE" }),
    { street: "Hauptstraße 1", zip: "10115", city: "Berlin", country: "DE" },
  );
  assert.equal(placeToJobLocation(null), null);
  assert.deepEqual(
    normalizeStreetSuggestions([{ placeId: "p", label: " Hauptstraße 1,  Berlin " }, { placeId: "", label: "x" }]),
    [{ placeId: "p", label: "Hauptstraße 1, Berlin" }],
  );
});

test("rankJobTitles puts titles starting with the text first, like the app", () => {
  const rows = [
    { title: "Senior Data Analyst" },
    { title: "Data Analyst" },
    { title: "Database Administrator" },
    { title: "Statistician", altLabels: ["data analyst (statistics)"] },
    { title: "Data Analyst" },
    { title: "Chef" },
  ];
  assert.deepEqual(rankJobTitles(rows, "data analyst"), ["Data Analyst", "Senior Data Analyst", "Statistician"]);
  assert.deepEqual(rankJobTitles(rows, "d"), []);
  assert.deepEqual(rankJobTitles(null, "data"), []);
});

import { addressToJobLocation, parseLocationText } from "../popup/location.js";

test("parseLocationText splits what job pages write into the four fields", () => {
  const cases = [
    ["Hauptstraße 1, 10115 Berlin, Deutschland", { street: "Hauptstraße 1", zip: "10115", city: "Berlin", country: "DE" }],
    ["10115 Berlin", { street: "", zip: "10115", city: "Berlin", country: "" }],
    ["Berlin, Germany (Hybrid)", { street: "", zip: "", city: "Berlin", country: "DE" }],
    ["Remote - Germany", { street: "", zip: "", city: "Remote", country: "DE" }],
    ["New York, NY 10001, USA", { street: "", zip: "10001", city: "New York", country: "US" }],
    ["10 Downing Street, London SW1A 2AA, United Kingdom", { street: "10 Downing Street", zip: "SW1A 2AA", city: "London", country: "GB" }],
    ["San Diego, CA", { street: "", zip: "", city: "San Diego", country: "" }],
    ["Musterweg 12b, 80331 München", { street: "Musterweg 12b", zip: "80331", city: "München", country: "" }],
    ["Hamburg · Hybrid", { street: "", zip: "", city: "Hamburg", country: "" }],
  ];
  for (const [text, expected] of cases) assert.deepEqual(parseLocationText(text), expected, text);
  // Structured data may end in a country code.
  assert.equal(parseLocationText("Hauptstraße 1, Berlin, BE, 10115, DE", { allowCodes: true }).country, "DE");
});

test("addressToJobLocation reads a schema.org PostalAddress", () => {
  assert.deepEqual(
    addressToJobLocation({ streetAddress: "Hauptstraße 1", postalCode: "10115", addressLocality: "Berlin", addressCountry: { name: "DE" } }),
    { street: "Hauptstraße 1", zip: "10115", city: "Berlin", country: "DE" },
  );
  assert.equal(addressToJobLocation({ addressCountry: "Germany" }).country, "DE");
  assert.equal(addressToJobLocation({}), null);
  assert.equal(addressToJobLocation(null), null);
});
