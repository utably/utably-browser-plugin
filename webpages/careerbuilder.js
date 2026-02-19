(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("careerbuilder.");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText(["[data-job-company-name]", "[class*='company-name']", "[class*='company']"]);
    const rawTitle = queryFirstText(["h1[data-job-title]", "h1[class*='job-title']", "h1"]) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(["[data-job-location]", "[class*='job-location']", "[class*='location']"]);
    const description = sanitizeText(queryFirstText(["[data-job-description]", "#job-description", "[class*='job-description']"]));
    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "careerbuilder",
    priority: 78,
    canHandle,
    extract,
  });
})();

