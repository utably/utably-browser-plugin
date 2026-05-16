(() => {
  function canHandle() {
    const host = location.hostname.toLowerCase();
    return host.includes("greenhouse.io") || host.endsWith(".greenhouse.io");
  }

  // Greenhouse application forms use stable ids like `first_name`, `last_name`,
  // `email`, `phone`, plus a `job_application` namespace. We map directly to
  // those before falling back to the generic heuristic for custom questions.
  const ID_MAP = {
    first_name: "firstName",
    "job_application_first_name": "firstName",
    last_name: "lastName",
    "job_application_last_name": "lastName",
    email: "email",
    "job_application_email": "email",
    phone: "phone",
    "job_application_phone": "phone",
    "candidate_url": "website",
  };

  function keyForElement(el, ctx) {
    return ID_MAP[el.id] || ID_MAP[el.name] || ctx.inferFieldKey(ctx.describeField(el));
  }

  globalThis.__utablyFillRegistry.push({
    id: "greenhouse",
    priority: 50,
    canHandle,
    fill: (profile, ctx, options) =>
      ctx.runAdapter({ id: "greenhouse", profile, ctx, options, keyForElement }),
  });
})();
