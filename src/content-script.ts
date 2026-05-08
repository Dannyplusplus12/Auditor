import axe from "axe-core";
import type { AxeAuditPayload, AxeViolation } from "./types";

const extractComputedStyles = (selector?: string) => {
  if (!selector) {
    return undefined;
  }

  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    return undefined;
  }

  const styles = window.getComputedStyle(element);
  return {
    color: styles.color,
    backgroundColor: styles.backgroundColor,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    lineHeight: styles.lineHeight
  };
};

const extractViolations = (results: axe.AxeResults, url: string): AxeAuditPayload => {
  const violations: AxeViolation[] = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? undefined,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => {
      const selector = node.target?.[0];
      return {
        html: node.html,
        target: node.target,
        failureSummary: node.failureSummary ?? undefined,
        computedStyles: extractComputedStyles(selector)
      };
    })
  }));

  return {
    url,
    violations
  };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RUN_AXE") {
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
  }

  if (message?.type === "HIGHLIGHT_NODE") {
    try {
      const selector = message.selector as string | undefined;
      if (!selector) {
        throw new Error("Missing selector.");
      }

      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error("Element not found.");
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.setAttribute("data-a11y-ai-highlight", "true");
      element.style.outline = "3px solid #f97316";
      element.style.outlineOffset = "4px";

      setTimeout(() => {
        if (element.getAttribute("data-a11y-ai-highlight") === "true") {
          element.style.outline = "";
          element.style.outlineOffset = "";
          element.removeAttribute("data-a11y-ai-highlight");
        }
      }, 2500);

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
  }
});
