# A11y-AI Auditor

A Chrome Extension (Manifest V3) that audits accessibility issues with axe-core and generates instant fixes and optimal prompts using Gemini 2.5 Flash.

## Features

- Run axe-core on the active tab from the popup.
- Extract violation snippets, selectors, and visual element sources.
- Send violation data to a background service worker that calls Gemini 2.5 Flash.
- Display fixes and copy-ready prompts in a clean popup UI.
- Securely store your Gemini API key via chrome.storage.local.

## Tech Stack

- TypeScript + Vite
- Manifest V3 Service Worker
- axe-core
- ESLint + Prettier

## Architecture

```
Popup UI (popup.ts) -> Background Service Worker (background.ts)
                      -> Content Script (content-script.ts) runs axe-core
                      -> Gemini 2.5 Flash API
```

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the extension:
   ```bash
   npm run build
   ```
3. Load `dist/` into Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select the `dist` folder

## Usage

1. Open the extension popup.
2. Click **Analyze**.
3. Review the fixes and copy prompts.
4. Paste your Gemini API key in the popup input.

## CI/CD

GitHub Actions lints and builds the project, then packages a ZIP artifact on every push and pull request.

## Notes

- The Gemini response parser expects a JSON array in the model output.
- Content scripts run on all URLs; update the manifest if you want to scope it.
