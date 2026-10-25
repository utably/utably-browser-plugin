import { companyLogoUrl } from "./company.js";

// Logos are only ever read from the server's cache (`src=cache`). A 404
// means "not cached" and the caller keeps its letter badge.

let apiBasePromise = null;

export function getLogoApiBase() {
  if (!apiBasePromise) {
    apiBasePromise = chrome.runtime
      .sendMessage({ type: "UTABLY_GET_API_BASE" })
      .then((response) => (response?.ok ? String(response.apiBase || "") : ""))
      .catch(() => "");
  }
  return apiBasePromise;
}

/**
 * Load the cached logo for `domain` into a fresh <img>. Resolves with the
 * loaded image, or null when there is no cached logo (or no domain), so the
 * caller only swaps its badge once the image is actually there.
 */
export async function loadCachedCompanyLogo(domain, { className = "", alt = "" } = {}) {
  const url = companyLogoUrl(await getLogoApiBase(), domain);
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.alt = alt;
    if (className) img.className = className;
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
