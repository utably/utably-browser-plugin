(() => {
  function hostMatches(host, patterns) {
    return patterns.some((pattern) => host === pattern || host.endsWith(`.${pattern}`) || host.includes(pattern));
  }

  function detectPortal(host) {
    if (hostMatches(host, ["reed.co.uk"])) return "reed";
    if (hostMatches(host, ["totaljobs.com"])) return "totaljobs";
    if (hostMatches(host, ["cv-library.co.uk"])) return "cvlibrary";
    if (hostMatches(host, ["jobsite.co.uk"])) return "jobsite";
    if (hostMatches(host, ["adzuna.co.uk"])) return "adzuna";
    if (hostMatches(host, ["fish4.co.uk", "fish4jobs"])) return "fish4jobs";
    if (hostMatches(host, ["jobs.theguardian.com", "theguardian.com"])) return "guardianjobs";
    if (hostMatches(host, ["jobs.nhs.uk"])) return "nhsjobs";
    if (hostMatches(host, ["civilservicejobs.service.gov.uk"])) return "civilservicejobs";
    if (hostMatches(host, ["findajob.dwp.gov.uk"])) return "findajob";
    return "";
  }

  function canHandle() {
    const host = location.hostname.toLowerCase();
    return Boolean(detectPortal(host));
  }

  function selectorsForPortal(portal) {
    switch (portal) {
      case "reed":
        return {
          company: [
            "[data-qa='company-name']",
            "[data-testid='company-name']",
            "[data-qa='job-company']",
            ".companyName",
            "[class*='company-name']",
            "[class*='company']",
          ],
          title: ["h1[data-qa='job-title']", ".job-header h1", "h1"],
          location: ["[data-qa='job-location']", ".location", "[class*='location']"],
          description: ["#jobDescription", "[data-qa='job-description']", ".description"],
        };
      case "totaljobs":
      case "jobsite":
        return {
          company: ["[data-testid='company-name']", ".job-header__company", "[class*='company']"],
          title: ["h1[data-testid='job-title']", ".job-header h1", "h1"],
          location: ["[data-testid='job-location']", ".job-header__location", "[class*='location']"],
          description: ["[data-testid='job-description']", "#job-description", "article"],
        };
      case "cvlibrary":
        return {
          company: [".job__header-company", "[data-id='companyName']", "[class*='company']"],
          title: ["h1.job__title", "h1[data-id='jobTitle']", "h1"],
          location: [".job__header-location", "[data-id='location']", "[class*='location']"],
          description: [".job__description", "#job-description", "article"],
        };
      case "adzuna":
        return {
          company: [".company", "[data-testid='company']", "[class*='company']"],
          title: ["h1[data-testid='job-title']", ".job-title", "h1"],
          location: [".location", "[data-testid='job-location']", "[class*='location']"],
          description: [".description", "#job-description", "article"],
        };
      case "fish4jobs":
        return {
          company: [".job-detail__company", "[data-testid='company']", "[class*='company']"],
          title: [".job-detail__title", "h1[data-testid='job-title']", "h1"],
          location: [".job-detail__location", "[data-testid='job-location']", "[class*='location']"],
          description: [".job-detail__description", "[data-testid='job-description']", "article"],
        };
      case "guardianjobs":
        return {
          company: [".listing__meta .recruiter", ".recruiter", "[class*='recruiter']"],
          title: ["h1.content__headline", "h1[data-testid='job-title']", "h1"],
          location: [".listing__meta .location", ".location", "[class*='location']"],
          description: [".listing__content", ".job-description", "article"],
        };
      case "nhsjobs":
        return {
          company: ["[data-test='organisation-name']", ".nhsuk-u-margin-top-0", "[class*='organisation']"],
          title: ["h1[data-test='job-title']", "h1.nhsuk-heading-l", "h1"],
          location: ["[data-test='location']", "[class*='location']", ".nhsuk-u-margin-top-2"],
          description: ["[data-test='job-description']", ".vacancy-description", "main"],
        };
      case "civilservicejobs":
      case "findajob":
        return {
          company: [".vacancy-summary__value", "[data-testid='company']", "[class*='employer']"],
          title: ["h1.govuk-heading-l", "h1[data-testid='job-title']", "h1"],
          location: [".govuk-summary-list__value", "[data-testid='job-location']", "[class*='location']"],
          description: [".govuk-grid-column-two-thirds", "main", "article"],
        };
      default:
        return {
          company: ["[class*='company']", "[data-testid='company']"],
          title: ["h1[data-testid='job-title']", "h1"],
          location: ["[class*='location']", "[data-testid='job-location']"],
          description: ["[class*='job-description']", "article", "main"],
        };
      }
  }

  function cleanReedCompany(rawCompany, normalize) {
    const text = normalize(rawCompany);
    if (!text) return "";
    return normalize(text.replace(/^company\s*/i, "").replace(/^posted by\s*/i, ""));
  }

  function inferReedCompanyFromTitle(rawTitle, normalize) {
    const text = normalize(rawTitle);
    if (!text) return "";
    const match = text.match(/\bby\s+(.+)$/i);
    return normalize(match?.[1] || "");
  }

  function cleanReedTitle(rawTitle, company, normalize) {
    let title = normalize(rawTitle);
    if (!title) return "";
    title = normalize(title.replace(/^job title\s*/i, ""));
    title = normalize(title.replace(/\bposted by\b.*$/i, ""));
    title = normalize(title.replace(/\s*\d{1,2}\s+[A-Za-z]+\s*(?:\d{4})?\s*(?:by\s+.*)?$/i, ""));
    if (company) {
      const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      title = normalize(title.replace(new RegExp(`\\bby\\s+${escaped}$`, "i"), ""));
    } else {
      title = normalize(title.replace(/\bby\s+.*$/i, ""));
    }
    return title;
  }

  async function extract(ctx) {
    const { normalize, queryFirstText, sanitizeText, cleanTitle, metaValue } = ctx;
    const host = location.hostname.toLowerCase();
    const portal = detectPortal(host);
    const selectors = selectorsForPortal(portal);

    const rawCompany = queryFirstText(selectors.company);
    const rawTitle = queryFirstText(selectors.title) || metaValue("og:title", "property") || document.title;
    const location = queryFirstText(selectors.location);
    const description = sanitizeText(queryFirstText(selectors.description));
    const companyFromTitle = portal === "reed" ? inferReedCompanyFromTitle(rawTitle, normalize) : "";
    const company =
      portal === "reed" ? cleanReedCompany(rawCompany, normalize) || companyFromTitle : rawCompany;
    const cleanRawTitle = portal === "reed" ? cleanReedTitle(rawTitle, company, normalize) : rawTitle;

    return {
      title: cleanTitle(cleanRawTitle, company),
      company,
      location,
      recruiterName: "",
      description,
    };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "ukPortals",
    priority: 75,
    canHandle,
    extract,
  });
})();
