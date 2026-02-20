import { trimOrEmpty } from "./dom.js";

function safeHostname(rawUrl) {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

export function buildApplicationPayload(els) {
  const jobTitle = trimOrEmpty(els.jobTitle.value);
  const companyName = trimOrEmpty(els.companyName.value);
  if (!jobTitle || !companyName) {
    throw new Error("Job title and company are required.");
  }

  const appliedDay = trimOrEmpty(els.applicationDate.value) || new Date().toISOString().slice(0, 10);
  const recruiterName = trimOrEmpty(els.recruiterName.value);
  const jobUrl = trimOrEmpty(els.jobUrl.value);

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
    interviewDates: [],
    recruiterInteractions: [],
    notes: "",
    interviewRounds: [],
    attachments: "",
    source: safeHostname(jobUrl),
  };
}
