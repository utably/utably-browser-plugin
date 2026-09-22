import { DEFAULT_LOCAL_PORT, STAGE_API_BASE, STAGE_APP_URL, STAGE_CONNECT_URL } from "./config.js";
import {
  applyTranslations,
  getLocalePreference,
  setLocalePreference,
  t,
} from "./i18n.js";

export function normalizeLocalPort(rawPort) {
  const port = Number.parseInt(String(rawPort || ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return DEFAULT_LOCAL_PORT;
  }
  return String(port);
}

export function getSelectedStage(els) {
  return els.debugMode.checked ? els.stage.value || "prod" : "prod";
}

export function isSidePanelMode() {
  return new URLSearchParams(location.search).get("mode") === "sidepanel";
}

export function isWorkspaceMode() {
  return new URLSearchParams(location.search).get("mode") === "workspace";
}

export function updateStageSettingsUi(els) {
  const debugEnabled = els.debugMode.checked;
  els.stageRow.classList.toggle("hidden", !debugEnabled);
  const showLocalPort = debugEnabled && (els.stage.value || "prod") === "local";
  els.localPortRow.classList.toggle("hidden", !showLocalPort);
}

export async function loadSettings(els) {
  const stored = await chrome.storage.local.get(["debugMode", "stage", "localPort"]);
  els.debugMode.checked = Boolean(stored.debugMode);
  els.stage.value = stored.stage || "prod";
  els.localPort.value = normalizeLocalPort(stored.localPort);
  if (els.languageSelect) {
    els.languageSelect.value = await getLocalePreference();
  }
  updateStageSettingsUi(els);
}

// Tokens are minted per API stage — a token issued by one stage's API must
// never be sent to another stage's API, and a cached profile from one stage
// must never be shown while connected to another.
function effectiveApiBase({ debugMode, stage }) {
  const mapped = STAGE_API_BASE[stage || "prod"] || STAGE_API_BASE.prod;
  return debugMode ? mapped : STAGE_API_BASE.prod;
}

export async function saveSettings(els, setStatus) {
  const localPort = normalizeLocalPort(els.localPort.value);
  els.localPort.value = localPort;

  const stored = await chrome.storage.local.get(["debugMode", "stage"]);
  const previousApiBase = effectiveApiBase({
    debugMode: Boolean(stored.debugMode),
    stage: stored.stage,
  });
  const nextApiBase = effectiveApiBase({
    debugMode: els.debugMode.checked,
    stage: els.stage.value || "prod",
  });
  const stageChanged = previousApiBase !== nextApiBase;

  // Revoke BEFORE writing the new settings so the background revokes the
  // token against the API that issued it. This also wipes the cached
  // profile, so nothing from the old stage lingers.
  if (stageChanged) {
    await chrome.runtime.sendMessage({ type: "UTABLY_REVOKE" }).catch(() => {});
  }

  await chrome.storage.local.set({
    debugMode: els.debugMode.checked,
    stage: els.stage.value || "prod",
    localPort,
  });
  if (els.languageSelect) {
    await setLocalePreference(els.languageSelect.value);
    applyTranslations(document);
  }
  setStatus(stageChanged ? t("settings.savedStageChanged") : t("settings.saved"));
  return { stageChanged };
}

export function getConnectUrl(els) {
  const stage = getSelectedStage(els);
  if (stage === "local") {
    const port = normalizeLocalPort(els.localPort.value);
    return `https://app.dev.utably.com:${port}/extension/connect`;
  }
  return STAGE_CONNECT_URL[stage] || STAGE_CONNECT_URL.prod;
}

export function getAppUrl(els) {
  const stage = getSelectedStage(els);
  if (stage === "local") {
    const port = normalizeLocalPort(els.localPort.value);
    return `https://app.dev.utably.com:${port}`;
  }
  return STAGE_APP_URL[stage] || STAGE_APP_URL.prod;
}
