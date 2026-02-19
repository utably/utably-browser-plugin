(() => {
  function canHandle() {
    const host = location.hostname.toLowerCase();
    return host.includes("wellfound.") || host.includes("angel.co");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText(["[data-testid='company-name']", "[class*='companyName']", "a[href*='/company/']"]);
    const rawTitle = queryFirstText(["h1[data-testid='job-title']", "h1[class*='jobTitle']", "h1"]) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(["[data-testid='job-location']", "[class*='location']"]);
    const description = sanitizeText(queryFirstText(["[data-testid='job-description']", "[class*='jobDescription']", "article"]));
    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "wellfound",
    priority: 78,
    canHandle,
    extract,
  });
})();

