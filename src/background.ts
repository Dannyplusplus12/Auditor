import type { AxeAuditPayload, GeminiFix } from "./types";
import { getSettings } from "./storage";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";

const extractImageSrc = (htmlSnippet: string) => htmlSnippet.match(/src=["']([^"']+)["']/i)?.[1];

const formatComputedStyles = (node: AxeAuditPayload["violations"][0]["nodes"][0]) => {
  if (!node.computedStyles) {
    return "";
  }

  return Object.entries(node.computedStyles)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
};

const buildPrompt = (violation: AxeAuditPayload["violations"][0], language: "vi" | "en") => {
  const node = violation.nodes[0];
  const computedStyles = node?.computedStyles ? JSON.stringify(node.computedStyles) : "";
  const languageLabel = language === "en" ? "English" : "Vietnamese";
  return `You are an Unstoppable Accessibility Expert. Fix this specific violation:

ID: ${violation.id}

Context: ${node?.html ?? ""}

Summary: ${node?.failureSummary ?? ""}

Styles: ${computedStyles || "(not available)"}

Return ONLY a JSON object: { "violationId": "...", "analysis": "...", "fixedCode": "...", "manualInstructions": "...", "optimalPrompt": "..." }.
If you cannot provide code, fill 'manualInstructions' with detailed steps.
You MUST speak ${languageLabel} for all general descriptions, analysis, and manualInstructions. If ${languageLabel} is chosen, the output fields 'analysis' and 'manualInstructions' MUST be ${languageLabel}. Keep technical IDs and fixedCode in English.
The optimalPrompt MUST be a concise, complete command a developer can paste into another AI to fix this exact issue. It MUST include the technical error name and the HTML snippet or selector context. Do not use generic placeholders.`;
};

const buildSimplifiedPrompt = (violation: AxeAuditPayload["violations"][0], language: "vi" | "en") => {
  const node = violation.nodes[0];
  const languageLabel = language === "en" ? "English" : "Vietnamese";
  return `Fix this accessibility issue and return JSON only.

ID: ${violation.id}
Context: ${node?.html ?? ""}
Summary: ${node?.failureSummary ?? ""}

Return ONLY a JSON object: { "violationId": "...", "analysis": "...", "fixedCode": "...", "manualInstructions": "...", "optimalPrompt": "..." }.
You MUST speak ${languageLabel} for all general descriptions, analysis, and manualInstructions. If ${languageLabel} is chosen, the output fields 'analysis' and 'manualInstructions' MUST be ${languageLabel}. Keep technical IDs and fixedCode in English.
The optimalPrompt MUST be a concise, complete command a developer can paste into another AI to fix this exact issue. It MUST include the technical error name and the HTML snippet or selector context. Do not use generic placeholders.`;
};


const generateGeminiRequest = async (
  violation: AxeAuditPayload["violations"][0],
  useSimplifiedPrompt: boolean
) => {
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error("Missing Gemini API key. Paste it in the popup.");
  }

  return {
    apiKey: settings.apiKey,
    body: {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: useSimplifiedPrompt
                ? buildSimplifiedPrompt(violation, settings.language)
                : buildPrompt(violation, settings.language)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        response_mime_type: "application/json"
      }
    }
  };
};

const extractJsonArray = (text: string) => {
  const match = text.match(/\[[\s\S]*\]/);
  return match?.[0];
};

const extractJsonObject = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/);
  return match?.[0];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseJsonFix = (text: string): {
  violationId?: string;
  analysis?: string;
  fixedCode?: string;
  optimalPrompt?: string;
  manualInstructions?: string;
} | null => {
  try {
    const trimmed = text.trim();
    const jsonText = trimmed.startsWith("{") ? trimmed : extractJsonObject(text);
    if (!jsonText) {
      return null;
    }
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as {
        violationId?: string;
        analysis?: string;
        fixedCode?: string;
        optimalPrompt?: string;
        manualInstructions?: string;
      };
    }
  } catch (error) {
    console.warn("Failed to parse Gemini JSON output", error);
  }

  return null;
};

const runGemini = async (violation: AxeAuditPayload["violations"][0], useSimplifiedPrompt: boolean) => {
  const { apiKey, body } = await generateGeminiRequest(violation, useSimplifiedPrompt);

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error("Gemini API request failed.");
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseJsonFix(text);
};

