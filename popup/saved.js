import { t } from "./i18n.js";
import { trimOrEmpty } from "./dom.js";
import { setActiveView } from "./profile.js";

// ---- Status meta (matches design tone palette) ----
const STATUS_META = {
  saved:     { key: "saved",     toneClass: "tone-saved" },
  applied:   { key: "applied",   toneClass: "tone-applied" },
  interview: { key: "interview", toneClass: "tone-interview" },
  offer:     { key: "offer",     toneClass: "tone-applied" },
  rejected:  { key: "rejected",  toneClass: "tone-saved" },
};

const FILTERS = ["all", "saved", "applied", "interview"];

// ---- Deterministic logo tone — same company always renders the same color ----
const LOGO_PALETTE = [
  { bg: "#062C33", fg: "#87FFDE" },
  { bg: "#5E6AD2", fg: "#ffffff" },
  { bg: "#635BFF", fg: "#ffffff" },
  { bg: "#EF7B45", fg: "#ffffff" },
  { bg: "#2FA97A", fg: "#ffffff" },
  { bg: "#FFE0B5", fg: "#062C33" },
  { bg: "#87FFDE", fg: "#062C33" },
  { bg: "#D9652F", fg: "#ffffff" },
];

function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function logoTone(company) {
  return LOGO_PALETTE[hashString(company) % LOGO_PALETTE.length];
}

function initials(name) {
  const clean = String(name || "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusKey(raw) {
  const v = trimOrEmpty(raw).toLowerCase();
  if (v.startsWith("interview")) return "interview";
  if (v.startsWith("appl")) return "applied";
  if (v.startsWith("offer")) return "offer";
  if (v.startsWith("reject")) return "rejected";
  return "saved";
}

function daysAgo(iso) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days < 0) return null;
  return days;
}

function formatSavedAgo(app) {
  const ts = app.updatedAt || app.createdAt || app.applicationDate;
  const d = daysAgo(ts);
  if (d == null) return "";
  if (d === 0) return t("saved.today");
  if (d === 1) return t("saved.yesterday");
  return t("saved.daysAgo", { count: d });
}

function hostFromUrl(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
  } catch {}
  return false;
}

let toastTimer = null;
function flashCopyToast(els, label, preview) {
  const toast = els.copyToast;
  if (!toast) return;
  toast.replaceChildren();
  const lbl = document.createElement("span");
  lbl.className = "toast-label";
  lbl.textContent = `${t("profile.copied")} · ${label || ""}`.trim();
  const pre = document.createElement("span");
  pre.className = "toast-preview";
  pre.textContent = preview || "";
  toast.appendChild(lbl);
  toast.appendChild(pre);
  toast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1400);
}

function makeIcon(svgString) {
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = svgString;
  return span;
}

const ICON_COPY = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_OPEN = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><polyline points="9 7 17 7 17 15"/></svg>';
const ICON_EXTERNAL = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';

function fitLightFromScore(score) {
  if (!Number.isFinite(score)) return "";
  if (score >= 85) return "perfect";
  if (score >= 70) return "good";
  if (score >= 50) return "partial";
  return "review";
}

// ---- Filter chip + count rendering ----
let currentFilter = "all";
let currentQuery = "";
let cachedApplications = [];

