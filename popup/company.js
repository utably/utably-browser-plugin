// Pure helpers for the company typeahead and cached company logos.
//
// No chrome.* or DOM access in this module, so it runs under `node --test`
// as-is. The DOM controllers live in companyTypeahead.js / companyLogo.js.

export const COMPANY_QUERY_MIN_CHARS = 2;
export const COMPANY_RESOLVE_BATCH_MAX = 20;

const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

/** Whitespace-collapsed, trimmed company name. */
export function normalizeCompanyName(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** Trimmed, whitespace-collapsed query, or "" when too short to search. */
export function normalizeCompanyQuery(text) {
  const clean = normalizeCompanyName(text);
  return clean.length >= COMPANY_QUERY_MIN_CHARS ? clean : "";
}

/**
 * Reduce whatever the server or a stored row carries to a bare host
 * ("utably.com"), or "" when it is not a plausible domain. Never trust the
 * value enough to put it into a URL without this.
 */
export function cleanCompanyDomain(raw) {
  let value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/, 1)[0];
  value = value.replace(/:\d+$/, "").replace(/\.$/, "");
  if (value.startsWith("www.")) value = value.slice(4);
  return DOMAIN_PATTERN.test(value) ? value : "";
}

/**
 * Logo URL for a domain, cache-only. `src=cache` makes the proxy answer from
 * its stored images and 404 otherwise — the plugin must never cause a new
 * provider fetch, so the flag is not optional here.
 */
export function companyLogoUrl(apiBase, domain) {
  const base = String(apiBase ?? "").trim().replace(/\/+$/, "");
  const host = cleanCompanyDomain(domain);
  if (!base || !host) return "";
  return `${base}/openDataProxy/favicon?domain=${encodeURIComponent(host)}&src=cache`;
}

/**
 * The domain that still belongs to the field's current text. A pick only
 * holds while the text equals the picked name; any edit turns it back into
 * free text without a domain.
 */
export function domainForCompanyValue(value, pick) {
  const name = String(value ?? "").trim();
  if (!name || !pick) return "";
  if (String(pick.name ?? "").trim() !== name) return "";
  return cleanCompanyDomain(pick.domain);
}

/** Server suggestion rows → [{ name, domain }], deduplicated, capped. */
export function normalizeCompanySuggestions(rows, limit = 6) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const name = normalizeCompanyName(row?.name);
    if (!name) continue;
    const domain = cleanCompanyDomain(row?.domain);
    const key = `${name.toLowerCase()}|${domain}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, domain });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Split company names that have not been asked yet into batches the
 * resolve endpoint accepts (≤ 20 names, each ≥ 2 chars). Marks every
 * returned name as asked, so a name is requested at most once per session.
 */
export function takeNamesToResolve(names, asked, batchSize = COMPANY_RESOLVE_BATCH_MAX) {
  const fresh = [];
  for (const raw of names || []) {
    const name = normalizeCompanyName(raw);
    if (name.length < COMPANY_QUERY_MIN_CHARS || asked.has(name)) continue;
    asked.add(name);
    fresh.push(name);
  }
  const batches = [];
  for (let i = 0; i < fresh.length; i += batchSize) {
    batches.push(fresh.slice(i, i + batchSize));
  }
  return batches;
}

// Legal forms and filler words that do not tell two companies apart.
const LEGAL_FORM_WORDS = new Set([
  "gmbh", "mbh", "ag", "se", "kg", "kgaa", "co", "ohg", "ug", "haftungsbeschrankt", "ev",
  "inc", "incorporated", "corp", "corporation", "llc", "ltd", "limited", "plc", "lp", "llp",
  "sa", "sas", "sarl", "srl", "spa", "bv", "nv", "ab", "as", "asa", "aps", "oy", "oyj",
  "group", "gruppe", "holding", "the",
]);

/** "Peri-Werk A. Schwörer GmbH & Co. KG" → "peri werk a schworer". */
export function companyMatchKey(name) {
  return normalizeCompanyName(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !LEGAL_FORM_WORDS.has(word))
    .join(" ");
}

/**
 * The suggestion that is clearly the company a job page named, or null.
 * Auto-fill only takes a domain when the names match once legal forms are
 * ignored ("Utably GmbH" ↔ "Utably"); anything looser stays free text, and
 * the user can still pick from the list by typing.
 */
export function matchingCompanySuggestion(name, rows) {
  const key = companyMatchKey(name);
  if (!key) return null;
  for (const row of normalizeCompanySuggestions(rows)) {
    if (row.domain && companyMatchKey(row.name) === key) return row;
  }
  return null;
}
