import { clearStatus, getDom, setStatus, trimOrEmpty } from "./dom.js";
import {
  getAppUrl,
  getConnectUrl,
  isSidePanelMode,
  isWorkspaceMode,
  loadSettings,
  saveSettings,
  toggleSettingsPanel,
  updateStageSettingsUi,
} from "./settings.js";
import { buildApplicationPayload } from "./payload.js";
import {
  ensureHostAccessForTab,
  extractIntoForm,
  getActiveTab,
  prefillSourceUrl,
  refreshActiveTabContext,
} from "./extraction.js";
import { applyTranslations, getLocale, loadLocale, setLocalePreference, t } from "./i18n.js";

const DRAFT_STORAGE_KEY = "utablyDraft";
const CONNECT_PENDING_KEY = "utablyConnectPending";
const MANUAL_FALLBACK_UNTIL_KEY = "utablyManualFallbackUntil";
const MANUAL_FALLBACK_MS = 120_000;
const IS_FIREFOX = /firefox/i.test(navigator.userAgent);
const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Host access is obtained at runtime via `optional_host_permissions` — the
// user gets a one-time Chrome prompt ("Allow this extension to read and
// change all your data on websites you visit") the first time they invoke
// Auto-fill or Capture. This must be called *synchronously* from within a
// user-gesture handler (e.g. a click listener) so Chrome recognizes the
// gesture and shows the prompt. Returns a Promise<boolean>: true if the
// user already granted or just granted, false on denial or error.
function requestBroadHostAccessFromGesture() {
  if (!chrome?.permissions?.request) {
    return Promise.resolve(false);
  }
  try {
    return chrome.permissions
      .request({ origins: ["*://*/*"] })
      .then((granted) => Boolean(granted))
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

function normalizeKind(value) {
  return value === "Applied" ? "Applied" : "Saved";
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
      kind: "Saved",
      updatedAt: 0,
    };
  }
  return {
    applicationDate: trimOrEmpty(rawValue.applicationDate),
    jobTitle: trimOrEmpty(rawValue.jobTitle),
    companyName: trimOrEmpty(rawValue.companyName),
    location: trimOrEmpty(rawValue.location),
    recruiterName: trimOrEmpty(rawValue.recruiterName),
    jobText: trimOrEmpty(rawValue.jobText),
    jobUrl: trimOrEmpty(rawValue.jobUrl),
    kind: normalizeKind(rawValue.kind),
    updatedAt: Number(rawValue.updatedAt || 0),
  };
}

function getSelectedKind(els) {
  const active = els.kindOptions?.find((btn) => btn.classList.contains("is-active"));
  return normalizeKind(active?.dataset?.kind);
}

function setSelectedKind(els, kind) {
  const next = normalizeKind(kind);
  els.kindOptions?.forEach((btn) => {
    const isActive = btn.dataset.kind === next;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-checked", isActive ? "true" : "false");
  });
}

function showSaveSuccess(els, { applicationLink, kind }) {
  if (!els.saveSuccessNotice) return;
  const messageKey = kind === "Saved" ? "success.savedSaved" : "success.savedApplied";
  if (els.saveSuccessText) {
    els.saveSuccessText.textContent = t(messageKey);
  }
  if (els.openSavedBtn) {
    if (applicationLink) {
      els.openSavedBtn.dataset.appLink = applicationLink;
      els.openSavedBtn.classList.remove("hidden");
    } else {
      els.openSavedBtn.dataset.appLink = "";
      els.openSavedBtn.classList.add("hidden");
    }
  }
  els.saveSuccessNotice.classList.remove("hidden");
  if (els.previewPanel) {
    els.previewPanel.classList.add("hidden");
  }
}

function hideSaveSuccess(els) {
  if (!els.saveSuccessNotice) return;
  els.saveSuccessNotice.classList.add("hidden");
  if (els.openSavedBtn) {
    els.openSavedBtn.dataset.appLink = "";
  }
  if (els.previewPanel) {
    els.previewPanel.classList.remove("hidden");
  }
}

function buildDraftFromForm(els) {
  return {
    applicationDate: trimOrEmpty(els.applicationDate.value),
    jobTitle: trimOrEmpty(els.jobTitle.value),
    companyName: trimOrEmpty(els.companyName.value),
    location: trimOrEmpty(els.location.value),
    recruiterName: trimOrEmpty(els.recruiterName.value),
    jobText: trimOrEmpty(els.jobText.value),
    jobUrl: trimOrEmpty(els.jobUrl.value),
    kind: getSelectedKind(els),
    updatedAt: Date.now(),
  };
}

function applyDraftToForm(els, rawDraft) {
  const draft = normalizeDraft(rawDraft);
  els.applicationDate.value = draft.applicationDate || els.applicationDate.value || new Date().toISOString().slice(0, 10);
  els.jobTitle.value = draft.jobTitle || els.jobTitle.value;
  els.companyName.value = draft.companyName || els.companyName.value;
  els.location.value = draft.location || els.location.value;
  els.recruiterName.value = draft.recruiterName || els.recruiterName.value;
  els.jobText.value = draft.jobText || els.jobText.value;
  els.jobUrl.value = draft.jobUrl || els.jobUrl.value;
  setSelectedKind(els, draft.kind);
  return draft;
}

async function loadDraftFromStorage() {
  const stored = await chrome.storage.local.get([DRAFT_STORAGE_KEY]);
  return normalizeDraft(stored[DRAFT_STORAGE_KEY]);
}

async function saveDraftToStorage(els) {
  const draft = buildDraftFromForm(els);
  await chrome.storage.local.set({ [DRAFT_STORAGE_KEY]: draft });
}

async function clearDraftFromStorage() {
  await chrome.storage.local.remove([DRAFT_STORAGE_KEY]);
}

function setPreviewMeta(els, result) {
  const adapter = trimOrEmpty(result?.adapter);
  if (!adapter) {
    els.previewMeta.textContent = "";
    els.previewMeta.classList.add("hidden");
    return;
  }
  els.previewMeta.textContent = `Source: ${adapter}`;
  els.previewMeta.classList.remove("hidden");
}

function clearFieldError(input, errorEl) {
  input.classList.remove("input-error");
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}

function showFieldError(input, errorEl, message) {
  input.classList.add("input-error");
  errorEl.textContent = message;
  errorEl.classList.remove("hidden");
}

