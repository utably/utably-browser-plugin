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

// ---- Clipboard helper + toast ----
let toastTimer = null;
let copyTracker = null; // { el, key, timer }

function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }
  } catch {}
  return false;
}

function showCopyToast(els, label, preview) {
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

function flashCopied(targetEl, copiedClass = "is-copied") {
  if (!targetEl) return;
  if (copyTracker) {
    copyTracker.el.classList.remove(copyTracker.cls);
    clearTimeout(copyTracker.timer);
  }
  targetEl.classList.add(copiedClass);
  copyTracker = {
    el: targetEl,
    cls: copiedClass,
    timer: setTimeout(() => targetEl.classList.remove(copiedClass), 1400),
  };
}

function copyAction(els, value, label, flashEl) {
  if (!value) return;
  copyToClipboard(value);
  showCopyToast(els, label, value);
  if (flashEl) flashCopied(flashEl);
}

// ---- Section icon SVGs (inline, design tokens) ----
const SECTION_ICONS = {
  user: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  graduation: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6 8.4 8.4M15.6 15.6l2.8 2.8M5.6 18.4 8.4 15.6M15.6 8.4l2.8-2.8"/></svg>',
  languages: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h10M5 4v4M9 4v0M9 18l4-10 4 10M11 14h4M19 22l-3-8"/></svg>',
  award: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M9 13.5 7 22l5-3 5 3-2-8.5"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 1 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 1 0 7 7l1-1"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>',
  target: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
};

function makeIconSpan(svgString) {
  const span = document.createElement("span");
  span.innerHTML = svgString;
  span.setAttribute("aria-hidden", "true");
  return span;
}

// ---- Section builder ----
function buildSection({ id, label, iconKey, tone, count, defaultOpen = true }) {
  const section = document.createElement("section");
  section.className = `section${defaultOpen ? " is-open" : ""}`;
  section.dataset.section = id;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "section-head";
  head.setAttribute("aria-expanded", String(defaultOpen));

  const icon = document.createElement("span");
  icon.className = `section-icon tone-${tone || "mint"}`;
  icon.appendChild(makeIconSpan(SECTION_ICONS[iconKey] || SECTION_ICONS.sparkle));
  head.appendChild(icon);

  const title = document.createElement("span");
  title.className = "section-title";
  title.textContent = label;
  head.appendChild(title);

  if (typeof count === "number" && count > 0) {
    const c = document.createElement("span");
    c.className = "section-count";
    c.textContent = String(count);
    head.appendChild(c);
  }

  const chev = document.createElement("span");
  chev.className = "section-chev";
  chev.appendChild(makeIconSpan(SECTION_ICONS.chev));
  head.appendChild(chev);

  const body = document.createElement("div");
  body.className = "section-body";

  head.addEventListener("click", () => {
    const isOpen = section.classList.toggle("is-open");
    head.setAttribute("aria-expanded", String(isOpen));
    body.style.display = isOpen ? "" : "none";
  });
  if (!defaultOpen) body.style.display = "none";

  section.appendChild(head);
  section.appendChild(body);
  return { section, body };
}

// ---- Entry row (label + value + hover copy pill) ----
function buildEntry(els, { id, label, value, href, copyValue }) {
  const row = document.createElement("div");
  row.className = "entry";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `${t("profile.copyAria")} ${label}`);
  if (id) row.dataset.entryId = id;

  const lbl = document.createElement("div");
  lbl.className = "entry-label";
  lbl.textContent = label;
  row.appendChild(lbl);

  const val = document.createElement("div");
  val.className = "entry-value";
  if (href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = value;
    a.addEventListener("click", (e) => e.stopPropagation());
    val.appendChild(a);
  } else {
    val.textContent = value;
  }
  row.appendChild(val);

  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "copy-pill";
  pill.setAttribute("aria-label", `${t("profile.copyAria")} ${label}`);
  pill.appendChild(makeIconSpan(SECTION_ICONS.copy));
  const pillText = document.createElement("span");
  pillText.textContent = t("profile.copy");
  pill.appendChild(pillText);
  row.appendChild(pill);

  const doCopy = (e) => {
    e?.stopPropagation();
    copyAction(els, copyValue || value, label, row);
    pill.classList.add("is-copied");
    pill.replaceChildren();
    pill.appendChild(makeIconSpan(SECTION_ICONS.check));
    const t2 = document.createElement("span");
    t2.textContent = t("profile.copied");
    pill.appendChild(t2);
    setTimeout(() => {
      pill.classList.remove("is-copied");
      pill.replaceChildren();
      pill.appendChild(makeIconSpan(SECTION_ICONS.copy));
      const t3 = document.createElement("span");
      t3.textContent = t("profile.copy");
      pill.appendChild(t3);
    }, 1400);
  };
  row.addEventListener("click", doCopy);
  pill.addEventListener("click", doCopy);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      doCopy(e);
    }
  });
  return row;
}

