(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("ziprecruiter.");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText(["[data-testid='company-name']", "[class*='companyName']", "[class*='hiring_company']"]);
    const rawTitle = queryFirstText(["h1[data-testid='job_title']", "h1[class*='job_title']", "h1"]) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(["[data-testid='job-location']", "[class*='job_location']", "[class*='location']"]);
    const description = sanitizeText(queryFirstText(["[data-testid='job_description']", "#job_description", "[class*='job_description']"]));
    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "ziprecruiter",
    priority: 79,
    canHandle,
    extract,
  });
})();

