(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("indeed.");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const company = queryFirstText(["[data-testid='inlineHeader-companyName']", ".jobsearch-InlineCompanyRating div"]);
    const rawTitle =
      queryFirstText(["h1[data-testid='jobsearch-JobInfoHeader-title']", ".jobsearch-JobInfoHeader-title"]) ||
      metaValue("og:title", "property") ||
      document.title;
    const location = queryFirstText(["[data-testid='job-location']", ".jobsearch-JobInfoHeader-subtitle div"]);
    const description = sanitizeText(
      queryFirstText(["#jobDescriptionText", "[data-testid='jobsearch-jobDescriptionText']"])
    );

    return {
      title: cleanTitle(rawTitle, company),
      company,
      location,
      recruiterName: "",
      description,
    };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "indeed",
    priority: 80,
    canHandle,
    extract,
  });
})();
