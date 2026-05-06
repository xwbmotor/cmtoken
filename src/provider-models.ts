import { type ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-onboard";

// This is a last-resort fallback. Discovery-first policy ensures we always
// prefer the first model returned by the API during setup.
export const CMTOKEN_DEFAULT_MODEL_ID = "minmax";
export const CMTOKEN_DEFAULT_MODEL_REF = `cmtoken/${CMTOKEN_DEFAULT_MODEL_ID}`;

export const CMTOKEN_MODEL_ORDER = ["minmax"] as const;

export const CMTOKEN_MODEL_CATALOG = {
  "minmax": {
    name: "minmax",
    reasoning: false,
    contextWindow: 192000,
    maxTokens: 8192,
  },
} as const;

export const STATIC_MODELS: ModelDefinitionConfig[] = [
  {
    id: "minmax",
    name: "minmax",
    reasoning: false,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 192000,
    maxTokens: 8192,
  }
];

export function isCMTokenModernModelId(modelId: string): boolean {
  return !!modelId;
}
