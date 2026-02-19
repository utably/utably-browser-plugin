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

async function ensureHostAccessForTab(tab) {
  const originPattern = getOriginPattern(tab?.url || "");
  if (!originPattern) return;

  const hasAccess = await chrome.permissions.contains({ origins: [originPattern] });
  if (hasAccess) return;

  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) {
    throw new Error("Host access denied. Allow access to this site to use Auto-fill.");
  }
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
