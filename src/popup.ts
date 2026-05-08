import type { PopupState, GeminiResponse } from "./types";
import { getSettings, setSettings, watchSettings } from "./storage";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Popup root element not found");
}

const initialState: PopupState = {
  isLoading: false,
  apiKey: ""
};

const renderLoading = (apiKey: string) => {
  app.innerHTML = `
    <div class="card stack">
      <div class="section-title">A11y-AI Auditor</div>
      <strong>Running accessibility audit...</strong>
      <div class="note">Analyzing the active tab with axe-core.</div>
      <label class="stack">
        <span class="section-title">Gemini API Key</span>
        <input class="input" type="text" id="apiKey" value="${apiKey}" placeholder="Paste your key" />
      </label>
    </div>
  `;
};

const renderError = (message: string, apiKey: string) => {
  app.innerHTML = `
    <div class="card stack">
      <div class="section-title">A11y-AI Auditor</div>
      <strong>We hit a snag</strong>
      <div class="note">${message}</div>
      <label class="stack">
        <span class="section-title">Gemini API Key</span>
        <input class="input" type="text" id="apiKey" value="${apiKey}" placeholder="Paste your key" />
      </label>
      <div class="row">
        <button class="button" id="retry">Retry</button>
      </div>
    </div>
  `;

  const retry = document.querySelector<HTMLButtonElement>("#retry");
  retry?.addEventListener("click", () => startAudit());
};

const renderResults = (response: GeminiResponse, apiKey: string) => {
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
        <label class="stack" style="margin: 0;">
          <span class="section-title">Gemini API Key</span>
          <input class="input" type="text" id="apiKey" value="${apiKey}" placeholder="Paste your key" />
        </label>
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
};

const renderIdle = (apiKey: string) => {
  app.innerHTML = `
    <div class="card stack">
      <div class="section-title">A11y-AI Auditor</div>
      <strong>Audit the active tab for accessibility issues.</strong>
      <div class="note">Powered by axe-core + Gemini 2.5 Flash.</div>
      <label class="stack">
        <span class="section-title">Gemini API Key</span>
        <input class="input" type="text" id="apiKey" value="${apiKey}" placeholder="Paste your key" />
      </label>
      <div class="row">
        <button class="button" id="analyze">Analyze</button>
      </div>
    </div>
  `;

  document
    .querySelector<HTMLButtonElement>("#analyze")
    ?.addEventListener("click", () => startAudit());
};

const wireApiKeyInput = (state: PopupState) => {
  const input = document.querySelector<HTMLInputElement>("#apiKey");
  if (!input) {
    return;
  }

  input.addEventListener("input", async () => {
    const value = input.value.trim();
    if (state.apiKey === value) {
      return;
    }
    state.apiKey = value;
    await setSettings({ apiKey: value });
  });
};

let currentState: PopupState = { ...initialState };
let unsubscribeSettings: (() => void) | undefined;

const initialize = async () => {
  const settings = await getSettings();
  currentState = {
    ...currentState,
    apiKey: settings.apiKey ?? ""
  };
  renderState(currentState);
  unsubscribeSettings?.();
  unsubscribeSettings = watchSettings((settingsState) => {
    currentState = {
      ...currentState,
      apiKey: settingsState.apiKey ?? ""
    };
    renderState(currentState);
  });
};

const renderState = (state: PopupState) => {
  const apiKey = state.apiKey ?? "";
  if (state.isLoading) {
    renderLoading(apiKey);
  } else if (state.error) {
    renderError(state.error, apiKey);
  } else if (state.response) {
    renderResults(state.response, apiKey);
  } else {
    renderIdle(apiKey);
  }

  wireApiKeyInput(state);
};

const updateState = (state: PopupState) => {
  currentState = {
    ...currentState,
    ...state
  };
  renderState(currentState);
};

const startAudit = async () => {
  updateState({
    isLoading: true,
    error: undefined
  });

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RUN_AUDIT"
    });

    if (!response?.success) {
      throw new Error(response?.error ?? "Unable to analyze the page.");
    }

    updateState({
      isLoading: false,
      response: response.data as GeminiResponse
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    updateState({
      isLoading: false,
      error: message
    });
  }
};

void initialize();
