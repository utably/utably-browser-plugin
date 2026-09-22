const DEFAULT_API_BASE = "https://api.utably.com";
const DEFAULT_CONNECT_URL = "https://app.utably.com/extension/connect";
const STAGE_API_BASE = {
  prod: "https://api.utably.com",
  dev: "https://api.dev.utably.com",
  test: "https://api.test.utably.com",
  local: "https://api.dev.utably.com",
};
const STAGE_CONNECT_URL = {
  prod: "https://app.utably.com/extension/connect",
  dev: "https://app.dev.utably.com/extension/connect",
  test: "https://app.test.utably.com/extension/connect",
};
const DEFAULT_LOCAL_PORT = "5173";
const WORKSPACE_PATH = "popup.html?mode=workspace";
const CAPTURE_SCRIPT_FILE = "content/capture.js";
const DRAFT_STORAGE_KEY = "utablyDraft";
const CAPTURE_TABS_KEY = "utablyCaptureTabs";
const PROFILE_CACHE_KEY = "utablyProfileCache";
const PROFILE_CACHE_TTL_MS = 5 * 60_000;
const FILL_CONSENTS_KEY = "utablyFillConsents";
const FILL_CONSENT_TTL_MS = 30 * 24 * 60 * 60_000;
const FILL_SCRIPT_FILES = [
  "content/fill/common.js",
  "content/fill/greenhouse.js",
  "content/fill/lever.js",
  "content/fill/ashby.js",
  "content/fill/generic.js",
  "content/fill/router.js",
];
const ATTACHMENT_SCRIPT_FILES = [
  "content/fill/attachments.js",
];
const DROPMODE_SCRIPT_FILES = [
  "content/fill/dropmode.js",
];
const ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;
const LOCALE_STORAGE_KEY = "utablyLocale";
const SUPPORTED_LOCALES = ["en", "de"];
const DEFAULT_LOCALE = "en";

const ACCESS_SKEW_MS = 30_000;