function clearValidationErrors(els) {
  clearFieldError(els.jobTitle, els.jobTitleError);
  clearFieldError(els.companyName, els.companyNameError);
}

function getDuplicateCandidate(els) {
  return {
    jobTitle: trimOrEmpty(els.jobTitle.value),
    companyName: trimOrEmpty(els.companyName.value),
    jobUrl: trimOrEmpty(els.jobUrl.value),
  };
}

function clearDuplicateNotice(els) {
  els.duplicateNotice.classList.add("hidden");
  els.duplicateNoticeText.textContent = t("duplicate.alreadyAdded");
}

function renderDuplicateNotice(els, match) {
  const title = trimOrEmpty(match?.jobTitle) || t("duplicate.alreadyAdded");
  const company = trimOrEmpty(match?.companyName);
  els.duplicateNoticeText.textContent = company ? `${title} — ${company}` : title;
  els.duplicateNotice.classList.remove("hidden");
}

async function checkDuplicate(els) {
  const candidate = getDuplicateCandidate(els);
  if (!candidate.jobTitle || !candidate.companyName) {
    clearDuplicateNotice(els);
    return null;
  }
  const response = await chrome.runtime.sendMessage({ type: "UTABLY_FIND_DUPLICATE", candidate });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to check duplicates.");
  }
  const match = response?.duplicate ? response.match || null : null;
  if (match) {
    renderDuplicateNotice(els, match);
  } else {
    clearDuplicateNotice(els);
  }
  return match;
}

function setSendAvailability(els, gate) {
  const disabled = !gate.allowSend;
  els.send.disabled = disabled;
  els.send.dataset.forceDisabled = disabled ? "1" : "0";
}

function validateRequiredFields(els) {
  clearValidationErrors(els);
  let isValid = true;

  if (!trimOrEmpty(els.jobTitle.value)) {
    showFieldError(els.jobTitle, els.jobTitleError, t("errors.jobTitleRequired"));
    isValid = false;
  }
  if (!trimOrEmpty(els.companyName.value)) {
    showFieldError(els.companyName, els.companyNameError, t("errors.companyRequired"));
    isValid = false;
  }

  return isValid;
}