// ---- Role card builder ----
function buildRoleCard(els, role) {
  const wrap = document.createElement("div");
  wrap.className = "role is-collapsed";

  const head = document.createElement("div");
  head.className = "role-head";

  // Toggle handle covers the title area. Mini-buttons stop propagation so
  // they don't collapse the card when the user clicks a copy action.
  const titleWrap = document.createElement("button");
  titleWrap.type = "button";
  titleWrap.className = "role-title-wrap";
  titleWrap.setAttribute("aria-expanded", "false");

  const title = document.createElement("div");
  title.className = "role-title";
  const titleText = role.title || role.position || "";
  title.textContent = titleText;
  if (role.company) {
    const sub = document.createElement("span");
    sub.className = "role-sub";
    sub.textContent = ` · ${role.company}`;
    title.appendChild(sub);
  }
  titleWrap.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "role-meta";
  const dates = formatPeriod(role.startDate, role.endDate, role.isCurrent);
  if (dates) {
    const s = document.createElement("span");
    s.textContent = dates;
    meta.appendChild(s);
  }
  if (role.location) {
    if (dates) {
      const d = document.createElement("span");
      d.className = "dot";
      d.textContent = "·";
      meta.appendChild(d);
    }
    const l = document.createElement("span");
    l.textContent = role.location;
    meta.appendChild(l);
  }
  if (meta.childElementCount > 0) titleWrap.appendChild(meta);

  const chev = document.createElement("span");
  chev.className = "role-chev";
  chev.appendChild(makeIconSpan(SECTION_ICONS.chev));
  titleWrap.appendChild(chev);

  head.appendChild(titleWrap);

  // Action buttons: copy header, copy all bullets
  const actions = document.createElement("div");
  actions.className = "role-actions";
  const headerBtn = document.createElement("button");
  headerBtn.type = "button";
  headerBtn.className = "mini-btn";
  headerBtn.appendChild(makeIconSpan(SECTION_ICONS.copy));
  const hbT = document.createElement("span");
  hbT.textContent = t("profile.header");
  headerBtn.appendChild(hbT);
  const headerString = [titleText, role.company, dates].filter(Boolean).join(" — ");
  headerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyAction(els, headerString, t("profile.header"), headerBtn);
    flashCopied(headerBtn);
  });
  actions.appendChild(headerBtn);

  const bullets = Array.isArray(role.achievementsBullets) ? role.achievementsBullets.filter(Boolean) : [];
  if (bullets.length > 0) {
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "mini-btn";
    allBtn.appendChild(makeIconSpan(SECTION_ICONS.copy));
    const abT = document.createElement("span");
    abT.textContent = t("profile.all");
    allBtn.appendChild(abT);
    const allString = bullets.map((b) => `• ${b}`).join("\n");
    allBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyAction(els, allString, t("profile.all"), allBtn);
      flashCopied(allBtn);
    });
    actions.appendChild(allBtn);
  }
  head.appendChild(actions);
  wrap.appendChild(head);

  // Body — hidden until the title row is clicked. Houses the per-field
  // entries (each separately copyable, because application forms have
  // separate inputs for company / title / dates) plus the description
  // blocks and achievement bullets.
  const body = document.createElement("div");
  body.className = "role-body";

  // Per-field entries — application forms split company / title / dates,
  // so each gets its own click-to-copy row.
  const fieldRows = [
    { key: "title", label: t("profile.field.title"), value: titleText },
    { key: "company", label: t("profile.field.company"), value: role.company },
    { key: "from", label: t("profile.field.from"), value: formatDate(role.startDate) },
    {
      key: "to",
      label: t("profile.field.to"),
      value: role.isCurrent ? t("profile.current") : formatDate(role.endDate),
    },
    { key: "location", label: t("profile.field.location"), value: role.location },
  ].filter((row) => row.value && row.value !== "N/A");
  if (fieldRows.length > 0) {
    const fieldList = document.createElement("div");
    fieldList.className = "role-fields";
    for (const row of fieldRows) {
      fieldList.appendChild(buildEntry(els, {
        id: `role-${role.id || titleText}-${row.key}`,
        label: row.label,
        value: row.value,
      }));
    }
    body.appendChild(fieldList);
  }

  const ul = document.createElement("ul");
  ul.className = "bullets";

  const addBlock = (text, blockLabel, variant) => {
    if (!text) return;
    const li = document.createElement("li");
    li.className = `bullet${variant ? ` bullet-${variant}` : ""}`;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    const inner = document.createElement("div");
    inner.className = "bullet-text";
    if (variant) {
      const tag = document.createElement("span");
      tag.className = "bullet-tag";
      tag.textContent = blockLabel;
      inner.appendChild(tag);
    }
    const bodyText = document.createElement("span");
    bodyText.className = "bullet-body";
    bodyText.textContent = text;
    inner.appendChild(bodyText);
    const copyHint = document.createElement("div");
    copyHint.className = "bullet-copy";
    copyHint.textContent = t("profile.copy");
    li.appendChild(inner);
    li.appendChild(copyHint);
    const doCopy = (e) => {
      e?.stopPropagation();
      copyAction(els, text, blockLabel, li);
    };
    li.addEventListener("click", doCopy);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        doCopy(e);
      }
    });
    ul.appendChild(li);
  };

  addBlock(role.description, t("profile.detail.role"), "role");
  addBlock(role.companyDescription, t("profile.detail.company"), "company");
  for (const b of bullets) addBlock(b, t("profile.bullet"), null);

  if (ul.childElementCount > 0) body.appendChild(ul);
  const hasBody = body.childElementCount > 0;
  if (hasBody) {
    wrap.appendChild(body);
  } else {
    // Nothing to expand — hide the chevron so the row doesn't look interactive.
    titleWrap.classList.add("is-empty");
    titleWrap.removeAttribute("aria-expanded");
    chev.style.display = "none";
  }

  titleWrap.addEventListener("click", (e) => {
    if (!hasBody) return;
    e.stopPropagation();
    const isOpen = wrap.classList.toggle("is-collapsed");
    titleWrap.setAttribute("aria-expanded", isOpen ? "false" : "true");
  });

  return wrap;
}

