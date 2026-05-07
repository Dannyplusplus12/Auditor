import type { SettingsState } from "./types";

const SETTINGS_KEY = "a11y_ai_settings";

export const getSettings = async (): Promise<SettingsState> => {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    apiKey: result[SETTINGS_KEY]?.apiKey ?? ""
  };
};

export const setSettings = async (settings: SettingsState): Promise<void> => {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: settings
  });
};
