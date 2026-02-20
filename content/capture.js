(function installUtablyCapture() {
  if (globalThis.__utablyCaptureController) {
    return;
  }

  const FIELD_OPTIONS = [
    { key: "jobTitle", label: "Title" },
    { key: "companyName", label: "Company" },
    { key: "location", label: "Location" },
    { key: "recruiterName", label: "Recruiter" },
    { key: "jobText", label: "Description" },
  ];

  const state = {
    enabled: false,
    latestText: "",
    dismissTimer: null,
  };

  let host = null;
  let shadowRoot = null;
  let card = null;
  let preview = null;
  let status = null;

  function ensureUi() {
    if (shadowRoot) return;

    host = document.createElement("div");
    host.id = "utably-capture-host";
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.top = "12px";
    host.style.right = "12px";
    host.style.zIndex = "2147483647";
    host.style.display = "none";
    document.documentElement.appendChild(host);

    shadowRoot = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.innerHTML = `
      <style>
        .card {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          width: 280px;
          border-radius: 12px;
          border: 1px solid #b7ddd6;
          background: #f7fffd;
          box-shadow: 0 10px 24px rgba(7, 63, 72, 0.18);
          color: #063f49;
          padding: 10px;
        }
        .title {
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .preview {
          font-size: 12px;
          line-height: 1.35;
          max-height: 64px;
          overflow: auto;
          border: 1px solid #d8ece8;
          border-radius: 8px;
          background: #ffffff;
          padding: 7px;
          margin-bottom: 8px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .btn {
          font: inherit;
          border-radius: 8px;
          border: 1px solid #9fcfc7;
          background: #ffffff;
          color: #055460;
          padding: 6px 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }
        .btn:hover {
          background: #e8f8f4;
        }
        .status {
          margin-top: 8px;
          font-size: 11px;
          color: #0a6c61;
          min-height: 14px;
        }
      </style>
      <div class="card">
        <div class="title">Captured text. Save to:</div>
        <div class="preview"></div>
        <div class="actions"></div>
        <div class="status"></div>
      </div>
    `;

    shadowRoot.appendChild(container);
    card = shadowRoot.querySelector(".card");
    preview = shadowRoot.querySelector(".preview");
    status = shadowRoot.querySelector(".status");
    const actions = shadowRoot.querySelector(".actions");

    for (const option of FIELD_OPTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn";
      button.textContent = option.label;
      button.addEventListener("click", () => assignToField(option.key));
      actions.appendChild(button);
    }

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "btn";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", hideCard);
    actions.appendChild(dismiss);
  }

  function hideCard() {
    if (host) host.style.display = "none";
    if (state.dismissTimer) {
      clearTimeout(state.dismissTimer);
      state.dismissTimer = null;
    }
  }

  function showCard() {
    ensureUi();
    host.style.display = "block";
    if (state.dismissTimer) clearTimeout(state.dismissTimer);
    state.dismissTimer = setTimeout(() => {
      hideCard();
    }, 9000);
  }

  function summarize(text) {
    if (!text) return "";
    const compact = text.replace(/\s+/g, " ").trim();
    if (compact.length <= 220) return compact;
    return `${compact.slice(0, 220)}...`;
  }

  async function assignToField(field) {
    const text = state.latestText;
    if (!text) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "UTABLY_CAPTURE_ASSIGN",
        field,
        text,
        pageUrl: location.href,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Failed to save capture.");
      }
      if (status) {
        status.textContent = `Saved to ${field}.`;
      }
      setTimeout(() => {
        hideCard();
      }, 650);
    } catch (error) {
      if (status) {
        status.textContent = error?.message || "Failed to save.";
      }
    }
  }

  function handleCopy() {
    if (!state.enabled) return;
    const selection = window.getSelection();
    const text = (selection ? selection.toString() : "").trim();
    if (!text) return;
    state.latestText = text;
    ensureUi();
    preview.textContent = summarize(text);
    status.textContent = "";
    showCard();
  }

  function setEnabled(enabled) {
    state.enabled = Boolean(enabled);
    if (!state.enabled) {
      hideCard();
    }
  }

  document.addEventListener("copy", handleCopy, true);

  globalThis.__utablyCaptureController = {
    setEnabled,
  };
})();
