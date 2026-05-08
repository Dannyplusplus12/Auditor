import type { SettingsState } from "./types";

const SETTINGS_KEY = "a11y_ai_settings";
const RESULTS_KEY = "a11y_ai_results";

export const getSettings = async (): Promise<SettingsState> => {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    apiKey: result[SETTINGS_KEY]?.apiKey ?? "",
    language: result[SETTINGS_KEY]?.language === "en" ? "en" : "vi"
  };
};

export const watchSettings = (callback: (settings: SettingsState) => void): (() => void) => {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) {
      return;
    }

    callback({
      apiKey: changes[SETTINGS_KEY].newValue?.apiKey ?? "",
      language: changes[SETTINGS_KEY].newValue?.language === "en" ? "en" : "vi"
    });
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};

export const setSettings = async (settings: SettingsState): Promise<void> => {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: settings
  });
};

export const getResults = async (): Promise<unknown> => {
  const result = await chrome.storage.local.get(RESULTS_KEY);
  return result[RESULTS_KEY];
};

export const setResults = async (results: unknown): Promise<void> => {
  await chrome.storage.local.set({
    [RESULTS_KEY]: results
  });
};

export const clearResults = async (): Promise<void> => {
  await chrome.storage.local.remove(RESULTS_KEY);
};