// ---- Education card — same collapse pattern as experience, with the
//      per-field entries (institution / degree / field / dates / GPA)
//      that application forms typically split into separate inputs.
function buildEducationCard(els, edu) {
  const wrap = document.createElement("div");
  wrap.className = "role is-collapsed";

  const head = document.createElement("div");
  head.className = "role-head";
  const titleWrap = document.createElement("button");
  titleWrap.type = "button";
  titleWrap.className = "role-title-wrap";
  titleWrap.setAttribute("aria-expanded", "false");

  const title = document.createElement("div");
  title.className = "role-title";
  const titleText = [edu.degree, edu.field].filter(Boolean).join(", ") || edu.course || edu.institution || "";
  title.textContent = titleText;
  if (edu.degree && edu.institution) {
    const sub = document.createElement("span");
    sub.className = "role-sub";
    sub.textContent = ` · ${edu.institution}`;
    title.appendChild(sub);
  }
  titleWrap.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "role-meta";
  const dates = formatPeriod(edu.startDate, edu.endDate, edu.currentlyAttending);
  if (dates) {
    const s = document.createElement("span");
    s.textContent = dates;
    meta.appendChild(s);
  }
  if (edu.gpa) {
    if (dates) {
      const d = document.createElement("span");
      d.className = "dot";
      d.textContent = "·";
      meta.appendChild(d);
    }
    const g = document.createElement("span");
    g.textContent = `GPA ${edu.gpa}`;
    meta.appendChild(g);
  }
  if (meta.childElementCount > 0) titleWrap.appendChild(meta);

  const chev = document.createElement("span");
  chev.className = "role-chev";
  chev.appendChild(makeIconSpan(SECTION_ICONS.chev));
  titleWrap.appendChild(chev);

  head.appendChild(titleWrap);
  wrap.appendChild(head);

  // Body with per-field entries + description bullet
  const body = document.createElement("div");
  body.className = "role-body";

  const fieldRows = [
    { key: "institution", label: t("profile.field.institution"), value: edu.institution },
    { key: "degree", label: t("profile.field.degree"), value: edu.degree },
    { key: "field", label: t("profile.field.field"), value: edu.field },
    { key: "course", label: t("profile.field.course"), value: edu.course },
    { key: "from", label: t("profile.field.from"), value: formatDate(edu.startDate) },
    {
      key: "to",
      label: t("profile.field.to"),
      value: edu.currentlyAttending ? t("profile.current") : formatDate(edu.endDate),
    },
    { key: "gpa", label: t("profile.field.gpa"), value: edu.gpa },
    { key: "location", label: t("profile.field.location"), value: edu.location },
  ].filter((row) => Boolean(row.value));
  if (fieldRows.length > 0) {
    const fieldList = document.createElement("div");
    fieldList.className = "role-fields";
    for (const row of fieldRows) {
      fieldList.appendChild(buildEntry(els, {
        id: `edu-${edu.id || titleText}-${row.key}`,
        label: row.label,
        value: row.value,
      }));
    }
    body.appendChild(fieldList);
  }

  const detail = edu.description || edu.thesisTopic;
  if (detail) {
    const ul = document.createElement("ul");
    ul.className = "bullets";
    const li = document.createElement("li");
    li.className = "bullet";
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    const text = document.createElement("div");
    text.className = "bullet-text";
    text.textContent = detail;
    const copyHint = document.createElement("div");
    copyHint.className = "bullet-copy";
    copyHint.textContent = t("profile.copy");
    li.appendChild(text);
    li.appendChild(copyHint);
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      copyAction(els, detail, t("profile.description"), li);
    });
    ul.appendChild(li);
    body.appendChild(ul);
  }

  const hasBody = body.childElementCount > 0;
  if (hasBody) {
    wrap.appendChild(body);
  } else {
    titleWrap.classList.add("is-empty");
    titleWrap.removeAttribute("aria-expanded");
    chev.style.display = "none";
  }
  titleWrap.addEventListener("click", (e) => {
    if (!hasBody) return;
    e.stopPropagation();
    const isOpen = wrap.classList.toggle("is-collapsed");
    titleWrap.setAttribute("aria-expanded", isOpen ? "false" : "true");
  });

  return wrap;
}

