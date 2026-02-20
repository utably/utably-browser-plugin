(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("dice.");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText(["[data-cy='company-name']", "[class*='company']", "[class*='employer']"]);
    const rawTitle = queryFirstText(["h1[data-cy='job-title']", "h1[class*='job-title']", "h1"]) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(["[data-cy='job-location']", "[class*='job-location']", "[class*='location']"]);
    const description = sanitizeText(queryFirstText(["[data-cy='job-description']", "#jobDescription", "[class*='job-description']"]));
    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "dice",
    priority: 78,
    canHandle,
    extract,
  });
})();

