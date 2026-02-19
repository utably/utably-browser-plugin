(() => {
  function canHandle() {
    const host = location.hostname.toLowerCase();
    return host.endsWith("google.com") && location.pathname.includes("/about/careers/applications/jobs/results/");
  }

  function sectionText(full, startRegex, endRegexes, normalize) {
    const start = full.search(startRegex);
    if (start < 0) return "";
    const startSlice = full.slice(start);
    let endAt = startSlice.length;
    for (const endRegex of endRegexes) {
      const idx = startSlice.search(endRegex);
      if (idx > 0 && idx < endAt) endAt = idx;
    }
    return normalize(startSlice.slice(0, endAt));
  }

  async function extract(ctx) {
    const { normalize, sanitizeText, waitForText, cleanTitle } = ctx;
    await waitForText(/(Minimum qualifications:|About the job|Responsibilities)/i, 5000);

    const lines = (document.body?.innerText || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => normalize(line))
      .filter(Boolean)
      .filter((line) => !/^hide$/i.test(line))
      .filter((line) => !/uses cookies from google/i.test(line))
      .filter((line) => !/^learn more$/i.test(line));

    const full = lines.join("\n");
    const findLine = (regex) => lines.find((line) => regex.test(line)) || "";
    const lineAfter = (regex, offset = 1) => {
      const idx = lines.findIndex((line) => regex.test(line));
      return idx >= 0 ? lines[idx + offset] || "" : "";
    };

    const company = lineAfter(/^corporate_fare$/i, 1) || findLine(/^google$/i);
    const rawTitle =
      lineAfter(/^back to jobs search$/i, 1) ||
      findLine(/\b(engineer|developer|manager|scientist|designer|architect|specialist|analyst|director|lead)\b/i);
    const locationText =
      lineAfter(/^place$/i, 1) ||
      findLine(/\b(remote|hybrid|onsite|[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Za-z\s]+)\b/i);

    const minQ = sectionText(full, /Minimum qualifications:/i, [/Preferred qualifications:/i, /About the job/i], normalize);
    const prefQ = sectionText(full, /Preferred qualifications:/i, [/About the job/i, /Responsibilities/i], normalize);
    const about = sectionText(
      full,
      /About the job/i,
      [/Responsibilities/i, /Information collected and processed as part of your Google Careers profile/i],
      normalize
    );
    const responsibilities = sectionText(
      full,
      /Responsibilities/i,
      [/Information collected and processed as part of your Google Careers profile/i, /Google is proud to be an equal opportunity/i],
      normalize
    );

    return {
      title: cleanTitle(rawTitle, company),
      company,
      location: locationText,
      recruiterName: "",
      description: sanitizeText([minQ, prefQ, about, responsibilities].filter(Boolean).join("\n\n")),
    };
  }

  globalThis.__utablyExtractorRegistry.push({
    id: "googlejobs",
    priority: 100,
    canHandle,
    extract,
  });
})();
