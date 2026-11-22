/**
 * Boards whose terms do not allow the extension to read the page/DOM.
 * On these hosts we never inject extractors; the user pastes the posting.
 */
export function isPasteOnlyHost(hostname) {
  if (!hostname || typeof hostname !== "string") return false;
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    /(^|\.)(linkedin\.com|xing\.com)$/.test(host) ||
    /(^|\.)(indeed|glassdoor|stepstone)\./.test(host)
  );
}
