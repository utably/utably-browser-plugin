(() => {
  function canHandle() {
    const host = location.hostname.toLowerCase();
    return host.includes("usajobs.gov");
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue, normalize } = ctx;
    const company = queryFirstText(["[data-test='Agency']", "[class*='usajobs-joa-summary__agency']", "[class*='agency']"]);
    const rawTitle = queryFirstText(["h1.usajobs-joa-header__title", "h1[data-test='JobTitle']", "h1"]) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(["[data-test='Locations']", "[class*='usajobs-joa-locations']", "[class*='location']"]);
    const description = sanitizeText(
      queryFirstText(["#duties", "#requirements", ".usajobs-joa-section", "[data-test='JobSummary']"])
    );
    return {
      title: cleanTitle(rawTitle, company),
      company: normalize(company || "U.S. Government"),
      location,
      recruiterName: "",
      description,
    };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "usajobs",
    priority: 77,
    canHandle,
    extract,
  });
})();