// The Import flow persists a remapped, flattened fitAnalysis shape (see
// popup/payload.js mapFitCheckToFitAnalysis) — fitSummary instead of
// summary, confidence (0–1) instead of overallScore (0–100), strengths /
// gaps instead of topStrengths / topConcerns. The FitCheck modal expects
// the original LLM shape, so normalize before handing it off.
function normalizeStoredFitAnalysis(stored) {
  if (!stored || typeof stored !== "object") return null;
  // If the stored object already looks like the LLM shape (or is the full
  // LLM envelope), pass it through unchanged.
  if (stored.insight && typeof stored.insight === "object") return stored;
  if (stored.overallScore != null && stored.summary != null) return stored;

  const overallScore = (() => {
    if (Number.isFinite(stored.overallScore)) return Math.round(stored.overallScore);
    if (Number.isFinite(stored.confidence)) return Math.round(stored.confidence * 100);
    return 0;
  })();
  const summary = stored.summary || stored.fitSummary || "";
  const strengths = Array.isArray(stored.topStrengths) ? stored.topStrengths
    : Array.isArray(stored.strengths) ? stored.strengths : [];
  const concerns = Array.isArray(stored.topConcerns) ? stored.topConcerns
    : Array.isArray(stored.gaps) ? stored.gaps : [];
  const skills = stored.skillsBreakdown || {};
  const noDeepData = !summary
    && strengths.length === 0
    && concerns.length === 0
    && (!Array.isArray(skills.matching) || skills.matching.length === 0)
    && !stored.preferencesAlignment
    && !stored.personalityFit;
  // Lock state: trust explicit flag, otherwise infer from emptiness. Old
  // imports (pre-flag-persistence) had insightsLocked dropped on the floor,
  // so a deep-empty result with a score = it was locked.
  const insightsLocked = stored.insightsLocked === true
    || (stored.insightsLocked === undefined && noDeepData && overallScore > 0);

  return {
    insight: {
      trafficLight: stored.trafficLight,
      overallScore,
      summary,
      qualificationAnalysis: stored.qualificationAnalysis,
      skillsBreakdown: stored.skillsBreakdown,
      preferencesAlignment: stored.preferencesAlignment,
      personalityFit: stored.personalityFit,
      topStrengths: strengths,
      topConcerns: concerns,
    },
    insightsLocked,
    upgradeMessage: stored.upgradeMessage
      || "Upgrade to Basic or Premium to unlock detailed insights on why this job fits you.",
  };
}

// ---- Fit-badge click → existing FitCheck modal ----
async function handleFitBadgeClick(els, app, badgeEl) {
  const fitCtl = window.__fitCheckController;
  if (!fitCtl) {
    flashCopyToast(els, t("saved.fitUnavailable"), "");
    return;
  }
  const originalLabel = badgeEl.innerHTML;
  const setBusy = (text) => {
    badgeEl.disabled = true;
    badgeEl.innerHTML = "";
    const num = document.createElement("span");
    num.className = "fit-num";
    num.textContent = text;
    badgeEl.appendChild(num);
  };
  const restore = () => {
    badgeEl.disabled = false;
    badgeEl.innerHTML = originalLabel;
  };

  try {
    setBusy(t("saved.fitLoading"));
    const detailResp = await chrome.runtime.sendMessage({
      type: "UTABLY_GET_APPLICATION",
      applicationId: app.id,
    });
    if (!detailResp?.ok) {
      throw new Error(detailResp?.error || t("saved.fitLoadFailed"));
    }
    const detail = detailResp.application || {};

    // If a stored FitCheck exists, normalize to the modal's expected shape
    // and open. The persisted shape (from the Import flow) re-keys several
    // fields, so without this the modal would show empty summary / strengths
    // / concerns and a zero score.
    if (detail.fitAnalysis && typeof detail.fitAnalysis === "object") {
      const normalized = normalizeStoredFitAnalysis(detail.fitAnalysis);
      if (normalized) {
        fitCtl.openFitCheck(normalized);
        restore();
        return;
      }
    }

    // Otherwise run a fresh FitCheck. Job description is required.
    const jobText = (detail.jobText || "").trim();
    if (!jobText) {
      flashCopyToast(els, t("saved.fitNoText"), "");
      restore();
      return;
    }

    setBusy(t("saved.fitRunning"));
    const fitResp = await chrome.runtime.sendMessage({
      type: "UTABLY_FITCHECK",
      jobPosting: {
        jobTitle: detail.jobTitle || app.jobTitle,
        companyName: detail.companyName || app.companyName,
        jobText,
        location: detail.location || app.location,
        jobUrl: detail.jobUrl || app.jobUrl,
      },
    });
    if (!fitResp?.ok) {
      throw new Error(fitResp?.error || t("saved.fitRunFailed"));
    }
    const result = fitResp.result;
    fitCtl.openFitCheck(result);

    // Persist the result on the application so subsequent clicks just
    // re-open the modal instead of burning another LLM call.
    chrome.runtime.sendMessage({
      type: "UTABLY_SAVE_APPLICATION_FITCHECK",
      applicationId: app.id,
      fitAnalysis: result,
    }).then((saveResp) => {
      if (saveResp?.ok) {
        // Patch cache so the next render shows the score + light.
        const idx = cachedApplications.findIndex((a) => a.id === app.id);
        if (idx >= 0) {
          const insight = (result?.insight && typeof result.insight === "object") ? result.insight : result;
          const rawScore = insight?.overallScore ?? insight?.score;
          const newScore = typeof rawScore === "number" && Number.isFinite(rawScore)
            ? Math.round(rawScore)
            : (typeof rawScore === "string" && Number.isFinite(Number(rawScore))
              ? Math.round(Number(rawScore))
              : null);
          const newLight = typeof insight?.trafficLight === "string" ? insight.trafficLight.toLowerCase() : "";
          cachedApplications[idx] = {
            ...cachedApplications[idx],
            fitScore: newScore != null ? newScore : cachedApplications[idx].fitScore,
            fitLight: ["perfect", "good", "partial", "review"].includes(newLight) ? newLight : cachedApplications[idx].fitLight,
            updatedAt: saveResp.application?.updatedAt || cachedApplications[idx].updatedAt,
          };
          renderList(els);
        }
      }
    }).catch(() => {});
  } catch (err) {
    flashCopyToast(els, err?.message || t("saved.fitRunFailed"), "");
    restore();
  } finally {
    // restore only if we haven't already (success path may have re-rendered).
    if (badgeEl.disabled) restore();
  }
}