function trim(value) {
  return (value || "").trim();
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeLocalPort(rawPort) {
  const port = Number.parseInt(String(rawPort || ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return DEFAULT_LOCAL_PORT;
  }
  return String(port);
}

function detectBrowserLocale() {
  const lang = (typeof navigator !== "undefined" ? navigator.language || "" : "").toLowerCase();
  if (lang.startsWith("de")) return "de";
  return DEFAULT_LOCALE;
}

async function getPluginLocale() {
  try {
    const stored = await chrome.storage.local.get([LOCALE_STORAGE_KEY]);
    const pref = (stored?.[LOCALE_STORAGE_KEY] || "").toString();
    if (SUPPORTED_LOCALES.includes(pref)) return pref;
    return detectBrowserLocale();
  } catch {
    return detectBrowserLocale();
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get([
    "debugMode",
    "stage",
    "localPort",
    "extAccessToken",
    "extRefreshToken",
    "extAccessExpiresAt",
    "extRefreshExpiresAt",
  ]);

  const resolvedStage = stored.stage || "prod";
  const localPort = normalizeLocalPort(stored.localPort);
  const mappedBase = STAGE_API_BASE[resolvedStage] || DEFAULT_API_BASE;
  const mappedConnect =
    resolvedStage === "local"
      ? `https://app.dev.utably.com:${localPort}/extension/connect`
      : STAGE_CONNECT_URL[resolvedStage] || DEFAULT_CONNECT_URL;
  const baseCandidate = stored.debugMode ? mappedBase : STAGE_API_BASE.prod;
  const connectCandidate = stored.debugMode ? mappedConnect : STAGE_CONNECT_URL.prod;

  return {
    apiBase: trim(baseCandidate || DEFAULT_API_BASE).replace(/\/+$/, ""),
    connectUrl: trim(connectCandidate || DEFAULT_CONNECT_URL) || DEFAULT_CONNECT_URL,
    accessToken: trim(stored.extAccessToken),
    refreshToken: trim(stored.extRefreshToken),
    accessExpiresAt: Number(stored.extAccessExpiresAt || 0),
    refreshExpiresAt: Number(stored.extRefreshExpiresAt || 0),
  };
}

async function saveAuth(auth) {
  await chrome.storage.local.set({
    extAccessToken: auth.accessToken || "",
    extRefreshToken: auth.refreshToken || "",
    extAccessExpiresAt: Number(auth.accessExpiresAt || 0),
    extRefreshExpiresAt: Number(auth.refreshExpiresAt || 0),
  });
}

// Profile data is PII; keep it out of disk-backed local storage. We use
// chrome.storage.session when available (MV3 in-memory, wiped on browser
// restart). If unavailable we fall back to NOT caching at all rather than
// silently downgrading to disk storage.
function getProfileCacheStorage() {
  return chrome.storage?.session || null;
}

async function readProfileCache() {
  const store = getProfileCacheStorage();
  if (!store) return null;
  try {
    const stored = await store.get([PROFILE_CACHE_KEY]);
    return stored?.[PROFILE_CACHE_KEY] || null;
  } catch {
    return null;
  }
}

async function writeProfileCache(entry) {
  const store = getProfileCacheStorage();
  if (!store) return;
  try {
    await store.set({ [PROFILE_CACHE_KEY]: entry });
  } catch {}
}

async function removeProfileCache() {
  const store = getProfileCacheStorage();
  if (store) {
    try {
      await store.remove([PROFILE_CACHE_KEY]);
    } catch {}
  }
  // Defensive: older builds wrote the cache to chrome.storage.local. Wipe any
  // legacy entry so PII doesn't linger on disk after upgrading.
  try {
    await chrome.storage.local.remove([PROFILE_CACHE_KEY]);
  } catch {}
}

async function clearAuth() {
  await chrome.storage.local.remove([
    "extAccessToken",
    "extRefreshToken",
    "extAccessExpiresAt",
    "extRefreshExpiresAt",
    FILL_CONSENTS_KEY,
  ]);
  await removeProfileCache();
}

function parseTokenResponse(json) {
  const accessToken = trim(json?.accessToken);
  const refreshToken = trim(json?.refreshToken);
  const accessExpiresAtRaw = json?.accessExpiresAt ? Date.parse(json.accessExpiresAt) : NaN;
  const refreshExpiresAtRaw = json?.refreshExpiresAt ? Date.parse(json.refreshExpiresAt) : NaN;
  const accessExpiresAt = Number.isFinite(accessExpiresAtRaw) ? accessExpiresAtRaw : 0;
  const refreshExpiresAt = Number.isFinite(refreshExpiresAtRaw) ? refreshExpiresAtRaw : 0;

  if (!accessToken || !refreshToken || !accessExpiresAt || !refreshExpiresAt) {
    throw new Error("Invalid token response");
  }

  return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt };
}

async function exchangeCode(apiBase, code) {
  const res = await fetch(`${apiBase}/extension/token/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  const auth = parseTokenResponse(json);
  await saveAuth(auth);
  // A fresh connect can be a different account (or a different stage) than
  // whatever the cache was fetched with — never serve the old profile.
  await removeProfileCache();
}

async function startConnectSession(options = {}) {
  const settings = await getSettings();
  const preferredConnectUrl = trim(options?.preferredConnectUrl);
  const connectUrlHint = isHttpUrl(preferredConnectUrl) ? preferredConnectUrl : settings.connectUrl;
  const res = await fetch(`${settings.apiBase}/extension/connect/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      extId: chrome.runtime.id,
      source: "extension",
      connectUrlHint,
      apiBaseHint: settings.apiBase,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  const sessionId = trim(json?.sessionId);
  if (!sessionId) {
    throw new Error("Connect session missing sessionId.");
  }

  const connectUrl = trim(json?.connectUrl || settings.connectUrl || DEFAULT_CONNECT_URL) || DEFAULT_CONNECT_URL;
  const expiresAtRaw = json?.expiresAt ? Date.parse(json.expiresAt) : NaN;
  const expiresAt = Number.isFinite(expiresAtRaw) ? expiresAtRaw : Date.now() + 120_000;
  return { sessionId, connectUrl, expiresAt };
}

async function pollConnectSession(sessionId) {
  const settings = await getSettings();
  const cleanSessionId = trim(sessionId);
  if (!cleanSessionId) {
    throw new Error("Missing session id.");
  }

  const url = new URL(`${settings.apiBase}/extension/connect/session/status`);
  url.searchParams.set("sessionId", cleanSessionId);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  const status = trim(json?.status).toLowerCase();

  if (trim(json?.code)) {
    await exchangeCode(settings.apiBase, trim(json.code));
    return { status: "connected" };
  }

  if (status === "connected") {
    const auth = parseTokenResponse(json);
    await saveAuth(auth);
    await removeProfileCache();
    return { status: "connected" };
  }

  if (status === "expired" || status === "failed" || status === "cancelled") {
    return {
      status,
      error: trim(json?.error || json?.message),
    };
  }

  return { status: "pending" };
}

async function refreshAccessToken(apiBase, refreshToken) {
  const res = await fetch(`${apiBase}/extension/token/refresh`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${refreshToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  const auth = parseTokenResponse(json);
  await saveAuth(auth);
  return auth.accessToken;
}

async function revokeToken(apiBase, token) {
  if (!token) {
    await clearAuth();
    return;
  }
  await fetch(`${apiBase}/extension/token/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => {});
  await clearAuth();
}

// Single-flight refresh. Refresh tokens rotate on every successful refresh
// (server rewrites the DDB hash), so two concurrent refreshes from the same
// extension racing to the server will deterministically log the user out:
// the second one arrives with a now-stale refresh token, server returns
// 401 "Refresh token mismatch", clearAuth() fires.
//
// With ~10 ensureAccessToken call sites firing in parallel as the user
// opens Saved/Profile/Import tabs, this race was the cause of the
// "logs out every few minutes" reports. Coalesce all in-flight refresh
// requests onto a single shared promise so only one token rotation
// happens at a time.
let pendingRefresh = null;

async function performRefresh(apiBase, refreshToken) {
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = (async () => {
    try {
      return await refreshAccessToken(apiBase, refreshToken);
    } finally {
      pendingRefresh = null;
    }
  })();
  return pendingRefresh;
}

async function ensureAccessToken(settings) {
  const now = Date.now();
  if (settings.accessToken && settings.accessExpiresAt > now + ACCESS_SKEW_MS) {
    return settings.accessToken;
  }

  if (!settings.refreshToken || settings.refreshExpiresAt <= now + ACCESS_SKEW_MS) {
    await clearAuth();
    return "";
  }

  try {
    return await performRefresh(settings.apiBase, settings.refreshToken);
  } catch {
    // If the in-flight refresh already rotated the token (race we lost),
    // re-read storage one more time before giving up — the winning refresh
    // may have just written fresh tokens we can use.
    try {
      const fresh = await getSettings();
      if (fresh.accessToken && fresh.accessExpiresAt > Date.now() + ACCESS_SKEW_MS) {
        return fresh.accessToken;
      }
    } catch {}
    await clearAuth();
    return "";
  }
}

async function getAuthStatus() {
  const settings = await getSettings();
  const token = await ensureAccessToken(settings);
  return {
    connected: Boolean(token),
    stage: settings.apiBase,
  };
}

async function sendImport(payload) {
  const settings = await getSettings();
  const token = await ensureAccessToken(settings);
  if (!token) {
    throw new Error("Not connected. Please connect to Utably first.");
  }

  const res = await fetch(`${settings.apiBase}/extension/import-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const message = trim(json?.message || json?.error || "") || `HTTP ${res.status}`;
    const err = new Error(message);
    err.code = trim(json?.error || "");
    err.details = json?.details || null;
    throw err;
  }

  const json = await res.json().catch(() => ({}));
  return {
    id: trim(json?.id),
    applicationLink: trim(json?.applicationLink),
    status: trim(json?.status),
  };
}

async function findDuplicateImport(candidate) {
  const settings = await getSettings();
  const token = await ensureAccessToken(settings);
  if (!token) {
    throw new Error("Not connected. Please connect to Utably first.");
  }

  const res = await fetch(`${settings.apiBase}/extension/import-job/duplicate-check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(candidate || {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));
  return {
    duplicate: Boolean(json?.duplicate),
    match: json?.match || null,
  };
}

/**
 * Park a captured posting so it can be passed to a friend from the web app.
 *
 * The plugin deliberately does NOT perform the share itself: writing into
 * another user's inbox is a cross-user capability, and this token lives in
 * browser storage. Parking a draft writes only into the user's own account —
 * the same trust level the plugin already has — and the web app does the
 * actual sharing under the real session, with the user picking recipients.
 */
async function createShareDraft(posting) {
  const settings = await getSettings();
  const token = await ensureAccessToken(settings);
  if (!token) {
    throw new Error("Not connected. Please connect to Utably first.");
  }

  const res = await fetch(`${settings.apiBase}/extension/share-drafts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(posting || {}),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const message = trim(json?.message || json?.error || "") || `HTTP ${res.status}`;
    const err = new Error(message);
    err.code = trim(json?.error || "");
    err.details = json?.details || null;
    throw err;
  }

  const json = await res.json().catch(() => ({}));
  const draftId = trim(json?.draftId);
  // Without an id there is nothing to hand off — fail here rather than
  // opening the web app on an empty draft.
  if (!draftId) {
    throw new Error("Could not prepare the share. Please try again.");
  }
  return { draftId };
}

async function sendFitCheck(jobPosting) {
  const settings = await getSettings();

  const token = await ensureAccessToken(settings);
  if (!token) {
    throw new Error("Not connected. Please connect to Utably first.");
  }

  const appLocale = await getPluginLocale();

  const res = await fetch(`${settings.apiBase}/extension/llm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: "fitcheck",
      jobPosting,
      languageContext: { appLocale },
    }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const message = trim(json?.message || json?.error || "") || `HTTP ${res.status}`;
    const err = new Error(message);
    err.code = trim(json?.error || json?.code || "");
    throw err;
  }

  return await res.json();
}

async function getActiveHost(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const u = new URL(tab?.url || "");
    return (u.hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeConsentRecord(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  const cutoff = Date.now() - FILL_CONSENT_TTL_MS;
  for (const [host, value] of Object.entries(raw)) {
    const ts = Number(value?.ts || value || 0);
    if (!host || !Number.isFinite(ts) || ts < cutoff) continue;
    out[host] = { ts };
  }
  return out;
}

async function loadFillConsents() {
  const stored = await chrome.storage.local.get([FILL_CONSENTS_KEY]);
  return normalizeConsentRecord(stored[FILL_CONSENTS_KEY]);
}

async function saveFillConsent(host) {
  if (!host) return;
  const consents = await loadFillConsents();
  consents[host] = { ts: Date.now() };
  await chrome.storage.local.set({ [FILL_CONSENTS_KEY]: consents });
}

async function clearFillConsents() {
  await chrome.storage.local.remove([FILL_CONSENTS_KEY]);
}

async function clearProfileCache() {
  await removeProfileCache();
}

async function fetchProfile({ forceRefresh = false } = {}) {
  const locale = await getPluginLocale().catch(() => "");
  const settings = await getSettings();
  if (!forceRefresh) {
    const cached = await readProfileCache();
    if (
      cached?.profile &&
      cached?.locale === locale &&
      cached?.apiBase === settings.apiBase &&
      Number(cached.fetchedAt) > Date.now() - PROFILE_CACHE_TTL_MS
    ) {
      return { profile: cached.profile, cached: true };
    }
  }

  const token = await ensureAccessToken(settings);
  if (!token) {
    throw new Error("Not connected. Please connect to Utably first.");
  }

  // Pass the plugin's active locale so the backend can merge the matching
  // profile variant (skills, titles, academic_title etc. are localized).
  const profileUrl = new URL(`${settings.apiBase}/extension/profile`);
  if (locale) profileUrl.searchParams.set("locale", locale);
  const res = await fetch(profileUrl.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const profile = await res.json().catch(() => null);
  if (!profile || typeof profile !== "object") {
    throw new Error("Invalid profile response.");
  }
  await writeProfileCache({ profile, fetchedAt: Date.now(), locale, apiBase: settings.apiBase });
  return { profile, cached: false };
}

async function fetchAttachments({ forceRefresh = false } = {}) {
  // No on-disk caching — presigned URLs expire in 5 minutes and the metadata
  // is small. Each call re-issues the request so the URLs are always fresh.
  const settings = await getSettings();
  const token = await ensureAccessToken(settings);
  if (!token) {
    throw new Error("Not connected. Please connect to Utably first.");
  }

  const res = await fetch(`${settings.apiBase}/extension/attachments`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const json = await res.json().catch(() => null);
  if (!json || !Array.isArray(json.attachments)) {
    throw new Error("Invalid attachments response.");
  }
  return { attachments: json.attachments, forceRefresh };
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchAttachmentBytes(presignedUrl) {
  const res = await fetch(presignedUrl);
  if (!res.ok) {
    throw new Error(`Attachment fetch failed: HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new Error("Attachment exceeds 12 MB limit for browser injection.");
  }
  return arrayBufferToBase64(buf);
}

async function previewAttachmentUpload({ tabId, fileName, mime, kind }) {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    throw new Error("Invalid tab id.");
  }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ATTACHMENT_SCRIPT_FILES,
  });
  const frameResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (params) => {
      if (typeof globalThis.__utablyPreviewAttachment !== "function") return null;
      return globalThis.__utablyPreviewAttachment(params);
    },
    args: [{ fileName, mime, kind }],
  });
  const targets = [];
  for (const entry of frameResults || []) {
    const r = entry?.result;
    if (r?.matched) {
      targets.push({
        host: r.host,
        isTopFrame: Boolean(r.isTopFrame),
        inputDescription: r.inputDescription || "",
      });
    }
  }
  return { targets };
}

