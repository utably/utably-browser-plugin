import {
  cleanCompanyDomain,
  domainForCompanyValue,
  normalizeCompanyQuery,
  normalizeCompanySuggestions,
} from "./company.js";
import { loadCachedCompanyLogo } from "./companyLogo.js";

// Company typeahead on the capture form's company field.
//
// Suggestions come from the server (via background.js) and show name +
// domain only — no logos per keystroke. Picking one remembers its domain;
// the domain only holds while the field text still equals the picked name,
// so free text is always allowed and never carries a stale domain.
//
// State is module-level (one form per popup) so the form's reset/restore
// paths can use it before the listeners are wired.

const SEARCH_DEBOUNCE_MS = 300;
const SUGGESTION_LIMIT = 6;
const OPTION_ID_PREFIX = "companySuggestion-";

let pick = null; // { name, domain } | null
let suggestions = [];
let activeIndex = -1;
let searchSeq = 0;
let searchTimer = null;
let logoSeq = 0;
let suppressNextSearch = false;

export function getCompanyPick() {
  return pick;
}

/** Domain to store for the field's current text ("" for free text). */
export function currentCompanyDomain(els) {
  return domainForCompanyValue(els.companyName?.value, pick);
}

function renderLogo(els, domain) {
  const slot = els.companyLogo;
  if (!slot) return;
  const seq = ++logoSeq;
  const hide = () => {
    slot.replaceChildren();
    slot.classList.add("hidden");
    els.companyField?.classList.remove("has-logo");
  };
  if (!domain) {
    hide();
    return;
  }
  loadCachedCompanyLogo(domain).then((img) => {
    if (seq !== logoSeq) return;
    if (!img) {
      hide();
      return;
    }
    slot.replaceChildren(img);
    slot.classList.remove("hidden");
    els.companyField?.classList.add("has-logo");
  });
}

function setPick(els, next) {
  const name = String(next?.name ?? "").trim();
  const domain = cleanCompanyDomain(next?.domain);
  pick = name && domain ? { name, domain } : null;
  renderLogo(els, pick?.domain || "");
}

/** Forget the picked company (form cleared or reset). */
export function clearCompanyPick(els) {
  closeSuggestions(els);
  setPick(els, null);
}

/** Restore a pick from a saved draft; an empty domain clears it. */
export function restoreCompanyPick(els, name, domain) {
  setPick(els, { name, domain });
  reconcileCompanyPick(els);
}

/**
 * Drop the pick when the field text no longer matches it — covers every
 * path that writes the value without an input event (extraction, drafts).
 */
export function reconcileCompanyPick(els) {
  if (pick && !domainForCompanyValue(els.companyName?.value, pick)) {
    setPick(els, null);
  }
}

function isOpen(els) {
  return els.companySuggestions && !els.companySuggestions.classList.contains("hidden");
}

function closeSuggestions(els) {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  searchSeq += 1; // any response still in flight is now stale
  suggestions = [];
  activeIndex = -1;
  if (els.companySuggestions) {
    els.companySuggestions.replaceChildren();
    els.companySuggestions.classList.add("hidden");
  }
  els.companyName?.setAttribute("aria-expanded", "false");
  els.companyName?.removeAttribute("aria-activedescendant");
}

function setActive(els, index) {
  activeIndex = index;
  const options = els.companySuggestions?.querySelectorAll('[role="option"]') || [];
  options.forEach((option, i) => {
    const selected = i === index;
    option.setAttribute("aria-selected", selected ? "true" : "false");
    option.classList.toggle("is-active", selected);
    if (selected) option.scrollIntoView({ block: "nearest" });
  });
  if (index >= 0) {
    els.companyName.setAttribute("aria-activedescendant", `${OPTION_ID_PREFIX}${index}`);
  } else {
    els.companyName.removeAttribute("aria-activedescendant");
  }
}

function choose(els, index) {
  const chosen = suggestions[index];
  if (!chosen) return;
  closeSuggestions(els);
  setPick(els, chosen);
  els.companyName.value = chosen.name;
  // Let the form's own listeners (draft, duplicate check, validation) see
  // the pick, without reopening the list for it.
  suppressNextSearch = true;
  els.companyName.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderSuggestions(els, rows) {
  const list = els.companySuggestions;
  if (!list) return;
  suggestions = rows;
  activeIndex = -1;
  list.replaceChildren();
  if (!rows.length) {
    closeSuggestions(els);
    return;
  }
  rows.forEach((row, index) => {
    const option = document.createElement("li");
    option.id = `${OPTION_ID_PREFIX}${index}`;
    option.className = "company-suggest-option";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    const name = document.createElement("span");
    name.className = "company-suggest-name";
    name.textContent = row.name;
    option.appendChild(name);
    if (row.domain) {
      const domain = document.createElement("span");
      domain.className = "company-suggest-domain";
      domain.textContent = row.domain;
      option.appendChild(domain);
    }
    // Keep focus in the input so blur does not close the list mid-click.
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => choose(els, index));
    list.appendChild(option);
  });
  list.classList.remove("hidden");
  els.companyName.setAttribute("aria-expanded", "true");
  els.companyName.removeAttribute("aria-activedescendant");
}

async function runSearch(els, query) {
  const seq = ++searchSeq;
  let response = null;
  try {
    response = await chrome.runtime.sendMessage({
      type: "UTABLY_COMPANY_SEARCH",
      query,
      limit: SUGGESTION_LIMIT,
    });
  } catch {
    response = null;
  }
  if (seq !== searchSeq || document.activeElement !== els.companyName) return;
  // Empty or failed lookups are the normal "nothing to suggest" case.
  renderSuggestions(els, normalizeCompanySuggestions(response?.suggestions, SUGGESTION_LIMIT));
}

function scheduleSearch(els) {
  if (searchTimer) clearTimeout(searchTimer);
  const query = normalizeCompanyQuery(els.companyName.value);
  if (!query) {
    closeSuggestions(els);
    return;
  }
  searchTimer = setTimeout(() => {
    searchTimer = null;
    runSearch(els, query);
  }, SEARCH_DEBOUNCE_MS);
}

function onKeyDown(els, event) {
  const open = isOpen(els);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (!open || !suggestions.length) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const count = suggestions.length;
    const next = activeIndex < 0
      ? (step > 0 ? 0 : count - 1)
      : (activeIndex + step + count) % count;
    setActive(els, next);
    return;
  }
  if (event.key === "Enter" && open && activeIndex >= 0) {
    event.preventDefault();
    choose(els, activeIndex);
    return;
  }
  if (event.key === "Escape" && open) {
    event.preventDefault();
    event.stopPropagation();
    closeSuggestions(els);
  }
}

export function wireCompanyTypeahead(els) {
  const input = els.companyName;
  if (!input || !els.companySuggestions) return;

  input.addEventListener("input", () => {
    reconcileCompanyPick(els);
    if (suppressNextSearch) {
      suppressNextSearch = false;
      return;
    }
    scheduleSearch(els);
  });
  input.addEventListener("keydown", (event) => onKeyDown(els, event));
  input.addEventListener("blur", () => closeSuggestions(els));
}
