(() => {
  globalThis.__utablyRunExtract = async () => {
    const registry = Array.isArray(globalThis.__utablyExtractorRegistry)
      ? [...globalThis.__utablyExtractorRegistry]
      : [];
    const common = globalThis.__utablyExtractCommon || {};

    registry.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const host = location.hostname.toLowerCase();
    const url = location.href;
    const isLinkedIn = host.includes("linkedin.com");

    for (const extractor of registry) {
      try {
        if (!extractor?.canHandle || !extractor.extract) continue;
        if (!extractor.canHandle()) continue;
        const payload = await extractor.extract(common);
        if (!payload) continue;
        return {
          url,
          host,
          isLinkedIn: Boolean(payload.isLinkedIn || isLinkedIn),
          title: payload.title || "",
          company: payload.company || "",
          location: payload.location || "",
          recruiterName: payload.recruiterName || "",
          description: payload.description || "",
          adapter: extractor.id || "unknown",
        };
      } catch {}
    }

    return {
      url,
      host,
      isLinkedIn,
      title: "",
      company: "",
      location: "",
      recruiterName: "",
      description: "",
      adapter: "none",
    };
  };
})();
