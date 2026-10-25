// Applies the Theme setting before the popup paints (classic script in
// <head>, so there is no flash of the wrong theme). The choice lives in
// localStorage because chrome.storage is async; settings.js writes both.
// "system" (the default) follows the OS and keeps following it while open.
(() => {
  const KEY = "utably.theme";
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const read = () => {
    try {
      const value = localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  };
  const apply = (pref = read()) => {
    const dark = pref === "dark" || (pref === "system" && Boolean(media?.matches));
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };
  apply();
  media?.addEventListener?.("change", () => apply());
  globalThis.__utablyApplyTheme = (pref) => {
    try {
      localStorage.setItem(KEY, pref === "light" || pref === "dark" ? pref : "system");
    } catch {}
    apply();
  };
  globalThis.__utablyThemePreference = read;
})();
