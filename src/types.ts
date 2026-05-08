export type AxeViolationNode = {
  html: string;
  target: string[];
  failureSummary?: string;
  computedStyles?: {
    color?: string;
    backgroundColor?: string;
    fontSize?: string;
    fontWeight?: string;
    lineHeight?: string;
  };
};

export type AxeViolation = {
  id: string;
  impact?: string;
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeViolationNode[];
};

export type AxeAuditPayload = {
  url: string;
  violations: AxeViolation[];
};

export type GeminiFix = {
  violationId: string;
  selector: string;
  htmlSnippet: string;
  imageSrc?: string;
  analysis: string;
  fixedCode: string;
  optimalPrompt: string;
  progress?: "pending" | "complete" | "error";
  manualInstructions?: string;
  error?: string;
};

export type GeminiResponse = {
  url: string;
  fixes: GeminiFix[];
};

export type SettingsState = {
  apiKey: string;
  language: "vi" | "en";
};

export type StoredResults = {
  url: string;
  fixes: GeminiFix[];
};

export type PopupState = {
  isLoading: boolean;
  error?: string;
  response?: GeminiResponse;
  apiKey?: string;
  language?: "vi" | "en";
  isSettingsOpen?: boolean;
};
