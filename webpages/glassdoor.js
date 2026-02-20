(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("glassdoor.");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText([
      "[data-test='employer-name']",
      "[data-test='company-name']",
      "[class*='EmployerProfile_employerName']",
    ]);
    const rawTitle =
      queryFirstText(["h1[data-test='job-title']", "[class*='JobDetails_jobTitle']", "h1"]) ||
      metaValue("og:title", "property") ||
      document.title;
    const location = queryFirstText([
      "[data-test='location']",
      "[class*='JobDetails_location']",
      "[class*='location']",
    ]);
    const description = sanitizeText(
      queryFirstText(["[data-test='jobDescriptionContent']", "#JobDescriptionContainer", "[class*='jobDescriptionContent']"])
    );
    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "glassdoor",
    priority: 79,
    canHandle,
    extract,
  });
})();

