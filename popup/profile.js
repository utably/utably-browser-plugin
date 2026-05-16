import { t } from "./i18n.js";
import { trimOrEmpty } from "./dom.js";
import { getActiveTab } from "./extraction.js";

const MAX_EXPERIENCES = 5;
const MAX_EDUCATION = 4;
const MAX_SKILLS = 18;
const MAX_LANGUAGES = 12;
const MAX_CERTS = 20;

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function formatDate(value) {
  const clean = trimOrEmpty(value);
  if (!clean) return "";
  // Accept ISO (YYYY-MM-DD) and "YYYY-MM" / "YYYY".
  const match = clean.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!match) return clean;
  const [, year, month] = match;
  if (!month) return year;
  return `${month}/${year}`;
}

function formatPeriod(start, end, isCurrent) {
  const s = formatDate(start);
  const e = isCurrent ? t("profile.current") || "Present" : formatDate(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

function formatLocation(profile) {
  const a = profile?.address || {};
  return [a.city, a.country].filter(Boolean).join(", ");
}

function showOrHideSection(card, selector, hasContent) {
  const section = card.querySelector(selector);
  if (section) section.classList.toggle("hidden", !hasContent);
}

function renderChipList(container, items) {
  container.replaceChildren();
  for (const item of items) {
    const span = document.createElement("span");
    span.className = "skill-chip";
    span.textContent = item;
    container.appendChild(span);
  }
}

function renderProfileCard(els, profile) {
  if (!els.profileCard) return;
  const card = els.profileCard;
  const c = profile?.contact || {};
  const fullName = [c.academicTitle, c.firstName, c.middleName, c.lastName].filter(Boolean).join(" ");
  card.querySelector(".profile-name").textContent = fullName || t("profile.empty");
  card.querySelector(".profile-email").textContent = c.email || "";
  card.querySelector(".profile-phone").textContent = c.phone || "";
  card.querySelector(".profile-location").textContent = formatLocation(profile);
  const nationalityEl = card.querySelector(".profile-nationality");
  if (nationalityEl) nationalityEl.textContent = c.nationality || "";

  // Links
  const linksList = card.querySelector(".profile-links");
  const links = profile?.links || {};
  const linkEntries = [
    ["LinkedIn", links.linkedin],
    ["GitHub", links.github],
    ["Website", links.website],
  ].filter(([, url]) => Boolean(url));
  linksList.replaceChildren();
  for (const [label, url] of linkEntries) {
    const li = document.createElement("li");
    const lbl = document.createElement("span");
    lbl.className = "link-label";
    lbl.textContent = label;
    const a = document.createElement("a");
    a.className = "link-url";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = url;
    li.appendChild(lbl);
    li.appendChild(a);
    linksList.appendChild(li);
  }
  showOrHideSection(card, ".profile-section-links", linkEntries.length > 0);

  // Experience (expandable)
  const expList = card.querySelector(".profile-experience");
  const experiences = Array.isArray(profile?.experience) ? profile.experience.slice(0, MAX_EXPERIENCES) : [];
  expList.replaceChildren();
  for (const exp of experiences) {
    expList.appendChild(buildExperienceEntry(exp));
  }
  showOrHideSection(card, ".profile-section-experience", experiences.length > 0);

  // Education (expandable)
  const eduList = card.querySelector(".profile-education");
  const education = Array.isArray(profile?.education) ? profile.education.slice(0, MAX_EDUCATION) : [];
  eduList.replaceChildren();
  for (const edu of education) {
    eduList.appendChild(buildEducationEntry(edu));
  }
  showOrHideSection(card, ".profile-section-education", education.length > 0);

  // Skills (hard + soft + other, capped)
  const skills = [
    ...(profile?.skills?.hard || []),
    ...(profile?.skills?.soft || []),
    ...(profile?.skills?.other || []),
  ].slice(0, MAX_SKILLS);
  renderChipList(card.querySelector(".profile-skills"), skills);
  showOrHideSection(card, ".profile-section-skills", skills.length > 0);

  // Languages
  const languages = (profile?.skills?.languages || []).slice(0, MAX_LANGUAGES);
  renderChipList(card.querySelector(".profile-languages"), languages);
  showOrHideSection(card, ".profile-section-languages", languages.length > 0);

  // Licenses + certificates (merged into one chip list)
  const certs = [
    ...((profile?.certifications?.licenses) || []),
    ...((profile?.certifications?.certificates) || []),
  ].slice(0, MAX_CERTS);
  renderChipList(card.querySelector(".profile-certifications"), certs);
  showOrHideSection(card, ".profile-section-certifications", certs.length > 0);

  card.classList.remove("hidden");
}

function appendDetailRow(container, labelKey, value) {
  if (!value) return;
  const row = document.createElement("div");
  row.className = "entry-detail-row";
  const lbl = document.createElement("span");
  lbl.className = "entry-detail-label";
  lbl.textContent = t(labelKey);
  const val = document.createElement("span");
  val.className = "entry-detail-value";
  val.textContent = value;
  row.appendChild(lbl);
  row.appendChild(val);
  container.appendChild(row);
}

function appendBulletList(container, labelKey, bullets) {
  if (!Array.isArray(bullets) || bullets.length === 0) return;
  const row = document.createElement("div");
  row.className = "entry-detail-row entry-detail-row-block";
  const lbl = document.createElement("div");
  lbl.className = "entry-detail-label";
  lbl.textContent = t(labelKey);
  row.appendChild(lbl);
  const ul = document.createElement("ul");
  ul.className = "entry-detail-bullets";
  for (const b of bullets) {
    const li = document.createElement("li");
    li.textContent = b;
    ul.appendChild(li);
  }
  row.appendChild(ul);
  container.appendChild(row);
}

function appendParagraph(container, labelKey, text) {
  if (!text) return;
  const row = document.createElement("div");
  row.className = "entry-detail-row entry-detail-row-block";
  const lbl = document.createElement("div");
  lbl.className = "entry-detail-label";
  lbl.textContent = t(labelKey);
  const p = document.createElement("p");
  p.className = "entry-detail-paragraph";
  p.textContent = text;
  row.appendChild(lbl);
  row.appendChild(p);
  container.appendChild(row);
}

function buildEntrySummary(primary, secondary, dates) {
  const summary = document.createElement("summary");
  summary.className = "entry-summary";
  const chevron = document.createElement("span");
  chevron.className = "entry-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";
  summary.appendChild(chevron);
  const body = document.createElement("span");
  body.className = "entry-summary-body";
  if (primary) {
    const a = document.createElement("span");
    a.className = "exp-title";
    a.textContent = primary;
    body.appendChild(a);
  }
  if (secondary) {
    const b = document.createElement("span");
    b.className = "exp-company";
    b.textContent = secondary;
    body.appendChild(b);
  }
  if (dates) {
    const c = document.createElement("span");
    c.className = "exp-dates";
    c.textContent = dates;
    body.appendChild(c);
  }
  summary.appendChild(body);
  return summary;
}

function buildExperienceEntry(exp) {
  const li = document.createElement("li");
  const details = document.createElement("details");
  details.className = "entry-details";
  const primary = exp.title || exp.position || "";
  const secondary = exp.company || "";
  const dates = formatPeriod(exp.startDate, exp.endDate, exp.isCurrent);
  details.appendChild(buildEntrySummary(primary, secondary, dates));

  const detail = document.createElement("div");
  detail.className = "entry-detail";
  appendDetailRow(detail, "profile.detail.location", exp.location);
  appendParagraph(detail, "profile.detail.role", exp.description);
  if (Array.isArray(exp.achievementsBullets) && exp.achievementsBullets.length) {
    appendBulletList(detail, "profile.detail.achievements", exp.achievementsBullets);
  } else if (exp.achievements) {
    appendParagraph(detail, "profile.detail.achievements", exp.achievements);
  }
  appendParagraph(detail, "profile.detail.company", exp.companyDescription);
  if (!detail.childElementCount) {
    const empty = document.createElement("div");
    empty.className = "entry-detail-empty";
    empty.textContent = t("profile.detail.empty");
    detail.appendChild(empty);
  }
  details.appendChild(detail);
  li.appendChild(details);
  return li;
}

function buildEducationEntry(edu) {
  const li = document.createElement("li");
  const details = document.createElement("details");
  details.className = "entry-details";
  const primary = [edu.degree, edu.field].filter(Boolean).join(", ") || edu.course || edu.type || "";
  const secondary = edu.institution || "";
  const dates = formatPeriod(edu.startDate, edu.endDate, edu.currentlyAttending);
  details.appendChild(buildEntrySummary(primary, secondary, dates));

  const detail = document.createElement("div");
  detail.className = "entry-detail";
  appendDetailRow(detail, "profile.detail.location", edu.location);
  appendDetailRow(detail, "profile.detail.gpa", edu.gpa);
  appendDetailRow(detail, "profile.detail.course", edu.course);
  appendDetailRow(detail, "profile.detail.thesis", edu.thesisTopic);
  appendParagraph(detail, "profile.detail.description", edu.description);
  if (!detail.childElementCount) {
    const empty = document.createElement("div");
    empty.className = "entry-detail-empty";
    empty.textContent = t("profile.detail.empty");
    detail.appendChild(empty);
  }
  details.appendChild(detail);
  li.appendChild(details);
  return li;
}

function showProfileError(els, message) {
  if (!els.profileError) return;
  els.profileError.textContent = message || t("profile.loadFailed");
  els.profileError.classList.remove("hidden");
}

function clearProfileError(els) {
  if (!els.profileError) return;
  els.profileError.textContent = "";
  els.profileError.classList.add("hidden");
}

function clearFillReport(els) {
  if (!els.fillReport) return;
  els.fillReport.textContent = "";
  els.fillReport.classList.add("hidden");
  els.fillReport.classList.remove("notice-error", "notice-success");
}

function showFillReport(els, message, tone = "info") {
  if (!els.fillReport) return;
  els.fillReport.textContent = message;
  els.fillReport.classList.remove("hidden", "notice-error", "notice-success");
  if (tone === "error") els.fillReport.classList.add("notice-error");
  if (tone === "success") els.fillReport.classList.add("notice-success");
}

export async function loadProfile(els, { forceRefresh = false } = {}) {
  if (!els.profileView) return null;
  clearProfileError(els);
  els.profileCard.classList.add("hidden");
  els.profileLoading.classList.remove("hidden");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "UTABLY_GET_PROFILE",
      forceRefresh,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Failed to load profile.");
    }
    const profile = response.profile;
    renderProfileCard(els, profile);
    return profile;
  } catch (err) {
    showProfileError(els, err?.message || t("profile.loadFailed"));
    return null;
  } finally {
    els.profileLoading.classList.add("hidden");
  }
}

