(() => {
  function hostMatches(host, patterns) {
    return patterns.some((p) => host === p || host.endsWith(`.${p}`) || host.includes(p));
  }

  function canHandle() {
    const host = location.hostname.toLowerCase();
    return hostMatches(host, [
      "myworkdayjobs.com",
      "greenhouse.io",
      "boards.greenhouse.io",
      "lever.co",
      "jobs.lever.co",
      "smartrecruiters.com",
      "careers.smartrecruiters.com",
      "icims.com",
      "icims",
      "taleo.net",
      "oraclecloud.com",
      "successfactors.com",
    ]);
  }

  async function extract(ctx) {
    const { queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const host = location.hostname.toLowerCase();

    const title =
      queryFirstText([
        "h1[data-ui='job-title']",
        "h1.posting-headline",
        "h1.posting-title",
        "h1.job-title",
        "h1",
      ]) ||
      metaValue("og:title", "property") ||
      document.title;

    const company =
      queryFirstText([
        "[data-ui='job-company']",
        ".posting-headline .company-name",
        ".company-name",
        ".posting-categories .department",
      ]) ||
      (host.includes("myworkdayjobs.com") ? host.split(".")[0] : "");

    const location = queryFirstText([
      "[data-ui='job-location']",
      ".posting-categories .location",
      ".job-location",
      "[class*='location']",
    ]);

    const description = sanitizeText(
      queryFirstText([
        "[data-ui='job-description']",
        "#job-description",
        ".posting-description",
        ".content-intro",
        "article",
        "main",
      ])
    );

    return {
      title: cleanTitle(title, company),
      company,
      location,
      recruiterName: "",
      description,
    };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "atsHosted",
    priority: 76,
    canHandle,
    extract,
  });
})();

