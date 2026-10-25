// Pure helpers for the job location field: a country picker plus a city
// field with suggestions. No chrome.* or DOM access, so it runs under
// `node --test`. The DOM controller lives in placesTypeahead.js.
//
// The app stores a job's location as one line, "City, Country" (country as
// its name), and splits it back the same way, so that is what the plugin
// sends. The codes match the app's country list (i18n-iso-countries).

export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO " +
  "JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR " +
  "MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO " +
  "RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV " +
  "TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

const CODE_SET = new Set(COUNTRY_CODES);
export const CITY_QUERY_MIN_CHARS = 2;

// Short forms job boards write that the display names do not cover.
const COUNTRY_ALIASES = {
  usa: "US", "u.s.": "US", "u.s.a.": "US", "united states of america": "US",
  uk: "GB", "u.k.": "GB", england: "GB", scotland: "GB", wales: "GB",
  uae: "AE", holland: "NL", "the netherlands": "NL",
  "federal republic of germany": "DE", "bundesrepublik deutschland": "DE", brd: "DE",
  "czech republic": "CZ", "tschechische republik": "CZ",
  turkey: "TR", türkiye: "TR", turkiye: "TR",
  korea: "KR", "south korea": "KR", "republic of korea": "KR", südkorea: "KR",
  russia: "RU", "russian federation": "RU",
  "great britain": "GB", großbritannien: "GB", grossbritannien: "GB",
};

const displayNamesCache = new Map();
function displayNames(locale) {
  const lang = String(locale || "en").toLowerCase().startsWith("de") ? "de" : "en";
  if (!displayNamesCache.has(lang)) {
    let names = null;
    try {
      names = new Intl.DisplayNames([lang], { type: "region" });
    } catch {
      names = null;
    }
    displayNamesCache.set(lang, names);
  }
  return displayNamesCache.get(lang);
}

/** "DE" → "Germany" / "Deutschland"; "" for an unknown code. */
export function countryName(code, locale) {
  const iso = normalizeCountryCode(code);
  if (!iso) return "";
  try {
    return displayNames(locale)?.of(iso) || iso;
  } catch {
    return iso;
  }
}

/** "de" → "DE"; "" unless it is a known ISO 3166-1 alpha-2 code. */
export function normalizeCountryCode(code) {
  const iso = String(code ?? "").trim().toUpperCase();
  return CODE_SET.has(iso) ? iso : "";
}

/** "DE" → 🇩🇪 */
export function countryFlag(code) {
  const iso = normalizeCountryCode(code);
  if (!iso) return "";
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

let nameIndex = null;
/** Country name (English or German), code or common alias → code, or "". */
export function countryCodeFromText(text) {
  const key = String(text ?? "").trim().toLowerCase();
  if (!key) return "";
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key];
  if (key.length === 2) return normalizeCountryCode(key);
  if (!nameIndex) {
    nameIndex = new Map();
    for (const locale of ["en", "de"]) {
      for (const code of COUNTRY_CODES) {
        const name = countryName(code, locale).toLowerCase();
        if (name && name !== code.toLowerCase() && !nameIndex.has(name)) nameIndex.set(name, code);
      }
    }
  }
  return nameIndex.get(key) || "";
}