export function setActiveView(els, view) {
  const isProfile = view === "profile";
  els.importView?.classList.toggle("hidden", isProfile);
  els.profileView?.classList.toggle("hidden", !isProfile);
  if (els.viewTabImport) {
    els.viewTabImport.classList.toggle("is-active", !isProfile);
    els.viewTabImport.setAttribute("aria-selected", String(!isProfile));
  }
  if (els.viewTabProfile) {
    els.viewTabProfile.classList.toggle("is-active", isProfile);
    els.viewTabProfile.setAttribute("aria-selected", String(isProfile));
  }
}

export function wireProfileTab(els, { requestHostAccess, openInUtably }) {
  if (!els.viewTabProfile) return;

  let loaded = false;

  els.viewTabImport?.addEventListener("click", () => {
    setActiveView(els, "import");
  });

  els.viewTabProfile?.addEventListener("click", async () => {
    setActiveView(els, "profile");
    clearFillReport(els);
    if (!loaded) {
      loaded = true;
      await loadProfile(els);
    }
  });

  els.refreshProfileBtn?.addEventListener("click", async () => {
    clearFillReport(els);
    await loadProfile(els, { forceRefresh: true });
  });

  els.openProfileAppBtn?.addEventListener("click", async () => {
    if (typeof openInUtably === "function") {
      await openInUtably("/user-data/profile");
    }
  });

  els.fillPageBtn?.addEventListener("click", async () => {
    clearFillReport(els);
    const granted = await requestHostAccess();
    if (!granted) {
      showFillReport(els, t("errors.hostDenied"), "error");
      return;
    }
    const tab = await getActiveTab();
    if (!tab?.id) {
      showFillReport(els, "No active tab.", "error");
      return;
    }
    const originalLabel = els.fillPageBtn.textContent;
    try {
      // Up to 3 preview→consent→fill attempts. If the page mutates between
      // preview and fill we abort the apply, re-run the preview, and let
      // the user re-consent against the new field set. After 3 changes we
      // give up — that's a hostile page.
      let attempt = 0;
      let finalResult = null;
      while (attempt < 3 && !finalResult) {
        attempt += 1;
        els.fillPageBtn.disabled = true;
        els.fillPageBtn.textContent = t("profile.previewing");
        const preview = await chrome.runtime.sendMessage({
          type: "UTABLY_FILL_PREVIEW",
          tabId: tab.id,
        });
        if (!preview?.ok) {
          throw new Error(preview?.error || "Preview failed.");
        }
        els.fillPageBtn.textContent = originalLabel;
        els.fillPageBtn.disabled = false;
        const hostsForConsent = preview.report?.hosts || [];
        const confirmed = await showFillConfirm(els, {
          hosts: hostsForConsent,
          consentRemembered: Boolean(preview.consentRemembered),
          changedRetry: attempt > 1,
        });
        if (!confirmed) {
          return;
        }
        els.fillPageBtn.disabled = true;
        els.fillPageBtn.textContent = t("profile.filling");
        const response = await chrome.runtime.sendMessage({
          type: "UTABLY_FILL_PAGE",
          tabId: tab.id,
          rememberConsent: confirmed.remember === true,
          // Pass the user-consented host list so the content scripts can
          // verify the page hasn't mutated since the preview.
          expectedHosts: hostsForConsent.map((h) => ({
            host: h.host,
            fields: Array.isArray(h.fields) ? h.fields : [],
          })),
        });
        if (response?.ok) {
          finalResult = response;
          break;
        }
        if (response?.code === "PAGE_CHANGED") {
          // Loop back to a fresh preview/consent cycle.
          showFillReport(els, t("profile.pageChanged"), "info");
          continue;
        }
        throw new Error(response?.error || "Fill failed.");
      }

      if (!finalResult) {
        showFillReport(els, t("profile.pageChangedAbort"), "error");
        return;
      }

      const report = finalResult.report || {};
      const filled = Number(report.filled || 0);
      if (filled > 0) {
        showFillReport(
          els,
          t("profile.fillSuccess", { count: filled, adapter: report.adapter || "generic" }),
          "success"
        );
      } else {
        showFillReport(els, t("profile.fillNothing"), "info");
      }
    } catch (err) {
      showFillReport(els, err?.message || "Fill failed.", "error");
    } finally {
      els.fillPageBtn.disabled = false;
      els.fillPageBtn.textContent = originalLabel;
    }
  });
}

