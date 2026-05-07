import { getSettings, setSettings } from "./storage";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Settings root element not found");
}

const render = async () => {
  const settings = await getSettings();

  app.innerHTML = `
    <div class="card stack">
      <div class="section-title">Settings</div>
      <label class="stack">
        <span>Gemini API Key</span>
        <input class="input" type="password" id="apiKey" value="${settings.apiKey}" />
      </label>
      <button class="button" id="save">Save</button>
      <div class="note">The key is stored locally using chrome.storage.local.</div>
    </div>
  `;

  const input = document.querySelector<HTMLInputElement>("#apiKey");
  const saveButton = document.querySelector<HTMLButtonElement>("#save");

  saveButton?.addEventListener("click", async () => {
    await setSettings({
      apiKey: input?.value ?? ""
    });
    saveButton.textContent = "Saved";
    setTimeout(() => {
      saveButton.textContent = "Save";
    }, 1500);
  });
};

void render();
