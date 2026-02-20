(() => {
  function canHandle() {
    const host = location.hostname.toLowerCase();
    return host === "builtin.com" || host.endsWith(".builtin.com");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText(["[data-testid='company-name']", "[class*='company-name']", "[class*='company']"]);
    const rawTitle = queryFirstText(["h1[data-testid='job-title']", "h1[class*='job-title']", "h1"]) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(["[data-testid='job-location']", "[class*='job-location']", "[class*='location']"]);
    const description = sanitizeText(queryFirstText(["[data-testid='job-description']", "[class*='job-description']", "article"]));
    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "builtin",
    priority: 77,
    canHandle,
    extract,
  });
})();

