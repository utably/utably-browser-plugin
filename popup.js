import { startPopupApp } from "./popup/app.js";

startPopupApp().catch((error) => {
  const message = error?.message || "Failed to initialize.";
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.remove("hidden", "info", "success");
    statusEl.classList.add("error");
  }
});