// ---- Chip (click-to-copy) ----
function buildChip(els, label, { tone, copyLabel } = {}) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `chip${tone ? ` tone-${tone}` : ""}`;
  chip.textContent = label;
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    copyAction(els, label, copyLabel || label, chip);
  });
  return chip;
}

// ---- Attachment helpers ----
function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ATTACHMENT_KIND_META = {
  cv:          { tone: "ink",    iconKey: "briefcase" },
  document:    { tone: "cream",  iconKey: "award" },
  certificate: { tone: "cream",  iconKey: "award" },
  image:       { tone: "mint",   iconKey: "user" },
  export:      { tone: "mint",   iconKey: "sparkle" },
};

function buildAttachmentCard(els, attachment) {
  const meta = ATTACHMENT_KIND_META[attachment.kind] || ATTACHMENT_KIND_META.document;
  const card = document.createElement("div");
  card.className = "attachment-card";
  card.dataset.attachmentKey = attachment.key;

  const icon = document.createElement("span");
  icon.className = `attachment-icon tone-${meta.tone}`;
  icon.appendChild(makeIconSpan(SECTION_ICONS[meta.iconKey] || SECTION_ICONS.sparkle));
  card.appendChild(icon);

  const body = document.createElement("div");
  body.className = "attachment-body";
  const name = document.createElement("div");
  name.className = "attachment-name";
  name.textContent = attachment.name;
  body.appendChild(name);

  const metaLine = document.createElement("div");
  metaLine.className = "attachment-meta";
  const kindLabel = t(`profile.attachment.kind.${attachment.kind}`) || attachment.kind;
  metaLine.textContent = [kindLabel, formatBytes(attachment.size)].filter(Boolean).join(" · ");
  body.appendChild(metaLine);
  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "attachment-actions";

  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className = "attachment-action";
  uploadBtn.appendChild(makeIconSpan(SECTION_ICONS.copy));
  const at = document.createElement("span");
  at.textContent = t("profile.attachment.upload");
  uploadBtn.appendChild(at);
  uploadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleAttachmentUpload(els, attachment, uploadBtn);
  });
  actions.appendChild(uploadBtn);

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "attachment-icon-btn";
  downloadBtn.title = t("profile.attachment.download");
  downloadBtn.setAttribute("aria-label", t("profile.attachment.download"));
  downloadBtn.appendChild(makeIconSpan(SECTION_ICONS.download));
  downloadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleAttachmentDownload(els, attachment, downloadBtn);
  });
  actions.appendChild(downloadBtn);

  card.appendChild(actions);
  return card;
}

