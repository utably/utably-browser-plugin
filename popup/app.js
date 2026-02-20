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

const DRAFT_STORAGE_KEY = "utablyDraft";

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
    applicationDate: trimOrEmpty(rawValue.applicationDate),
    jobTitle: trimOrEmpty(rawValue.jobTitle),
    companyName: trimOrEmpty(rawValue.companyName),
    location: trimOrEmpty(rawValue.location),
    recruiterName: trimOrEmpty(rawValue.recruiterName),
    jobText: trimOrEmpty(rawValue.jobText),
    jobUrl: trimOrEmpty(rawValue.jobUrl),
    updatedAt: Number(rawValue.updatedAt || 0),
  };
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
  els.duplicateNoticeText.textContent = "Already added.";
}

function renderDuplicateNotice(els, match) {
  const title = trimOrEmpty(match?.jobTitle) || "This application";
  const company = trimOrEmpty(match?.companyName) || "the same company";
  els.duplicateNoticeText.textContent = `${title} at ${company} already exists.`;
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
    showFieldError(els.jobTitle, els.jobTitleError, "Job title is required.");
    isValid = false;
  }
  if (!trimOrEmpty(els.companyName.value)) {
    showFieldError(els.companyName, els.companyNameError, "Company is required.");
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
  let authPollHandle = null;

  async function refreshAuthState() {
    const response = await chrome.runtime.sendMessage({ type: "UTABLY_AUTH_STATUS" });
    const connected = Boolean(response?.ok && response?.connected);
    if (!connected) setPreviewMeta(els, null);

    els.authGate.classList.toggle("hidden", connected);
    els.appContent.classList.toggle("hidden", !connected);
    els.logoutBtn.classList.toggle("hidden", !connected);

    if (connected) {
      await prefillSourceUrl(els);
    }
    return connected;
  }

  function startAuthPolling() {
    if (authPollHandle) clearInterval(authPollHandle);
    let attempts = 0;
    authPollHandle = setInterval(async () => {
      attempts += 1;
      const connected = await refreshAuthState().catch(() => false);
      if (connected) {
        clearInterval(authPollHandle);
        authPollHandle = null;
        setStatusText("Extension connected.", "success");
        return;
      }
      if (attempts >= 40) {
        clearInterval(authPollHandle);
        authPollHandle = null;
        setStatusText("Still not connected. Complete login on the connect page.", "info");
      }
    }, 1500);
  }

  async function openConnect() {
    const url = new URL(getConnectUrl(els));
    url.searchParams.set("extId", chrome.runtime.id);
    url.searchParams.set("src", "extension");
    await chrome.tabs.create({ url: url.toString() });
    setStatusText("Waiting for connection...", "info");
    startAuthPolling();
  }

  async function logout() {
    setStatusText("Logging out...", "info");
    const response = await chrome.runtime.sendMessage({ type: "UTABLY_REVOKE" });
    if (!response?.ok) {
      throw new Error(response?.error || "Logout failed.");
    }
    await refreshAuthState();
    setStatusText("Logged out.", "success");
  }

  return { refreshAuthState, openConnect, logout };
}

async function goToApp(els) {
  await chrome.tabs.create({ url: getAppUrl(els) });
}

async function sendApplication(els, setStatusText) {
  setStatusText("Sending...", "info");
  const payload = buildApplicationPayload(els);
  const response = await chrome.runtime.sendMessage({ type: "UTABLY_SEND", payload });
  if (!response?.ok) {
    const err = new Error(response?.error || "Failed to send.");
    err.code = response?.code || "";
    err.details = response?.details || null;
    throw err;
  }
  await clearDraftFromStorage();
  setStatusText("Saved to Utably.", "success");
}