async function uploadAttachmentToPage({ tabId, attachment, expectedHost }) {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    throw new Error("Invalid tab id.");
  }
  if (!attachment?.presignedUrl) {
    throw new Error("Missing presigned URL.");
  }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ATTACHMENT_SCRIPT_FILES,
  });

  const base64 = await fetchAttachmentBytes(attachment.presignedUrl);
  const frameResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (params) => {
      if (typeof globalThis.__utablyUploadAttachment !== "function") return null;
      return globalThis.__utablyUploadAttachment(params);
    },
    args: [{
      base64,
      fileName: attachment.name,
      mime: attachment.mime,
      kind: attachment.kind,
      expectedHost,
    }],
  });

  let uploaded = 0;
  const reports = [];
  for (const entry of frameResults || []) {
    const r = entry?.result;
    if (!r) continue;
    if (r.uploaded) uploaded += 1;
    reports.push(r);
  }
  return { uploaded, reports };
}

async function placeAttachmentOnPage({ tabId, attachment, expectedHost }) {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    throw new Error("Invalid tab id.");
  }
  if (!attachment?.presignedUrl) {
    throw new Error("Missing presigned URL.");
  }

  await chrome.scripting.executeScript({
    target: { tabId }, // place mode runs in the top frame only — the user
                       // can only click in the frame they can see
    files: DROPMODE_SCRIPT_FILES,
  });

  const base64 = await fetchAttachmentBytes(attachment.presignedUrl);
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (params) => {
      if (typeof globalThis.__utablyEnterDropMode !== "function") return null;
      return await globalThis.__utablyEnterDropMode(params);
    },
    args: [{
      base64,
      fileName: attachment.name,
      mime: attachment.mime,
      kind: attachment.kind,
      expectedHost,
    }],
  });

  return result || { placed: false, reason: "no_result" };
}

