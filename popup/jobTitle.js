// Job title suggestions from our occupation list (the same list the app's
// title fields use). The server filters by substring and sorts
// alphabetically, so the rows are re-ranked here exactly like the app does:
// a title starting with the text beats one that only mentions it, and a
// title match beats an alternative-label match.

export const TITLE_QUERY_MIN_CHARS = 2;

function relevance(row, query) {
  const q = query.toLowerCase();
  const title = String(row?.title ?? "").toLowerCase();
  if (title === q) return 1000;
  if (title.startsWith(q)) return 500;
  if (title.includes(` ${q}`)) return 200;
  if (title.includes(q)) return 100;
  for (const alt of Array.isArray(row?.altLabels) ? row.altLabels : []) {
    const label = String(alt ?? "").toLowerCase();
    if (label.startsWith(q)) return 50;
    if (label.includes(` ${q}`)) return 25;
    if (label.includes(q)) return 10;
  }
  return 0;
}

/** Server occupation rows → the best `limit` distinct titles. */
export function rankJobTitles(rows, query, limit = 6) {
  const q = String(query ?? "").replace(/\s+/g, " ").trim();
  if (q.length < TITLE_QUERY_MIN_CHARS || !Array.isArray(rows)) return [];
  const seen = new Set();
  return rows
    .map((row) => ({ title: String(row?.title ?? "").replace(/\s+/g, " ").trim(), score: relevance(row, q) }))
    .filter((row) => row.title && row.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .filter((row) => {
      const key = row.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((row) => row.title);
}