function getFocusableElements(container) {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter((el) => {
    if (el.disabled) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function uniquePreserveOrder(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function fieldLabel(key) {
  const translated = t(`fillField.${key}`);
  if (translated && translated !== `fillField.${key}`) return translated;
  return key;
}

function renderConfirmHosts(container, hosts) {
  if (!container) return;
  // Build via DOM nodes (never innerHTML with user data) so the modal
  // remains XSS-proof even if a frame hostname contains odd characters.
  container.replaceChildren();
  for (const entry of hosts) {
    const li = document.createElement("li");

    const header = document.createElement("div");
    header.className = "fill-confirm-host-header";

    const name = document.createElement("span");
    name.className = "fill-confirm-host-name";
    name.textContent = entry.host || "";
    header.appendChild(name);

    if (!entry.isTopFrame) {
      const tag = document.createElement("span");
      tag.className = "fill-confirm-host-tag tag-iframe";
      tag.textContent = t("fillConfirm.iframeTag") || "iframe";
      header.appendChild(tag);
    }
    li.appendChild(header);

    const fieldList = document.createElement("ul");
    fieldList.className = "fill-confirm-host-fields";
    for (const key of uniquePreserveOrder(entry.fields || [])) {
      const fieldLi = document.createElement("li");
      fieldLi.textContent = fieldLabel(key);
      fieldList.appendChild(fieldLi);
    }
    li.appendChild(fieldList);

    container.appendChild(li);
  }
}

function showFillConfirm(els, { hosts, consentRemembered, changedRetry }) {
  if (!els.fillConfirmModal) return Promise.resolve(false);
  return new Promise((resolve) => {
    const previousFocused = document.activeElement;
    const safeHosts = Array.isArray(hosts) ? hosts : [];
    const totalFields = safeHosts.reduce((acc, h) => acc + (h.fields?.length || 0), 0);

    if (els.fillConfirmChangedNotice) {
      els.fillConfirmChangedNotice.classList.toggle("hidden", !changedRetry);
    }
    renderConfirmHosts(els.fillConfirmHosts, safeHosts);
    if (els.fillConfirmHosts) {
      els.fillConfirmHosts.classList.toggle("hidden", safeHosts.length === 0);
    }
    if (els.fillConfirmEmpty) {
      els.fillConfirmEmpty.classList.toggle("hidden", totalFields > 0);
    }
    if (els.fillConfirmRemember) {
      els.fillConfirmRemember.checked = Boolean(consentRemembered);
    }
    if (els.fillConfirmApply) {
      els.fillConfirmApply.disabled = totalFields === 0;
    }

    els.fillConfirmModal.classList.remove("hidden");
    const [first] = getFocusableElements(els.fillConfirmModal);
    first?.focus();

    const onApply = () => close({ confirmed: true, remember: Boolean(els.fillConfirmRemember?.checked) });
    const onCancel = () => close({ confirmed: false });
    const onBackdrop = (event) => {
      if (event.target === els.fillConfirmModal) onCancel();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(els.fillConfirmModal);
      if (!focusable.length) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    function close(result) {
      els.fillConfirmModal.classList.add("hidden");
      els.fillConfirmApply?.removeEventListener("click", onApply);
      els.fillConfirmCancel?.removeEventListener("click", onCancel);
      els.closeFillConfirmBtn?.removeEventListener("click", onCancel);
      els.fillConfirmModal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocused && typeof previousFocused.focus === "function") {
        previousFocused.focus();
      }
      resolve(result.confirmed ? { remember: result.remember === true } : false);
    }

    els.fillConfirmApply?.addEventListener("click", onApply);
    els.fillConfirmCancel?.addEventListener("click", onCancel);
    els.closeFillConfirmBtn?.addEventListener("click", onCancel);
    els.fillConfirmModal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeyDown);
  });
}

export async function refreshConsentCount(els) {
  if (!els.consentCount) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: "UTABLY_FILL_CONSENT_STATUS" });
    const count = response?.ok ? (response.hosts || []).length : 0;
    els.consentCount.textContent = String(count);
  } catch {
    els.consentCount.textContent = "0";
  }
}

export function wirePrivacySettings(els, { setStatusText }) {
  els.clearConsentsBtn?.addEventListener("click", async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "UTABLY_CLEAR_FILL_CONSENTS" });
      if (!response?.ok) throw new Error(response?.error || "Failed to clear consents.");
      await refreshConsentCount(els);
      if (typeof setStatusText === "function") {
        setStatusText(t("settings.privacy.consentsCleared"), "success");
      }
    } catch (err) {
      if (typeof setStatusText === "function") {
        setStatusText(err?.message || "Failed to clear consents.", "error");
      }
    }
  });

  els.clearProfileCacheBtn?.addEventListener("click", async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "UTABLY_CLEAR_PROFILE_CACHE" });
      if (!response?.ok) throw new Error(response?.error || "Failed to clear cache.");
      if (typeof setStatusText === "function") {
        setStatusText(t("settings.privacy.cacheCleared"), "success");
      }
    } catch (err) {
      if (typeof setStatusText === "function") {
        setStatusText(err?.message || "Failed to clear cache.", "error");
      }
    }
  });

  refreshConsentCount(els).catch(() => {});
}
