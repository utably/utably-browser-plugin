(() => {
  function canHandle() {
    const host = location.hostname.toLowerCase();
    return host.includes("joinhandshake.com") || host.includes("handshake.");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText(["[data-testid='company-name']", "[class*='employer']", "[class*='company']"]);
    const rawTitle = queryFirstText(["h1[data-testid='job-title']", "h1[class*='job-title']", "h1"]) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(["[data-testid='job-location']", "[class*='location']"]);
    const description = sanitizeText(queryFirstText(["[data-testid='job-description']", "[class*='job-description']", "article"]));
    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "handshake",
    priority: 77,
    canHandle,
    extract,
  });
})();