async function handleAttachmentDownload(els, attachment, btn) {
  if (!attachment) return;
  const originalLabel = btn?.innerHTML || "";
  if (btn) {
    btn.disabled = true;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: "UTABLY_ATTACHMENT_DOWNLOAD",
      attachment,
    });
    if (!response?.ok) throw new Error(response?.error || "Download failed.");
    showCopyToast(els, t("profile.attachment.downloaded"), attachment.name);
  } catch (err) {
    copyToastError(els, err?.message || "Download failed.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  }
}

async function handleAttachmentUpload(els, attachment, btn) {
  if (!els || !attachment) return;
  const originalLabel = btn ? btn.innerHTML : null;
  const setBusy = (text) => {
    if (!btn) return;
    btn.disabled = true;
    btn.replaceChildren();
    btn.appendChild(makeIconSpan(SECTION_ICONS.copy));
    const span = document.createElement("span");
    span.textContent = text;
    btn.appendChild(span);
  };
  const restore = () => {
    if (!btn) return;
    btn.disabled = false;
    if (originalLabel) btn.innerHTML = originalLabel;
  };
  try {
    setBusy(t("profile.attachment.checking"));
    const granted = await requestBroadHostAccessForAttachment();
    if (!granted) {
      copyToastError(els, t("errors.hostDenied"));
      restore();
      return;
    }
    const tab = await getActiveTab();
    if (!tab?.id) {
      copyToastError(els, t("profile.attachment.noTab"));
      restore();
      return;
    }
    const preview = await chrome.runtime.sendMessage({
      type: "UTABLY_ATTACHMENT_PREVIEW",
      tabId: tab.id,
      attachment,
    });
    if (!preview?.ok) {
      throw new Error(preview?.error || "Preview failed.");
    }
    const targets = Array.isArray(preview.targets) ? preview.targets : [];
    const host = preview.host;

    if (!targets.length) {
      // No direct <input type=file> match. Offer place mode as a fallback.
      const proceed = await confirmAttachmentPlace(els, { attachment, host });
      if (!proceed) {
        restore();
        return;
      }
      setBusy(t("profile.attachment.placing"));
      const placeResult = await chrome.runtime.sendMessage({
        type: "UTABLY_ATTACHMENT_PLACE",
        tabId: tab.id,
        attachment,
        expectedHost: host,
      });
      if (!placeResult?.ok) {
        throw new Error(placeResult?.error || "Place failed.");
      }
      if (!placeResult.placed) {
        const reason = placeResult.reason || "";
        if (reason === "cancelled") {
          copyToastError(els, t("profile.attachment.cancelled"));
        } else if (reason === "timeout") {
          copyToastError(els, t("profile.attachment.timeout"));
        } else if (reason === "no_targets") {
          copyToastError(els, t("profile.attachment.noDropzone"));
        } else {
          copyToastError(els, t("profile.attachment.noMatch"));
        }
      } else {
        showCopyToast(els, t("profile.attachment.uploaded"), `${attachment.name} → ${host}`);
      }
      restore();
      return;
    }

    const confirmed = await confirmAttachmentUpload(els, { attachment, host, targets });
    if (!confirmed) {
      restore();
      return;
    }
    setBusy(t("profile.attachment.uploading"));
    const result = await chrome.runtime.sendMessage({
      type: "UTABLY_ATTACHMENT_UPLOAD",
      tabId: tab.id,
      attachment,
      expectedHost: host,
    });
    if (!result?.ok) {
      throw new Error(result?.error || "Upload failed.");
    }
    if (!result.uploaded) {
      copyToastError(els, t("profile.attachment.noMatch"));
    } else {
      showCopyToast(els, t("profile.attachment.uploaded"), `${attachment.name} → ${host}`);
    }
  } catch (err) {
    copyToastError(els, err?.message || "Upload failed.");
  } finally {
    restore();
  }
}

function confirmAttachmentPlace(els, { attachment, host }) {
  // Lighter-weight consent than the upload flow: the file STILL doesn't
  // leave the user's machine until they click a target on the page, but we
  // still ask once before entering the highlighted-targets mode.
  if (!els.fillConfirmModal) return Promise.resolve(false);
  const fauxHosts = [{
    host,
    isTopFrame: true,
    adapter: "place",
    fields: [
      `${t("profile.attachment.fileLabel")}: ${attachment.name}`,
      t("profile.attachment.placeHint"),
    ],
  }];
  return showFillConfirm(els, {
    hosts: fauxHosts,
    consentRemembered: false,
    changedRetry: false,
  }).then((res) => Boolean(res));
}

function requestBroadHostAccessForAttachment() {
  if (!chrome?.permissions?.request) return Promise.resolve(false);
  try {
    return chrome.permissions
      .request({ origins: ["*://*/*"] })
      .then((granted) => Boolean(granted))
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

function copyToastError(els, message) {
  if (!els?.copyToast) return;
  const toast = els.copyToast;
  toast.replaceChildren();
  const lbl = document.createElement("span");
  lbl.className = "toast-label";
  lbl.style.color = "#FFB1A8";
  lbl.textContent = `⚠ ${message}`;
  toast.appendChild(lbl);
  toast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function confirmAttachmentUpload(els, { attachment, host, targets }) {
  // Reuse the existing fill-confirm modal for visual consistency. The
  // "hosts" panel here lists where the FILE will land.
  if (!els.fillConfirmModal) return Promise.resolve(false);
  const fauxHosts = [{
    host,
    isTopFrame: targets[0]?.isTopFrame ?? true,
    adapter: "attachment",
    fields: targets.map((target, i) => `${t("profile.attachment.fileLabel")}: ${attachment.name} → ${target.inputDescription || `input #${i + 1}`}`),
  }];
  return showFillConfirm(els, {
    hosts: fauxHosts,
    consentRemembered: false,
    changedRetry: false,
  }).then((res) => Boolean(res));
}

// Surface only the kinds that make sense for application autofill:
// CVs (the "favourite document" from /user-data/profile) and certificates.
// Profile pictures and bulk exports are hidden from the side panel — they
// don't drop into application forms cleanly.
const ATTACHMENT_VISIBLE_KINDS = new Set(["cv", "certificate"]);

function renderAttachmentsSection(els, attachments) {
  if (!els.profileSections) return;
  const existing = els.profileSections.querySelector('[data-section="attachments"]');
  if (existing) existing.remove();
  const visible = (Array.isArray(attachments) ? attachments : [])
    .filter((a) => ATTACHMENT_VISIBLE_KINDS.has(a.kind));
  if (visible.length === 0) return;

  const { section, body } = buildSection({
    id: "attachments",
    label: t("profile.attachments"),
    iconKey: "award",
    tone: "orange",
    count: visible.length,
    defaultOpen: false,
  });

  const list = document.createElement("div");
  list.className = "attachment-list";
  for (const att of visible) {
    list.appendChild(buildAttachmentCard(els, att));
  }
  body.appendChild(list);

  // Always append last — Attachments is supporting context, not the headline.
  els.profileSections.appendChild(section);
}

async function loadAttachments(els) {
  try {
    const response = await chrome.runtime.sendMessage({ type: "UTABLY_LIST_ATTACHMENTS" });
    if (!response?.ok) return;
    renderAttachmentsSection(els, response.attachments || []);
  } catch (err) {
    console.warn("[Utably] attachments load failed", err);
  }
}

function renderProfileCard(els, profile) {
  if (!els.profileCard || !els.profileSections) return;
  const c = profile?.contact || {};

  // Identity strip
  const fullName = [c.academicTitle, c.firstName, c.middleName, c.lastName].filter(Boolean).join(" ");
  if (els.identityName) els.identityName.textContent = fullName || t("profile.empty");
  if (els.identityMeta) {
    const headline = [
      profile?.experience?.[0]?.title || profile?.experience?.[0]?.position,
      formatLocation(profile),
    ].filter(Boolean).join(" · ");
    els.identityMeta.textContent = headline;
  }
  if (els.identityAvatar) {
    els.identityAvatar.replaceChildren();
    const initials = [c.firstName, c.lastName].filter(Boolean).map((s) => s[0]).join("").toUpperCase().slice(0, 2);
    if (c.photoUrl) {
      const img = document.createElement("img");
      img.src = c.photoUrl;
      img.alt = fullName || "Profile photo";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        // Presigned URL expired or fetch failed — fall back to initials.
        els.identityAvatar.replaceChildren();
        els.identityAvatar.textContent = initials || "·";
      });
      els.identityAvatar.appendChild(img);
    } else {
      els.identityAvatar.textContent = initials || "·";
    }
  }

  // Rebuild sections
  const sectionsRoot = els.profileSections;
  sectionsRoot.replaceChildren();

  // ---- Contact section ----
  const contactItems = [
    { id: "email", label: t("fillField.email"), value: c.email, href: c.email ? `mailto:${c.email}` : null },
    { id: "phone", label: t("fillField.phone"), value: c.phone, href: c.phone ? `tel:${c.phone.replace(/\s+/g, "")}` : null },
    { id: "city", label: t("fillField.city"), value: c.city || profile?.address?.city },
    {
      id: "address",
      label: t("profile.address"),
      value: [
        [profile?.address?.street, profile?.address?.houseNumber].filter(Boolean).join(" "),
        [profile?.address?.zip, profile?.address?.city].filter(Boolean).join(" "),
        profile?.address?.country,
      ].filter(Boolean).join(", "),
    },
    { id: "nationality", label: t("profile.nationality"), value: c.nationality },
  ].filter((entry) => Boolean(entry.value));
  if (contactItems.length > 0) {
    const { section, body } = buildSection({
      id: "contact",
      label: t("profile.contact"),
      iconKey: "user",
      tone: "mint",
      count: contactItems.length,
    });
    for (const entry of contactItems) body.appendChild(buildEntry(els, entry));
    sectionsRoot.appendChild(section);
  }

  // ---- Links section ----
  const links = profile?.links || {};
  const linkEntries = [
    ["LinkedIn", links.linkedin],
    ["GitHub", links.github],
    ["Website", links.website],
  ].filter(([, url]) => Boolean(url));
  if (linkEntries.length > 0) {
    const { section, body } = buildSection({
      id: "links",
      label: t("profile.links"),
      iconKey: "link",
      tone: "cream",
      count: linkEntries.length,
    });
    for (const [label, url] of linkEntries) {
      body.appendChild(buildEntry(els, { id: `link-${label}`, label, value: url, href: url, copyValue: url }));
    }
    sectionsRoot.appendChild(section);
  }

  // ---- Experience section ----
  const experiences = Array.isArray(profile?.experience) ? profile.experience.slice(0, MAX_EXPERIENCES) : [];
  if (experiences.length > 0) {
    const { section, body } = buildSection({
      id: "experience",
      label: t("profile.experience"),
      iconKey: "briefcase",
      tone: "ink",
      count: experiences.length,
    });
    for (const exp of experiences) body.appendChild(buildRoleCard(els, exp));
    sectionsRoot.appendChild(section);
  }

  // ---- Education section ----
  const education = Array.isArray(profile?.education) ? profile.education.slice(0, MAX_EDUCATION) : [];
  if (education.length > 0) {
    const { section, body } = buildSection({
      id: "education",
      label: t("profile.education"),
      iconKey: "graduation",
      tone: "cream",
      count: education.length,
      defaultOpen: false,
    });
    for (const edu of education) body.appendChild(buildEducationCard(els, edu));
    sectionsRoot.appendChild(section);
  }

  // ---- Skills section (grouped) ----
  const hardSkills = (profile?.skills?.hard || []).slice(0, MAX_SKILLS);
  const softSkills = (profile?.skills?.soft || []).slice(0, MAX_SKILLS);
  const otherSkills = (profile?.skills?.other || []).slice(0, MAX_SKILLS);
  const totalSkills = hardSkills.length + softSkills.length + otherSkills.length;
  if (totalSkills > 0) {
    const { section, body } = buildSection({
      id: "skills",
      label: t("profile.skills"),
      iconKey: "sparkle",
      tone: "mint",
      count: totalSkills,
    });
    const renderGroup = (groupLabel, list, tone) => {
      if (!list.length) return;
      const headRow = document.createElement("div");
      headRow.className = "chip-group-head";
      const groupSpan = document.createElement("span");
      groupSpan.textContent = groupLabel;
      headRow.appendChild(groupSpan);
      const copyAllBtn = document.createElement("button");
      copyAllBtn.type = "button";
      copyAllBtn.className = "mini-btn";
      copyAllBtn.appendChild(makeIconSpan(SECTION_ICONS.copy));
      const txt = document.createElement("span");
      txt.textContent = t("profile.copyAll");
      copyAllBtn.appendChild(txt);
      copyAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyAction(els, list.join(", "), groupLabel, copyAllBtn);
        flashCopied(copyAllBtn);
      });
      headRow.appendChild(copyAllBtn);
      body.appendChild(headRow);

      const grid = document.createElement("div");
      grid.className = "chip-grid";
      for (const skill of list) grid.appendChild(buildChip(els, skill, { tone, copyLabel: t("profile.skill") }));
      body.appendChild(grid);
    };
    renderGroup(t("profile.skillHard"), hardSkills, undefined);
    renderGroup(t("profile.skillSoft"), softSkills, "cream");
    renderGroup(t("profile.skillOther"), otherSkills, "cream");
    sectionsRoot.appendChild(section);
  }

  // ---- Languages section ----
  const languages = (profile?.skills?.languages || []).slice(0, MAX_LANGUAGES);
  if (languages.length > 0) {
    const { section, body } = buildSection({
      id: "languages",
      label: t("profile.languages"),
      iconKey: "languages",
      tone: "mint",
      count: languages.length,
      defaultOpen: false,
    });
    const grid = document.createElement("div");
    grid.className = "chip-grid";
    for (const lang of languages) grid.appendChild(buildChip(els, lang, { copyLabel: t("profile.language") }));
    body.appendChild(grid);
    sectionsRoot.appendChild(section);
  }

  // ---- Certifications + licenses section ----
  const licenses = (profile?.certifications?.licenses) || [];
  const certificates = (profile?.certifications?.certificates) || [];
  const totalCerts = licenses.length + certificates.length;
  if (totalCerts > 0) {
    const { section, body } = buildSection({
      id: "certifications",
      label: t("profile.certifications"),
      iconKey: "award",
      tone: "cream",
      count: totalCerts,
      defaultOpen: false,
    });
    if (certificates.length > 0) {
      const headRow = document.createElement("div");
      headRow.className = "chip-group-head";
      const span = document.createElement("span");
      span.textContent = t("profile.certificates");
      headRow.appendChild(span);
      body.appendChild(headRow);
      const grid = document.createElement("div");
      grid.className = "chip-grid";
      for (const cert of certificates.slice(0, MAX_CERTS)) {
        grid.appendChild(buildChip(els, cert, { tone: "cream", copyLabel: t("profile.certificate") }));
      }
      body.appendChild(grid);
    }
    if (licenses.length > 0) {
      const headRow = document.createElement("div");
      headRow.className = "chip-group-head";
      const span = document.createElement("span");
      span.textContent = t("profile.licenses");
      headRow.appendChild(span);
      body.appendChild(headRow);
      const grid = document.createElement("div");
      grid.className = "chip-grid";
      for (const lic of licenses.slice(0, MAX_CERTS)) {
        grid.appendChild(buildChip(els, lic, { tone: "cream", copyLabel: t("profile.license") }));
      }
      body.appendChild(grid);
    }
    sectionsRoot.appendChild(section);
  }

  els.profileCard.classList.remove("hidden");
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
    // Attachments load in parallel — failure here doesn't block the profile.
    loadAttachments(els).catch(() => {});
    return profile;
  } catch (err) {
    showProfileError(els, err?.message || t("profile.loadFailed"));
    return null;
  } finally {
    els.profileLoading.classList.add("hidden");
  }
}

export function setActiveView(els, view) {
  const isImport = view === "import";
  const isProfile = view === "profile";
  const isSaved = view === "saved";
  els.importView?.classList.toggle("hidden", !isImport);
  els.profileView?.classList.toggle("hidden", !isProfile);
  els.savedView?.classList.toggle("hidden", !isSaved);
  if (els.viewTabImport) {
    els.viewTabImport.classList.toggle("is-active", isImport);
    els.viewTabImport.setAttribute("aria-selected", String(isImport));
  }
  if (els.viewTabProfile) {
    els.viewTabProfile.classList.toggle("is-active", isProfile);
    els.viewTabProfile.setAttribute("aria-selected", String(isProfile));
  }
  if (els.viewTabSaved) {
    els.viewTabSaved.classList.toggle("is-active", isSaved);
    els.viewTabSaved.setAttribute("aria-selected", String(isSaved));
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
