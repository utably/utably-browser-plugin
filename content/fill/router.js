(() => {
  function emptyReport() {
    return {
      adapter: "none",
      host: location.hostname.toLowerCase(),
      isTopFrame: window === window.top,
      filled: 0,
      skipped: 0,
      fields: [],
    };
  }

  globalThis.__utablyRunFill = (profile, options) => {
    const registry = Array.isArray(globalThis.__utablyFillRegistry)
      ? [...globalThis.__utablyFillRegistry]
      : [];
    const ctx = globalThis.__utablyFillCommon || {};
    const opts = options && typeof options === "object" ? options : {};

    registry.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    let chosen = null;
    for (const adapter of registry) {
      try {
        if (!adapter?.canHandle || !adapter.fill) continue;
        if (!adapter.canHandle()) continue;
        chosen = adapter;
        break;
      } catch (err) {
        console.warn(`[Utably fill] adapter ${adapter.id} canHandle failed`, err);
      }
    }
    if (!chosen) return emptyReport();

    // Real-fill mode (not dryRun) requires the user-consented host list.
    // Each frame validates that its host is on that list and finds its
    // matching field set. If the host isn't consented, refuse.
    const frameOptions = { dryRun: Boolean(opts.dryRun) };
    if (!opts.dryRun && Array.isArray(opts.expectedHosts)) {
      const myHost = location.hostname.toLowerCase();
      const entry = opts.expectedHosts.find((h) => (h?.host || "").toLowerCase() === myHost);
      if (!entry) {
        // Frame appeared after the user consented — refuse to fill.
        return {
          ...emptyReport(),
          adapter: chosen.id,
          aborted: true,
          reason: "host_not_consented",
        };
      }
      frameOptions.expectedFields = Array.isArray(entry.fields) ? entry.fields : [];
    }

    try {
      return chosen.fill(profile, ctx, frameOptions) || emptyReport();
    } catch (err) {
      console.warn(`[Utably fill] adapter ${chosen.id} failed`, err);
      return emptyReport();
    }
  };
})();
