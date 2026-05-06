import type {
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "openclaw/plugin-sdk/provider-model-shared";
import {
  CMTOKEN_MODEL_CATALOG,
  CMTOKEN_MODEL_ORDER,
  CMTOKEN_DEFAULT_MODEL_ID,
} from "./provider-models.js";

export const CMTOKEN_DEFAULT_BASE_URL = "http://agent.nat300.top/api/v1/uifm-gateway/plan/v1";
export const CMTOKEN_DEFAULT_DISCOVERY_URL = "http://agent.nat300.top/api/v1/uifm-gateway/v1/models";

export function resolveCMTokenCatalogBaseUrl(): string {
  return CMTOKEN_DEFAULT_BASE_URL;
}

function buildCMTokenModel(params: {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}): ModelDefinitionConfig {
  return {
    id: params.id,
    name: params.name,
    reasoning: params.reasoning,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: params.contextWindow,
    maxTokens: params.maxTokens,
  };
}

function buildCMTokenCatalog(): ModelDefinitionConfig[] {
  return CMTOKEN_MODEL_ORDER.map((id) => {
    const model = CMTOKEN_MODEL_CATALOG[id];
    return buildCMTokenModel({
      id,
      name: model.name,
      reasoning: model.reasoning,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    });
  });
}

export function buildCMTokenProvider(): ModelProviderConfig {
  return {
    baseUrl: resolveCMTokenCatalogBaseUrl(),
    api: "openai-completions",
    models: buildCMTokenCatalog(),
  };
}

export function buildCMTokenPortalProvider(): ModelProviderConfig {
  return {
    baseUrl: resolveCMTokenCatalogBaseUrl(),
    api: "openai-completions",
    models: buildCMTokenCatalog(),
  };
}

export function modelRef(modelId: string): string {
  return `cmtoken/${modelId}`;
}

export const DEFAULT_MODEL = CMTOKEN_DEFAULT_MODEL_ID;
