import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import type {
  OpenClawPluginApi,
  ProviderAuthContext,
  ProviderAuthResult,
  ProviderCatalogContext,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  buildOauthProviderAuthResult,
  createProviderApiKeyAuthMethod,
} from "openclaw/plugin-sdk/provider-auth";

import { CMTOKEN_DEFAULT_MODEL_ID } from "./provider-models.js";

const PROVIDER_ID = "cmtoken";
const PROVIDER_LABEL = "CMToken";



const DEFAULT_DISCOVERY_URL = process.env.CMTOKEN_DISCOVERY_URL as string;
const DEFAULT_BASE_URL = process.env.CMTOKEN_BASE_URL as string;

const INLINED_STATIC_MODELS = [
  {
    id: "minmax",
    name: "minmax",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 192000,
    maxTokens: 8192,
  }
];

let discoveryCache: any = null;

const trace = (msg: string, start?: number) => {
  return globalThis.performance ? performance.now() : Date.now();
};

async function resolveApiCatalog(ctx: ProviderCatalogContext) {
  const config = ctx.config as any;
  const start = trace("Entering resolveApiCatalog");
  if (discoveryCache && Date.now() - discoveryCache.timestamp < 300000) {
    trace("Exiting resolveApiCatalog (Cache hit)", start);
    return discoveryCache.data;
  }
  const discoveryUrl = config.discoveryUrl || DEFAULT_DISCOVERY_URL;
  let finalModels: any[] = [];
  try {
    const { fetchCMTokenModels, CMTokenSubscriptionError, CMTokenDiscoveryError } = await import("./discovery.js");
    const auth = ctx.resolveProviderAuth(PROVIDER_ID);
    const token = auth.apiKey?.trim() || auth.discoveryApiKey?.trim() || ((ctx.config as any)?.apiKey)?.trim();
    const rawModels = await fetchCMTokenModels(discoveryUrl, 15000, token);
    if (rawModels && rawModels.length > 0) {
      finalModels = rawModels.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        reasoning: false,
        input: ["text" as const],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow || 192000,
        maxTokens: m.maxTokens || 8192,
      }));
    }
  } catch (err: any) {
    const { CMTokenSubscriptionError, CMTokenDiscoveryError } = await import("./discovery.js");
    if (err instanceof CMTokenSubscriptionError) {
      trace(`Subscription missing for CMToken: ${err.message}`);
      finalModels = [{
        id: "subscription-required",
        name: "⚠️ 订阅到期 (请检查套餐)",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 0,
        maxTokens: 0,
      }, ...INLINED_STATIC_MODELS];
    } else if (err instanceof CMTokenDiscoveryError) {
      trace(`Discovery API error (${err.status}): ${err.message}`);
      finalModels = [{
        id: "api-error",
        name: `⚠️ 服务异常 (${err.status})`,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 0,
        maxTokens: 0,
      }, ...INLINED_STATIC_MODELS];
    } else {
      trace(`Discovery error: ${err}`);
    }
  }

  const isFallback = finalModels.length === 0;
  if (isFallback) finalModels = INLINED_STATIC_MODELS.map(m => ({ ...m }));

  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const result = { provider: { baseUrl, api: "openai-completions" as const, models: finalModels } };

  // If we fall back to static models, use a very short cache (10s) to encourage retries
  const offset = isFallback ? 290000 : 0;
  discoveryCache = { data: result, timestamp: Date.now() - offset };

  trace(isFallback ? "Exiting resolveApiCatalog (Fallback used)" : "Exiting resolveApiCatalog (Success)", start);
  return result;
}

function augmentCMTokenCatalog(ctx: any): any[] {
  if (discoveryCache?.data?.provider?.models) {
    return discoveryCache.data.provider.models.map((m: any) => ({ ...m, provider: PROVIDER_ID }));
  }
  return INLINED_STATIC_MODELS.map(m => ({ ...m, provider: PROVIDER_ID }));
}

async function selectCMTokenDefaultModel(ctx: ProviderAuthContext, models: any[]): Promise<string> {
  if (models.length > 0) {
    // Always prioritize the first model from discovery to ensure 
    // it works whether the ID is 'minmax', 'minmaxA', etc.
    return models[0].id;
  }

  return CMTOKEN_DEFAULT_MODEL_ID;
}

