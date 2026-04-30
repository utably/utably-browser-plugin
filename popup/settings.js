import { DEFAULT_LOCAL_PORT, STAGE_APP_URL, STAGE_CONNECT_URL } from "./config.js";
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

export function toggleSettingsPanel(els) {
  els.settings.classList.toggle("hidden");
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

export async function saveSettings(els, setStatus) {
  const localPort = normalizeLocalPort(els.localPort.value);
  els.localPort.value = localPort;
  await chrome.storage.local.set({
    debugMode: els.debugMode.checked,
    stage: els.stage.value || "prod",
    localPort,
  });
  if (els.languageSelect) {
    await setLocalePreference(els.languageSelect.value);
    applyTranslations(document);
  }
  setStatus(t("settings.saved"));
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
