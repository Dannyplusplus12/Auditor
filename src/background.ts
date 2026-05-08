import type { AxeAuditPayload, GeminiFix, GeminiResponse } from "./types";
import { getSettings } from "./storage";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const extractImageSrc = (htmlSnippet: string) => htmlSnippet.match(/src=["']([^"']+)["']/i)?.[1];

const buildPrompt = (payload: AxeAuditPayload) => {
  const violationsText = payload.violations
    .map((violation, index) => {
      const nodeText = violation.nodes
        .map((node) => {
          const selector = node.target?.[0] ?? "unknown";
          const html = node.html ?? "";
          return `- Selector: ${selector}\n  HTML: ${html}\n  Summary: ${node.failureSummary ?? ""}`;
        })
        .join("\n");
      return `${index + 1}. ${violation.id} - ${violation.description}\n${nodeText}`;
    })
    .join("\n\n");

  return `You are an accessibility engineer. For each violation listed, analyze the issue, provide a corrected HTML/CSS snippet, and craft the optimal prompt a developer could use to reproduce the fix. Respond with a JSON array where each item contains: violationId, analysis, fixedCode, optimalPrompt.\n\nViolations:\n${violationsText}`;
};

const generateGeminiRequest = async (payload: AxeAuditPayload) => {
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error("Missing Gemini API key. Add it in Settings.");
  }

  return {
    apiKey: settings.apiKey,
    body: {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildPrompt(payload)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    }
  };
};

const parseJsonFixes = (text: string): Array<{
  violationId: string;
  analysis: string;
  fixedCode: string;
  optimalPrompt: string;
}> => {
  try {
    // Gemini can wrap JSON in markdown or narrative text, so we extract the first array block.
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) {
      return [];
    }
    const jsonText = text.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return parsed as Array<{
        violationId: string;
        analysis: string;
        fixedCode: string;
        optimalPrompt: string;
      }>;
    }
  } catch (error) {
    console.warn("Failed to parse Gemini JSON output", error);
  }

  return [];
};

const parseGeminiResponse = (text: string, payload: AxeAuditPayload): GeminiResponse => {
  const jsonFixes = parseJsonFixes(text);
  const fixes: GeminiFix[] = payload.violations.map((violation) => {
    const node = violation.nodes[0];
    const selector = node?.target?.[0] ?? "unknown";
    const htmlSnippet = node?.html ?? "";
    const imageSrc = extractImageSrc(htmlSnippet);
    const jsonFix = jsonFixes.find((fix) => fix.violationId === violation.id);

    return {
      violationId: violation.id,
      selector,
      htmlSnippet,
      imageSrc,
      analysis: jsonFix?.analysis ?? `Review violation ${violation.id}.`,
      fixedCode: jsonFix?.fixedCode ?? "Gemini did not return a fix.",
      optimalPrompt: jsonFix?.optimalPrompt ?? "Gemini did not return a prompt."
    };
  });

  return {
    url: payload.url,
    fixes
  };
};

const runGemini = async (payload: AxeAuditPayload): Promise<GeminiResponse> => {
  const { apiKey, body } = await generateGeminiRequest(payload);

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
  return parseGeminiResponse(text, payload);
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

      const geminiResponse = await runGemini(response.data as AxeAuditPayload);
      sendResponse({
        success: true,
        data: geminiResponse
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
