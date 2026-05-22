/* Utably — interactive "place mode" for attachment uploads.
 *
 * Some upload widgets (Workday, some Greenhouse Premium skins, many bespoke
 * SaaS HR apps) don't expose a writable <input type=file>; they bind to
 * `drop` events on a styled <div>. The straight DataTransfer injection in
 * attachments.js can't reach those.
 *
 * Place mode is the workaround: the user clicks "Upload to page" → if no
 * direct input matches, the plugin enters place mode → this script
 * highlights every plausible drop target on the page → the user clicks one
 * → we synthesize the full dragenter/dragover/drop sequence with a crafted
 * DataTransfer payload.
 *
 * Limitations honestly disclosed in docs/fill.md: frameworks that check
 * `event.isTrusted` will reject the synthesized events. Most don't.
 */
(() => {
  const STATE_KEY = "__utablyDropModeState";

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
    if (!style) return true;
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) === 0) return false;
    return true;
  }

  function describeTarget(el) {
    const parts = [];
    if (el.id) parts.push(`#${el.id}`);
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    if (el.getAttribute("data-testid")) parts.push(el.getAttribute("data-testid"));
    const label = el.closest("label");
    if (label?.textContent) parts.push(label.textContent.trim().slice(0, 80));
    return parts.join(" · ").slice(0, 200) || "drop target";
  }

  function isLikelyDropzone(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === "INPUT" && el.type === "file") return true;
    // Heuristic match on classes / data attrs / aria.
    const cls = (el.className || "").toString().toLowerCase();
    const role = (el.getAttribute("role") || "").toLowerCase();
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    const testId = (el.getAttribute("data-testid") || "").toLowerCase();
    const text = (el.textContent || "").toLowerCase().slice(0, 200);
    const HAYSTACK = `${cls} ${role} ${label} ${testId} ${text}`;
    return /\b(dropzone|drop-zone|file-drop|file-upload|upload-area|file-input|attach|drag.{0,4}drop|drag.{0,6}file|drop.{0,8}here)\b/.test(HAYSTACK);
  }

  function collectCandidates() {
    const out = new Set();
    // 1. Real file inputs first (highest confidence).
    for (const inp of document.querySelectorAll('input[type="file"]')) {
      if (!isVisible(inp) && (!inp.offsetParent && inp.type === 'file')) {
        // Hidden file inputs — surface their visible label/wrapper instead.
        const id = inp.id ? document.querySelector(`label[for="${CSS.escape(inp.id)}"]`) : null;
        const wrap = inp.closest("label, [class*='upload'], [class*='drop']");
        if (id) out.add(id);
        if (wrap) out.add(wrap);
        continue;
      }
      out.add(inp);
    }
    // 2. Likely dropzones by heuristic.
    const allEls = document.querySelectorAll("div, section, label, form");
    for (const el of allEls) {
      if (out.has(el)) continue;
      if (!isVisible(el)) continue;
      if (isLikelyDropzone(el)) out.add(el);
      if (out.size > 60) break; // cap exploration
    }
    return Array.from(out);
  }

  function clearState() {
    const state = globalThis[STATE_KEY];
    if (!state) return;
    state.overlays.forEach((ov) => ov.remove());
    state.banner?.remove();
    document.removeEventListener("keydown", state.escListener, true);
    state.candidateInfo.forEach(({ el, prevOutline }) => {
      el.style.outline = prevOutline;
      el.removeEventListener("click", state.onTargetClick, true);
    });
    globalThis[STATE_KEY] = null;
  }

  function paintHighlight(el) {
    const rect = el.getBoundingClientRect();
    const ov = document.createElement("div");
    ov.style.cssText = [
      "position:fixed",
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      "border:2.5px dashed #5EE4C1",
      "border-radius:10px",
      "background:rgba(135,255,222,0.15)",
      "pointer-events:none",
      "z-index:2147483645",
      "transition:background 120ms ease",
    ].join(";");
    document.body.appendChild(ov);
    return ov;
  }

  function paintBanner(message) {
    const banner = document.createElement("div");
    banner.style.cssText = [
      "position:fixed",
      "top:14px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:2147483646",
      "background:#062C33",
      "color:#fff",
      "padding:10px 16px",
      "border-radius:12px",
      "font-family:'Red Hat Display',system-ui,sans-serif",
      "font-size:13px",
      "font-weight:600",
      "box-shadow:0 8px 24px rgba(0,0,0,0.25)",
      "letter-spacing:-0.005em",
      "display:flex",
      "align-items:center",
      "gap:10px",
    ].join(";");
    const dot = document.createElement("span");
    dot.style.cssText = "width:8px;height:8px;border-radius:50%;background:#87FFDE;flex-shrink:0";
    banner.appendChild(dot);
    const text = document.createElement("span");
    text.textContent = message;
    banner.appendChild(text);
    const esc = document.createElement("span");
    esc.style.cssText = "margin-left:8px;font-size:10px;color:rgba(255,255,255,0.55);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;border:1px solid rgba(255,255,255,0.3);border-radius:4px;padding:1px 6px";
    esc.textContent = "ESC to cancel";
    banner.appendChild(esc);
    document.body.appendChild(banner);
    return banner;
  }

  function setNativeValue(input, value) {
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
  }

  function synthesizeDropOn(target, file) {
    // For real <input type=file> elements, drop events aren't what they
    // listen for — they listen for `change`. Inject via DataTransfer directly.
    if (target.tagName === "INPUT" && target.type === "file") {
      const dt = new DataTransfer();
      dt.items.add(file);
      try { target.files = dt.files; }
      catch {
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");
        if (desc?.set) desc.set.call(target, dt.files);
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return { method: "input", description: describeTarget(target) };
    }

    // For dropzone divs/labels, synthesize the full sequence.
    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const makeEvent = (type) => {
      const dt = new DataTransfer();
      dt.items.add(file);
      const ev = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: cx,
        clientY: cy,
        dataTransfer: dt,
      });
      return ev;
    };
    // Older browsers / frameworks check different stages; fire them all.
    target.dispatchEvent(makeEvent("dragenter"));
    target.dispatchEvent(makeEvent("dragover"));
    target.dispatchEvent(makeEvent("drop"));

    // Also try the contained <input type=file> if any — frameworks often
    // route the drop into a hidden input.
    const hiddenInput = target.querySelector('input[type="file"]');
    if (hiddenInput) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        hiddenInput.files = dt.files;
        hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {}
    }
    return { method: "drop", description: describeTarget(target) };
  }

  globalThis.__utablyEnterDropMode = (params) => {
    clearState();
    try {
      const { base64, fileName, mime, kind, expectedHost } = params || {};
      const myHost = location.hostname.toLowerCase();
      if (expectedHost && expectedHost !== myHost) {
        return { host: myHost, placed: false, reason: "host_not_consented" };
      }
      if (!base64 || !fileName) {
        return { host: myHost, placed: false, reason: "missing_payload" };
      }

      const bytes = base64ToBytes(base64);
      const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
      const file = new File([blob], fileName, {
        type: mime || "application/octet-stream",
        lastModified: Date.now(),
      });

      const candidates = collectCandidates();
      if (!candidates.length) {
        return { host: myHost, placed: false, reason: "no_targets" };
      }

      const overlays = [];
      const candidateInfo = [];
      const state = {
        overlays,
        candidateInfo,
        banner: null,
        escListener: null,
        onTargetClick: null,
        resolved: false,
        result: { host: myHost, placed: false, reason: "cancelled" },
      };
      globalThis[STATE_KEY] = state;

      // We resolve through a promise so the executeScript callback waits
      // until the user actually clicks (or cancels).
      const done = new Promise((resolve) => {
        const finish = (result) => {
          if (state.resolved) return;
          state.resolved = true;
          state.result = result;
          clearState();
          resolve(result);
        };

        state.onTargetClick = (e) => {
          const targetEl = e.currentTarget;
          e.preventDefault();
          e.stopPropagation();
          try {
            const placement = synthesizeDropOn(targetEl, file);
            finish({ host: myHost, placed: true, ...placement });
          } catch (err) {
            finish({ host: myHost, placed: false, reason: "exception", error: err?.message || "" });
          }
        };

        state.escListener = (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            finish({ host: myHost, placed: false, reason: "cancelled" });
          }
        };

        for (const el of candidates) {
          candidateInfo.push({ el, prevOutline: el.style.outline });
          el.style.outline = "2.5px dashed #5EE4C1";
          el.addEventListener("click", state.onTargetClick, true);
        }
        overlays.push(...candidates.map(paintHighlight));
        state.banner = paintBanner(`Click the upload area to place ${file.name}`);
        document.addEventListener("keydown", state.escListener, true);

        // Safety timeout — 60s of no interaction → bail.
        setTimeout(() => {
          if (!state.resolved) finish({ host: myHost, placed: false, reason: "timeout" });
        }, 60_000);
      });

      return done;
    } catch (err) {
      clearState();
      return { host: location.hostname.toLowerCase(), placed: false, reason: "exception", error: err?.message || "" };
    }
  };

  globalThis.__utablyExitDropMode = () => {
    clearState();
    return { ok: true };
  };
})();
