(() => {
  function canHandle() {
    const host = location.hostname.toLowerCase();
    return host.includes("lever.co") || host === "jobs.lever.co" || host.endsWith(".lever.co");
  }

  // Lever uses `name` attributes like `name`, `email`, `phone`, `urls[LinkedIn]`,
  // `urls[GitHub]`, `urls[Portfolio]`, `org`, `resume`.
  const NAME_MAP = {
    name: "fullName",
    email: "email",
    phone: "phone",
    org: "currentCompany",
    "urls[LinkedIn]": "linkedin",
    "urls[GitHub]": "github",
    "urls[Portfolio]": "website",
    "urls[Other]": "website",
  };

  function keyForElement(el, ctx) {
    return NAME_MAP[el.name] || ctx.inferFieldKey(ctx.describeField(el));
  }

  globalThis.__utablyFillRegistry.push({
    id: "lever",
    priority: 50,
    canHandle,
    fill: (profile, ctx, options) =>
      ctx.runAdapter({ id: "lever", profile, ctx, options, keyForElement }),
  });
})();
