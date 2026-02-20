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

async function clearAuth() {
  await chrome.storage.local.remove([
    "extAccessToken",
    "extRefreshToken",
    "extAccessExpiresAt",
    "extRefreshExpiresAt",
  ]);
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
    return await refreshAccessToken(settings.apiBase, settings.refreshToken);
  } catch {
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
    await chrome.tabs.create({ url: settings.connectUrl || DEFAULT_CONNECT_URL });
    throw new Error("Not connected. Opened connect page.");
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
}

async function findDuplicateImport(candidate) {
  const settings = await getSettings();
  const token = await ensureAccessToken(settings);
  if (!token) {
    await chrome.tabs.create({ url: settings.connectUrl || DEFAULT_CONNECT_URL });
    throw new Error("Not connected. Opened connect page.");
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
        await sendImport(message.payload || {});
        sendResponse({ ok: true });
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

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
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
