import { getLocale, t } from "./i18n.js";
import {
  CITY_QUERY_MIN_CHARS,
  buildJobLocation,
  countryFlag,
  countryName,
  normalizeCitySuggestions,
  normalizeCountryCode,
  normalizeStreetSuggestions,
  parseLocationText,
  placeToJobLocation,
  searchCountries,
  streetSuggestionParts,
} from "./location.js";
import { wireTypeahead } from "./typeahead.js";

// Job location on the capture form, the same four fields as the app's job
// form: country (type "german" or "deutsch" → Deutschland), city, postal
// code and street. City and street suggestions come from Amazon Location
// via our server (background.js), narrowed to the picked country; picking
// a street also fills postal code, city and country. Free text is always
// allowed.
//
// The job is sent with the structured fields plus one readable line,
// "City, Country", for everything that only reads `location`.

const SUGGESTION_LIMIT = 6;

let countryCode = ""; // the picked country; the field shows its name

function setCountry(els, code) {
  countryCode = normalizeCountryCode(code);
  if (els.locationCountry) {
    els.locationCountry.value = countryCode ? countryName(countryCode, getLocale()) : "";
  }
  if (els.locationCountryFlag) {
    els.locationCountryFlag.textContent = countryFlag(countryCode);
    els.locationCountryFlag.classList.toggle("hidden", !countryCode);
    els.locationCountryField?.classList.toggle("has-logo", Boolean(countryCode));
  }
}

/** The picked country code ("" when none). */
export function currentCountryCode() {
  return countryCode;
}

/** The readable location line ("Berlin, Germany"). */
export function readJobLocation(els) {
  return buildJobLocation({ city: els.location?.value, country: countryCode }, getLocale());
}

/** The structured fields, named as the app stores them. */
export function readJobLocationFields(els) {
  const value = (el) => String(el?.value ?? "").replace(/\s+/g, " ").trim();
  return {
    locationCountry: countryCode ? countryName(countryCode, getLocale()) : "",
    locationCity: value(els.location),
    locationZip: value(els.locationZip),
    locationStreet: value(els.locationStreet),
  };
}

/** Fill the four fields ({ street, zip, city, country code }). */
export function writeJobLocationParts(els, { street = "", zip = "", city = "", country = "" } = {}) {
  if (els.location) els.location.value = city;
  if (els.locationStreet) els.locationStreet.value = street;
  if (els.locationZip) els.locationZip.value = zip;
  setCountry(els, country);
}

/**
 * Show a location written as text — from a job page, a captured selection
 * or a draft — split into street, postal code, city and country. A draft's
 * own street / postal code win over what the text holds.
 */
export function writeJobLocation(els, text, { street = "", zip = "" } = {}) {
  const parsed = parseLocationText(text);
  writeJobLocationParts(els, { ...parsed, street: street || parsed.street, zip: zip || parsed.zip });
}

function notifyChange(input) {
  input?.dispatchEvent(new Event("input", { bubbles: true }));
}

export function wireLocationFields(els) {
  const locale = () => getLocale();

  // Country: a searchable list in English and German; the text only counts
  // once it names a country, otherwise it is cleared when the field is left.
  const country = wireTypeahead({
    input: els.locationCountry,
    list: els.locationCountrySuggestions,
    idPrefix: "countrySuggestion-",
    minChars: 1,
    debounceMs: 0,
    openOnFocus: true,
    lookup: (query) =>
      searchCountries(query, locale(), 8).map((row) => ({
        primary: `${countryFlag(row.code)} ${row.name}`,
        secondary: row.also,
        value: row.code,
      })),
    onChoose: (code) => {
      setCountry(els, code);
      notifyChange(els.locationCountry);
    },
  });
  els.locationCountry?.addEventListener("input", () => {
    // Typing over a picked country un-picks it until a new one is chosen.
    if (countryCode && els.locationCountry.value !== countryName(countryCode, locale())) {
      countryCode = "";
      if (els.locationCountryFlag) els.locationCountryFlag.classList.add("hidden");
      els.locationCountryField?.classList.remove("has-logo");
    }
  });
  els.locationCountry?.addEventListener("blur", () => {
    if (countryCode) return;
    const typed = searchCountries(els.locationCountry.value, locale(), 1)[0];
    const exact = typed && [typed.name, typed.also].some(
      (name) => name && name.toLowerCase() === String(els.locationCountry.value).trim().toLowerCase(),
    );
    setCountry(els, exact ? typed.code : "");
    notifyChange(els.locationCountry);
  });

  // City: towns only, inside the picked country.
  wireTypeahead({
    input: els.location,
    list: els.locationSuggestions,
    idPrefix: "citySuggestion-",
    minChars: CITY_QUERY_MIN_CHARS,
    lookup: async (query) => {
      const response = await chrome.runtime
        .sendMessage({ type: "UTABLY_PLACES_SUGGEST", kind: "city", query, country: countryCode, lang: locale(), limit: SUGGESTION_LIMIT })
        .catch(() => null);
      return normalizeCitySuggestions(response?.suggestions, countryCode, SUGGESTION_LIMIT).map((row) => ({
        primary: row.city,
        secondary: row.country ? `${countryFlag(row.country)} ${countryName(row.country, locale())}` : "",
        value: row,
      }));
    },
    onChoose: (row) => {
      els.location.value = row.city;
      if (row.country) setCountry(els, row.country);
      notifyChange(els.location);
    },
  });

  // Street: addresses inside the picked country; a pick fills the rest.
  wireTypeahead({
    input: els.locationStreet,
    list: els.locationStreetSuggestions,
    idPrefix: "streetSuggestion-",
    minChars: 3,
    lookup: async (query) => {
      const response = await chrome.runtime
        .sendMessage({
          type: "UTABLY_PLACES_SUGGEST",
          kind: "address",
          query,
          near: String(els.location?.value ?? "").trim(),
          country: countryCode,
          lang: locale(),
          limit: SUGGESTION_LIMIT,
        })
        .catch(() => null);
      return normalizeStreetSuggestions(response?.suggestions, SUGGESTION_LIMIT).map((row) => ({
        primary: row.label,
        value: row,
      }));
    },
    onChoose: async (row) => {
      // The picked line shows at once ("Landsberger Straße, 10249 Berlin,
      // Deutschland"); the address details then fill in what it lacks.
      const fromLabel = streetSuggestionParts(row.label);
      els.locationStreet.value = fromLabel.street;
      const response = await chrome.runtime
        .sendMessage({ type: "UTABLY_PLACES_PLACE", placeId: row.placeId, lang: locale() })
        .catch(() => null);
      const picked = placeToJobLocation(response?.place) || {};
      const street = picked.street || fromLabel.street;
      const zip = picked.zip || fromLabel.zip;
      const city = picked.city || fromLabel.city;
      const country = picked.country || fromLabel.country;
      if (street) els.locationStreet.value = street;
      if (zip && els.locationZip) els.locationZip.value = zip;
      if (city && els.location) els.location.value = city;
      if (country) setCountry(els, country);
      notifyChange(els.locationStreet);
    },
  });

  return { closeCountry: country.close };
}

/** Re-label the picked country after the popup language changed. */
export function refreshCountryLabel(els) {
  setCountry(els, countryCode);
  if (els.locationCountry) els.locationCountry.placeholder = t("preview.country.placeholder");
}