async function runCMTokenOAuth(ctx: ProviderAuthContext): Promise<ProviderAuthResult> {
  const progress = ctx.prompter.progress(`正在启动 CMToken OAuth…`);
  try {
    const { loginCMTokenOAuth } = await import("./oauth.runtime.js");
    const config = ctx.config as any;
    const result = await loginCMTokenOAuth({
      openUrl: ctx.openUrl,
      note: ctx.prompter.note,
      progress,
      runtime: (ctx as any).runtime,
      config: {
        oauthBaseUrl: config.oauthBaseUrl,
        clientId: config.clientId,
      }
    });
    progress.stop("CMToken OAuth 完成");

    // Model Discovery & Selection
    const discoveryUrl = config.discoveryUrl || DEFAULT_DISCOVERY_URL;
    const { fetchCMTokenModels, CMTokenSubscriptionError, CMTokenDiscoveryError } = await import("./discovery.js");
    let rawModels: any[] = [];
    try {
      rawModels = await fetchCMTokenModels(discoveryUrl, 15000, result.access);
    } catch (err) {
      if (err instanceof CMTokenSubscriptionError) {
        ctx.prompter.note({
          title: "CMToken 订阅提醒",
          body: `您的账号认证成功，但当前未包含可用订阅套餐。部分模型（如 minmax）可能无法使用，请检查您的套餐状态。\n\n错误详情: ${err.message}`,
          severity: "warning"
        });
      } else if (err instanceof CMTokenDiscoveryError) {
        ctx.prompter.note({
          title: "CMToken 服务提醒",
          body: `模型列表获取失败 (状态码: ${err.status})。这可能是由于网络波动或服务端暂时不可用引起的，我们将使用内置备用模型。\n\n详情: ${err.message}`,
          severity: "info"
        });
      } else {
        throw err;
      }
    }

    const models = rawModels.map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      reasoning: false,
      input: ["text" as const],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 192000,
      maxTokens: m.maxTokens || 8192,
    }));

    const primaryModelId = await selectCMTokenDefaultModel(ctx, models);

    // Update discoveryCache immediately
    discoveryCache = {
      timestamp: Date.now(),
      data: {
        provider: {
          baseUrl: result.resourceUrl || config.baseUrl || DEFAULT_BASE_URL,
          api: "openai-completions" as const,
          models: models.length > 0 ? models : INLINED_STATIC_MODELS
        }
      }
    };

    return buildOauthProviderAuthResult({
      providerId: PROVIDER_ID, defaultModel: `${PROVIDER_ID}/${primaryModelId}`,
      access: result.access, refresh: result.refresh, expires: result.expires,
      configPatch: {
        models: {
          providers: {
            [PROVIDER_ID]: { baseUrl: result.resourceUrl || config.baseUrl || DEFAULT_BASE_URL, api: "openai-completions" as const, models }
          }
        },
      } as any,
    });
  } catch (err) {
    if (err.name === "CMTokenSubscriptionError") {
      progress.stop("CMToken OAuth 完成 (发现订阅问题)");
      // The result variable is not in scope here if loginCMTokenOAuth threw,
      // but here it threw in fetchCMTokenModels, so loginCMTokenOAuth already succeeded.
      // However, to keep it simple, if it's a subscription error, we already showed the note.
      // We can just throw a modified error that core handles or just return success if we have the data.
    }
    const errorMsg = formatErrorMessage(err);
    progress.stop(`CMToken OAuth 失败: ${errorMsg}`);
    throw err;
  }
}

