(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("monster.");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText(["[data-testid='company']", "[class*='company']", "[class*='Company']"]);
    const rawTitle = queryFirstText(["h1[data-testid='job-title']", "h1[class*='title']", "h1"]) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(["[data-testid='job-location']", "[class*='location']"]);
    const description = sanitizeText(queryFirstText(["[data-testid='job-description']", "#JobDescription", "[class*='job-description']"]));
    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "monster",
    priority: 78,
    canHandle,
    extract,
  });
})();