const ZIP_FIRST = /^(\d{4,6}|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\s+(.+)$/i; // "10115 Berlin", "SW1A 1AA London"
const ZIP_LAST = /^(.+?)\s+(\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i; // "Austin 78701", "London SW1A 2AA"
const STATE_CODE = /^[A-Z]{2,3}$/; // "NY 10001": the state, not the city
const HOUSE_NUMBER = /(^\d+[a-z]?\s+\S)|(\S\s+\d+[a-z]?(?:[-/]\d+[a-z]?)?$)/i; // "10 Downing St", "Hauptstraße 1a"
const PART_SEPARATORS = /\s*[,;|·/]\s*|\s+[-–]\s+/;
// How or where-ish the job is worked, not a place: dropped from the text.
const WORK_MODE_WORDS = [
  "fully remote", "full remote", "100% remote", "remote first", "remote", "hybrid", "on-site", "onsite", "on site",
  "home office", "homeoffice", "mobile arbeit", "mobiles arbeiten", "vor ort", "teilweise remote",
  "bundesweit", "deutschlandweit", "nationwide", "worldwide", "weltweit", "anywhere",
  "multiple locations", "mehrere standorte", "verschiedene standorte", "eu", "europe", "europa", "emea", "dach",
];
const WORK_MODES = WORK_MODE_WORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const WORK_MODE_PART = new RegExp(`^(?:${WORK_MODES})$`, "i");
const WORK_MODE_EDGE = new RegExp(`^(?:${WORK_MODES})\\s+|\\s+(?:${WORK_MODES})$`, "i");

/** "Germany Remote" → "Germany"; "Remote" → "". */
function withoutWorkMode(part) {
  let text = part.trim();
  if (WORK_MODE_PART.test(text)) return "";
  for (let i = 0; i < 2; i += 1) text = text.replace(WORK_MODE_EDGE, "").trim();
  return WORK_MODE_PART.test(text) ? "" : text;
}

/**
 * A location as a job page writes it → { street, zip, city, country }.
 * "Hauptstraße 1, 10115 Berlin, Deutschland" fills all four; "Berlin,
 * Germany" fills city and country; "Munich, Bavaria" keeps the city and
 * drops the region. Only a last part that names a country becomes the
 * country; two-letter endings ("San Diego, CA") are only read as country
 * codes when `allowCodes` is set (structured data), since in free text
 * they are far more often states. Text that fits nothing stays the city.
 */
export function parseLocationText(text, { allowCodes = false } = {}) {
  const empty = { street: "", zip: "", city: "", country: "" };
  const clean = String(text ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return empty;
  const out = { ...empty };
  const asCountry = (part) => (part.length === 2 && !allowCodes ? "" : countryCodeFromText(part));
  // Work modes go; a part naming a country is the country wherever it sits
  // ("Germany, Berlin"), and is never kept as the city.
  // A two-letter code only counts at the end ("Berlin, BE, 10115, DE": BE
  // is the state).
  const raws = clean.split(PART_SEPARATORS).map(withoutWorkMode).filter(Boolean);
  const parts = [];
  raws.forEach((part, index) => {
    const code = part.length > 2 || index === raws.length - 1 ? asCountry(part) : "";
    if (!code) parts.push(part);
    else if (!out.country || index === raws.length - 1) out.country = code;
  });
  if (!parts.length) return out;
  if (parts.length === 1 && !out.country) {
    const only = parts[0].match(ZIP_FIRST);
    if (only) return { ...out, zip: only[1], city: only[2] };
    return { ...out, city: parts[0] };
  }

  const rest = [];
  for (const part of parts) {
    const zipFirst = part.match(ZIP_FIRST);
    const zipLast = part.match(ZIP_LAST);
    if (!out.zip && /^\d{4,6}$/.test(part)) {
      out.zip = part;
    } else if (!out.zip && zipFirst && !out.city) {
      out.zip = zipFirst[1];
      out.city = zipFirst[2];
    } else if (!out.zip && zipLast && STATE_CODE.test(zipLast[1])) {
      out.zip = zipLast[2];
    } else if (!out.zip && zipLast && !out.city && !HOUSE_NUMBER.test(zipLast[1])) {
      out.city = zipLast[1];
      out.zip = zipLast[2];
    } else if (!out.street && HOUSE_NUMBER.test(part) && parts.length > 1) {
      out.street = part;
    } else {
      rest.push(part);
    }
  }
  // The first leftover part is the city; later ones are regions.
  if (!out.city && rest.length) out.city = rest[0];
  return out;
}

/** "Berlin, Germany" → { city: "Berlin", country: "DE" } (see parseLocationText). */
export function parseJobLocation(text) {
  const { city, country } = parseLocationText(text);
  return { city, country };
}

/**
 * A schema.org PostalAddress (the JSON-LD job pages publish) → the form's
 * fields. The country may be a code, a name or a { name } object.
 */
export function addressToJobLocation(address) {
  if (!address || typeof address !== "object") return null;
  const text = (value) => String(value?.name ?? value ?? "").replace(/\s+/g, " ").trim();
  const country = countryCodeFromText(text(address.addressCountry ?? address.country));
  const out = {
    street: text(address.streetAddress ?? address.street),
    zip: text(address.postalCode ?? address.zip),
    city: text(address.addressLocality ?? address.city),
    country,
  };
  // Pages often put the country in addressLocality ("Deutschland").
  const cityAsCountry = countryCodeFromText(out.city);
  if (cityAsCountry && out.city.length > 2) {
    out.city = "";
    if (!out.country) out.country = cityAsCountry;
  }
  return out.street || out.zip || out.city || out.country ? out : null;
}

/**
 * A page's structured address with the gaps filled from its location text:
 * `{ country: "DE" }` + "Berlin" → Berlin, Germany. Either may be missing.
 */
export function mergeJobLocation(address, text) {
  const parsed = parseLocationText(text);
  const base = address || {};
  const out = {};
  for (const field of ["street", "zip", "city", "country"]) out[field] = base[field] || parsed[field] || "";
  return out;
}

/** { city, country } → "Berlin, Germany" (country named in `locale`). */
export function buildJobLocation({ city, country }, locale) {
  return [String(city ?? "").trim(), countryName(country, locale)].filter(Boolean).join(", ");
}

/**
 * Server city suggestions → [{ city, country, label }]. The provider's label
 * ("10115 Berlin, Deutschland") becomes city + country where it can.
 */
export function normalizeCitySuggestions(rows, fallbackCountry = "", limit = 6) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const label = String(row?.label ?? "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    const parsed = parseJobLocation(label);
    const country = parsed.country || normalizeCountryCode(fallbackCountry);
    const fromTitle = String(row?.title ?? "").split(",")[0].trim().replace(/^\d{3,}\s+/, "");
    // A title that names the country ("Deutschland, Berlin") is not the town.
    const city = (fromTitle && !countryCodeFromText(fromTitle) ? fromTitle : parsed.city).replace(/^\d{3,}\s+/, "");
    if (!city) continue;
    const key = `${city.toLowerCase()}|${country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ city, country, label });
    if (out.length >= limit) break;
  }
  return out;
}

function foldText(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

let searchIndex = null;
function countrySearchIndex() {
  if (!searchIndex) {
    searchIndex = COUNTRY_CODES.map((code) => ({
      code,
      names: [...new Set([countryName(code, "en"), countryName(code, "de")].map(foldText))],
    }));
    for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
      searchIndex.find((entry) => entry.code === code)?.names.push(foldText(alias));
    }
  }
  return searchIndex;
}

/**
 * Countries for what the user typed, in English or German: "german" →
 * Germany, "deutsch" → Deutschland, "de" → DE. Best first: exact name,
 * then names starting with the text, then a word inside a name starting
 * with it. Names are shown in `locale`; `also` carries the other
 * language's name when that is the one that matched.
 */
export function searchCountries(query, locale, limit = 8) {
  const q = foldText(query);
  if (!q) return [];
  const hits = [];
  for (const { code, names } of countrySearchIndex()) {
    let score = 0;
    let matched = "";
    if (q.length === 2 && code.toLowerCase() === q) score = 90;
    for (const name of names) {
      let s = 0;
      if (name === q) s = 100;
      else if (name.startsWith(q)) s = 80;
      else if (name.split(/[\s-]+/).some((word) => word.startsWith(q))) s = 50;
      if (s > score) {
        score = s;
        matched = name;
      }
    }
    if (score) hits.push({ code, score, matched });
  }
  const shown = String(locale || "en").toLowerCase().startsWith("de") ? "de" : "en";
  return hits
    .map((hit) => {
      const name = countryName(hit.code, shown);
      const other = countryName(hit.code, shown === "de" ? "en" : "de");
      const also = hit.matched && foldText(other) === hit.matched && other !== name ? other : "";
      return { code: hit.code, name, also, score: hit.score };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, shown))
    .slice(0, limit)
    .map(({ code, name, also }) => ({ code, name, also }));
}

// Where the house number comes first ("10 Downing Street"), as in the app.
const NUMBER_FIRST = new Set(["US", "GB", "IE", "FR", "CA", "AU", "NZ"]);

/** Street + house number in the country's order. */
export function streetLine({ street, house_number: number, country }) {
  const name = String(street ?? "").trim();
  const no = String(number ?? "").trim();
  if (!name || !no) return name;
  return NUMBER_FIRST.has(normalizeCountryCode(country)) ? `${no} ${name}` : `${name} ${no}`;
}

/** A picked address (server `places/place`) → the form's fields. */
export function placeToJobLocation(place) {
  if (!place || typeof place !== "object") return null;
  return {
    street: streetLine(place),
    zip: String(place.zip ?? "").trim(),
    city: String(place.city ?? "").trim(),
    country: normalizeCountryCode(place.country),
  };
}

/**
 * A street suggestion's label → its parts: the first part is the street
 * ("Landsberger Straße" or "Landsberger Allee 10"), the rest postal code,
 * town and country.
 */
export function streetSuggestionParts(label) {
  const text = String(label ?? "").replace(/\s+/g, " ").trim();
  const [first = "", ...rest] = text.split(/\s*,\s*/);
  const parsed = parseLocationText(rest.join(", "));
  return { street: first, zip: parsed.zip, city: parsed.city, country: parsed.country };
}

/** Server address suggestions → [{ placeId, label }]. */
export function normalizeStreetSuggestions(rows, limit = 6) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    const placeId = String(row?.placeId ?? "").trim();
    const label = String(row?.label ?? "").replace(/\s+/g, " ").trim();
    if (!placeId || !label || placeId.length > 2048) continue;
    out.push({ placeId, label });
    if (out.length >= limit) break;
  }
  return out;
}