async function runFormFill({ tabId, profile, dryRun = false, expectedHosts = null }) {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    throw new Error("Invalid tab id.");
  }
  if (!profile || typeof profile !== "object") {
    throw new Error("Missing profile data.");
  }

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: FILL_SCRIPT_FILES,
  });

  const callOptions = { dryRun: Boolean(dryRun) };
  if (!dryRun && Array.isArray(expectedHosts)) {
    callOptions.expectedHosts = expectedHosts;
  }

  const frameResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (data, options) => {
      if (typeof globalThis.__utablyRunFill !== "function") return null;
      return globalThis.__utablyRunFill(data, options || {});
    },
    args: [profile, callOptions],
  });

  // Aggregate per-host. For dry-run we want every host that WOULD receive
  // data; for real-fill we want what actually got filled. Aborted frames
  // (page changed mid-flow, or host not in consent list) are reported
  // separately so the UI can re-prompt instead of silently dropping fields.
  const byHost = new Map();
  let totalFilled = 0;
  let totalSkipped = 0;
  const aborted = [];
  for (const entry of frameResults || []) {
    const r = entry?.result;
    if (!r || typeof r !== "object") continue;
    if (r.aborted) {
      aborted.push({
        host: (r.host || "").toLowerCase(),
        reason: r.reason || "unknown",
        planFields: Array.isArray(r.planFields) ? r.planFields : [],
      });
      continue;
    }
    if (r.adapter === "none") continue;
    const host = (r.host || "").toLowerCase();
    if (!host) continue;
    const filled = Number(r.filled || 0);
    const skipped = Number(r.skipped || 0);
    totalFilled += filled;
    totalSkipped += skipped;
    // For dry-run, include hosts where filled is 0 but fields were planned.
    if (!dryRun && filled === 0) continue;
    if (dryRun && !(Array.isArray(r.fields) && r.fields.length)) continue;
    const existing = byHost.get(host) || {
      host,
      adapter: r.adapter,
      isTopFrame: Boolean(r.isTopFrame),
      filled: 0,
      fields: [],
    };
    existing.filled += filled;
    if (Array.isArray(r.fields)) {
      for (const f of r.fields) existing.fields.push(f);
    }
    byHost.set(host, existing);
  }
  const hosts = Array.from(byHost.values());
  return {
    hosts,
    filled: totalFilled,
    skipped: totalSkipped,
    aborted,
    // Backward-compat fields used by the success toast.
    adapter: hosts[0]?.adapter || "none",
    fields: hosts.flatMap((h) => h.fields),
  };
}

