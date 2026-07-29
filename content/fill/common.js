(() => {
  // Use React-friendly native setters so frameworks (Greenhouse uses React in
  // some boards, Ashby is Next.js, Lever is React) observe the value change.
  // Setting `el.value` directly bypasses the React synthetic-event tracker
  // and the framework reverts your write on the next render.
  function setNativeValue(el, value) {
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value == null ? "" : String(value));
    } else {
      el.value = value == null ? "" : String(value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.type === "hidden") return false;
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
    if (style && (style.visibility === "hidden" || style.display === "none")) return false;
    return true;
  }

  function isFillableInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    const blocked = new Set([
      "hidden", "file", "submit", "button", "reset", "image",
      "checkbox", "radio", "color", "range", "password",
    ]);
    return !blocked.has((el.type || "text").toLowerCase());
  }

  // Pulls every label/name/placeholder/aria signal we can use to identify a
  // field. Returned as lowercase so the matcher can keyword-match cheaply.
  function describeField(el) {
    const parts = [];
    if (el.name) parts.push(el.name);
    if (el.id) parts.push(el.id);
    if (el.placeholder) parts.push(el.placeholder);
    if (el.autocomplete) parts.push(el.autocomplete);
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const t = el.ownerDocument.getElementById(id)?.textContent;
        if (t) parts.push(t);
      }
    }
    if (el.id) {
      const lbl = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl?.textContent) parts.push(lbl.textContent);
    }
    let parent = el.parentElement;
    let hops = 0;
    while (parent && hops < 4) {
      if (parent.tagName === "LABEL") {
        if (parent.textContent) parts.push(parent.textContent);
        break;
      }
      hops += 1;
      parent = parent.parentElement;
    }
    return parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function matchesAny(haystack, patterns) {
    return patterns.some((p) => (p instanceof RegExp ? p.test(haystack) : haystack.includes(p)));
  }

  function collectInputs(root = document) {
    const out = [];
    const inputs = root.querySelectorAll("input, textarea");
    for (const el of inputs) {
      if (!isFillableInput(el)) continue;
      if (!isVisible(el)) continue;
      out.push(el);
    }
    return out;
  }

  function pickValue(profile, fieldKey) {
    const c = profile?.contact || {};
    const a = profile?.address || {};
    const l = profile?.links || {};
    switch (fieldKey) {
      case "firstName": return c.firstName || "";
      case "lastName": return c.lastName || "";
      case "fullName": return [c.firstName, c.lastName].filter(Boolean).join(" ");
      case "email": return c.email || "";
      case "phone": return c.phone || "";
      case "street": return [a.street, a.houseNumber].filter(Boolean).join(" ");
      case "city": return a.city || "";
      case "zip": return a.zip || "";
      case "country": return a.country || "";
      case "linkedin": return l.linkedin || "";
      case "github": return l.github || "";
      case "website": return l.website || "";
      case "currentCompany": return profile?.experience?.[0]?.company || "";
      case "currentTitle": return profile?.experience?.[0]?.title || "";
      default: return "";
    }
  }

  // Heuristic field-key matcher. Ordered: most specific first so "first name"
  // wins before generic "name". Returns null if nothing matches confidently.
  function inferFieldKey(description) {
    if (!description) return null;
    const d = description;

    if (matchesAny(d, [/first[\s_-]*name/, "given name", "vorname"])) return "firstName";
    if (matchesAny(d, [/last[\s_-]*name/, "surname", "family name", "nachname"])) return "lastName";
    if (matchesAny(d, [/full[\s_-]*name/, /\bname\b/]) && !d.includes("company") && !d.includes("user")) {
      return "fullName";
    }
    if (matchesAny(d, [/e[\s_-]*mail/, "email address"])) return "email";
    if (matchesAny(d, [/\bphone\b/, "mobile", "telefon"])) return "phone";
    if (matchesAny(d, ["linkedin", "linked in"])) return "linkedin";
    if (matchesAny(d, ["github", "git hub"])) return "github";
    if (matchesAny(d, ["portfolio", "website", "personal site", "homepage"])) return "website";
    if (matchesAny(d, [/street/, "address line"])) return "street";
    if (matchesAny(d, [/\bcity\b/, "town", "stadt"])) return "city";
    if (matchesAny(d, [/\bzip\b/, "postal", "postcode", "plz"])) return "zip";
    if (matchesAny(d, [/\bcountry\b/, "land"])) return "country";
    if (matchesAny(d, ["current company", "employer", "company name"]) && !d.includes("you")) {
      return "currentCompany";
    }
    if (matchesAny(d, ["current title", "current role", "job title", "position"]) && !d.includes("desired")) {
      return "currentTitle";
    }
    return null;
  }

  // Fill an input only if it's empty — never overwrite user-edited data.
  // When `options.dryRun` is true, return true without mutating the DOM so we
  // can show the user a preview ("what would be filled") before any PII
  // actually lands in a third-party form. This is the linchpin of the DSGVO
  // consent-before-fill flow.
  function tryFill(el, value, options) {
    if (!value) return false;
    const current = (el.value || "").trim();
    if (current) return false;
    if (options && options.dryRun) return true;
    return setNativeValue(el, value);
  }

  function canonicalFieldSet(fields) {
    const seen = new Set();
    for (const f of Array.isArray(fields) ? fields : []) {
      if (f) seen.add(String(f));
    }
    return [...seen].sort().join("|");
  }

  // Build the fill plan: iterate inputs, pick a field key + value, capture
  // the element reference. The plan is the single source of truth for both
  // the dry-run preview AND the eventual apply — they look at the same
  // elements with the same logic, so the dry-run accurately predicts what
  // the apply will do.
  function buildPlan(profile, keyForElement, ctx) {
    const inputs = collectInputs(document);
    const plan = [];
    for (const el of inputs) {
      const key = keyForElement(el, ctx);
      if (!key) continue;
      const value = pickValue(profile, key);
      if (!value) continue;
      const current = (el.value || "").trim();
      if (current) continue;
      plan.push({ el, key, value });
    }
    return { plan, totalCandidates: inputs.length };
  }

  function applyPlan(plan) {
    let filled = 0;
    const fields = [];
    for (const { el, key, value } of plan) {
      // Re-check at apply time: the element must still be in the DOM and
      // still empty. Closes any microtask-scale race between buildPlan and
      // applyPlan inside the same synchronous frame execution.
      if (!el.isConnected) continue;
      if (!isFillableInput(el)) continue;
      if ((el.value || "").trim()) continue;
      if (setNativeValue(el, value)) {
        filled += 1;
        fields.push(key);
      }
    }
    return { filled, fields };
  }

  // Plan / verify / apply in a single synchronous JS run. The TOCTOU window
  // between the user seeing the preview and the page receiving PII is
  // collapsed: if the page has mutated such that the field set no longer
  // matches what the user consented to, we abort instead of filling.
  function runAdapter({ id, profile, ctx, options, keyForElement }) {
    const { plan, totalCandidates } = buildPlan(profile, keyForElement, ctx);
    const planFields = plan.map((p) => p.key);
    const base = {
      adapter: id,
      host: location.hostname.toLowerCase(),
      isTopFrame: window === window.top,
      filled: 0,
      skipped: Math.max(0, totalCandidates - plan.length),
      fields: planFields,
    };

    if (options?.dryRun) {
      return base;
    }

    if (Array.isArray(options?.expectedFields)) {
      const expectedKey = canonicalFieldSet(options.expectedFields);
      const planKey = canonicalFieldSet(planFields);
      if (expectedKey !== planKey) {
        return {
          ...base,
          fields: [],
          filled: 0,
          aborted: true,
          reason: "page_changed",
          planFields,
        };
      }
    }

    const { filled, fields } = applyPlan(plan);
    return { ...base, filled, fields };
  }

  globalThis.__utablyFillRegistry = [];
  globalThis.__utablyFillCommon = {
    setNativeValue,
    isVisible,
    isFillableInput,
    describeField,
    collectInputs,
    pickValue,
    inferFieldKey,
    tryFill,
    buildPlan,
    applyPlan,
    canonicalFieldSet,
    runAdapter,
  };
})();
