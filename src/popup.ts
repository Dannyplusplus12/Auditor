import type { PopupState, GeminiResponse, StoredResults } from "./types";
import { clearResults, getResults, getSettings, setResults, setSettings, watchSettings } from "./storage";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Popup root element not found");
}

const initialState: PopupState = {
  isLoading: false,
  apiKey: "",
  language: "vi",
  isSettingsOpen: false
};

let finishedCount = 0;

const getCompletedCount = (fixes: GeminiResponse["fixes"]) =>
  fixes.filter((fix) => fix.progress === "complete").length;

const renderHeaderHtml = (
  apiKey: string,
  language: "vi" | "en",
  isSettingsOpen: boolean,
  response?: GeminiResponse
) => {
  const fixesText = response
    ? `<strong class="header-count">${response.fixes.length} fix${response.fixes.length === 1 ? "" : "es"}</strong>`
    : "";
  const urlText = response ? `<div class="note">${response.url}</div>` : "";
  const completed = response ? getCompletedCount(response.fixes) : 0;
  const total = response ? response.fixes.length : 0;
  const copyLabel = response ? `Copy All Prompts (${completed}/${total})` : "Copy All Prompts";
  const copyDisabled = completed === 0 ? "disabled" : "";
  const actions = response
    ? `
      <div class="header-buttons">
        <button class="button" id="analyze">Full Re-scan</button>
        <button class="button secondary" id="copy-all" ${copyDisabled}>${copyLabel}</button>
        <button class="button secondary" id="clear-results">Clear Results</button>
      </div>
    `
    : "";
  return `
    <div class="header">
      <div>
        <div class="section-title">A11y-AI Auditor</div>
        ${fixesText}
        ${urlText}
      </div>
      <div class="header-actions">
        ${actions}
        <button class="icon-button" id="settings-toggle" aria-label="Settings">
          <span aria-hidden="true">⚙️</span>
        </button>
      </div>
    </div>
    <div class="settings-panel ${isSettingsOpen ? "open" : ""}">
      <label class="stack">
        <span class="section-title">Gemini API Key</span>
        <input class="input" type="password" id="apiKey" value="${apiKey}" placeholder="Paste your key" />
      </label>
      <label class="stack">
        <span class="section-title">Language</span>
        <select class="input" id="language">
          <option value="vi" ${language === "vi" ? "selected" : ""}>Vietnamese</option>
          <option value="en" ${language === "en" ? "selected" : ""}>English</option>
        </select>
      </label>
      <button class="button secondary" id="save-settings">Save</button>
    </div>
  `;
};

const renderLoading = (state: PopupState) => {
  app.innerHTML = `
    <div class="card stack">
      ${renderHeaderHtml(state.apiKey ?? "", state.language ?? "vi", state.isSettingsOpen ?? false)}
      <strong>Running accessibility audit...</strong>
      <div class="note">Analyzing the active tab with axe-core.</div>
    </div>
  `;
};

const renderError = (message: string, state: PopupState) => {
  app.innerHTML = `
    <div class="card stack">
      ${renderHeaderHtml(state.apiKey ?? "", state.language ?? "vi", state.isSettingsOpen ?? false)}
      <strong>We hit a snag</strong>
      <div class="note">${message}</div>
      <div class="row">
        <button class="button" id="retry">Retry</button>
      </div>
    </div>
  `;

  const retry = document.querySelector<HTMLButtonElement>("#retry");
  retry?.addEventListener("click", () => startAudit());
};