async function handleStatusChange(els, applicationId, selectEl, newValue) {
  const card = selectEl.closest(".job-card");
  const previousValue = selectEl.dataset.previousValue || selectEl.value;
  selectEl.dataset.previousValue = newValue;
  selectEl.disabled = true;
  // Optimistic tone swap so the user sees the change immediately.
  const newToneClass = (STATUS_META[statusKey(newValue)] || STATUS_META.saved).toneClass;
  selectEl.classList.remove("tone-saved", "tone-applied", "tone-interview");
  selectEl.classList.add(newToneClass);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "UTABLY_UPDATE_APPLICATION_STATUS",
      applicationId,
      status: newValue,
    });
    if (!response?.ok) {
      throw new Error(response?.error || t("saved.statusUpdateFailed"));
    }
    // Patch local cache so filter counts stay correct.
    const idx = cachedApplications.findIndex((a) => a.id === applicationId);
    if (idx >= 0) {
      cachedApplications[idx] = {
        ...cachedApplications[idx],
        status: newValue,
        updatedAt: response.application?.updatedAt || cachedApplications[idx].updatedAt,
      };
    }
    renderFilters(els, computeCounts());
    flashCopyToast(els, t("saved.statusUpdated"), t(`saved.status.${statusKey(newValue)}`));
    if (card) {
      card.classList.add("is-flash");
      setTimeout(() => card.classList.remove("is-flash"), 800);
    }
  } catch (err) {
    // Roll back the optimistic update.
    selectEl.value = previousValue;
    selectEl.dataset.previousValue = previousValue;
    const oldTone = (STATUS_META[statusKey(previousValue)] || STATUS_META.saved).toneClass;
    selectEl.classList.remove("tone-saved", "tone-applied", "tone-interview");
    selectEl.classList.add(oldTone);
    if (els.copyToast) {
      els.copyToast.replaceChildren();
      const lbl = document.createElement("span");
      lbl.className = "toast-label";
      lbl.style.color = "#FFB1A8";
      lbl.textContent = `⚠ ${err?.message || t("saved.statusUpdateFailed")}`;
      els.copyToast.appendChild(lbl);
      els.copyToast.classList.add("is-visible");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => els.copyToast.classList.remove("is-visible"), 2200);
    }
  } finally {
    selectEl.disabled = false;
  }
}

