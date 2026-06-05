import { type ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-onboard";

// Discovery-first policy ensures we always prefer the first model returned by the API during setup.

export const CMTOKEN_MODEL_ORDER = [] as const;

export const CMTOKEN_MODEL_CATALOG = {} as const;

export const STATIC_MODELS: ModelDefinitionConfig[] = [];

export function isCMTokenModernModelId(modelId: string): boolean {
  return !!modelId;
}
