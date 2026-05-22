/* Utably — file attachment injection content script.
 *
 * Programmatic file uploads into <input type=file> are gated by browser
 * security: the .files property is read-only to normal scripts. The only
 * portable way to populate it is via a DataTransfer object — the same path
 * the browser uses when the user drops a file from disk. We:
 *
 *   1. Decode the base64 payload passed from the background service worker
 *      into bytes (background does the cross-origin fetch from S3).
 *   2. Wrap the bytes as a `File` with the correct name + MIME type.
 *   3. Build a `DataTransfer`, add the file, assign to input.files.
 *   4. Dispatch `change` + `input` events so React/Vue/Angular state hooks
 *      observe the upload.
 *
 * The browser treats the result as if the user picked the file by hand —
 * the destination site cannot distinguish.
 */
(() => {
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function matchesAccept(input, mime, fileName) {
    const raw = (input.getAttribute('accept') || '').trim();
    if (!raw) return true; // no constraint — accept anything
    const parts = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const lowerName = (fileName || '').toLowerCase();
    const lowerMime = (mime || '').toLowerCase();
    return parts.some((part) => {
      if (!part) return false;
      if (part.startsWith('.')) return lowerName.endsWith(part);
      if (part.endsWith('/*')) return lowerMime.startsWith(part.slice(0, -2)); // e.g. image/*
      return lowerMime === part;
    });
  }

  function describeInput(el) {
    const parts = [];
    if (el.id) parts.push(el.id);
    if (el.name) parts.push(el.name);
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    if (el.id) {
      const lbl = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl?.textContent) parts.push(lbl.textContent);
    }
    let parent = el.parentElement;
    let hops = 0;
    while (parent && hops < 4) {
      if (parent.tagName === 'LABEL' && parent.textContent) {
        parts.push(parent.textContent);
        break;
      }
      hops += 1;
      parent = parent.parentElement;
    }
    return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isVisibleInput(el) {
    if (!el || !el.isConnected) return false;
    if (el.disabled) return false;
    if (el.type !== 'file') return false;
    // Many forms hide the native input and use a styled wrapper. We do NOT
    // filter on visibility — the input is still the correct injection target,
    // and the user's consent modal showed them the field's label/id.
    return true;
  }

  function collectFileInputs() {
    return Array.from(document.querySelectorAll('input[type="file"]')).filter(isVisibleInput);
  }

  function planUpload(file, kind) {
    const inputs = collectFileInputs();
    const candidates = [];
    for (const input of inputs) {
      if (input.disabled || input.readOnly) continue;
      if (!matchesAccept(input, file.type, file.name)) continue;
      const description = describeInput(input);
      candidates.push({ input, description });
    }
    if (!candidates.length) return null;

    // Prefer inputs whose label/id/name mention the kind (resume, cv, photo,
    // certificate). Falls back to the first match.
    const KIND_KEYWORDS = {
      cv: ['resume', 'cv', 'curriculum', 'lebenslauf'],
      image: ['photo', 'picture', 'avatar', 'foto', 'image', 'bild'],
      certificate: ['certificate', 'cert', 'transcript', 'diploma', 'zeugnis', 'urkunde'],
      document: ['attachment', 'document', 'file', 'cover', 'anschreiben'],
    };
    const keywords = KIND_KEYWORDS[kind] || [];
    let chosen = candidates[0];
    if (keywords.length) {
      const hit = candidates.find((c) => keywords.some((kw) => c.description.includes(kw)));
      if (hit) chosen = hit;
    }
    return chosen;
  }

  function setFileOnInput(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    try {
      input.files = dt.files;
    } catch (err) {
      // Some browsers/frameworks treat .files as truly read-only on certain
      // input shapes. Falling back to defining the property via descriptor.
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      if (desc && desc.set) desc.set.call(input, dt.files);
      else throw err;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Preview: returns the planned destination (input description + host) but
  // does NOT mutate the DOM. Used for the consent modal.
  globalThis.__utablyPreviewAttachment = (params) => {
    try {
      const { fileName, mime, kind } = params || {};
      // Build a transient File just to evaluate `accept` matching. The
      // payload is empty (0 bytes), but the name + type are what matters
      // for filtering.
      const tmp = new File([new Uint8Array(0)], fileName || 'file', { type: mime || 'application/octet-stream' });
      const plan = planUpload(tmp, kind);
      if (!plan) {
        return {
          host: location.hostname.toLowerCase(),
          isTopFrame: window === window.top,
          matched: false,
          inputDescription: '',
        };
      }
      return {
        host: location.hostname.toLowerCase(),
        isTopFrame: window === window.top,
        matched: true,
        inputDescription: plan.description.slice(0, 200) || 'file input',
      };
    } catch (err) {
      return { host: location.hostname.toLowerCase(), matched: false, error: err?.message || 'preview failed' };
    }
  };

  globalThis.__utablyUploadAttachment = (params) => {
    try {
      const { base64, fileName, mime, kind, expectedHost } = params || {};
      const myHost = location.hostname.toLowerCase();
      if (expectedHost && expectedHost !== myHost) {
        return { host: myHost, uploaded: false, reason: 'host_not_consented' };
      }
      if (!base64 || !fileName) {
        return { host: myHost, uploaded: false, reason: 'missing_payload' };
      }
      const bytes = base64ToBytes(base64);
      const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
      const file = new File([blob], fileName, {
        type: mime || 'application/octet-stream',
        lastModified: Date.now(),
      });
      const plan = planUpload(file, kind);
      if (!plan) return { host: myHost, uploaded: false, reason: 'no_matching_input' };
      setFileOnInput(plan.input, file);
      return {
        host: myHost,
        isTopFrame: window === window.top,
        uploaded: true,
        inputDescription: plan.description.slice(0, 200) || 'file input',
        bytes: file.size,
      };
    } catch (err) {
      console.warn('[Utably] attachment upload failed', err);
      return { host: location.hostname.toLowerCase(), uploaded: false, reason: 'exception', error: err?.message || '' };
    }
  };
})();
