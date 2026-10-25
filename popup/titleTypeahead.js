import { TITLE_QUERY_MIN_CHARS, rankJobTitles } from "./jobTitle.js";
import { wireTypeahead } from "./typeahead.js";

// Job title suggestions on the capture form, from our occupation list via
// the server (background.js). Picking one just fills the title.

export function wireTitleTypeahead(els) {
  wireTypeahead({
    input: els.jobTitle,
    list: els.jobTitleSuggestions,
    idPrefix: "titleSuggestion-",
    minChars: TITLE_QUERY_MIN_CHARS,
    debounceMs: 250,
    lookup: async (query) => {
      const response = await chrome.runtime
        .sendMessage({ type: "UTABLY_TITLE_SUGGEST", query })
        .catch(() => null);
      return rankJobTitles(response?.titles, query, 6).map((title) => ({ primary: title, value: title }));
    },
    onChoose: (title) => {
      els.jobTitle.value = title;
      els.jobTitle.dispatchEvent(new Event("input", { bubbles: true }));
    },
  });
}
