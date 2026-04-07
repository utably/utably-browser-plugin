(() => {
  function canHandle() {
    return location.hostname.toLowerCase().includes("monster.");
  }

  function parseJobPostingJsonLd() {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      const raw = (script.textContent || "").trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
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

  function parseNextData() {
    const node = document.querySelector("#__NEXT_DATA__");
    const raw = node?.textContent || "";
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function isSearchResultsPage(nextData) {
    const path = (location.pathname || "").toLowerCase();
    if (path.includes("/jobs/search")) return true;
    const canonical = (document.querySelector("link[rel='canonical']")?.getAttribute("href") || "").toLowerCase();
    if (canonical.includes("/jobs/search")) return true;
    const dist = nextData?.query?.distributor;
    if (Array.isArray(dist) && dist.join("/").toLowerCase().includes("jobs/search")) return true;
    return false;
  }

  function htmlToText(value) {
    if (!value) return "";
    const node = document.createElement("div");
    node.innerHTML = String(value);
    return node.textContent || node.innerText || "";
  }

  function scoreDescriptionText(text) {
    const normalized = (text || "").toLowerCase();
    const len = normalized.length;
    if (len < 260 || len > 32000) return -1;
    let score = len / 90;
    const positives = [
      "description",
      "key responsibilities",
      "requirements",
      "qualifications",
      "benefits",
      "about company",
      "numbers & facts",
    ];
    for (const word of positives) {
      if (normalized.includes(word)) score += 16;
    }
    const quickApplyCount = (normalized.match(/quick apply/g) || []).length;
    score -= quickApplyCount * 25;
    if (normalized.includes("search results for")) score -= 120;
    if (normalized.includes("jobs in remote")) score -= 80;
    if (normalized.includes("remote jobs only")) score -= 80;
    if (normalized.includes("all dates")) score -= 80;
    if (/cookie|privacy|terms|sign in|upload resume/.test(normalized)) score -= 60;
    return score;
  }

  function bestDescriptionFromDom(normalize, rootHint) {
    if (!rootHint) return "";
    const candidates = [];
    candidates.push(rootHint);

    const selectors = [
      "[data-testid='job-description']",
      "#JobDescription",
      "[class*='job-description']",
      "[data-testid='job-details']",
      "[data-testid='job-view']",
      "article",
      "section",
      "main",
    ];
    for (const selector of selectors) {
      const nodes = Array.from(rootHint.querySelectorAll(selector)).slice(0, 16);
      candidates.push(...nodes);
    }

    let bestText = "";
    let bestScore = -1;
    const seen = new Set();
    for (const node of candidates) {
      if (!node || seen.has(node)) continue;
      seen.add(node);
      const text = normalize(node.innerText || "");
      const score = scoreDescriptionText(text);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
    }
    return bestText;
  }

  function textIn(root, selectors, normalize) {
    if (!root) return "";
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      const text = normalize(node?.textContent || "");
      if (text) return text;
    }
    return "";
  }

  function firstDetailRoot() {
    const roots = [
      document.querySelector("[data-testid='job-view']"),
      document.querySelector("[data-testid='job-details']"),
      document.querySelector(".splitview-style__JobContainer-sc-77d8a261-4"),
      document.querySelector("[data-testid='job-description']")?.closest("section, article, main, div"),
      document.querySelector("#JobDescription")?.closest("section, article, main, div"),
    ];
    for (const root of roots) {
      if (root) return root;
    }
    return null;
  }

  function hasLoadedDetail(root, normalize) {
    if (!root) return false;
    const text = normalize(root.innerText || "");
    if (text.length < 220) return false;
    if (/search results for|remote jobs only|all dates|within 30 miles/i.test(text)) return false;
    if ((text.match(/quick apply/gi) || []).length >= 3) return false;
    return /description|about company|numbers & facts|responsibilities|qualifications|apply/i.test(text);
  }

  function cleanMonsterCompany(raw, normalize) {
    return normalize((raw || "").replace(/^posted by\s*/i, "").replace(/^company\s*/i, ""));
  }

  function cleanMonsterTitle(raw, normalize) {
    let title = normalize(raw);
    if (!title) return "";
    title = normalize(title.replace(/^new!\s*/i, ""));
    title = normalize(title.replace(/^search results for\s*/i, ""));
    if (/jobs?\s+in\s+/i.test(title)) return "";
    return title;
  }

  async function extract(ctx) {
    const { normalize, queryFirstText, sanitizeText, cleanTitle, metaValue, waitForText } = ctx;
    await waitForText(/description|job description|key responsibilities/i, 2500);

    const nextData = parseNextData();
    const searchResultsPage = isSearchResultsPage(nextData);
    const jobPosting = searchResultsPage ? null : parseJobPostingJsonLd();
    const detailRoot = firstDetailRoot();
    const detailLoaded = hasLoadedDetail(detailRoot, normalize);

    if (searchResultsPage && !detailLoaded) {
      return { title: "", company: "", location: "", recruiterName: "", description: "" };
    }

    const rawCompany =
      normalize(jobPosting?.hiringOrganization?.name || jobPosting?.hiringOrganization || "") ||
      textIn(detailRoot, ["[data-testid='company']", "[data-testid='company-name']", "a[href*='/company/']"], normalize) ||
      "";
    const company = cleanMonsterCompany(rawCompany, normalize);

    const rawTitleCandidate =
      normalize(jobPosting?.title || "") ||
      textIn(
        detailRoot,
        [
          "h1[data-testid='job-title']",
          "[data-testid*='job-title']",
          "h1[class*='title']",
          "h2[class*='title']",
          "h1",
          "h2",
        ],
        normalize
      ) ||
      (searchResultsPage ? "" : metaValue("og:title", "property") || document.title);
    const rawTitle = cleanMonsterTitle(rawTitleCandidate, normalize);

    const location =
      normalize(jobPosting?.jobLocation?.address?.addressLocality || "") ||
      textIn(
        detailRoot,
        ["[data-testid='job-location']", "[data-testid='location']", "[class*='location']", "li[class*='location']"],
        normalize
      );

    const descriptionFromJson = normalize(htmlToText(jobPosting?.description || ""));
    const descriptionFromDom = bestDescriptionFromDom(normalize, detailRoot);
    const description = sanitizeText(descriptionFromJson || descriptionFromDom);

    return { title: cleanTitle(rawTitle, company), company, location, recruiterName: "", description };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "monster",
    priority: 78,
    canHandle,
    extract,
  });
})();
