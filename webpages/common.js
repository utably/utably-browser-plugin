(() => {
  function normalize(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function sanitizeText(text, maxLen = 20000) {
    if (!text) return "";
    const lines = String(text)
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => normalize(line))
      .filter(Boolean);

    const boilerplate = [
      /\b(accept|reject|manage|use of)\s+cookies?\b/i,
      /\bcookie\s+(policy|settings|preferences|notice|consent)\b/i,
      /privacy policy/i,
      /terms of (use|service)/i,
      /sign in/i,
      /create account/i,
      /skip to main/i,
      /copyright/i,
      /all rights reserved/i,
    ];
    return lines
      .filter((line) => !boilerplate.some((rx) => rx.test(line)))
      .join("\n")
      .slice(0, maxLen);
  }

  function queryFirstText(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = normalize(node?.textContent || "");
      if (text) return text;
    }
    return "";
  }

  function metaValue(key, attr = "name") {
    return normalize(document.querySelector(`meta[${attr}="${key}"]`)?.content || "");
  }

  function waitForText(regex, timeout = 3500) {
    return new Promise((resolve) => {
      const hasMatch = () => regex.test(document.body?.innerText || "");
      if (hasMatch()) return resolve(true);
      const observer = new MutationObserver(() => {
        if (hasMatch()) {
          observer.disconnect();
          resolve(true);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeout);
    });
  }

  function cleanTitle(rawTitle, companyName) {
    const title = normalize(rawTitle);
    if (!title) return "";
    const separators = [" | ", " - ", " — ", " · "];
    let best = title;
    for (const sep of separators) {
      if (best.includes(sep)) {
        const first = normalize(best.split(sep)[0]);
        if (first && first.length >= 4) best = first;
      }
    }
    if (companyName) {
      const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      best = normalize(best.replace(new RegExp(`\\s+at\\s+${escaped}$`, "i"), ""));
    }
    return best;
  }

  globalThis.__utablyExtractorRegistry = [];
  globalThis.__utablyExtractCommon = {
    normalize,
    sanitizeText,
    queryFirstText,
    metaValue,
    waitForText,
    cleanTitle,
  };
})();
