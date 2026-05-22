(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("linkedin.com");
  }

  async function extract(ctx) {
    const { queryFirstText, metaValue, cleanTitle } = ctx;
    const company =
      queryFirstText([".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name"]) || "";
    const rawTitle =
      queryFirstText([".job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title"]) ||
      metaValue("og:title", "property") ||
      document.title ||
      "";
    const location =
      queryFirstText([".job-details-jobs-unified-top-card__bullet", ".jobs-unified-top-card__bullet"]) || "";

    return {
      title: cleanTitle(rawTitle, company),
      company,
      location,
      recruiterName: "",
      description: "",
      isLinkedIn: true,
    };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "linkedin",
    priority: 90,
    canHandle,
    extract,
  });
})();
