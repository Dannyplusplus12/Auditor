import type { PopupState, GeminiResponse } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Popup root element not found");
}

const initialState: PopupState = {
  isLoading: false
};

const renderLoading = () => {
  app.innerHTML = `
    <div class="card stack">
      <div class="section-title">A11y-AI Auditor</div>
      <strong>Running accessibility audit...</strong>
      <div class="note">Analyzing the active tab with axe-core.</div>
    </div>
  `;
};

const renderError = (message: string) => {
  app.innerHTML = `
    <div class="card stack">
      <div class="section-title">A11y-AI Auditor</div>
      <strong>We hit a snag</strong>
      <div class="note">${message}</div>
      <div class="row">
        <button class="button" id="retry">Retry</button>
        <button class="button secondary" id="open-settings">Settings</button>
      </div>
    </div>
  `;

  const retry = document.querySelector<HTMLButtonElement>("#retry");
  retry?.addEventListener("click", () => startAudit());

  const openSettings = document.querySelector<HTMLButtonElement>("#open-settings");
  openSettings?.addEventListener("click", () => chrome.runtime.openOptionsPage());
};

const renderResults = (response: GeminiResponse) => {
  const cards = response.fixes
    .map(
      (fix) => `
        <div class="card-item stack">
          <div class="row">
            <span class="badge">${fix.violationId}</span>
            <span class="badge">${fix.selector}</span>
            ${fix.imageSrc ? `<span class="badge">img</span>` : ""}
          </div>
          <div>${fix.analysis}</div>
          <div>
            <div class="section-title">Fixed Code</div>
            <pre>${fix.fixedCode}</pre>
            <button class="button secondary" data-copy="${encodeURIComponent(
              fix.fixedCode
            )}">Copy Code</button>
          </div>
          <div>
            <div class="section-title">Optimal Prompt</div>
            <pre>${fix.optimalPrompt}</pre>
            <button class="button secondary" data-copy="${encodeURIComponent(
              fix.optimalPrompt
            )}">Copy Prompt</button>
          </div>
        </div>
      `
    )
    .join("");

  app.innerHTML = `
    <div class="card stack">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="section-title">A11y-AI Auditor</div>
          <strong>${response.fixes.length} fix${response.fixes.length === 1 ? "" : "es"}</strong>
          <div class="note">${response.url}</div>
        </div>
        <button class="button secondary" id="open-settings">Settings</button>
      </div>
      <div class="card-list">${cards || "<div>No violations detected 🎉</div>"}</div>
      <button class="button" id="analyze">Analyze Again</button>
    </div>
  `;

  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const text = decodeURIComponent(button.dataset.copy ?? "");
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied!";
      setTimeout(() => {
        button.textContent = button.textContent === "Copied!" ? "Copy" : button.textContent;
      }, 1500);
    });
  });

  document
    .querySelector<HTMLButtonElement>("#analyze")
    ?.addEventListener("click", () => startAudit());
  document
    .querySelector<HTMLButtonElement>("#open-settings")
    ?.addEventListener("click", () => chrome.runtime.openOptionsPage());
};

const renderIdle = () => {
  app.innerHTML = `
    <div class="card stack">
      <div class="section-title">A11y-AI Auditor</div>
      <strong>Audit the active tab for accessibility issues.</strong>
      <div class="note">Powered by axe-core + Gemini 1.5 Flash.</div>
      <div class="row">
        <button class="button" id="analyze">Analyze</button>
        <button class="button secondary" id="open-settings">Settings</button>
      </div>
    </div>
  `;

  document
    .querySelector<HTMLButtonElement>("#analyze")
    ?.addEventListener("click", () => startAudit());
  document
    .querySelector<HTMLButtonElement>("#open-settings")
    ?.addEventListener("click", () => chrome.runtime.openOptionsPage());
};

const setState = (state: PopupState) => {
  if (state.isLoading) {
    renderLoading();
    return;
  }

  if (state.error) {
    renderError(state.error);
    return;
  }

  if (state.response) {
    renderResults(state.response);
    return;
  }

  renderIdle();
};

const startAudit = async () => {
  setState({
    isLoading: true
  });

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RUN_AUDIT"
    });

    if (!response?.success) {
      throw new Error(response?.error ?? "Unable to analyze the page.");
    }

    setState({
      isLoading: false,
      response: response.data as GeminiResponse
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setState({
      isLoading: false,
      error: message
    });
  }
};

setState(initialState);