function getFocusableElements(container) {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter((element) => {
    if (element.disabled) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function withBusyButton(button, loadingText, action) {
  const idleText = button.dataset.idleText || button.textContent || "";
  button.dataset.idleText = idleText;
  button.classList.add("is-loading");
  button.disabled = true;
  button.textContent = loadingText;

  return Promise.resolve()
    .then(action)
    .finally(() => {
      button.classList.remove("is-loading");
      button.disabled = button.dataset.forceDisabled === "1";
      button.textContent = idleText;
    });
}

function createAuthController(els, setStatusText) {
  let connectPollHandle = null;
  let manualFallbackTimer = null;
  const showManualCodeFallback = (untilTs = Date.now() + MANUAL_FALLBACK_MS, persist = true) => {
    els.manualCodePanel.classList.remove("hidden");
    if (persist) {
      chrome.storage.local.set({ [MANUAL_FALLBACK_UNTIL_KEY]: Number(untilTs || 0) }).catch(() => {});
    }
  };
  const hideManualCodeFallback = () => {
    els.manualCodePanel.classList.add("hidden");
    chrome.storage.local.remove([MANUAL_FALLBACK_UNTIL_KEY]).catch(() => {});
  };
  const clearManualFallbackTimer = () => {
    if (!manualFallbackTimer) return;
    clearTimeout(manualFallbackTimer);
    manualFallbackTimer = null;
  };
  const armManualFallbackTimer = () => {
    clearManualFallbackTimer();
    manualFallbackTimer = setTimeout(() => {
      showManualCodeFallback();
    }, 3000);
  };
  const savePendingConnect = (sessionId, expiresAt) => {
    chrome.storage.local
      .set({
        [CONNECT_PENDING_KEY]: {
          sessionId: trimOrEmpty(sessionId),
          expiresAt: Number(expiresAt || 0),
        },
      })
      .catch(() => {});
  };
  const clearPendingConnect = () => {
    chrome.storage.local.remove([CONNECT_PENDING_KEY]).catch(() => {});
  };

  async function refreshAuthState() {
    const response = await chrome.runtime.sendMessage({ type: "UTABLY_AUTH_STATUS" });
    const connected = Boolean(response?.ok && response?.connected);
    if (!connected) setPreviewMeta(els, null);

    els.authGate.classList.toggle("hidden", connected);
    els.appContent.classList.toggle("hidden", !connected);
    els.logoutBtn.classList.toggle("hidden", !connected);

    if (connected) {
      hideManualCodeFallback();
      await prefillSourceUrl(els);
    }
    return connected;
  }

  function stopConnectPolling() {
    if (!connectPollHandle) return;
    clearInterval(connectPollHandle);
    connectPollHandle = null;
  }

  function startConnectPolling(sessionId, expiresAt) {
    stopConnectPolling();
    let attempts = 0;
    connectPollHandle = setInterval(async () => {
      attempts += 1;
      const poll = await chrome.runtime
        .sendMessage({ type: "UTABLY_CONNECT_SESSION_POLL", sessionId })
        .catch(() => ({ ok: false }));

      if (poll?.ok && poll.status === "connected") {
        stopConnectPolling();
        clearManualFallbackTimer();
        clearPendingConnect();
        await refreshAuthState().catch(() => false);
        setStatusText(t("status.connected"), "success");
        return;
      }

      if (poll?.ok && (poll.status === "expired" || poll.status === "failed" || poll.status === "cancelled")) {
        stopConnectPolling();
        clearPendingConnect();
        showManualCodeFallback();
        setStatusText(
          poll.error || "Connect session ended. Paste the one-time code below to finish connecting.",
          "info"
        );
        return;
      }

      if (Date.now() > Number(expiresAt || 0)) {
        stopConnectPolling();
        clearPendingConnect();
        showManualCodeFallback();
        setStatusText("Connect session expired. Start again or paste the one-time code.", "info");
        return;
      }

      if (attempts % 3 === 0) {
        const connected = await refreshAuthState().catch(() => false);
        if (connected) {
          stopConnectPolling();
          setStatusText(t("status.connected"), "success");
          return;
        }
      }

      if (attempts >= 40) {
        stopConnectPolling();
        clearPendingConnect();
        showManualCodeFallback();
        setStatusText("Still waiting for connection. Paste the one-time code as a fallback.", "info");
      }
    }, 1500);
    savePendingConnect(sessionId, expiresAt);
    armManualFallbackTimer();
  }

  function startLegacyConnectPolling() {
    stopConnectPolling();
    let attempts = 0;
    connectPollHandle = setInterval(async () => {
      attempts += 1;
      const connected = await refreshAuthState().catch(() => false);
      if (connected) {
        stopConnectPolling();
        clearManualFallbackTimer();
        setStatusText(t("status.connected"), "success");
        return;
      }
      if (attempts >= 40) {
        stopConnectPolling();
        showManualCodeFallback();
        setStatusText("Still not connected. Paste the one-time code as a fallback.", "info");
      }
    }, 1500);
  }

  async function openConnect() {
    const preferredConnectUrl = getConnectUrl(els);
    const session = await chrome.runtime.sendMessage({
      type: "UTABLY_CONNECT_SESSION_START",
      preferredConnectUrl,
    });
    if (!session?.ok) {
      const legacyUrl = new URL(getConnectUrl(els));
      legacyUrl.searchParams.set("extId", chrome.runtime.id);
      legacyUrl.searchParams.set("src", "extension");
      await chrome.tabs.create({ url: legacyUrl.toString() });
      showManualCodeFallback();
      setStatusText("Opened connect page. Automatic polling unavailable; you can paste the one-time code below.", "info");
      startLegacyConnectPolling();
      return;
    }

    hideManualCodeFallback();
    const openUrl = new URL(preferredConnectUrl || session.connectUrl);
    openUrl.searchParams.set("sessionId", session.sessionId);
    openUrl.searchParams.set("extId", chrome.runtime.id);
    openUrl.searchParams.set("src", "extension");
    await chrome.tabs.create({ url: openUrl.toString() });
    setStatusText(t("status.connecting"), "info");
    startConnectPolling(session.sessionId, session.expiresAt);
  }

  async function submitManualCode(rawCode) {
    const code = trimOrEmpty(rawCode);
    if (!code) {
      throw new Error("Paste a one-time code first.");
    }
    const response = await chrome.runtime.sendMessage({ type: "UTABLY_EXCHANGE_CODE", code });
    if (!response?.ok) {
      throw new Error(response?.error || "Code exchange failed.");
    }
    stopConnectPolling();
    clearManualFallbackTimer();
    clearPendingConnect();
    const connected = await refreshAuthState();
    if (!connected) {
      throw new Error("Code accepted but auth state did not refresh.");
    }
    setStatusText("Extension connected.", "success");
  }

  async function logout() {
    stopConnectPolling();
    clearManualFallbackTimer();
    clearPendingConnect();
    setStatusText(t("actions.loggingOut"), "info");
    const response = await chrome.runtime.sendMessage({ type: "UTABLY_REVOKE" });
    if (!response?.ok) {
      throw new Error(response?.error || "Logout failed.");
    }
    // Clear all user data on logout to prevent stale data
    await clearDraftFromStorage();
    await chrome.storage.local.remove([FITCHECK_CACHE_KEY]);
    // Reset form fields
    els.applicationDate.value = new Date().toISOString().slice(0, 10);
    els.jobTitle.value = "";
    els.companyName.value = "";
    els.location.value = "";
    els.recruiterName.value = "";
    els.jobText.value = "";
    els.jobUrl.value = "";
    setPreviewMeta(els, null);
    clearDuplicateNotice(els);
    clearValidationErrors(els);
    await refreshAuthState();
    setStatusText(t("status.loggedOut"), "success");
  }

  async function restoreConnectUiState() {
    const stored = await chrome.storage.local.get([CONNECT_PENDING_KEY, MANUAL_FALLBACK_UNTIL_KEY]);
    const fallbackUntil = Number(stored[MANUAL_FALLBACK_UNTIL_KEY] || 0);
    if (fallbackUntil > Date.now()) {
      showManualCodeFallback(fallbackUntil, false);
    } else {
      hideManualCodeFallback();
    }

    const pending = stored[CONNECT_PENDING_KEY];
    const pendingSessionId = trimOrEmpty(pending?.sessionId);
    const pendingExpiresAt = Number(pending?.expiresAt || 0);
    if (pendingSessionId && pendingExpiresAt > Date.now()) {
      setStatusText(t("status.connecting"), "info");
      startConnectPolling(pendingSessionId, pendingExpiresAt);
      return;
    }
    if (pendingSessionId) {
      clearPendingConnect();
    }
  }

  return { refreshAuthState, openConnect, submitManualCode, logout, restoreConnectUiState };
}

async function goToApp(els) {
  await chrome.tabs.create({ url: getAppUrl(els) });
}

async function sendApplication(els, setStatusText) {
  setStatusText(t("actions.sending"), "info");
  const payload = await buildApplicationPayload(els);
  const response = await chrome.runtime.sendMessage({ type: "UTABLY_SEND", payload });
  if (!response?.ok) {
    const err = new Error(response?.error || "Failed to send.");
    err.code = response?.code || "";
    err.details = response?.details || null;
    throw err;
  }
  await clearDraftFromStorage();
  // Always build the link plugin-side: the lambda's APP_BASE_URL doesn't know
  // about the plugin's local-stage port (e.g. https://app.dev.utably.com:5173)
  // so backend-provided applicationLink would route to the wrong origin in
  // local dev. The plugin knows what stage/port the user has configured.
  const id = trimOrEmpty(response?.id);
  const applicationLink = id
    ? `${getAppUrl(els).replace(/\/+$/u, "")}/applications/${encodeURIComponent(id)}`
    : "";
  return {
    id,
    applicationLink,
    kind: payload.status,
  };
}

async function resetForm(els, setStatusText) {
  clearValidationErrors(els);
  setPreviewMeta(els, null);
  clearDuplicateNotice(els);
  hideSaveSuccess(els);
  els.linkedinNotice.classList.add("hidden");
  els.applicationDate.value = new Date().toISOString().slice(0, 10);
  els.jobTitle.value = "";
  els.companyName.value = "";
  els.location.value = "";
  els.recruiterName.value = "";
  els.jobText.value = "";
  setSelectedKind(els, "Saved");
  await prefillSourceUrl(els);
  await clearDraftFromStorage();
  setStatusText(t("status.formReset"), "info");
}

async function clearFormAfterSave(els) {
  clearValidationErrors(els);
  setPreviewMeta(els, null);
  clearDuplicateNotice(els);
  els.linkedinNotice.classList.add("hidden");
  els.applicationDate.value = new Date().toISOString().slice(0, 10);
  els.jobTitle.value = "";
  els.companyName.value = "";
  els.location.value = "";
  els.recruiterName.value = "";
  els.jobText.value = "";
  els.jobUrl.value = "";
  setSelectedKind(els, "Saved");
  await clearDraftFromStorage();
}

function confirmResetInApp(els) {
  return new Promise((resolve) => {
    const previousFocused = document.activeElement;
    els.resetConfirmModal.classList.remove("hidden");
    els.resetConfirmNo.focus();

    const onYes = () => close(true);
    const onNo = () => close(false);
    const onBackdrop = (event) => {
      if (event.target === els.resetConfirmModal) close(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(els.resetConfirmModal);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    function close(confirmed) {
      els.resetConfirmModal.classList.add("hidden");
      els.resetConfirmYes.removeEventListener("click", onYes);
      els.resetConfirmNo.removeEventListener("click", onNo);
      els.resetConfirmModal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocused && typeof previousFocused.focus === "function") {
        previousFocused.focus();
      }
      resolve(confirmed);
    }

    els.resetConfirmYes.addEventListener("click", onYes);
    els.resetConfirmNo.addEventListener("click", onNo);
    els.resetConfirmModal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeyDown);
  });
}

const FITCHECK_CACHE_KEY = "utablyFitCheckCache";

function getFitCheckCacheKey(els) {
  const jobTitle = trimOrEmpty(els.jobTitle.value);
  const companyName = trimOrEmpty(els.companyName.value);
  const jobUrl = trimOrEmpty(els.jobUrl.value);
  // Locale-scoped: a cached EN result must not be served for a DE request.
  const locale = getLocale();
  const base = jobUrl || `${jobTitle}::${companyName}`;
  return base ? `${locale}::${base}` : "";
}

async function getCachedFitCheck(cacheKey) {
  if (!cacheKey) return null;
  try {
    const stored = await chrome.storage.local.get([FITCHECK_CACHE_KEY]);
    const cache = stored[FITCHECK_CACHE_KEY] || {};
    const entry = cache[cacheKey];
    if (!entry) return null;
    // Cache valid for 24 hours
    if (Date.now() - entry.timestamp > 24 * 60 * 60 * 1000) return null;
    return entry.result;
  } catch {
    return null;
  }
}

async function setCachedFitCheck(cacheKey, result) {
  if (!cacheKey || !result) return;
  try {
    const stored = await chrome.storage.local.get([FITCHECK_CACHE_KEY]);
    const cache = stored[FITCHECK_CACHE_KEY] || {};
    // Keep max 20 cached results
    const keys = Object.keys(cache);
    if (keys.length >= 20) {
      const oldest = keys.sort((a, b) => (cache[a].timestamp || 0) - (cache[b].timestamp || 0))[0];
      delete cache[oldest];
    }
    cache[cacheKey] = { result, timestamp: Date.now() };
    await chrome.storage.local.set({ [FITCHECK_CACHE_KEY]: cache });
  } catch (err) {
    console.warn("[FitCheck] Cache save failed:", err);
  }
}

function createFitCheckController(els, setStatusText) {
  let lastFocusedBeforeModal = null;
  let cachedResult = null;

  const isFitCheckOpen = () => !els.fitCheckModal.classList.contains("hidden");

  const openFitCheck = (result) => {
    lastFocusedBeforeModal = document.activeElement;
    cachedResult = result;
    renderFitCheckResult(els, result);
    els.fitCheckModal.classList.remove("hidden");
    const [firstFocusable] = getFocusableElements(els.fitCheckModal);
    firstFocusable?.focus();
  };

  const closeFitCheck = () => {
    els.fitCheckModal.classList.add("hidden");
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
      lastFocusedBeforeModal.focus();
    }
  };

  const getCachedResult = () => cachedResult;

  const clearCachedResult = () => {
    cachedResult = null;
  };

  async function runFitCheck(forceRefresh = false) {
    const cacheKey = getFitCheckCacheKey(els);

    // Check cache unless forcing refresh
    if (!forceRefresh && cacheKey) {
      const cached = await getCachedFitCheck(cacheKey);
      if (cached) {
        cachedResult = cached;
        return cached;
      }
    }

    const jobPosting = {
      jobTitle: trimOrEmpty(els.jobTitle.value),
      companyName: trimOrEmpty(els.companyName.value),
      jobText: trimOrEmpty(els.jobText.value),
      location: trimOrEmpty(els.location.value),
      jobUrl: trimOrEmpty(els.jobUrl.value),
    };

    if (!jobPosting.jobText) {
      throw new Error("Job description is required for FitCheck.");
    }

    const response = await chrome.runtime.sendMessage({
      type: "UTABLY_FITCHECK",
      jobPosting,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "FitCheck failed.");
    }

    cachedResult = response.result;

    // Save to cache
    if (cacheKey) {
      await setCachedFitCheck(cacheKey, response.result);
    }

    return response.result;
  }

  async function checkHasCached() {
    const cacheKey = getFitCheckCacheKey(els);
    if (!cacheKey) return false;
    const cached = await getCachedFitCheck(cacheKey);
    return cached !== null;
  }

  return { isFitCheckOpen, openFitCheck, closeFitCheck, runFitCheck, getCachedResult, clearCachedResult, checkHasCached };
}

function renderFitCheckResult(els, result) {
  const fitcheck = result?.insight || result || {};
  const insightsLocked = result?.insightsLocked === true;
  const upgradeMessage = result?.upgradeMessage || "Upgrade to unlock detailed insights.";

  // Traffic Light (always shown)
  const trafficLight = fitcheck.trafficLight || "good";
  els.fitCheckTrafficLight.className = `fitcheck-traffic-light ${trafficLight}`;
  const lightLabel = els.fitCheckTrafficLight.querySelector(".traffic-light-label");
  if (lightLabel) {
    lightLabel.textContent =
      trafficLight === "perfect" ? "Strong Match" :
      trafficLight === "good" ? "Good Match" :
      trafficLight === "partial" ? "Partial Match" : "Review Needed";
  }

  // Score (always shown)
  const score = fitcheck.overallScore || 0;
  const scoreValue = els.fitCheckScore.querySelector(".score-value");
  if (scoreValue) {
    scoreValue.textContent = Math.round(score);
  }

  // Helper to render locked section
  const renderLockedOverlay = (container) => {
    if (!container) return;
    container.classList.add("fitcheck-locked");
    const existingOverlay = container.querySelector(".locked-overlay");
    if (!existingOverlay) {
      const overlay = document.createElement("div");
      overlay.className = "locked-overlay";
      overlay.innerHTML = `
        <div class="locked-icon">&#128274;</div>
        <div class="locked-text">Upgrade to unlock</div>
      `;
      container.appendChild(overlay);
    }
  };

  const clearLockedOverlay = (container) => {
    if (!container) return;
    container.classList.remove("fitcheck-locked");
    const overlay = container.querySelector(".locked-overlay");
    if (overlay) overlay.remove();
  };

  // Summary
  const summaryText = els.fitCheckSummary.querySelector(".fitcheck-summary-text");
  if (insightsLocked) {
    renderLockedOverlay(els.fitCheckSummary);
    if (summaryText) summaryText.textContent = "";
  } else {
    clearLockedOverlay(els.fitCheckSummary);
    if (summaryText) {
      summaryText.textContent = fitcheck.summary || "No summary available.";
    }
  }

  // Qualification
  const qual = fitcheck.qualificationAnalysis || {};
  const qualBadge = els.fitCheckQualification.querySelector(".fitcheck-qualification-badge");
  if (qualBadge) {
    const level = qual.level || "match";
    qualBadge.className = `fitcheck-qualification-badge ${level}`;
    qualBadge.textContent = level.replace("_", " ");
  }

  const signalsList = els.fitCheckQualification.querySelector(".fitcheck-signals");
  if (insightsLocked) {
    if (signalsList) signalsList.innerHTML = "";
    renderLockedOverlay(els.fitCheckQualification);
  } else {
    clearLockedOverlay(els.fitCheckQualification);
    if (signalsList) {
      const signals = Array.isArray(qual.signals) ? qual.signals : [];
      signalsList.innerHTML = signals.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    }
  }

  // Skills
  if (insightsLocked) {
    renderSkillsList(els.fitCheckSkills.querySelector(".skills-matching .skills-list"), []);
    renderSkillsList(els.fitCheckSkills.querySelector(".skills-gaps .skills-list"), []);
    renderSkillsList(els.fitCheckSkills.querySelector(".skills-bonus .skills-list"), []);
    renderLockedOverlay(els.fitCheckSkills);
  } else {
    clearLockedOverlay(els.fitCheckSkills);
    const skills = fitcheck.skillsBreakdown || {};
    renderSkillsList(els.fitCheckSkills.querySelector(".skills-matching .skills-list"), skills.matching || []);
    renderSkillsList(els.fitCheckSkills.querySelector(".skills-gaps .skills-list"), skills.gaps || []);
    renderSkillsList(els.fitCheckSkills.querySelector(".skills-bonus .skills-list"), skills.bonus || []);
  }

  // Preferences
  if (insightsLocked) {
    renderLockedOverlay(els.fitCheckPreferences);
    for (const pref of ["salary", "location", "remote"]) {
      const item = els.fitCheckPreferences.querySelector(`[data-pref="${pref}"]`);
      if (item) {
        item.className = "pref-item unknown";
        const statusEl = item.querySelector(".pref-status");
        if (statusEl) statusEl.textContent = "";
      }
    }
  } else {
    clearLockedOverlay(els.fitCheckPreferences);
    const prefs = fitcheck.preferencesAlignment || {};
    for (const pref of ["salary", "location", "remote"]) {
      const item = els.fitCheckPreferences.querySelector(`[data-pref="${pref}"]`);
      if (item) {
        const status = prefs[pref]?.status || "unknown";
        item.className = `pref-item ${status}`;
        const statusEl = item.querySelector(".pref-status");
        if (statusEl) {
          statusEl.textContent = status;
        }
      }
    }
  }

  // Personality
  const personalityText = els.fitCheckPersonality.querySelector(".fitcheck-personality-text");
  if (insightsLocked) {
    renderLockedOverlay(els.fitCheckPersonality);
    if (personalityText) personalityText.textContent = "";
  } else {
    clearLockedOverlay(els.fitCheckPersonality);
    const personality = fitcheck.personalityFit || {};
    if (personalityText) {
      personalityText.textContent = personality.workStyle || "No personality analysis available.";
    }
  }

  // Key Points
  const strengthsList = els.fitCheckKeyPoints.querySelector(".fitcheck-strengths-list");
  const concernsList = els.fitCheckKeyPoints.querySelector(".fitcheck-concerns-list");
  if (insightsLocked) {
    renderLockedOverlay(els.fitCheckKeyPoints);
    if (strengthsList) strengthsList.innerHTML = "";
    if (concernsList) concernsList.innerHTML = "";
  } else {
    clearLockedOverlay(els.fitCheckKeyPoints);
    if (strengthsList) {
      const strengths = Array.isArray(fitcheck.topStrengths) ? fitcheck.topStrengths : [];
      strengthsList.innerHTML = strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    }
    if (concernsList) {
      const concerns = Array.isArray(fitcheck.topConcerns) ? fitcheck.topConcerns : [];
      concernsList.innerHTML = concerns.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    }
  }

  // Show upgrade banner for free users
  const existingBanner = els.fitCheckModal.querySelector(".fitcheck-upgrade-banner");
  if (insightsLocked) {
    if (!existingBanner) {
      const banner = document.createElement("div");
      banner.className = "fitcheck-upgrade-banner";
      banner.innerHTML = `
        <div class="upgrade-icon">&#9889;</div>
        <div class="upgrade-content">
          <div class="upgrade-title">Unlock Full Insights</div>
          <div class="upgrade-text">${escapeHtml(upgradeMessage)}</div>
        </div>
        <a href="https://app.utably.com/settings/subscription" target="_blank" class="upgrade-btn">Upgrade</a>
      `;
      els.fitCheckModal.querySelector(".fitcheck-body")?.prepend(banner);
    }
  } else if (existingBanner) {
    existingBanner.remove();
  }
}

function renderSkillsList(container, skills) {
  if (!container) return;
  const safeSkills = Array.isArray(skills) ? skills : [];
  container.innerHTML = safeSkills.map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("");
}

function escapeHtml(str) {
  const text = String(str || "");
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function wireListeners(els, auth, sidePanel) {
  const setStatusText = (message, tone = "info") => setStatus(els, message, tone);
  const duplicateGate = {
    status: "unknown", // unknown | checking | ok | duplicate | unavailable
    allowSend: false,
  };
  let currentDuplicateMatch = null;
  let duplicateCheckTimer = null;
  let duplicateRequestSeq = 0;
  let lastFocusedBeforeModal = null;
  let captureEnabled = false;
  let draftSaveTimer = null;

  const persistDraftSoon = () => {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      saveDraftToStorage(els).catch(() => {});
    }, 180);
  };

  const renderCaptureButton = () => {
    els.captureMode.textContent = captureEnabled ? t("actions.captureOn") : t("actions.captureOff");
    els.captureMode.dataset.forceDisabled = "0";
  };

  const syncCaptureModeForActiveTab = async () => {
    const tab = await getActiveTab();
    if (!tab?.id) {
      captureEnabled = false;
      renderCaptureButton();
      return;
    }
    const modeResponse = await chrome.runtime.sendMessage({
      type: "UTABLY_CAPTURE_GET_MODE",
      tabId: tab.id,
    });
    captureEnabled = Boolean(modeResponse?.ok && modeResponse.enabled);
    renderCaptureButton();
  };

  const isPrivacyOpen = () => !els.privacyModal.classList.contains("hidden");

  const refreshLegalLinkHrefs = () => {
    const base = getAppUrl(els);
    const links = els.privacyModal.querySelectorAll("a.legal-link[data-legal-path]");
    links.forEach((link) => {
      const path = link.getAttribute("data-legal-path") || "";
      link.setAttribute("href", `${base}${path}`);
    });
  };

  const openPrivacy = () => {
    lastFocusedBeforeModal = document.activeElement;
    refreshLegalLinkHrefs();
    els.privacyModal.classList.remove("hidden");
    const [firstFocusable] = getFocusableElements(els.privacyModal);
    firstFocusable?.focus();
  };

  const closePrivacy = () => {
    els.privacyModal.classList.add("hidden");
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
      lastFocusedBeforeModal.focus();
    }
  };

  const scheduleDuplicateCheck = (delay = 260) => {
    const candidate = getDuplicateCandidate(els);
    if (!candidate.jobTitle || !candidate.companyName) {
      duplicateGate.status = "unknown";
      duplicateGate.allowSend = false;
      setSendAvailability(els, duplicateGate);
      clearDuplicateNotice(els);
      return;
    }
    duplicateGate.status = "checking";
    duplicateGate.allowSend = false;
    setSendAvailability(els, duplicateGate);
    if (duplicateCheckTimer) clearTimeout(duplicateCheckTimer);
    duplicateCheckTimer = setTimeout(async () => {
      const requestId = ++duplicateRequestSeq;
      try {
        const match = await checkDuplicate(els);
        if (requestId !== duplicateRequestSeq) return;
        currentDuplicateMatch = match;
        duplicateGate.status = match ? "duplicate" : "ok";
        duplicateGate.allowSend = !match;
        setSendAvailability(els, duplicateGate);
      } catch {
        if (requestId !== duplicateRequestSeq) return;
        duplicateGate.status = "unavailable";
        duplicateGate.allowSend = false;
        setSendAvailability(els, duplicateGate);
        setStatusText(t("errors.duplicateUnavailable"), "error");
      }
    }, delay);
  };

  els.jobTitle.addEventListener("input", () => clearFieldError(els.jobTitle, els.jobTitleError));
  els.companyName.addEventListener("input", () => clearFieldError(els.companyName, els.companyNameError));
  els.jobTitle.addEventListener("input", () => {
    persistDraftSoon();
    currentDuplicateMatch = null;
    duplicateGate.status = "unknown";
    duplicateGate.allowSend = false;
    setSendAvailability(els, duplicateGate);
    scheduleDuplicateCheck();
  });
  els.companyName.addEventListener("input", () => {
    persistDraftSoon();
    currentDuplicateMatch = null;
    duplicateGate.status = "unknown";
    duplicateGate.allowSend = false;
    setSendAvailability(els, duplicateGate);
    scheduleDuplicateCheck();
  });
  els.jobUrl.addEventListener("input", () => {
    persistDraftSoon();
    currentDuplicateMatch = null;
    duplicateGate.status = "unknown";
    duplicateGate.allowSend = false;
    setSendAvailability(els, duplicateGate);
    scheduleDuplicateCheck();
  });
  for (const field of [els.applicationDate, els.location, els.recruiterName, els.jobText]) {
    field.addEventListener("input", persistDraftSoon);
  }
  els.openDuplicateBtn.addEventListener("click", async () => {
    const id = trimOrEmpty(currentDuplicateMatch?.id);
    if (!id) return;
    const url = `${getAppUrl(els).replace(/\/+$/u, "")}/applications/${encodeURIComponent(id)}`;
    await chrome.tabs.create({ url });
  });

  els.toggleSettings.addEventListener("click", () => toggleSettingsPanel(els));
  els.openPrivacyBtn.addEventListener("click", openPrivacy);
  els.closePrivacyBtn.addEventListener("click", closePrivacy);
  els.privacyModal.addEventListener("click", (event) => {
    if (event.target === els.privacyModal) {
      closePrivacy();
    }
  });

  els.saveSettings.addEventListener("click", () => {
    withBusyButton(els.saveSettings, "Saving...", () => saveSettings(els, setStatusText)).catch((error) => {
      setStatusText(error?.message || "Failed to save settings.", "error");
    });
  });

  els.openConnect.addEventListener("click", () => {
    withBusyButton(els.openConnect, t("actions.opening"), () => auth.openConnect()).catch((error) => {
      setStatusText(error?.message || "Connect failed.", "error");
    });
  });

  els.manualCodeSubmit.addEventListener("click", () => {
    withBusyButton(els.manualCodeSubmit, t("actions.connecting"), async () => {
      await auth.submitManualCode(els.manualCode.value);
      els.manualCode.value = "";
    }).catch((error) => {
      setStatusText(error?.message || "Code exchange failed.", "error");
    });
  });

  els.goToAppBtn.addEventListener("click", () => {
    withBusyButton(els.goToAppBtn, t("actions.opening"), () => goToApp(els)).catch((error) => {
      setStatusText(error?.message || "Failed to open Utably.", "error");
    });
  });

  // FitCheck button and modal
  const fitCheckController = createFitCheckController(els, setStatusText);

  // Update FitCheck button state based on job description content
  const updateFitCheckState = () => {
    const jobTextValue = els.jobText?.value || "";
    const hasJobText = jobTextValue.trim().length > 0;

    // Enable/disable button
    if (els.fitCheckBtn) {
      els.fitCheckBtn.disabled = !hasJobText;
    }

    // Update indicator text
    if (els.fitCheckInline) {
      els.fitCheckInline.classList.toggle("no-data", !hasJobText);
    }
  };

  // Update button label based on cache (async, separate from disabled state)
  const updateFitCheckLabel = async () => {
    try {
      const hasCached = await fitCheckController.checkHasCached();
      const btnText = els.fitCheckBtn?.querySelector(".fitcheck-btn-text");
      if (btnText) {
        btnText.textContent = hasCached ? t("fitcheck.btnView") : t("fitcheck.btn");
      }
    } catch (e) {
      console.warn("[FitCheck] Cache check failed:", e);
    }
  };

  // Initial state
  updateFitCheckState();
  updateFitCheckLabel();

  // Wire to input events
  els.jobText.addEventListener("input", updateFitCheckState);
  els.jobTitle.addEventListener("input", updateFitCheckLabel);
  els.companyName.addEventListener("input", updateFitCheckLabel);
  els.jobUrl.addEventListener("input", updateFitCheckLabel);

  els.fitCheckBtn.addEventListener("click", async () => {
    // If we have a cached result in memory, just reopen instantly
    const existing = fitCheckController.getCachedResult();
    if (existing) {
      fitCheckController.openFitCheck(existing);
      return;
    }

    // Check storage cache - if found, open instantly without "Analyzing..." spinner
    const cacheKey = getFitCheckCacheKey(els);
    if (cacheKey) {
      const storageCached = await getCachedFitCheck(cacheKey);
      if (storageCached) {
        fitCheckController.openFitCheck(storageCached);
        return;
      }
    }

    // No cache - run fresh analysis
    withBusyButton(els.fitCheckBtn, t("fitcheck.analyzing"), async () => {
      const result = await fitCheckController.runFitCheck(false);
      fitCheckController.openFitCheck(result);
    }).catch((error) => {
      setStatusText(error?.message || "FitCheck failed.", "error");
    });
  });

  // Reanalyze button in modal
  els.reanalyzeFitCheckBtn.addEventListener("click", () => {
    fitCheckController.closeFitCheck();
    withBusyButton(els.fitCheckBtn, t("fitcheck.reanalyzing"), async () => {
      const result = await fitCheckController.runFitCheck(true); // force refresh
      fitCheckController.openFitCheck(result);
      updateFitCheckState(); // update button label
    }).catch((error) => {
      setStatusText(error?.message || "FitCheck failed.", "error");
    });
  });

  els.closeFitCheckBtn.addEventListener("click", () => {
    fitCheckController.closeFitCheck();
  });

  // Expose controller for payload building
  window.__fitCheckController = fitCheckController;

  // Close FitCheck modal on Escape key
  els.fitCheckModal.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && fitCheckController.isFitCheckOpen()) {
      fitCheckController.closeFitCheck();
    }
  });

  // Close FitCheck modal on backdrop click
  els.fitCheckModal.addEventListener("click", (e) => {
    if (e.target === els.fitCheckModal) {
      fitCheckController.closeFitCheck();
    }
  });

  els.logoutBtn.addEventListener("click", () => {
    withBusyButton(els.logoutBtn, t("actions.loggingOut"), () => auth.logout()).catch((error) => {
      setStatusText(error?.message || "Logout failed.", "error");
    });
  });

  // Apply translations immediately when the user changes the language.
  els.languageSelect?.addEventListener("change", async () => {
    await setLocalePreference(els.languageSelect.value);
    applyTranslations(document);
    // Refresh dynamic strings.
    renderCaptureButton();
    // FitCheck output is locale-bound. Drop the in-memory result so the next
    // click re-runs (or hits the new locale's storage cache).
    fitCheckController.clearCachedResult();
    updateFitCheckState();
    updateFitCheckLabel();
  });

  els.extract.addEventListener("click", () => {
    const run = async () => {
      hideSaveSuccess(els);
      const granted = await requestBroadHostAccessFromGesture();
      if (!granted) {
        setStatusText(t("errors.hostDenied"), "error");
        return;
      }
      return withBusyButton(els.extract, t("actions.extracting"), async () => {
        const result = await extractIntoForm(els, setStatusText);
        setPreviewMeta(els, result);
        persistDraftSoon();
        currentDuplicateMatch = null;
        duplicateGate.status = "unknown";
        duplicateGate.allowSend = false;
        setSendAvailability(els, duplicateGate);
        // Update FitCheck button state after auto-fill
        fitCheckController.clearCachedResult();
        updateFitCheckState();
        updateFitCheckLabel();
        if (result) {
          scheduleDuplicateCheck(0);
        }
        if (result) clearStatus(els);
      }).catch((error) => {
        setStatusText(error?.message || "Extraction failed.", "error");
      });
    };
    run().catch((error) => {
      setStatusText(error?.message || "Failed to request host access.", "error");
    });
  });

  els.reset.addEventListener("click", () => {
    confirmResetInApp(els).then((confirmed) => {
      if (!confirmed) return;
      currentDuplicateMatch = null;
      duplicateGate.status = "unknown";
      duplicateGate.allowSend = false;
      setSendAvailability(els, duplicateGate);
      withBusyButton(els.reset, t("actions.resetting"), async () => {
        await resetForm(els, setStatusText);
        // Clear FitCheck cache AFTER form is reset
        fitCheckController.clearCachedResult();
        updateFitCheckState();
        updateFitCheckLabel();
      }).catch((error) => {
        setStatusText(error?.message || "Reset failed.", "error");
      });
    });
  });

  els.send.addEventListener("click", () => {
    withBusyButton(els.send, t("actions.saving"), async () => {
      if (duplicateGate.status !== "ok") {
        setStatusText(t("errors.duplicateWaiting"), "info");
        return;
      }
      if (!validateRequiredFields(els)) {
        setStatusText(t("errors.requiredFields"), "error");
        return;
      }
      const duplicateMatch = await checkDuplicate(els);
      currentDuplicateMatch = duplicateMatch;
      if (duplicateMatch?.id) {
        duplicateGate.status = "duplicate";
        duplicateGate.allowSend = false;
        setSendAvailability(els, duplicateGate);
        setStatusText(t("errors.duplicateExists"), "error");
        return;
      }
      duplicateGate.status = "ok";
      duplicateGate.allowSend = true;
      setSendAvailability(els, duplicateGate);
      const result = await sendApplication(els, setStatusText);
      // Clear form fields, hide preview, show success notice with link.
      // The link persists until the user clicks "Save another", "Reset",
      // "Auto-fill", or starts typing in the form.
      await clearFormAfterSave(els);
      currentDuplicateMatch = null;
      duplicateGate.status = "unknown";
      duplicateGate.allowSend = false;
      setSendAvailability(els, duplicateGate);
      fitCheckController.clearCachedResult();
      updateFitCheckState();
      updateFitCheckLabel();
      showSaveSuccess(els, result);
      clearStatus(els);
    }).catch((error) => {
      if (error?.code === "DUPLICATE_APPLICATION" && error?.details?.id) {
        currentDuplicateMatch = error.details;
        renderDuplicateNotice(els, error.details);
        duplicateGate.status = "duplicate";
        duplicateGate.allowSend = false;
        setSendAvailability(els, duplicateGate);
        setStatusText(t("errors.duplicateExists"), "error");
        return;
      }
      setStatusText(error?.message || "Failed to send.", "error");
    });
  });

  // Kind selector (Applied vs Saved)
  els.kindOptions?.forEach((btn) => {
    btn.addEventListener("click", () => {
      setSelectedKind(els, btn.dataset.kind);
      persistDraftSoon();
    });
  });

  // Save success notice actions
  els.openSavedBtn?.addEventListener("click", async () => {
    const link = els.openSavedBtn.dataset.appLink;
    if (!link) return;
    await chrome.tabs.create({ url: link });
    hideSaveSuccess(els);
    prefillSourceUrl(els).catch(() => {});
  });
  els.saveAnotherBtn?.addEventListener("click", () => {
    hideSaveSuccess(els);
    prefillSourceUrl(els).catch(() => {});
  });

  // Hide success notice as soon as the user starts working on a new entry.
  const dismissSuccessOnEdit = () => {
    if (els.saveSuccessNotice && !els.saveSuccessNotice.classList.contains("hidden")) {
      hideSaveSuccess(els);
    }
  };
  for (const field of [
    els.jobTitle,
    els.companyName,
    els.jobUrl,
    els.location,
    els.recruiterName,
    els.jobText,
    els.applicationDate,
  ]) {
    field?.addEventListener("input", dismissSuccessOnEdit);
  }

  els.captureMode.addEventListener("click", async () => {
    try {
      els.captureMode.disabled = true;
      els.captureMode.dataset.forceDisabled = "1";

      const nextEnabled = !captureEnabled;
      if (nextEnabled) {
        const granted = await requestBroadHostAccessFromGesture();
        if (!granted) {
          throw new Error("Host access denied. Allow website access to enable capture mode.");
        }
      }

      const tab = await getActiveTab();
      if (!tab?.id) {
        throw new Error("No active tab.");
      }

      if (nextEnabled) {
        await ensureHostAccessForTab(tab);
      }

      const response = await chrome.runtime.sendMessage({
        type: "UTABLY_CAPTURE_SET_MODE",
        tabId: tab.id,
        enabled: nextEnabled,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Failed to update capture mode.");
      }
      captureEnabled = Boolean(response.enabled);
      renderCaptureButton();
      setStatusText(
        captureEnabled ? t("status.captureOn") : t("status.captureOff"),
        "info"
      );
    } catch (error) {
      const fallback = error?.message;
      if (fallback?.includes("Host access denied") || fallback?.includes("capture mode")) {
        setStatusText(t("errors.captureHostDenied"), "error");
      } else {
        setStatusText(fallback || "Failed to toggle capture mode.", "error");
      }
    } finally {
      els.captureMode.disabled = false;
      els.captureMode.dataset.forceDisabled = "0";
    }
  });

  els.debugMode.addEventListener("change", () => {
    if (!els.debugMode.checked) {
      els.stage.value = "prod";
    }
    updateStageSettingsUi(els);
  });

  els.stage.addEventListener("change", () => updateStageSettingsUi(els));
  document.addEventListener("keydown", (event) => {
    if (!isPrivacyOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closePrivacy();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = getFocusableElements(els.privacyModal);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(() => {
      refreshActiveTabContext(els, sidePanel, auth.refreshAuthState).catch(() => {});
      syncCaptureModeForActiveTab().catch(() => {});
    });
  }

  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (!tab?.active) return;
      if (!changeInfo.url && changeInfo.status !== "complete") return;
      refreshActiveTabContext(els, sidePanel, auth.refreshAuthState).catch(() => {});
      syncCaptureModeForActiveTab().catch(() => {});
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "UTABLY_DRAFT_UPDATED") return;
    applyDraftToForm(els, message.draft || null);
    currentDuplicateMatch = null;
    duplicateGate.status = "unknown";
    duplicateGate.allowSend = false;
    setSendAvailability(els, duplicateGate);
    scheduleDuplicateCheck(0);
    // Update FitCheck state for new draft
    fitCheckController.clearCachedResult();
    updateFitCheckState();
    updateFitCheckLabel();
  });

  syncCaptureModeForActiveTab().catch(() => {
    renderCaptureButton();
  });

  if (trimOrEmpty(els.jobTitle.value) && trimOrEmpty(els.companyName.value)) {
    scheduleDuplicateCheck(0);
  }
  setSendAvailability(els, duplicateGate);
}

export async function startPopupApp() {
  const els = getDom();
  const sidePanel = isSidePanelMode();
  const workspace = isWorkspaceMode();
  const setStatusText = (message, tone = "info") => setStatus(els, message, tone);

  document.body.classList.toggle("sidepanel-mode", sidePanel);
  document.body.classList.toggle("workspace-mode", workspace);
  document.body.classList.toggle("safari-mode", IS_SAFARI);
  clearStatus(els);

  await loadLocale();
  applyTranslations(document);

  if (!els.applicationDate.value) {
    els.applicationDate.value = new Date().toISOString().slice(0, 10);
  }

  await loadSettings(els);
  const auth = createAuthController(els, setStatusText);
  await auth.refreshAuthState();
  await auth.restoreConnectUiState();
  const storedDraft = await loadDraftFromStorage();
  applyDraftToForm(els, storedDraft);
  wireListeners(els, auth, sidePanel);
}
