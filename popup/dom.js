export function getDom() {
  return {
    authGate: document.getElementById("authGate"),
    appContent: document.getElementById("appContent"),
    settings: document.getElementById("settings"),
    toggleSettings: document.getElementById("toggleSettings"),
    openPrivacyBtn: document.getElementById("openPrivacyBtn"),
    closePrivacyBtn: document.getElementById("closePrivacyBtn"),
    privacyModal: document.getElementById("privacyModal"),
    resetConfirmModal: document.getElementById("resetConfirmModal"),
    resetConfirmNo: document.getElementById("resetConfirmNo"),
    resetConfirmYes: document.getElementById("resetConfirmYes"),
    saveSettings: document.getElementById("saveSettings"),
    openConnect: document.getElementById("openConnect"),
    goToAppBtn: document.getElementById("goToAppBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    debugMode: document.getElementById("debugMode"),
    stageRow: document.getElementById("stageRow"),
    stage: document.getElementById("stage"),
    localPortRow: document.getElementById("localPortRow"),
    localPort: document.getElementById("localPort"),
    linkedinNotice: document.getElementById("linkedinNotice"),
    applicationDate: document.getElementById("applicationDate"),
    jobTitle: document.getElementById("jobTitle"),
    jobTitleError: document.getElementById("jobTitleError"),
    companyName: document.getElementById("companyName"),
    companyNameError: document.getElementById("companyNameError"),
    location: document.getElementById("location"),
    recruiterName: document.getElementById("recruiterName"),
    jobText: document.getElementById("jobText"),
    jobUrl: document.getElementById("jobUrl"),
    duplicateNotice: document.getElementById("duplicateNotice"),
    duplicateNoticeText: document.getElementById("duplicateNoticeText"),
    openDuplicateBtn: document.getElementById("openDuplicateBtn"),
    previewMeta: document.getElementById("previewMeta"),
    extract: document.getElementById("extract"),
    reset: document.getElementById("reset"),
    send: document.getElementById("send"),
    status: document.getElementById("status"),
  };
}

export function setStatus(els, message, tone = "info") {
  const normalizedTone = tone === "success" || tone === "error" ? tone : "info";
  els.status.classList.remove("hidden", "info", "success", "error");
  els.status.classList.add(normalizedTone);
  els.status.textContent = message || "";
}

export function clearStatus(els) {
  els.status.textContent = "";
  els.status.classList.add("hidden");
  els.status.classList.remove("info", "success", "error");
}

export function trimOrEmpty(value) {
  return (value || "").trim();
}
