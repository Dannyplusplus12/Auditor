# A11y-AI Auditor Context

## Project Identity
- **Name:** A11y-AI Auditor
- **Purpose:** Chrome extension that runs axe-core on the active tab and uses Gemini 1.5 Flash to generate accessibility fixes and copy-ready prompts.
- **Target Audience:** Front-end developers and accessibility engineers who want fast remediation guidance.

## Tech Stack & DevOps
- **Framework/Build:** Vite + TypeScript (no React; vanilla DOM rendering).
- **Extension Manifest:** Manifest V3.
- **AI/Accessibility:** Gemini 1.5 Flash API, axe-core.
- **Package Manager:** npm.
- **CI/CD:** GitHub Actions workflow (`.github/workflows/build.yml`) for lint, build, zip artifact.

## Golden Flow (Click → Axe → Background → Gemini → Popup)
1. **User clicks Analyze** in `popup.ts`.
2. Popup sends `RUN_AUDIT` message to the background service worker.
3. **Background (`background.ts`)** queries active tab and sends `RUN_AXE` message to content script.
4. **Content script (`content-script.ts`)** runs `axe.run()` on the page and returns `AxeAuditPayload`.
5. Background builds a prompt from violations, calls **Gemini 1.5 Flash** via `generateContent` API.
6. Background parses Gemini response into structured fixes (`GeminiResponse`).
7. Popup receives the response and renders fixes + copy buttons.

## File Map
- `public/manifest.json`: MV3 config, permissions, service worker, content script registration.
- `src/background.ts`: Orchestrates audit, calls Gemini, parses AI output, returns results to popup.
- `src/content-script.ts`: Runs axe-core in the page context and serializes violations.
- `src/popup.ts`: Popup UI state, renders loading/errors/results, triggers audit.
- `src/settings.ts`: Options UI to store Gemini API key.
- `src/storage.ts`: `chrome.storage.local` access helpers for settings.
- `src/types.ts`: Shared TypeScript types for payloads and UI state.
- `src/styles.css`: Shared UI styling for popup/settings.
- `popup.html`: Popup entry page wiring `popup.ts` and styles.
- `settings.html`: Options page wiring `settings.ts` and styles.
- `vite.config.ts`: Vite build inputs/outputs for MV3 bundle.
- `.github/workflows/build.yml`: CI pipeline (install, lint, build, package).
- `README.md`: User-facing setup and usage docs.

## AI Strategy
- **Prompting:** Background builds a single prompt listing all violations with selector, HTML snippet, and failure summary. It instructs Gemini to act as an accessibility engineer and return a JSON array containing `violationId`, `analysis`, `fixedCode`, and `optimalPrompt`.
- **Parsing:** Gemini output is parsed by extracting the first JSON array block from the response text. Missing entries get fallback analysis/fix/prompt strings.
- **Vision Integration:** No image/vision input is sent; only HTML snippets and selectors. `imageSrc` is extracted from HTML if present for display, not for Gemini.

## State Management
- **Settings:** Gemini API key stored in `chrome.storage.local` under `a11y_ai_settings` via `getSettings`/`setSettings`.
- **Scan Results:** No persistence; results live in popup state only after background returns `GeminiResponse`.

## Current Progress & TODOs
- **Implemented:** MV3 extension shell, axe-core scan, Gemini call/parse, popup rendering, settings storage, CI build/package.
- **Known Constraints:** Gemini JSON parsing relies on array extraction; malformed model output yields empty fixes.
- **Potential TODOs:**
  - Add validation and richer error handling for malformed Gemini responses.
  - Persist recent scan history and/or last response.
  - Add optional target URL scoping for content script in `manifest.json`.
  - Improve multi-node violation handling (currently uses first node for context).