async function openSidePanelForActiveTab() {
  if (!chrome.sidePanel?.open) {
    throw new Error("Side panel API is unavailable in this Chrome version.");
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab?.windowId) {
    throw new Error("Missing active tab/window.");
  }
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "popup.html?mode=sidepanel",
    enabled: true,
  });
  await chrome.sidePanel.open({ windowId: tab.windowId });
}

async function openOrFocusWorkspaceTab() {
  const workspaceUrl = chrome.runtime.getURL(WORKSPACE_PATH);
  const existingTabs = await chrome.tabs.query({ url: workspaceUrl });
  const existingTab = existingTabs[0];
  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: workspaceUrl });
}

async function openPrimarySurfaceForActiveTab() {
  if (chrome.sidePanel?.open) {
    await openSidePanelForActiveTab();
    return;
  }
  await openOrFocusWorkspaceTab();
}

function normalizeCaptureTabs(rawValue) {
  if (!rawValue || typeof rawValue !== "object") return {};
  const cleaned = {};
  for (const [key, value] of Object.entries(rawValue)) {
    if (value) cleaned[String(key)] = true;
  }
  return cleaned;
}

async function getCaptureTabs() {
  const stored = await chrome.storage.local.get(CAPTURE_TABS_KEY);
  return normalizeCaptureTabs(stored[CAPTURE_TABS_KEY]);
}

async function isCaptureModeEnabledForTab(tabId) {
  const captureTabs = await getCaptureTabs();
  return Boolean(captureTabs[String(tabId)]);
}

async function saveCaptureTabs(captureTabs) {
  await chrome.storage.local.set({ [CAPTURE_TABS_KEY]: normalizeCaptureTabs(captureTabs) });
}

async function setCaptureModeForTab(tabId, enabled) {
  const captureTabs = await getCaptureTabs();
  const tabKey = String(tabId);
  const isEnabled = Boolean(enabled);

  if (isEnabled) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CAPTURE_SCRIPT_FILE],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        globalThis.__utablyCaptureController?.setEnabled(true);
      },
    });
    captureTabs[tabKey] = true;
  } else {
    await chrome.scripting
      .executeScript({
        target: { tabId },
        func: () => {
          globalThis.__utablyCaptureController?.setEnabled(false);
        },
      })
      .catch(() => {});
    delete captureTabs[tabKey];
  }

  await saveCaptureTabs(captureTabs);
  return isEnabled;
}

function normalizeDraft(rawValue) {
  if (!rawValue || typeof rawValue !== "object") {
    return {
      applicationDate: "",
      jobTitle: "",
      companyName: "",
      location: "",
      recruiterName: "",
      jobText: "",
      jobUrl: "",
      updatedAt: 0,
    };
  }
  return {
    applicationDate: trim(rawValue.applicationDate),
    jobTitle: trim(rawValue.jobTitle),
    companyName: trim(rawValue.companyName),
    location: trim(rawValue.location),
    recruiterName: trim(rawValue.recruiterName),
    jobText: trim(rawValue.jobText),
    jobUrl: trim(rawValue.jobUrl),
    updatedAt: Number(rawValue.updatedAt || 0),
  };
}

async function getDraft() {
  const stored = await chrome.storage.local.get(DRAFT_STORAGE_KEY);
  return normalizeDraft(stored[DRAFT_STORAGE_KEY]);
}

async function saveDraft(draft) {
  const normalized = normalizeDraft(draft);
  await chrome.storage.local.set({ [DRAFT_STORAGE_KEY]: normalized });
  return normalized;
}

