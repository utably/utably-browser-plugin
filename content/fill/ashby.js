(() => {
  function canHandle() {
    const host = location.hostname.toLowerCase();
    return host.includes("ashbyhq.com") || host.includes("jobs.ashbyhq.com") || host.endsWith(".ashbyhq.com");
  }

  // Ashby renders fields with `data-testid` like `applicationFormQuestionName`
  // and aria-labels. There's no stable name attribute we can rely on, so we
  // lean almost entirely on the generic label/aria heuristic.
  function keyForElement(el, ctx) {
    return ctx.inferFieldKey(ctx.describeField(el));
  }

  globalThis.__utablyFillRegistry.push({
    id: "ashby",
    priority: 50,
    canHandle,
    fill: (profile, ctx, options) =>
      ctx.runAdapter({ id: "ashby", profile, ctx, options, keyForElement }),
  });
})();
