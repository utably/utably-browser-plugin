(() => {
  function canHandle() {
    return true;
  }

  function parseJsonLdJobPosting(normalize) {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      const raw = script.textContent || "";
      if (!raw.trim()) continue;
      try {
        const json = JSON.parse(raw);
        const queue = Array.isArray(json) ? [...json] : [json];
        while (queue.length) {
          const item = queue.shift();
          if (!item || typeof item !== "object") continue;
          if (Array.isArray(item)) {
            queue.push(...item);
            continue;
          }
          if (Array.isArray(item["@graph"])) queue.push(...item["@graph"]);
          const type = item["@type"];
          const isJobPosting = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
          if (isJobPosting) return item;
        }
      } catch {}
    }
    return null;
  }

  function flattenJobLocation(jobLocation, normalize) {
    if (!jobLocation) return "";
    const locations = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
    const first = locations[0];
    const address = first?.address || first;
    return [
      address?.streetAddress,
      address?.addressLocality,
      address?.addressRegion,
      address?.postalCode,
      address?.addressCountry,
    ]
      .map((part) => normalize(part))
      .filter(Boolean)
      .join(", ");
  }

  function scoreDescriptionNode(node, normalize) {
    const text = normalize(node?.innerText || "");
    const len = text.length;
    if (len < 300 || len > 30000) return -1;
    let score = len / 90;
    const keywords = [
      "responsibilities",
      "requirements",
      "qualifications",
      "experience",
      "about the role",
      "what you'll do",
      "you will",
      "benefits",
    ];
    for (const k of keywords) {
      if (text.toLowerCase().includes(k)) score += 18;
    }
    if (/cookie|privacy|terms|subscribe|sign in/i.test(text)) score -= 120;
    return score;
  }

  async function extract(ctx) {
    const { normalize, sanitizeText, queryFirstText, metaValue, cleanTitle } = ctx;
    const jobPosting = parseJsonLdJobPosting(normalize);

    const company =
      normalize(jobPosting?.hiringOrganization?.name || jobPosting?.hiringOrganization || "") ||
      queryFirstText(["[data-testid*='company']", "[class*='company']", "[data-test*='company']", "a[href*='/company/']"]) ||
      metaValue("og:site_name", "property");

    const rawTitle =
      normalize(jobPosting?.title || "") ||
      queryFirstText(["h1[data-test*='job']", "[data-testid*='job-title']", "[class*='job-title']", "main h1", "h1"]) ||
      metaValue("og:title", "property") ||
      document.title ||
      "";

    const location =
      flattenJobLocation(jobPosting?.jobLocation, normalize) ||
      queryFirstText([
        "[data-testid*='location']",
        "[class*='location']",
        "[data-test*='location']",
        "li[class*='location']",
      ]);

    const recruiterName = queryFirstText([
      "[data-testid*='recruiter']",
      "[class*='recruiter']",
      "[class*='hiring-manager']",
      "a[href*='linkedin.com/in/']",
    ]);

    const descSelectors = [
      "[data-testid*='job-description']",
      "[class*='job-description']",
      "[data-test*='job-description']",
      "article",
      "main",
      "[role='main']",
    ];
    let bestDescription = normalize(String(jobPosting?.description || "").replace(/<[^>]+>/g, " "));
    if (!bestDescription) {
      let bestScore = -1;
      for (const selector of descSelectors) {
        const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 10);
        for (const node of nodes) {
          const score = scoreDescriptionNode(node, normalize);
          if (score > bestScore) {
            bestScore = score;
            bestDescription = normalize(node.innerText || "");
          }
        }
      }
    }

    return {
      title: cleanTitle(rawTitle, company),
      company,
      location,
      recruiterName,
      description: sanitizeText(bestDescription),
    };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "generic",
    priority: 10,
    canHandle,
    extract,
  });
})();
