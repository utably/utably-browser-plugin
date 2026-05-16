(() => {
  // Generic adapter is the catch-all for hosts we don't have a dedicated
  // adapter for. We deliberately restrict it to the top frame so that
  // unknown iframes (ad networks, trackers, third-party widgets) cannot
  // receive PII just because they happen to contain an input named "email".
  // ATS-specific adapters (greenhouse/lever/ashby) still run in their own
  // frames because their canHandle() check pins them to a known host.
  function canHandle() {
    return window === window.top;
  }

  function keyForElement(el, ctx) {
    return ctx.inferFieldKey(ctx.describeField(el));
  }

  globalThis.__utablyFillRegistry.push({
    id: "generic",
    priority: 1,
    canHandle,
    fill: (profile, ctx, options) =>
      ctx.runAdapter({ id: "generic", profile, ctx, options, keyForElement }),
  });
})();
