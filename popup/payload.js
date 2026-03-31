import { trimOrEmpty } from "./dom.js";

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
  return jobUrl || `${jobTitle}::${companyName}`;
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
 */
function mapFitCheckToFitAnalysis(fitCheckResult) {
  if (!fitCheckResult) return undefined;

  const insight = fitCheckResult.insight || fitCheckResult;
  if (!insight || !insight.overallScore) return undefined;

  return {
    fitSummary: insight.summary || undefined,
    strengths: Array.isArray(insight.topStrengths) ? insight.topStrengths : undefined,
    gaps: Array.isArray(insight.topConcerns) ? insight.topConcerns : undefined,
    nextSteps: undefined, // FitCheck doesn't provide this yet
    confidence: insight.overallScore ? insight.overallScore / 100 : undefined,
    generatedAt: new Date().toISOString(),
  };
}

export async function buildApplicationPayload(els) {
  const jobTitle = trimOrEmpty(els.jobTitle.value);
  const companyName = trimOrEmpty(els.companyName.value);
  if (!jobTitle || !companyName) {
    throw new Error("Job title and company are required.");
  }

  const appliedDay = trimOrEmpty(els.applicationDate.value) || new Date().toISOString().slice(0, 10);
  const recruiterName = trimOrEmpty(els.recruiterName.value);
  const jobUrl = trimOrEmpty(els.jobUrl.value);

  // Get cached FitCheck result - check memory first, then storage
  let fitCheckResult = window.__fitCheckController?.getCachedResult?.();
  if (!fitCheckResult) {
    const cacheKey = getFitCheckCacheKey(els);
    fitCheckResult = await getCachedFitCheckFromStorage(cacheKey);
    console.log("[Payload] FitCheck from storage:", fitCheckResult ? "found" : "not found");
  } else {
    console.log("[Payload] FitCheck from memory cache");
  }

  const fitAnalysis = mapFitCheckToFitAnalysis(fitCheckResult);
  console.log("[Payload] fitAnalysis:", fitAnalysis);

  return {
    id: crypto.randomUUID(),
    companyName,
    jobTitle,
    applicationDate: appliedDay,
    applicationMethod: "",
    status: "Applied",
    jobUrl,
    jobText: trimOrEmpty(els.jobText.value),
    location: trimOrEmpty(els.location.value) || undefined,
    recruiter: recruiterName ? { name: recruiterName } : undefined,
    fitAnalysis,
    interviewDates: [],
    recruiterInteractions: [],
    notes: "",
    interviewRounds: [],
    attachments: "",
    source: safeHostname(jobUrl),
  };
}
