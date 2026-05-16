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
    manualCodePanel: document.getElementById("manualCodePanel"),
    manualCode: document.getElementById("manualCode"),
    manualCodeSubmit: document.getElementById("manualCodeSubmit"),
    goToAppBtn: document.getElementById("goToAppBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    debugMode: document.getElementById("debugMode"),
    languageSelect: document.getElementById("languageSelect"),
    stageRow: document.getElementById("stageRow"),
    stage: document.getElementById("stage"),
    localPortRow: document.getElementById("localPortRow"),
    localPort: document.getElementById("localPort"),
    linkedinNotice: document.getElementById("linkedinNotice"),
    applicationDate: document.getElementById("applicationDate"),
    applicationDateLabel: document.getElementById("applicationDateLabel"),
    jobTitle: document.getElementById("jobTitle"),
    jobTitleError: document.getElementById("jobTitleError"),
    companyName: document.getElementById("companyName"),
    companyNameError: document.getElementById("companyNameError"),
    location: document.getElementById("location"),
    recruiterName: document.getElementById("recruiterName"),
    jobText: document.getElementById("jobText"),
    jobUrl: document.getElementById("jobUrl"),
    notes: document.getElementById("notes"),
    duplicateNotice: document.getElementById("duplicateNotice"),
    duplicateNoticeText: document.getElementById("duplicateNoticeText"),
    openDuplicateBtn: document.getElementById("openDuplicateBtn"),
    previewPanel: document.getElementById("previewPanel"),
    previewMeta: document.getElementById("previewMeta"),
    captureMode: document.getElementById("captureMode"),
    extract: document.getElementById("extract"),
    reset: document.getElementById("reset"),
    send: document.getElementById("send"),
    status: document.getElementById("status"),
    // Save kind selector (Applied vs Saved)
    kindSelector: document.getElementById("kindSelector"),
    kindOptions: Array.from(document.querySelectorAll("#kindSelector .kind-option")),
    // Post-save success notice
    saveSuccessNotice: document.getElementById("saveSuccessNotice"),
    saveSuccessText: document.getElementById("saveSuccessText"),
    openSavedBtn: document.getElementById("openSavedBtn"),
    saveAnotherBtn: document.getElementById("saveAnotherBtn"),
    // FitCheck elements
    fitCheckInline: document.getElementById("fitCheckInline"),
    fitCheckBtn: document.getElementById("fitCheckBtn"),
    fitCheckModal: document.getElementById("fitCheckModal"),
    closeFitCheckBtn: document.getElementById("closeFitCheckBtn"),
    reanalyzeFitCheckBtn: document.getElementById("reanalyzeFitCheckBtn"),
    fitCheckTrafficLight: document.getElementById("fitCheckTrafficLight"),
    fitCheckScore: document.getElementById("fitCheckScore"),
    fitCheckSummary: document.getElementById("fitCheckSummary"),
    fitCheckQualification: document.getElementById("fitCheckQualification"),
    fitCheckSkills: document.getElementById("fitCheckSkills"),
    fitCheckPreferences: document.getElementById("fitCheckPreferences"),
    fitCheckPersonality: document.getElementById("fitCheckPersonality"),
    fitCheckKeyPoints: document.getElementById("fitCheckKeyPoints"),
    // Profile tab
    viewTabs: document.getElementById("viewTabs"),
    viewTabImport: document.getElementById("viewTabImport"),
    viewTabProfile: document.getElementById("viewTabProfile"),
    importView: document.getElementById("importView"),
    profileView: document.getElementById("profileView"),
    profileLoading: document.getElementById("profileLoading"),
    profileError: document.getElementById("profileError"),
    profileCard: document.getElementById("profileCard"),
    refreshProfileBtn: document.getElementById("refreshProfileBtn"),
    fillPageBtn: document.getElementById("fillPageBtn"),
    openProfileAppBtn: document.getElementById("openProfileAppBtn"),
    fillReport: document.getElementById("fillReport"),
    // Fill confirmation modal
    fillConfirmModal: document.getElementById("fillConfirmModal"),
    closeFillConfirmBtn: document.getElementById("closeFillConfirmBtn"),
    fillConfirmHosts: document.getElementById("fillConfirmHosts"),
    fillConfirmChangedNotice: document.getElementById("fillConfirmChangedNotice"),
    fillConfirmEmpty: document.getElementById("fillConfirmEmpty"),
    fillConfirmRemember: document.getElementById("fillConfirmRemember"),
    fillConfirmCancel: document.getElementById("fillConfirmCancel"),
    fillConfirmApply: document.getElementById("fillConfirmApply"),
    // Settings: autofill privacy
    consentCount: document.getElementById("consentCount"),
    clearConsentsBtn: document.getElementById("clearConsentsBtn"),
    clearProfileCacheBtn: document.getElementById("clearProfileCacheBtn"),
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