async function applyCaptureToDraft(payload) {
  const field = trim(payload?.field);
  const text = trim(payload?.text);
  const pageUrl = trim(payload?.pageUrl);
  if (!text) {
    throw new Error("Missing captured text.");
  }

  const allowedFields = new Set(["jobTitle", "companyName", "location", "recruiterName", "jobText"]);
  if (!allowedFields.has(field)) {
    throw new Error("Invalid capture field.");
  }

  const draft = await getDraft();
  if (field === "jobText") {
    const current = draft.jobText ? `${draft.jobText}\n\n` : "";
    draft.jobText = `${current}${text}`.trim();
  } else {
    draft[field] = text;
  }
  if (!draft.jobUrl && pageUrl) {
    draft.jobUrl = pageUrl;
  }
  if (!draft.applicationDate) {
    draft.applicationDate = new Date().toISOString().slice(0, 10);
  }
  draft.updatedAt = Date.now();

  const saved = await saveDraft(draft);
  chrome.runtime.sendMessage({ type: "UTABLY_DRAFT_UPDATED", draft: saved }).catch(() => {});
  return saved;
}

async function configureActionClickSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function handleExternalConnectCode(code) {
  const settings = await getSettings();
  const clean = trim(code);
  if (!clean) {
    throw new Error("Missing code.");
  }
  await exchangeCode(settings.apiBase, clean);
}

