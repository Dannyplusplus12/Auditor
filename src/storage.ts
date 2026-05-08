import type { SettingsState } from "./types";

const SETTINGS_KEY = "a11y_ai_settings";

export const getSettings = async (): Promise<SettingsState> => {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    apiKey: result[SETTINGS_KEY]?.apiKey ?? ""
  };
};

export const watchSettings = (callback: (settings: SettingsState) => void): (() => void) => {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) {
      return;
    }

    callback({
      apiKey: changes[SETTINGS_KEY].newValue?.apiKey ?? ""
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