const runGeminiWithRetry = async (violation: AxeAuditPayload["violations"][0]) => {
  try {
    const result = await runGemini(violation, false);
    if (result?.analysis || result?.manualInstructions) {
      return result;
    }
    console.warn("Gemini retry", { type: "invalid-response", attempt: 1, violationId: violation.id });
  } catch (error) {
    console.warn("Gemini retry", { type: "request-failed", attempt: 1, violationId: violation.id });
  }

  try {
    const result = await runGemini(violation, true);
    if (result?.analysis || result?.manualInstructions) {
      return result;
    }
    console.warn("Gemini retry", { type: "invalid-response", attempt: 2, violationId: violation.id });
  } catch (error) {
    console.warn("Gemini retry", { type: "request-failed", attempt: 2, violationId: violation.id });
  }

  return null;
};

const createFixShell = (violation: AxeAuditPayload["violations"][0]): GeminiFix => {
  const node = violation.nodes[0];
  const selector = node?.target?.[0] ?? "unknown";
  const htmlSnippet = node?.html ?? "";
  const imageSrc = extractImageSrc(htmlSnippet);
  return {
    violationId: violation.id,
    selector,
    htmlSnippet,
    imageSrc,
    analysis: "",
    fixedCode: "",
    optimalPrompt: "",
    progress: "pending"
  };
};


const normalizeFix = (
  violation: AxeAuditPayload["violations"][0] | null,
  jsonFix: ReturnType<typeof parseJsonFix> | null
): GeminiFix => {
  const selector = violation ? violation.nodes[0]?.target?.[0] ?? "unknown" : "structural";
  const htmlSnippet = violation ? violation.nodes[0]?.html ?? "" : "";
  const imageSrc = violation ? extractImageSrc(htmlSnippet) : undefined;
  const violationId = violation ? violation.id : "structural";
  const fallback = jsonFix?.manualInstructions ?? jsonFix?.analysis ?? `Review violation ${violationId}.`;
  return {
    violationId,
    selector,
    htmlSnippet,
    imageSrc,
    analysis: jsonFix?.analysis ?? fallback,
    fixedCode: jsonFix?.fixedCode ?? fallback,
    optimalPrompt: jsonFix?.optimalPrompt ?? fallback,
    progress: jsonFix ? "complete" : "error",
    manualInstructions: jsonFix?.manualInstructions,
    error: jsonFix ? undefined : "Missing JSON response"
  };
};

const runGeminiForViolations = async (payload: AxeAuditPayload, onUpdate: (fix: GeminiFix) => void) => {
  for (const violation of payload.violations) {
    try {
      const jsonFix = await runGeminiWithRetry(violation);
      onUpdate(normalizeFix(violation, jsonFix));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const fix = normalizeFix(violation, null);
      onUpdate({
        ...fix,
        progress: "error",
        error: message
      });
    }

    await wait(1500);
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "RUN_AUDIT") {
    return;
  }

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("No active tab found.");
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "RUN_AXE"
      });

      if (!response?.success) {
        throw new Error(response?.error ?? "Axe audit failed.");
      }

      const payload = response.data as AxeAuditPayload;
      const fixes = payload.violations.map((violation) => createFixShell(violation));

      sendResponse({
        success: true,
        data: {
          url: payload.url,
          fixes
        }
      });

      await runGeminiForViolations(payload, (fix) => {
        chrome.runtime.sendMessage({
          type: "AUDIT_PROGRESS",
          data: {
            url: payload.url,
            fix
          }
        });
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown error";
      sendResponse({
        success: false,
        error: messageText
      });
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "RUN_SINGLE_VIOLATION") {
    return;
  }

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("No active tab found.");
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "RUN_AXE"
      });

      if (!response?.success) {
        throw new Error(response?.error ?? "Axe audit failed.");
      }

      const payload = response.data as AxeAuditPayload;
      const violation = payload.violations.find((item) => item.id === message.violationId);
      if (!violation) {
        throw new Error("Violation not found.");
      }

      const jsonFix = await runGeminiWithRetry(violation);
      const fix = normalizeFix(violation, jsonFix);

      chrome.runtime.sendMessage({
        type: "AUDIT_PROGRESS",
        data: {
          url: payload.url,
          fix
        }
      });

      sendResponse({
        success: true
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown error";
      sendResponse({
        success: false,
        error: messageText
      });
    }
  })();

  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "HIGHLIGHT_NODE") {
    return;
  }

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error("No active tab found.");
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "HIGHLIGHT_NODE",
        selector: message.selector
      });

      sendResponse({
        success: response?.success ?? false,
        error: response?.error
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown error";
      sendResponse({
        success: false,
        error: messageText
      });
    }
  })();

  return true;
});