const createViolationCard = (fix: GeminiResponse["fixes"][0]) => {
  const card = document.createElement("div");
  card.className = "card-item stack";
  card.dataset.highlightSelector = encodeURIComponent(fix.selector);
  card.setAttribute("role", "button");
  card.tabIndex = 0;

  const badgeRow = document.createElement("div");
  badgeRow.className = "row";

  const idBadge = document.createElement("span");
  idBadge.className = "badge primary";
  idBadge.textContent = fix.violationId;
  badgeRow.append(idBadge);

  const refreshButton = document.createElement("button");
  refreshButton.className = "icon-button small";
  refreshButton.type = "button";
  refreshButton.title = "Re-run";
  refreshButton.setAttribute("aria-label", "Re-run violation");
  refreshButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 4a8 8 0 0 1 7.65 5.53l1.86-1.07v5.04h-5.04l1.85-1.07A6 6 0 1 0 18 12h2a8 8 0 0 1-8 8 8 8 0 0 1 0-16Z"
      />
    </svg>
  `;
  refreshButton.dataset.violationId = fix.violationId;
  refreshButton.dataset.loading = fix.progress === "pending" ? "true" : "false";
  badgeRow.append(refreshButton);

  const selectorBadge = document.createElement("span");
  selectorBadge.className = "badge selector";
  selectorBadge.textContent = fix.selector;
  badgeRow.append(selectorBadge);

  if (fix.imageSrc) {
    const imageBadge = document.createElement("span");
    imageBadge.className = "badge status";
    imageBadge.textContent = "img";
    badgeRow.append(imageBadge);
  }

  if (fix.progress === "pending") {
    const statusBadge = document.createElement("span");
    statusBadge.className = "badge status";
    statusBadge.textContent = "Analyzing...";
    badgeRow.append(statusBadge);
  }

  if (fix.progress === "error") {
    const statusBadge = document.createElement("span");
    statusBadge.className = "badge status";
    statusBadge.textContent = "error";
    badgeRow.append(statusBadge);
  }

  const analysis = document.createElement("div");
  analysis.className = "result-text";
  analysis.textContent =
    fix.analysis || fix.manualInstructions || (fix.progress === "pending" ? "Analyzing..." : "");

  const fixedBlock = document.createElement("div");
  const fixedTitle = document.createElement("div");
  fixedTitle.className = "section-title";
  fixedTitle.textContent = "Fixed Code";
  const fixedCode = document.createElement("pre");
  fixedCode.className = "code-block";
  fixedCode.textContent =
    fix.fixedCode || fix.manualInstructions || (fix.progress === "pending" ? "Awaiting response..." : "");
  const fixedButton = document.createElement("button");
  fixedButton.className = "button secondary";
  fixedButton.textContent = "Copy Code";
  fixedButton.dataset.copyLabel = "Copy Code";
  fixedButton.disabled = !fix.fixedCode && !fix.manualInstructions;
  fixedButton.dataset.copy = fix.fixedCode || fix.manualInstructions || "";

  const promptBlock = document.createElement("div");
  const promptTitle = document.createElement("div");
  promptTitle.className = "section-title";
  promptTitle.textContent = "Optimal Prompt";
  const promptCode = document.createElement("pre");
  promptCode.className = "code-block";
  promptCode.textContent =
    fix.optimalPrompt || fix.manualInstructions || (fix.progress === "pending" ? "Awaiting response..." : "");
  const promptButton = document.createElement("button");
  promptButton.className = "button secondary";
  promptButton.textContent = "Copy Prompt";
  promptButton.dataset.copyLabel = "Copy Prompt";
  promptButton.disabled = !fix.optimalPrompt && !fix.manualInstructions;
  promptButton.dataset.copy = fix.optimalPrompt || fix.manualInstructions || "";

  fixedBlock.append(fixedTitle, fixedCode, fixedButton);
  promptBlock.append(promptTitle, promptCode, promptButton);
  card.append(badgeRow, analysis, fixedBlock, promptBlock);

  const triggerHighlight = async () => {
    const selector = decodeURIComponent(card.dataset.highlightSelector ?? "");
    if (!selector) {
      return;
    }

    await chrome.runtime.sendMessage({
      type: "HIGHLIGHT_NODE",
      selector
    });
  };

  card.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) {
      return;
    }
    void triggerHighlight();
  });

  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    void triggerHighlight();
  });

  return card;
};

const renderResults = (response: GeminiResponse, state: PopupState) => {
  app.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card stack";

  const header = document.createElement("div");
  header.className = "stack";
  header.innerHTML = renderHeaderHtml(
    state.apiKey ?? "",
    state.language ?? "vi",
    state.isSettingsOpen ?? false,
    response
  );

  const list = document.createElement("div");
  list.className = "card-list";
  if (response.fixes.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No violations detected 🎉";
    list.append(empty);
  } else {
    response.fixes.forEach((fix) => list.append(createViolationCard(fix)));
  }

  card.append(header, list);
  app.append(card);

  finishedCount = getCompletedCount(response.fixes);

  finishedCount = getCompletedCount(response.fixes);

  document
    .querySelector<HTMLButtonElement>("#analyze")
    ?.addEventListener("click", () => startAudit());

  document
    .querySelector<HTMLButtonElement>("#copy-all")
    ?.addEventListener("click", async () => {
      const prompts = response.fixes
        .filter((fix) => fix.progress === "complete")
        .map((fix) => fix.optimalPrompt || fix.manualInstructions || "")
        .filter(Boolean)
        .join("\n\n");
      if (!prompts) {
        return;
      }
      await navigator.clipboard.writeText(prompts);
      const button = document.querySelector<HTMLButtonElement>("#copy-all");
      if (!button) {
        return;
      }
      const previous = button.textContent;
      button.textContent = "Copied all!";
      button.classList.add("copy-feedback");
      setTimeout(() => {
        button.textContent = previous ?? "Copy All Prompts";
        button.classList.remove("copy-feedback");
      }, 1400);
    });

  document
    .querySelector<HTMLButtonElement>("#clear-results")
    ?.addEventListener("click", async () => {
      await clearResults();
      updateState({
        response: undefined
      });
    });
};

const wireCopyButtons = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const text = button.dataset.copy ?? "";
      if (!text) {
        return;
      }
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = "Copied!";
      button.classList.add("copy-feedback");
      setTimeout(() => {
        button.textContent = button.dataset.copyLabel ?? previous ?? "Copy";
        button.classList.remove("copy-feedback");
      }, 1400);
    });
  });
};

const wireRefreshButtons = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-violation-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const violationId = button.dataset.violationId;
      if (!violationId || !currentState.response) {
        return;
      }

      button.classList.add("is-loading");

      const updatedFixes = currentState.response.fixes.map((item) =>
        item.violationId === violationId
          ? {
              ...item,
              progress: "pending",
              analysis: "",
              fixedCode: "",
              optimalPrompt: "",
              manualInstructions: undefined
            }
          : item
      );

      updateState({
        response: {
          ...currentState.response,
          fixes: updatedFixes
        }
      });

      const response = await chrome.runtime.sendMessage({
        type: "RUN_SINGLE_VIOLATION",
        violationId
      });

      if (!response?.success) {
        button.classList.remove("is-loading");
      }
    });
  });
};

const renderIdle = (state: PopupState) => {
  app.innerHTML = `
    <div class="card stack">
      ${renderHeaderHtml(state.apiKey ?? "", state.language ?? "vi", state.isSettingsOpen ?? false)}
      <strong>Audit the active tab for accessibility issues.</strong>
      <div class="note">Powered by axe-core + Gemini 3.1 Flash Lite.</div>
      <div class="row">
        <button class="button" id="analyze">Analyze</button>
      </div>
    </div>
  `;

  document
    .querySelector<HTMLButtonElement>("#analyze")
    ?.addEventListener("click", () => startAudit());
};

const wireSettingsControls = (state: PopupState) => {
  const toggle = document.querySelector<HTMLButtonElement>("#settings-toggle");
  toggle?.addEventListener("click", () => {
    updateState({
      isSettingsOpen: !currentState.isSettingsOpen
    });
  });

  const input = document.querySelector<HTMLInputElement>("#apiKey");
  const saveButton = document.querySelector<HTMLButtonElement>("#save-settings");
  const languageSelect = document.querySelector<HTMLSelectElement>("#language");

  if (input) {
    input.addEventListener("input", () => {
      state.apiKey = input.value;
    });
  }

  if (languageSelect) {
    languageSelect.addEventListener("change", async () => {
      const value = languageSelect.value === "en" ? "en" : "vi";
      state.language = value;
      await setSettings({
        apiKey: state.apiKey ?? "",
        language: value
      });
    });
  }

  saveButton?.addEventListener("click", async () => {
    const apiKey = input?.value.trim() ?? "";
    const language = languageSelect?.value === "en" ? "en" : "vi";
    state.apiKey = apiKey;
    state.language = language;
    await setSettings({ apiKey, language });
    saveButton.textContent = "Saved";
    setTimeout(() => {
      saveButton.textContent = "Save";
    }, 1400);
  });
};

let currentState: PopupState = { ...initialState };
let unsubscribeSettings: (() => void) | undefined;

const initialize = async () => {
  const settings = await getSettings();
  currentState = {
    ...currentState,
    apiKey: settings.apiKey ?? "",
    language: settings.language ?? "vi"
  };
  const savedResults = (await getResults()) as StoredResults | undefined;
  if (savedResults?.fixes?.length) {
    currentState = {
      ...currentState,
      response: {
        url: savedResults.url,
        fixes: savedResults.fixes
      }
    };
  }
  renderState(currentState);
  unsubscribeSettings?.();
  unsubscribeSettings = watchSettings((settingsState) => {
    currentState = {
      ...currentState,
      apiKey: settingsState.apiKey ?? "",
      language: settingsState.language ?? "vi"
    };
    renderState(currentState);
  });
};

const renderState = (state: PopupState) => {
  if (state.isLoading) {
    renderLoading(state);
  } else if (state.error) {
    renderError(state.error, state);
  } else if (state.response) {
    renderResults(state.response, state);
  } else {
    renderIdle(state);
  }

  wireSettingsControls(state);
  wireCopyButtons();
  wireRefreshButtons();
};

const updateState = (state: PopupState) => {
  currentState = {
    ...currentState,
    ...state
  };
  renderState(currentState);
  if (currentState.response) {
    void setResults({
      url: currentState.response.url,
      fixes: currentState.response.fixes
    });
  }
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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "AUDIT_PROGRESS") {
    return;
  }

  const fix = message.data?.fix as GeminiResponse["fixes"][0] | undefined;
  if (!fix || !currentState.response) {
    return;
  }

  const updatedFixes = currentState.response.fixes.map((item) =>
    item.violationId === fix.violationId ? { ...item, ...fix } : item
  );

  updateState({
    response: {
      ...currentState.response,
      fixes: updatedFixes
    }
  });

  const refreshButton = document.querySelector<HTMLButtonElement>(
    `[data-violation-id="${fix.violationId}"]`
  );
  refreshButton?.classList.remove("is-loading");
});

void initialize();
