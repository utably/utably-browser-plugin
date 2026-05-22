import { trimOrEmpty } from "./dom.js";
import { getLocale } from "./i18n.js";

const FITCHECK_CACHE_KEY = "utablyFitCheckCache";

function safeHostname(rawUrl) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

function getFitCheckCacheKey(els) {
  const jobTitle = trimOrEmpty(els.jobTitle.value);
  const companyName = trimOrEmpty(els.companyName.value);
  const jobUrl = trimOrEmpty(els.jobUrl.value);
  const locale = getLocale();
  const base = jobUrl || `${jobTitle}::${companyName}`;
  return base ? `${locale}::${base}` : "";
}

async function getCachedFitCheckFromStorage(cacheKey) {
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

/**
 * Map FitCheck result to FitAnalysis format for the application
 * Includes full detailed data from plugin's FitCheck
 */
function mapFitCheckToFitAnalysis(fitCheckResult) {
  if (!fitCheckResult) return undefined;

  const insight = fitCheckResult.insight || fitCheckResult;
  if (!insight || !insight.overallScore) return undefined;

  // Preserve the lock state + upgrade copy so re-opening the modal later
  // (from the Saved tab) shows the same upgrade CTA the user originally saw.
  const insightsLocked = Boolean(fitCheckResult.insightsLocked);
  const upgradeMessage = typeof fitCheckResult.upgradeMessage === "string"
    ? fitCheckResult.upgradeMessage
    : undefined;

  return {
    // Basic fields
    fitSummary: insight.summary || undefined,
    strengths: Array.isArray(insight.topStrengths) ? insight.topStrengths : undefined,
    gaps: Array.isArray(insight.topConcerns) ? insight.topConcerns : undefined,
    nextSteps: undefined,
    confidence: insight.overallScore ? insight.overallScore / 100 : undefined,
    generatedAt: new Date().toISOString(),

    // Tier state at the time of analysis
    insightsLocked,
    upgradeMessage,

    // Extended fields from FitCheck
    trafficLight: insight.trafficLight || undefined,
    qualificationAnalysis: insight.qualificationAnalysis ? {
      level: insight.qualificationAnalysis.level || undefined,
      signals: Array.isArray(insight.qualificationAnalysis.signals)
        ? insight.qualificationAnalysis.signals : undefined,
    } : undefined,
    skillsBreakdown: insight.skillsBreakdown ? {
      matching: Array.isArray(insight.skillsBreakdown.matching)
        ? insight.skillsBreakdown.matching : undefined,
      gaps: Array.isArray(insight.skillsBreakdown.gaps)
        ? insight.skillsBreakdown.gaps : undefined,
      bonus: Array.isArray(insight.skillsBreakdown.bonus)
        ? insight.skillsBreakdown.bonus : undefined,
      gapSeverity: insight.skillsBreakdown.gapSeverity || undefined,
    } : undefined,
    preferencesAlignment: insight.preferencesAlignment ? {
      salary: insight.preferencesAlignment.salary || undefined,
      location: insight.preferencesAlignment.location || undefined,
      remote: insight.preferencesAlignment.remote || undefined,
    } : undefined,
    personalityFit: insight.personalityFit ? {
      workStyle: insight.personalityFit.workStyle || undefined,
      teamDynamics: insight.personalityFit.teamDynamics || undefined,
    } : undefined,
  };
}

function getSelectedKind(els) {
  const active = els?.kindOptions?.find?.((btn) => btn.classList.contains("is-active"));
  const value = active?.dataset?.kind;
  return value === "Applied" ? "Applied" : "Saved";
}

export async function buildApplicationPayload(els) {
  const jobTitle = trimOrEmpty(els.jobTitle.value);
  const companyName = trimOrEmpty(els.companyName.value);
  if (!jobTitle || !companyName) {
    throw new Error("Job title and company are required.");
  }

  const status = getSelectedKind(els);
  const recruiterName = trimOrEmpty(els.recruiterName.value);
  const jobUrl = trimOrEmpty(els.jobUrl.value);
  const appliedDay = trimOrEmpty(els.applicationDate.value) || new Date().toISOString().slice(0, 10);

  // Get cached FitCheck result - check memory first, then storage
  let fitCheckResult = window.__fitCheckController?.getCachedResult?.();
  if (!fitCheckResult) {
    const cacheKey = getFitCheckCacheKey(els);
    fitCheckResult = await getCachedFitCheckFromStorage(cacheKey);
  }

  const fitAnalysis = mapFitCheckToFitAnalysis(fitCheckResult);

  return {
    id: crypto.randomUUID(),
    companyName,
    jobTitle,
    applicationDate: appliedDay,
    applicationMethod: "",
    status,
    jobUrl,
    jobText: trimOrEmpty(els.jobText.value),
    location: trimOrEmpty(els.location.value) || undefined,
    recruiter: recruiterName ? { name: recruiterName } : undefined,
    fitAnalysis,
    interviewDates: [],
    recruiterInteractions: [],
    notes: trimOrEmpty(els.notes?.value),
    interviewRounds: [],
    attachments: "",
    source: safeHostname(jobUrl),
  };
}
