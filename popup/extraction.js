import { EXTRACTION_SCRIPT_FILES } from "./config.js";
import { trimOrEmpty } from "./dom.js";

export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function prefillSourceUrl(els) {
  const tab = await getActiveTab();
  if (tab?.url) {
    els.jobUrl.value = tab.url;
  }
}

function getOriginPattern(urlString) {
  if (!urlString) return "";
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return `${parsed.origin}/*`;
  } catch {
    return "";
  }
}

export async function ensureHostAccessForTab(tab) {
  // Verify the user actually granted host access for this tab before we try
  // to inject. This runs *after* requestBroadHostAccessFromGesture() has
  // shown the Chrome prompt from within a user gesture — by the time we get
  // here, the grant is either in place or the user declined. Checking
  // chrome.permissions.contains() gives us a clean, actionable error message
  // instead of letting chrome.scripting.executeScript fail with an opaque
  // "Extension manifest must request permission to access this host".
  if (!tab?.url) return;
  const originPattern = getOriginPattern(tab.url);
  if (!originPattern) {
    // chrome://, about:, file:, etc. — we can't grant access to these.
    throw new Error(
      "This page type doesn't allow extension access. Open a regular website and try again."
    );
  }
  if (!chrome?.permissions?.contains) return;
  try {
    const hasBroad = await chrome.permissions.contains({ origins: ["*://*/*"] });
    if (hasBroad) return;
    const hasOrigin = await chrome.permissions.contains({ origins: [originPattern] });
    if (hasOrigin) return;
  } catch {
    // If the check itself throws, let the downstream executeScript call
    // surface the real error.
    return;
  }
  const host = (() => {
    try {
      return new URL(tab.url).hostname;
    } catch {
      return "this page";
    }
  })();
  throw new Error(
    `Host access required for ${host}. Click Auto-fill again and approve the Chrome permission prompt.`
  );
}

async function runAdapterExtraction(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: EXTRACTION_SCRIPT_FILES,
  });

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (globalThis.__utablyRunExtract ? globalThis.__utablyRunExtract() : null),
  });
  return result || null;
}

export async function extractIntoForm(els, setStatus) {
  setStatus("Extracting...", "info");
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("No active tab.", "error");
    return null;
  }

  await ensureHostAccessForTab(tab);
  const result = await runAdapterExtraction(tab.id);

  if (!result) {
    setStatus("No data extracted.", "info");
    return null;
  }

  const hasUsefulData = Boolean(
    trimOrEmpty(result.title) ||
      trimOrEmpty(result.company) ||
      trimOrEmpty(result.location) ||
      trimOrEmpty(result.description)
  );
  if (!hasUsefulData) {
    setStatus("No structured job data found on this page.", "info");
    return null;
  }

  els.linkedinNotice.classList.toggle("hidden", !result.isLinkedIn);
  els.applicationDate.value = trimOrEmpty(els.applicationDate.value) || new Date().toISOString().slice(0, 10);
  els.jobTitle.value = result.title || "";
  els.companyName.value = result.company || "";
  els.location.value = result.location || "";
  if (trimOrEmpty(result.recruiterName)) {
    els.recruiterName.value = result.recruiterName;
  }
  els.jobUrl.value = result.url || tab.url || "";
  if (!result.isLinkedIn) {
    els.jobText.value = result.description || "";
  }
  return result;
}

export async function refreshActiveTabContext(els, isSidePanel, refreshAuthState) {
  if (!isSidePanel) return;
  const connected = await refreshAuthState();
  if (!connected) return;
  await prefillSourceUrl(els);
}