function renderFilters(els, counts) {
  if (!els.savedFilters) return;
  els.savedFilters.replaceChildren();
  for (const key of FILTERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-chip${currentFilter === key ? " is-active" : ""}`;
    btn.textContent = t(`saved.filter.${key}`);
    const c = document.createElement("span");
    c.className = "filter-chip-count";
    c.textContent = String(counts[key] ?? 0);
    btn.appendChild(c);
    btn.addEventListener("click", () => {
      currentFilter = key;
      renderFilters(els, counts);
      renderList(els);
    });
    els.savedFilters.appendChild(btn);
  }
}

function buildCard(els, app, openInUtably) {
  const card = document.createElement("div");
  card.className = "job-card";

  const row = document.createElement("div");
  row.className = "job-card-row";

  const tone = logoTone(app.companyName);
  const logo = document.createElement("div");
  logo.className = "job-logo";
  logo.style.background = tone.bg;
  logo.style.color = tone.fg;
  logo.textContent = initials(app.companyName);
  row.appendChild(logo);

  const text = document.createElement("div");
  text.className = "job-text";

  const title = document.createElement("div");
  title.className = "job-title";
  title.textContent = app.jobTitle || t("saved.untitled");
  text.appendChild(title);

  const meta1 = document.createElement("div");
  meta1.className = "job-meta";
  if (app.companyName) {
    const c = document.createElement("span");
    c.className = "job-meta-company";
    c.textContent = app.companyName;
    meta1.appendChild(c);
  }
  if (app.location) {
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.textContent = "·";
    meta1.appendChild(dot);
    const l = document.createElement("span");
    l.textContent = app.location;
    meta1.appendChild(l);
  }
  if (meta1.childElementCount > 0) text.appendChild(meta1);

  const sourceHost = hostFromUrl(app.jobUrl) || trimOrEmpty(app.source);
  const ago = formatSavedAgo(app);
  if (sourceHost || ago) {
    const meta2 = document.createElement("div");
    meta2.className = "job-meta";
    if (ago) {
      const a = document.createElement("span");
      a.textContent = ago;
      meta2.appendChild(a);
    }
    if (sourceHost) {
      if (ago) {
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.textContent = "·";
        meta2.appendChild(dot);
      }
      const s = document.createElement("span");
      s.textContent = sourceHost;
      meta2.appendChild(s);
    }
    text.appendChild(meta2);
  }
  row.appendChild(text);

  // Right-hand cluster: fit-score badge (clickable) above the status pill.
  const rightCol = document.createElement("div");
  rightCol.className = "job-right";

  // Strict null/undefined check — Number(null) === 0 would otherwise paint
  // every never-FitChecked application with a misleading "0".
  const hasScore = typeof app.fitScore === "number" && Number.isFinite(app.fitScore);
  const score = hasScore ? app.fitScore : 0;
  // FitCheck needs job description text to run. If the badge has no stored
  // result AND no job text on file, the user physically can't get a fit
  // analysis — render a disabled state instead of a clickable run button.
  // Legacy responses that don't include hasJobText default to "true" so
  // we never DISABLE a badge under uncertainty (errs on the side of
  // letting the user try; the click handler will surface "missing text"
  // if it really is missing).
  const hasJobText = app.hasJobText !== false;
  const canRunFitCheck = hasJobText;
  const fit = document.createElement("button");
  fit.type = "button";
  fit.className = "fit-badge";
  fit.dataset.appId = app.id;
  if (hasScore) {
    const tone = (app.fitLight && app.fitLight.trim()) || fitLightFromScore(score);
    fit.classList.add(`fit-${tone}`);
    fit.title = t("saved.fitOpen");
    const dot = document.createElement("span");
    dot.className = "fit-dot";
    fit.appendChild(dot);
    const num = document.createElement("span");
    num.className = "fit-num";
    num.textContent = String(score);
    fit.appendChild(num);
  } else if (canRunFitCheck) {
    fit.classList.add("fit-empty");
    fit.title = t("saved.fitRun");
    const dot = document.createElement("span");
    dot.className = "fit-dot";
    fit.appendChild(dot);
    const num = document.createElement("span");
    num.className = "fit-num";
    num.textContent = t("saved.fitRunShort");
    fit.appendChild(num);
  } else {
    fit.classList.add("fit-disabled");
    fit.disabled = true;
    fit.title = t("saved.fitNoTextTooltip");
    const dot = document.createElement("span");
    dot.className = "fit-dot";
    fit.appendChild(dot);
    const num = document.createElement("span");
    num.className = "fit-num";
    num.textContent = t("saved.fitNoTextShort");
    fit.appendChild(num);
  }
  fit.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hasScore && !canRunFitCheck) {
      // Disabled — surface a friendly toast pointing the user at the import
      // tab so they can re-capture the job description.
      flashCopyToast(els, t("saved.fitNoText"), "");
      return;
    }
    handleFitBadgeClick(els, app, fit);
  });
  rightCol.appendChild(fit);

  const status = STATUS_META[statusKey(app.status)] || STATUS_META.saved;
  const select = document.createElement("select");
  select.className = `job-status job-status-select ${status.toneClass}`;
  select.dataset.appId = app.id;
  select.setAttribute("aria-label", t("saved.statusAria"));
  const STATUS_OPTIONS = ["saved", "applied", "interview", "offer", "rejected"];
  for (const key of STATUS_OPTIONS) {
    const opt = document.createElement("option");
    // Capitalize first letter — matches the backend whitelist values.
    opt.value = key.charAt(0).toUpperCase() + key.slice(1);
    opt.textContent = t(`saved.status.${key}`);
    if (key === status.key) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("click", (e) => e.stopPropagation());
  select.addEventListener("change", (e) => handleStatusChange(els, app.id, select, e.target.value));
  rightCol.appendChild(select);

  row.appendChild(rightCol);
  card.appendChild(row);

  const actions = document.createElement("div");
  actions.className = "job-actions";

  const mkBtn = (label, getValue, copyLabel) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mini-btn";
    b.appendChild(makeIcon(ICON_COPY));
    const s = document.createElement("span");
    s.textContent = label;
    b.appendChild(s);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = getValue();
      if (!val) return;
      copyToClipboard(val);
      flashCopyToast(els, copyLabel, val);
      b.classList.add("is-copied");
      b.replaceChildren();
      b.appendChild(makeIcon(ICON_CHECK));
      const s2 = document.createElement("span");
      s2.textContent = label;
      b.appendChild(s2);
      setTimeout(() => {
        b.classList.remove("is-copied");
        b.replaceChildren();
        b.appendChild(makeIcon(ICON_COPY));
        const s3 = document.createElement("span");
        s3.textContent = label;
        b.appendChild(s3);
      }, 1400);
    });
    return b;
  };

  actions.appendChild(mkBtn(t("saved.action.title"), () => `${app.jobTitle} at ${app.companyName}`, t("saved.copy.title")));
  actions.appendChild(mkBtn(t("saved.action.company"), () => app.companyName, t("saved.copy.company")));

  if (app.jobUrl) {
    const postingBtn = document.createElement("button");
    postingBtn.type = "button";
    postingBtn.className = "mini-btn";
    postingBtn.appendChild(makeIcon(ICON_EXTERNAL));
    const ps = document.createElement("span");
    ps.textContent = t("saved.action.posting");
    postingBtn.appendChild(ps);
    postingBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await chrome.tabs.create({ url: app.jobUrl });
      } catch (err) {
        copyToClipboard(app.jobUrl);
        flashCopyToast(els, t("saved.copy.url"), app.jobUrl);
      }
    });
    actions.appendChild(postingBtn);
  }

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "mini-btn";
  openBtn.style.marginLeft = "auto";
  openBtn.appendChild(makeIcon(ICON_OPEN));
  const openText = document.createElement("span");
  openText.textContent = t("saved.action.open");
  openBtn.appendChild(openText);
  openBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (typeof openInUtably === "function") {
      await openInUtably(`/applications/${encodeURIComponent(app.id)}`);
    }
  });
  actions.appendChild(openBtn);

  card.appendChild(actions);
  return card;
}

function filteredApplications() {
  const q = currentQuery.trim().toLowerCase();
  return cachedApplications.filter((app) => {
    if (currentFilter !== "all" && statusKey(app.status) !== currentFilter) return false;
    if (q) {
      const haystack = [
        app.jobTitle,
        app.companyName,
        app.location,
        app.source,
        hostFromUrl(app.jobUrl),
      ].map((s) => (s || "").toLowerCase()).join(" ");
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function computeCounts() {
  const counts = { all: cachedApplications.length, saved: 0, applied: 0, interview: 0 };
  for (const app of cachedApplications) {
    const k = statusKey(app.status);
    if (counts[k] != null) counts[k] += 1;
  }
  return counts;
}

let openInUtablyRef = null;

function renderList(els) {
  if (!els.savedList) return;
  const visible = filteredApplications();
  els.savedList.replaceChildren();
  if (visible.length === 0) {
    els.savedEmpty?.classList.remove("hidden");
    return;
  }
  els.savedEmpty?.classList.add("hidden");
  for (const app of visible) {
    els.savedList.appendChild(buildCard(els, app, openInUtablyRef));
  }
}

export async function loadSavedApplications(els) {
  if (!els.savedView) return;
  els.savedError?.classList.add("hidden");
  els.savedLoading?.classList.remove("hidden");
  try {
    const response = await chrome.runtime.sendMessage({ type: "UTABLY_LIST_APPLICATIONS" });
    if (!response?.ok) {
      throw new Error(response?.error || "Failed to load.");
    }
    cachedApplications = Array.isArray(response.applications) ? response.applications : [];
    const counts = computeCounts();
    renderFilters(els, counts);
    renderList(els);
  } catch (err) {
    if (els.savedError) {
      els.savedError.textContent = err?.message || t("saved.loadFailed");
      els.savedError.classList.remove("hidden");
    }
    cachedApplications = [];
    renderFilters(els, { all: 0, saved: 0, applied: 0, interview: 0 });
    renderList(els);
  } finally {
    els.savedLoading?.classList.add("hidden");
  }
}

export function wireSavedTab(els, { openInUtably }) {
  if (!els.viewTabSaved) return;
  openInUtablyRef = openInUtably;

  let loaded = false;

  els.viewTabSaved.addEventListener("click", async () => {
    setActiveView(els, "saved");
    if (!loaded) {
      loaded = true;
      await loadSavedApplications(els);
    }
  });

  els.refreshSavedBtn?.addEventListener("click", async () => {
    await loadSavedApplications(els);
  });

  let searchTimer = null;
  els.savedSearch?.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentQuery = els.savedSearch.value || "";
      els.savedSearchClear?.classList.toggle("hidden", !currentQuery);
      renderList(els);
    }, 120);
  });
  els.savedSearchClear?.addEventListener("click", () => {
    if (!els.savedSearch) return;
    els.savedSearch.value = "";
    currentQuery = "";
    els.savedSearchClear.classList.add("hidden");
    renderList(els);
    els.savedSearch.focus();
  });
}