async function resetForm(els, setStatusText) {
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
  await prefillSourceUrl(els);
  await clearDraftFromStorage();
  setStatusText("Form reset.", "info");
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
    els.captureMode.textContent = captureEnabled ? "Capture: On" : "Capture: Off";
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

  const openPrivacy = () => {
    lastFocusedBeforeModal = document.activeElement;
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
        setStatusText("Duplicate check unavailable. Save is disabled.", "error");
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
    withBusyButton(els.openConnect, "Opening...", () => auth.openConnect()).catch((error) => {
      setStatusText(error?.message || "Connect failed.", "error");
    });
  });

  els.goToAppBtn.addEventListener("click", () => {
    withBusyButton(els.goToAppBtn, "Opening...", () => goToApp(els)).catch((error) => {
      setStatusText(error?.message || "Failed to open Utably.", "error");
    });
  });

  els.logoutBtn.addEventListener("click", () => {
    withBusyButton(els.logoutBtn, "Logging out...", () => auth.logout()).catch((error) => {
      setStatusText(error?.message || "Logout failed.", "error");
    });
  });

  els.extract.addEventListener("click", () => {
    withBusyButton(els.extract, "Extracting...", async () => {
      const result = await extractIntoForm(els, setStatusText);
      setPreviewMeta(els, result);
      persistDraftSoon();
      currentDuplicateMatch = null;
      duplicateGate.status = "unknown";
      duplicateGate.allowSend = false;
      setSendAvailability(els, duplicateGate);
      if (result) {
        scheduleDuplicateCheck(0);
      }
      if (result) clearStatus(els);
    }).catch((error) => {
      setStatusText(error?.message || "Extraction failed.", "error");
    });
  });

  els.reset.addEventListener("click", () => {
    confirmResetInApp(els).then((confirmed) => {
      if (!confirmed) return;
      currentDuplicateMatch = null;
      duplicateGate.status = "unknown";
      duplicateGate.allowSend = false;
      setSendAvailability(els, duplicateGate);
      withBusyButton(els.reset, "Resetting...", () => resetForm(els, setStatusText)).catch((error) => {
        setStatusText(error?.message || "Reset failed.", "error");
      });
    });
  });

  els.send.addEventListener("click", () => {
    withBusyButton(els.send, "Saving...", async () => {
      if (duplicateGate.status !== "ok") {
        setStatusText("Waiting for duplicate check result.", "info");
        return;
      }
      if (!validateRequiredFields(els)) {
        setStatusText("Review required fields before saving.", "error");
        return;
      }
      const duplicateMatch = await checkDuplicate(els);
      currentDuplicateMatch = duplicateMatch;
      if (duplicateMatch?.id) {
        duplicateGate.status = "duplicate";
        duplicateGate.allowSend = false;
        setSendAvailability(els, duplicateGate);
        setStatusText("Application already exists. Open the existing entry.", "error");
        return;
      }
      duplicateGate.status = "ok";
      duplicateGate.allowSend = true;
      setSendAvailability(els, duplicateGate);
      await sendApplication(els, setStatusText);
    }).catch((error) => {
      if (error?.code === "DUPLICATE_APPLICATION" && error?.details?.id) {
        currentDuplicateMatch = error.details;
        renderDuplicateNotice(els, error.details);
        duplicateGate.status = "duplicate";
        duplicateGate.allowSend = false;
        setSendAvailability(els, duplicateGate);
        setStatusText("Application already exists. Open the existing entry.", "error");
        return;
      }
      setStatusText(error?.message || "Failed to send.", "error");
    });
  });

  els.captureMode.addEventListener("click", async () => {
    try {
      els.captureMode.disabled = true;
      els.captureMode.dataset.forceDisabled = "1";

      const tab = await getActiveTab();
      if (!tab?.id) {
        throw new Error("No active tab.");
      }

      const nextEnabled = !captureEnabled;
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
        captureEnabled
          ? "Capture mode enabled. Copy selected text on the page to categorize it."
          : "Capture mode disabled.",
        "info"
      );
    } catch (error) {
      setStatusText(error?.message || "Failed to toggle capture mode.", "error");
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
  clearStatus(els);

  if (!els.applicationDate.value) {
    els.applicationDate.value = new Date().toISOString().slice(0, 10);
  }

  await loadSettings(els);
  const auth = createAuthController(els, setStatusText);
  await auth.refreshAuthState();
  const storedDraft = await loadDraftFromStorage();
  applyDraftToForm(els, storedDraft);
  wireListeners(els, auth, sidePanel);
}
