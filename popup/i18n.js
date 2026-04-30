const SUPPORTED = ["en", "de"];
const DEFAULT_LOCALE = "en";
const STORAGE_KEY = "utablyLocale"; // "auto" | "en" | "de"
const LOCALE_FILE_PREFIX = "popup/locales";

const DICT = Object.create(null);
let dictLoaded = null;
let currentLocale = DEFAULT_LOCALE;

function detectBrowserLocale() {
  const lang = (navigator?.language || "").toLowerCase();
  if (lang.startsWith("de")) return "de";
  return "en";
}

function resolveLocale(preference) {
  if (preference === "en" || preference === "de") return preference;
  return detectBrowserLocale();
}

async function fetchLocale(locale) {
  const url = chrome.runtime.getURL(`${LOCALE_FILE_PREFIX}/${locale}.json`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load locale ${locale}: HTTP ${response.status}`);
  }
  return response.json();
}

async function ensureDictsLoaded() {
  if (dictLoaded) return dictLoaded;
  dictLoaded = Promise.all(
    SUPPORTED.map(async (locale) => {
      try {
        DICT[locale] = await fetchLocale(locale);
      } catch (err) {
        console.warn(`[i18n] could not load ${locale}.json`, err);
        DICT[locale] = DICT[locale] || {};
      }
    })
  );
  return dictLoaded;
}

export function getLocalePreference() {
  return chrome.storage.local
    .get([STORAGE_KEY])
    .then((stored) => {
      const raw = (stored?.[STORAGE_KEY] || "").toString();
      if (raw === "en" || raw === "de" || raw === "auto") return raw;
      return "auto";
    })
    .catch(() => "auto");
}

export async function loadLocale() {
  await ensureDictsLoaded();
  const pref = await getLocalePreference();
  currentLocale = resolveLocale(pref);
  return { preference: pref, locale: currentLocale };
}

export async function setLocalePreference(pref) {
  const value = pref === "en" || pref === "de" ? pref : "auto";
  await chrome.storage.local.set({ [STORAGE_KEY]: value });
  await ensureDictsLoaded();
  currentLocale = resolveLocale(value);
  return { preference: value, locale: currentLocale };
}

export function getLocale() {
  return currentLocale;
}

export function getSupportedLocales() {
  return [...SUPPORTED];
}

export function t(key, params) {
  const dict = DICT[currentLocale] || DICT[DEFAULT_LOCALE] || {};
  let value = dict[key];
  if (value == null) {
    const fallback = (DICT[DEFAULT_LOCALE] || {})[key];
    value = fallback != null ? fallback : key;
  }
  if (params && typeof value === "string") {
    return value.replace(/\{(\w+)\}/g, (_match, name) =>
      params[name] != null ? String(params[name]) : `{${name}}`
    );
  }
  return value;
}

export function applyTranslations(root = document) {
  const textNodes = root.querySelectorAll("[data-i18n]");
  textNodes.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const html = el.getAttribute("data-i18n-html") === "true";
    const value = t(key);
    if (html) {
      el.innerHTML = value;
    } else {
      el.textContent = value;
    }
  });
  const placeholderNodes = root.querySelectorAll("[data-i18n-placeholder]");
  placeholderNodes.forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });
  const titleNodes = root.querySelectorAll("[data-i18n-title]");
  titleNodes.forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    el.setAttribute("title", t(key));
  });
  const ariaNodes = root.querySelectorAll("[data-i18n-aria-label]");
  ariaNodes.forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    el.setAttribute("aria-label", t(key));
  });
}