export function registerCMTokenProviders(api: OpenClawPluginApi) {
  // 1. Register real CMToken
  api.registerProvider({
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    docsPath: "/plugins/cmtoken",
    auth: [
      {
        id: "api-key",
        label: "CMToken API Key",
        hint: "使用 API Key 进行认证",
        kind: "api_key",
        wizard: {
          choiceId: "cmtoken-api-key",
          choiceLabel: "CMToken API Key",
          groupId: PROVIDER_ID,
          groupLabel: PROVIDER_LABEL,
          groupHint: "CMToken AI 模型",
        },
        async run(ctx) {
          const {
            ensureApiKeyFromOptionEnvOrPrompt,
            buildApiKeyCredential,
            normalizeApiKeyInput,
            validateApiKeyInput
          } = await import("openclaw/plugin-sdk/provider-auth");

          let capturedSecretInput: any;
          let capturedMode: any;

          await ensureApiKeyFromOptionEnvOrPrompt({
            config: ctx.config,
            env: {},
            provider: PROVIDER_ID,
            envLabel: "CMTOKEN_API_KEY",
            promptMessage: "请输入 CMToken API Key",
            normalize: normalizeApiKeyInput,
            validate: validateApiKeyInput,
            prompter: ctx.prompter,
            setCredential: async (apiKey, mode) => {
              capturedSecretInput = apiKey;
              capturedMode = mode;
            },
          });

          const profileId = `${PROVIDER_ID}:default`;
          const credential = buildApiKeyCredential(PROVIDER_ID, capturedSecretInput, {}, {
            secretInputMode: capturedMode,
            config: ctx.config
          });

          // Model Discovery & Selection
          const config = ctx.config as any;
          const discoveryUrl = config.discoveryUrl || DEFAULT_DISCOVERY_URL;
          const { fetchCMTokenModels } = await import("./discovery.js");
          const rawModels = await fetchCMTokenModels(discoveryUrl, 15000, capturedSecretInput);
          const models = rawModels.map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            reasoning: false,
            input: ["text" as const],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: m.contextWindow || 192000,
            maxTokens: m.maxTokens || 8192,
          }));

          const primaryModelId = await selectCMTokenDefaultModel(ctx, models);

          return {
            profiles: [{ profileId, credential }],
            defaultModel: `${PROVIDER_ID}/${primaryModelId}`,
            configPatch: {
              models: {
                providers: {
                  [PROVIDER_ID]: { baseUrl: config.baseUrl || DEFAULT_BASE_URL, api: "openai-completions" as const, models }
                }
              },
            } as any,
          };
        }
      } as any,
      {
        id: "oauth",
        label: "CMToken OAuth",
        hint: "通过移动认证浏览器流登录",
        kind: "device_code",
        run: runCMTokenOAuth,
        applyConfig: (cfg: any) => ({
          ...cfg,
          models: {
            ...cfg.models,
            providers: {
              ...cfg.models?.providers,
              [PROVIDER_ID]: { baseUrl: DEFAULT_BASE_URL, api: "openai-completions", models: INLINED_STATIC_MODELS }
            }
          },
          // We no longer manually touch cfg.agents.defaults.models here to prevent overwrites.
        }),
        wizard: {
          choiceId: "cmtoken-oauth",
          choiceLabel: "CMToken OAuth",
          groupId: PROVIDER_ID,
          groupLabel: PROVIDER_LABEL,
          groupHint: "CMToken AI 模型",
        },
      } as any,
    ],
    catalog: { order: "simple", run: async (ctx) => resolveApiCatalog(ctx) },
    augmentModelCatalog: (ctx) => augmentCMTokenCatalog(ctx),
    async refreshOAuth(cred) {
      const { refreshCMTokenToken } = await import("./oauth.js");
      // Use defaults if config is not easily accessible here; 
      // but usually the plugin can access its own config if needed.
      try {
        const result = await refreshCMTokenToken({ refreshToken: cred.refresh });
        // Invalidate discovery cache so the next catalog call picks up potentially new subscription status
        discoveryCache = null;
        return {
          ...cred,
          access: result.access,
          refresh: result.refresh,
          expires: result.expires,
        };
      } catch (err) {
        console.error(`[CMToken] refreshOAuth failed:`, err);
        throw err;
      }
    },
    classifyFailoverReason(ctx) {
      const errorMsg = ctx.error?.message || String(ctx.error);
      if (errorMsg.includes("订阅套餐") || errorMsg.includes("订阅已过期") || errorMsg.includes("余额不足")) {
        return "billing";
      }
      return undefined;
    },
  });
}