async function ensureUtablyTabGroup(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.id) {
    throw new Error("Tab not found.");
  }

  let groupId = tab.groupId;
  if (typeof groupId !== "number" || groupId < 0) {
    groupId = await chrome.tabs.group({ tabIds: [tab.id] });
  }

  await chrome.tabGroups.update(groupId, {
    title: "Utably",
    color: "cyan",
    collapsed: false,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "UTABLY_EXCHANGE_CODE") {
    (async () => {
      const settings = await getSettings();
      const code = trim(message.code);
      if (!code) {
        sendResponse({ ok: false, error: "Missing code." });
        return;
      }

      try {
        await exchangeCode(settings.apiBase, code);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Connect failed." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_REVOKE") {
    (async () => {
      const settings = await getSettings();
      const token = settings.refreshToken || settings.accessToken;
      await revokeToken(settings.apiBase, token);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "UTABLY_SEND") {
    (async () => {
      try {
        const result = await sendImport(message.payload || {});
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err?.message || "Failed to send.",
          code: err?.code || "",
          details: err?.details || null,
        });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_SHARE_DRAFT") {
    (async () => {
      try {
        const result = await createShareDraft(message.posting || {});
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err?.message || "Failed to prepare the share.",
          code: err?.code || "",
          details: err?.details || null,
        });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_FIND_DUPLICATE") {
    (async () => {
      try {
        const result = await findDuplicateImport(message.candidate || {});
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to check duplicates." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_FITCHECK") {
    (async () => {
      try {
        const result = await sendFitCheck(message.jobPosting || {});
        sendResponse({ ok: true, result });
      } catch (err) {
        console.error("[FitCheck BG] Error:", err);
        sendResponse({
          ok: false,
          error: err?.message || "FitCheck failed.",
          code: err?.code || "",
        });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_AUTH_STATUS") {
    (async () => {
      try {
        const status = await getAuthStatus();
        sendResponse({ ok: true, ...status });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to read auth state." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_CONNECT_SESSION_START") {
    (async () => {
      try {
        const session = await startConnectSession(message || {});
        sendResponse({ ok: true, ...session });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to start connect session." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_CONNECT_SESSION_POLL") {
    (async () => {
      try {
        const result = await pollConnectSession(message.sessionId);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to poll connect session." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_CAPTURE_GET_MODE") {
    (async () => {
      try {
        const tabId = Number(message.tabId);
        if (!Number.isInteger(tabId) || tabId <= 0) {
          sendResponse({ ok: false, error: "Invalid tab id." });
          return;
        }
        const enabled = await isCaptureModeEnabledForTab(tabId);
        sendResponse({ ok: true, enabled });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to read capture mode." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_CAPTURE_SET_MODE") {
    (async () => {
      try {
        const tabId = Number(message.tabId);
        if (!Number.isInteger(tabId) || tabId <= 0) {
          sendResponse({ ok: false, error: "Invalid tab id." });
          return;
        }
        const enabled = await setCaptureModeForTab(tabId, Boolean(message.enabled));
        sendResponse({ ok: true, enabled });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to update capture mode." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_CAPTURE_ASSIGN") {
    (async () => {
      try {
        const draft = await applyCaptureToDraft(message);
        sendResponse({ ok: true, draft });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to save capture." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_GET_PROFILE") {
    (async () => {
      try {
        const result = await fetchProfile({ forceRefresh: Boolean(message.forceRefresh) });
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to load profile." });
      }
    })();
    return true;
  }

  // Read-only peek at the session cache for the header avatar. Never calls
  // the API: the popup opens on every job page, and the profile is meant to
  // be fetched when the user asks for it (Profile tab, or a fill), not as a
  // side effect of showing chrome. A cold cache just means no avatar yet.
  if (message?.type === "UTABLY_PEEK_PROFILE") {
    (async () => {
      try {
        const cached = await readProfileCache();
        // No TTL check here on purpose. The 5-minute window exists so autofill
        // never writes stale values into a form; the avatar is cosmetic, so a
        // stale name and photo are fine and stop it flickering back to the
        // generic glyph. Still session-only, so it clears when the browser does.
        sendResponse({ ok: true, profile: cached?.profile || null });
      } catch {
        sendResponse({ ok: true, profile: null });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_FILL_PREVIEW") {
    (async () => {
      try {
        const tabId = Number(message.tabId);
        if (!Number.isInteger(tabId) || tabId <= 0) {
          sendResponse({ ok: false, error: "Invalid tab id." });
          return;
        }
        const host = await getActiveHost(tabId);
        if (!host) {
          sendResponse({ ok: false, error: "Cannot determine page host." });
          return;
        }
        const { profile } = await fetchProfile({ forceRefresh: false });
        const report = await runFormFill({ tabId, profile, dryRun: true });
        const consents = await loadFillConsents();
        sendResponse({
          ok: true,
          host,
          report,
          consentRemembered: Boolean(consents[host]),
        });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to preview fill." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_FILL_PAGE") {
    (async () => {
      try {
        const tabId = Number(message.tabId);
        if (!Number.isInteger(tabId) || tabId <= 0) {
          sendResponse({ ok: false, error: "Invalid tab id." });
          return;
        }
        const host = await getActiveHost(tabId);
        if (!host) {
          sendResponse({ ok: false, error: "Cannot determine page host." });
          return;
        }
        const expectedHosts = Array.isArray(message.expectedHosts) ? message.expectedHosts : null;
        if (!expectedHosts) {
          // Refuse to fill without an explicit consent list — the user
          // must have seen the preview and approved each recipient.
          sendResponse({ ok: false, code: "CONSENT_MISSING", error: "Consent list required." });
          return;
        }
        const { profile } = await fetchProfile({ forceRefresh: false });
        const report = await runFormFill({ tabId, profile, dryRun: false, expectedHosts });

        // If any frame aborted because its planned fields no longer match
        // the user-approved set (page mutated between preview and fill),
        // surface that so the UI can re-preview rather than silently
        // skipping fields.
        if (Array.isArray(report.aborted) && report.aborted.length > 0) {
          sendResponse({
            ok: false,
            code: "PAGE_CHANGED",
            error: "Page changed after consent. Please review again.",
            aborted: report.aborted,
            report,
          });
          return;
        }
        if (message.rememberConsent) {
          await saveFillConsent(host);
        }
        sendResponse({ ok: true, host, report });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to fill page." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_GET_APPLICATION") {
    (async () => {
      try {
        const id = String(message.applicationId || "").trim();
        if (!id) {
          sendResponse({ ok: false, error: "Missing application id." });
          return;
        }
        const settings = await getSettings();
        const token = await ensureAccessToken(settings);
        if (!token) {
          sendResponse({ ok: false, error: "Not connected. Please connect to Utably first." });
          return;
        }
        const res = await fetch(
          `${settings.apiBase}/extension/applications/${encodeURIComponent(id)}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          sendResponse({ ok: false, error: text || `HTTP ${res.status}` });
          return;
        }
        const json = await res.json().catch(() => null);
        sendResponse({ ok: true, application: json?.application || null });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to load application." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_SAVE_APPLICATION_FITCHECK") {
    (async () => {
      try {
        const id = String(message.applicationId || "").trim();
        const fitAnalysis = message.fitAnalysis;
        if (!id) {
          sendResponse({ ok: false, error: "Missing application id." });
          return;
        }
        if (!fitAnalysis || typeof fitAnalysis !== "object") {
          sendResponse({ ok: false, error: "Missing fit analysis." });
          return;
        }
        const settings = await getSettings();
        const token = await ensureAccessToken(settings);
        if (!token) {
          sendResponse({ ok: false, error: "Not connected." });
          return;
        }
        const res = await fetch(
          `${settings.apiBase}/extension/applications/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ fitAnalysis }),
          }
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          sendResponse({ ok: false, error: text || `HTTP ${res.status}` });
          return;
        }
        const json = await res.json().catch(() => null);
        sendResponse({ ok: true, application: json });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to save FitCheck." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_UPDATE_APPLICATION_STATUS") {
    (async () => {
      try {
        const id = String(message.applicationId || "").trim();
        const status = String(message.status || "").trim();
        if (!id) {
          sendResponse({ ok: false, error: "Missing application id." });
          return;
        }
        const settings = await getSettings();
        const token = await ensureAccessToken(settings);
        if (!token) {
          sendResponse({ ok: false, error: "Not connected. Please connect to Utably first." });
          return;
        }
        const res = await fetch(
          `${settings.apiBase}/extension/applications/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status }),
          }
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          sendResponse({ ok: false, error: text || `HTTP ${res.status}` });
          return;
        }
        const json = await res.json().catch(() => null);
        sendResponse({ ok: true, application: json });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to update status." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_LIST_APPLICATIONS") {
    (async () => {
      try {
        const settings = await getSettings();
        const token = await ensureAccessToken(settings);
        if (!token) {
          sendResponse({ ok: false, error: "Not connected. Please connect to Utably first." });
          return;
        }
        const res = await fetch(`${settings.apiBase}/extension/applications`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          sendResponse({ ok: false, error: text || `HTTP ${res.status}` });
          return;
        }
        const json = await res.json().catch(() => null);
        if (!json || !Array.isArray(json.applications)) {
          sendResponse({ ok: false, error: "Invalid applications response." });
          return;
        }
        sendResponse({ ok: true, applications: json.applications });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to list applications." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_ATTACHMENT_DOWNLOAD") {
    (async () => {
      try {
        const attachment = message.attachment || {};
        if (!attachment.presignedUrl) {
          sendResponse({ ok: false, error: "Missing presigned URL." });
          return;
        }
        const downloadId = await chrome.downloads.download({
          url: attachment.presignedUrl,
          filename: attachment.name || "utably-download",
          saveAs: Boolean(message.saveAs),
          conflictAction: "uniquify",
        });
        sendResponse({ ok: true, downloadId });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Download failed." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_LIST_ATTACHMENTS") {
    (async () => {
      try {
        const result = await fetchAttachments({ forceRefresh: Boolean(message.forceRefresh) });
        sendResponse({ ok: true, attachments: result.attachments });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to list attachments." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_ATTACHMENT_PREVIEW") {
    (async () => {
      try {
        const tabId = Number(message.tabId);
        if (!Number.isInteger(tabId) || tabId <= 0) {
          sendResponse({ ok: false, error: "Invalid tab id." });
          return;
        }
        const host = await getActiveHost(tabId);
        if (!host) {
          sendResponse({ ok: false, error: "Cannot determine page host." });
          return;
        }
        const { targets } = await previewAttachmentUpload({
          tabId,
          fileName: message.attachment?.name,
          mime: message.attachment?.mime,
          kind: message.attachment?.kind,
        });
        sendResponse({ ok: true, host, targets });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Preview failed." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_ATTACHMENT_PLACE") {
    (async () => {
      try {
        const tabId = Number(message.tabId);
        if (!Number.isInteger(tabId) || tabId <= 0) {
          sendResponse({ ok: false, error: "Invalid tab id." });
          return;
        }
        const host = await getActiveHost(tabId);
        if (!host) {
          sendResponse({ ok: false, error: "Cannot determine page host." });
          return;
        }
        if (message.expectedHost && message.expectedHost !== host) {
          sendResponse({ ok: false, code: "HOST_CHANGED", error: "Page navigated since consent." });
          return;
        }
        const result = await placeAttachmentOnPage({
          tabId,
          attachment: message.attachment || {},
          expectedHost: host,
        });
        sendResponse({ ok: true, host, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Place failed." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_ATTACHMENT_UPLOAD") {
    (async () => {
      try {
        const tabId = Number(message.tabId);
        if (!Number.isInteger(tabId) || tabId <= 0) {
          sendResponse({ ok: false, error: "Invalid tab id." });
          return;
        }
        const host = await getActiveHost(tabId);
        if (!host) {
          sendResponse({ ok: false, error: "Cannot determine page host." });
          return;
        }
        if (message.expectedHost && message.expectedHost !== host) {
          sendResponse({ ok: false, code: "HOST_CHANGED", error: "Page navigated since consent." });
          return;
        }
        const result = await uploadAttachmentToPage({
          tabId,
          attachment: message.attachment || {},
          expectedHost: host,
        });
        sendResponse({ ok: true, host, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Upload failed." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_FILL_CONSENT_STATUS") {
    (async () => {
      try {
        const consents = await loadFillConsents();
        const hosts = Object.keys(consents).sort();
        sendResponse({ ok: true, consents, hosts });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to read consents." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_CLEAR_FILL_CONSENTS") {
    (async () => {
      try {
        await clearFillConsents();
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to clear consents." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_CLEAR_PROFILE_CACHE") {
    (async () => {
      try {
        await clearProfileCache();
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to clear profile cache." });
      }
    })();
    return true;
  }

  if (message?.type === "UTABLY_ENSURE_GROUP") {
    (async () => {
      try {
        const tabId = Number(message.tabId);
        if (!Number.isInteger(tabId) || tabId <= 0) {
          sendResponse({ ok: false, error: "Invalid tab id." });
          return;
        }
        await ensureUtablyTabGroup(tabId);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || "Failed to update Utably tab group." });
      }
    })();
    return true;
  }
});

chrome.action.onClicked.addListener(async () => {
  try {
    await openPrimarySurfaceForActiveTab();
  } catch (error) {
    console.warn("Failed to open Utably workspace surface from action click.", error);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  configureActionClickSidePanel().catch(() => {});
  // One-time migration: wipe any pre-MV3-session PII that older builds left
  // in chrome.storage.local. Safe to run repeatedly.
  chrome.storage.local.remove([PROFILE_CACHE_KEY]).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  configureActionClickSidePanel().catch(() => {});
});

configureActionClickSidePanel().catch(() => {});

chrome.tabs.onRemoved.addListener((tabId) => {
  getCaptureTabs()
    .then((captureTabs) => {
      const tabKey = String(tabId);
      if (!captureTabs[tabKey]) return;
      delete captureTabs[tabKey];
      return saveCaptureTabs(captureTabs);
    })
    .catch(() => {});
});

// Optional-chained: Firefox does not implement `externally_connectable` and
// therefore has no `onMessageExternal`. Without the guard this throws at the
// top level of the background script and takes the whole extension down.
chrome.runtime.onMessageExternal?.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "UTABLY_EXTERNAL_CONNECT") return;
  (async () => {
    try {
      await handleExternalConnectCode(message.code);
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || "External connect failed." });
    }
  })();
  return true;
});
