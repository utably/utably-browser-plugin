// One suggestion list under a text field: debounced lookups, stale answers
// dropped, arrow keys / Enter / Escape / mouse, ARIA combobox. The job
// title, country, city and street fields all use it; the company field has
// its own controller (logo + picked domain) in companyTypeahead.js.
//
// Rows are { primary, secondary?, value } — `value` is handed back to
// `onChoose`. Free text is always allowed; a pick only fills fields.

/**
 * @param {object} opts
 * @param {HTMLInputElement} opts.input
 * @param {HTMLElement} opts.list           the <ul role="listbox">
 * @param {string} opts.idPrefix            option id prefix (unique per field)
 * @param {(query: string) => Promise<Array>|Array} opts.lookup
 * @param {(value: any) => void} opts.onChoose
 * @param {number} [opts.minChars=2]
 * @param {number} [opts.debounceMs=300]
 * @param {boolean} [opts.openOnFocus=false] show rows for the current text on focus
 */
export function wireTypeahead({
  input,
  list,
  idPrefix,
  lookup,
  onChoose,
  minChars = 2,
  debounceMs = 300,
  openOnFocus = false,
}) {
  if (!input || !list) return { close() {}, skipNextInput() {} };

  let rows = [];
  let activeIndex = -1;
  let seq = 0;
  let timer = null;
  let skipNext = false;

  input.setAttribute("role", "combobox");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  if (list.id) input.setAttribute("aria-controls", list.id);

  const isOpen = () => !list.classList.contains("hidden");

  function close() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    seq += 1;
    rows = [];
    activeIndex = -1;
    list.replaceChildren();
    list.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function setActive(index) {
    activeIndex = index;
    list.querySelectorAll('[role="option"]').forEach((option, i) => {
      const selected = i === index;
      option.setAttribute("aria-selected", selected ? "true" : "false");
      option.classList.toggle("is-active", selected);
      if (selected) option.scrollIntoView({ block: "nearest" });
    });
    if (index >= 0) input.setAttribute("aria-activedescendant", `${idPrefix}${index}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function choose(index) {
    const row = rows[index];
    if (!row) return;
    close();
    // The field's own listeners (draft, validation) see the change; the
    // list must not reopen for it.
    skipNext = true;
    onChoose(row.value);
  }

  function render(next) {
    rows = Array.isArray(next) ? next : [];
    activeIndex = -1;
    list.replaceChildren();
    if (!rows.length) {
      close();
      return;
    }
    rows.forEach((row, index) => {
      const option = document.createElement("li");
      option.id = `${idPrefix}${index}`;
      option.className = "company-suggest-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      const primary = document.createElement("span");
      primary.className = "company-suggest-name";
      primary.textContent = row.primary;
      option.appendChild(primary);
      if (row.secondary) {
        const secondary = document.createElement("span");
        secondary.className = "company-suggest-domain";
        secondary.textContent = row.secondary;
        option.appendChild(secondary);
      }
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => choose(index));
      list.appendChild(option);
    });
    list.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }

  async function run(query) {
    const mine = ++seq;
    let next = [];
    try {
      next = await lookup(query);
    } catch {
      next = [];
    }
    if (mine !== seq || document.activeElement !== input) return;
    render(next);
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    const query = String(input.value || "").replace(/\s+/g, " ").trim();
    if (query.length < minChars) {
      close();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      run(query);
    }, debounceMs);
  }

  input.addEventListener("input", () => {
    if (skipNext) {
      skipNext = false;
      return;
    }
    schedule();
  });
  if (openOnFocus) input.addEventListener("focus", schedule);
  input.addEventListener("keydown", (event) => {
    const open = isOpen();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!open || !rows.length) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const count = rows.length;
      setActive(activeIndex < 0 ? (step > 0 ? 0 : count - 1) : (activeIndex + step + count) % count);
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      choose(activeIndex);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  input.addEventListener("blur", close);

  return {
    close,
    /** The next input event comes from code, not typing: no lookup for it. */
    skipNextInput() {
      skipNext = true;
    },
  };
}
