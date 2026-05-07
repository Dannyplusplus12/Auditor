import axe from "axe-core";
import type { AxeAuditPayload, AxeViolation } from "./types";

const extractViolations = (results: axe.AxeResults, url: string): AxeAuditPayload => {
  const violations: AxeViolation[] = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? undefined,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => ({
      html: node.html,
      target: node.target,
      failureSummary: node.failureSummary ?? undefined
    }))
  }));

  return {
    url,
    violations
  };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "RUN_AXE") {
    return;
  }

  (async () => {
    try {
      const results = await axe.run();
      const payload = extractViolations(results, window.location.href);
      sendResponse({
        success: true,
        data: payload
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
