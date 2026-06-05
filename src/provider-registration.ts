import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import type {
  OpenClawPluginApi,
  ProviderAuthContext,
  ProviderAuthResult,
  ProviderCatalogContext,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  buildOauthProviderAuthResult,
} from "openclaw/plugin-sdk/provider-auth";


const PROVIDER_ID = "cmtoken";
const PROVIDER_LABEL = "CMToken";

declare const __CMTOKEN_DISCOVERY_URL__: string;
declare const __CMTOKEN_BASE_URL__: string;

const DEFAULT_DISCOVERY_URL = __CMTOKEN_DISCOVERY_URL__;
const DEFAULT_BASE_URL = __CMTOKEN_BASE_URL__;

const INLINED_STATIC_MODELS: any[] = [];

// Mutable wizard config objects. After run() fetches models, we inject allowedKeys
// into modelAllowlist so OpenClaw's promptModelAllowlist takes the fast path
// (skipping the slow global catalog load / "Loading available models" spinner).
const CMTOKEN_WIZARD_SETUP: any = {
  expectedProviders: [PROVIDER_ID],
  modelAllowlist: {
    loadCatalog: false,
  },
};

const CMTOKEN_API_KEY_WIZARD_CONFIG: any = {
  choiceId: "cmtoken-api-key",
  choiceLabel: "CMToken API Key",
  groupId: PROVIDER_ID,
  groupLabel: PROVIDER_LABEL,
  groupHint: "CMToken AI 模型",
  setup: CMTOKEN_WIZARD_SETUP,
  // Also put modelAllowlist at root for older OpenClaw versions that read method.wizard.modelAllowlist
  modelAllowlist: {
    loadCatalog: false,
  },
};

const CMTOKEN_OAUTH_WIZARD_CONFIG: any = {
  choiceId: "cmtoken-oauth",
  choiceLabel: "CMToken OAuth",
  groupId: PROVIDER_ID,
  groupLabel: PROVIDER_LABEL,
  groupHint: "CMToken AI 模型",
  setup: CMTOKEN_WIZARD_SETUP,
  modelAllowlist: {
    loadCatalog: false,
  },
};

/** Inject dynamic model keys into all wizard config objects so OpenClaw skips catalog loading */
function injectWizardAllowedKeys(keys: string[]) {
  CMTOKEN_WIZARD_SETUP.modelAllowlist = {
    loadCatalog: false,
    allowedKeys: keys,
  };
  CMTOKEN_API_KEY_WIZARD_CONFIG.modelAllowlist = {
    loadCatalog: false,
    allowedKeys: keys,
  };
  CMTOKEN_OAUTH_WIZARD_CONFIG.modelAllowlist = {
    loadCatalog: false,
    allowedKeys: keys,
  };
}

async function resolveApiCatalog(ctx: ProviderCatalogContext) {
  const config = ctx.config as any;

  // FAST PATH: Use models already saved in config (from OAuth/API Key setup) to avoid slow duplicate fetch on startup
  const providerModels = config.models?.providers?.[PROVIDER_ID]?.models;
  if (providerModels && Array.isArray(providerModels) && providerModels.length > 0) {
    return { provider: { baseUrl: config.baseUrl || DEFAULT_BASE_URL, api: "openai-completions" as const, models: providerModels } };
  }

  // STATIC FALLBACK: Do not perform network requests during provider discovery to prevent blocking the OpenClaw CLI for up to 4 minutes on Windows.
  // The real models will be fetched and saved during the 'configure' setup flow.
  return { provider: { baseUrl: config.baseUrl || DEFAULT_BASE_URL, api: "openai-completions" as const, models: INLINED_STATIC_MODELS.map(m => ({ ...m })) } };
}

function augmentCMTokenCatalog(ctx: any): any[] {
  return INLINED_STATIC_MODELS.map(m => ({ ...m, provider: PROVIDER_ID }));
}

async function selectCMTokenDefaultModel(ctx: ProviderAuthContext, models: any[]): Promise<string | undefined> {
  if (models.length > 0) {
    let currentDefault = "无";
    const cfgModel = (ctx.config as any)?.agents?.defaults?.model;
    if (typeof cfgModel === "string") {
      currentDefault = cfgModel;
    } else if (cfgModel && typeof cfgModel === "object" && cfgModel.primary) {
      currentDefault = cfgModel.primary;
    } else if (cfgModel && typeof cfgModel === "object" && cfgModel.model) {
      currentDefault = `${cfgModel.provider || "unknown"}/${cfgModel.model}`;
    }

    let isCurrentModelValid = true;
    if (currentDefault !== "无") {
      if (currentDefault.startsWith(`${PROVIDER_ID}/`)) {
        const modelIdOnly = currentDefault.replace(`${PROVIDER_ID}/`, '');
        isCurrentModelValid = models.some(m => m.id === modelIdOnly);
      } else {
        isCurrentModelValid = true;
      }
    }

    const options: any[] = [];
    if (currentDefault !== "无") {
      if (isCurrentModelValid) {
        options.push({ value: "skip", label: `保持原有默认模型 (Keep current default: ${currentDefault})` });
      } else {
        options.push({ value: "skip", label: `保持原有默认模型 (⚠️已失效/无权限: ${currentDefault})` });
      }
    }
    options.push(...models.map(m => ({ value: `${PROVIDER_ID}/${m.id}`, label: m.name || m.id })));

    const selected = await ctx.prompter.select({
      message: "请选择默认使用哪个模型？(Select Default Model)",
      options,
      initialValue: currentDefault !== "无" ? "skip" : options[0]?.value,
    });
    if (selected === "skip") {
      return currentDefault !== "无" ? currentDefault : undefined;
    }
    if (typeof selected === "string") {
      return selected;
    }
  }

  return undefined;
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

    const discoveryUrl = config.discoveryUrl || DEFAULT_DISCOVERY_URL;
    const { fetchCMTokenModels, CMTokenSubscriptionError, CMTokenDiscoveryError } = await import("./discovery.js");
    let rawModels: any[] = [];
    try {
      rawModels = await fetchCMTokenModels(discoveryUrl, 15000, result.access);
    } catch (err) {
      if (err instanceof CMTokenSubscriptionError) {
        throw err;
      } else if (err instanceof CMTokenDiscoveryError) {
        throw new Error(`模型列表获取失败 (状态码: ${err.status})。这可能是由于网络波动或服务端暂时不可用引起的，配置流程已中断。\n\n详情: ${err.message}`);
      }
      throw err;
    }

    const finalModels = (rawModels || []).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      reasoning: false,
      input: ["text" as const],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 192000,
      maxTokens: m.maxTokens || 8192,
    }));

    if (finalModels && finalModels.length > 0) {
      dynamicModelAllowlist = finalModels.map((m: any) => m.id.includes('/') ? m.id : `${PROVIDER_ID}/${m.id}`);
      injectWizardAllowedKeys(dynamicModelAllowlist);
    }

    const primaryModelId = await selectCMTokenDefaultModel(ctx, finalModels);

    return {
      profiles: [{
        profileId: `${PROVIDER_ID}:default`,
        credential: {
          provider: PROVIDER_ID,
          type: "oauth",
          access: result.access,
          refresh: result.refresh,
          expires: result.expires,
        } as any,
      }],
      configPatch: {
        models: {
          providers: {
            [PROVIDER_ID]: { baseUrl: result.resourceUrl || config.baseUrl || DEFAULT_BASE_URL, api: "openai-completions" as const, models: finalModels }
          }
        },
        ...(primaryModelId ? {
          agents: {
            defaults: {
              model: {
                primary: primaryModelId
              }
            }
          }
        } : {})
      } as any,
      replaceDefaultModels: !!primaryModelId,
    };
  } catch (err: any) {
    const errorMsg = formatErrorMessage(err);
    progress.stop(`CMToken OAuth 失败: ${errorMsg}`);
    throw err;
  }
}

// Module-level cache to store dynamically fetched models during the run() phase.
// OpenClaw evaluates the plugin registry again after run() completes, so this
// will inject the precise dynamic models into the wizard bypass.
let dynamicModelAllowlist: string[] | undefined = undefined;

export function registerCMTokenProviders(api: OpenClawPluginApi) {
  const allowedKeys = dynamicModelAllowlist;

  api.registerProvider({
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    docsPath: "/plugins/cmtoken",
    wizard: {
      setup: CMTOKEN_WIZARD_SETUP,
    },
    auth: [
      {
        id: "api-key",
        label: "CMToken API Key",
        hint: "使用 API Key 进行认证",
        kind: "api_key",
        wizard: CMTOKEN_API_KEY_WIZARD_CONFIG,
        async run(ctx: any) {
          const {
            ensureApiKeyFromOptionEnvOrPrompt,
            buildApiKeyCredential,
            normalizeApiKeyInput,
            validateApiKeyInput
          } = await import("openclaw/plugin-sdk/provider-auth");

          let capturedSecretInput: any;
          let capturedMode: any;

          await (ensureApiKeyFromOptionEnvOrPrompt as any)({
            token: ctx.opts?.token,
            tokenProvider: ctx.opts?.tokenProvider,
            secretInputMode: ctx.allowSecretRefPrompt === false ? (ctx.secretInputMode ?? "plaintext") : ctx.secretInputMode,
            config: ctx.config,
            env: ctx.env,
            expectedProviders: [PROVIDER_ID],
            provider: PROVIDER_ID,
            promptMessage: "请输入 CMToken API Key",
            normalize: normalizeApiKeyInput,
            validate: validateApiKeyInput,
            prompter: ctx.prompter,
            setCredential: async (apiKey: string, mode: any) => {
              capturedSecretInput = apiKey;
              capturedMode = mode;
            },
          });

          const profileId = `${PROVIDER_ID}:default`;
          const credential = buildApiKeyCredential(PROVIDER_ID, capturedSecretInput, {}, {
            secretInputMode: capturedMode,
            config: ctx.config
          });

          const config = ctx.config as any;
          const discoveryUrl = config.discoveryUrl || DEFAULT_DISCOVERY_URL;
            let finalModels: any[] = [];
            try {
              const { fetchCMTokenModels } = await import("./discovery.js");
              const rawModels = await fetchCMTokenModels(discoveryUrl, 15000, capturedSecretInput);
              finalModels = (rawModels || []).map((m: any) => ({
                id: m.id,
                name: m.name || m.id,
                reasoning: false,
                input: ["text" as const],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: m.contextWindow || 192000,
                maxTokens: m.maxTokens || 8192,
              }));
              
              if (finalModels && finalModels.length > 0) {
                dynamicModelAllowlist = finalModels.map((m: any) => `${PROVIDER_ID}/${m.id}`);
                injectWizardAllowedKeys(dynamicModelAllowlist);
              }
            } catch (discoveryErr: any) {
              if (discoveryErr instanceof Error) {
                throw discoveryErr;
              }
              throw new Error(`模型列表获取失败。配置流程已中断。`);
            }

            const primaryModelId = await selectCMTokenDefaultModel(ctx, finalModels);

          // No longer caching dynamically here.

          return {
            configPatch: {
              models: {
                providers: {
                  [PROVIDER_ID]: { baseUrl: config.baseUrl || DEFAULT_BASE_URL, api: "openai-completions" as const, models: finalModels }
                }
              },
              ...(primaryModelId ? {
                agents: {
                  defaults: {
                    model: {
                      primary: primaryModelId
                    }
                  }
                }
              } : {})
            } as any,
            profiles: [
              { profileId, credential }
            ],
            replaceDefaultModels: !!primaryModelId,
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
        wizard: CMTOKEN_OAUTH_WIZARD_CONFIG,
      } as any,
    ],
    catalog: { order: "simple", run: async (ctx: any) => resolveApiCatalog(ctx) },
    augmentModelCatalog: (ctx: any) => augmentCMTokenCatalog(ctx),
    async refreshOAuth(cred: any) {
      const { refreshCMTokenToken } = await import("./oauth.js");
      // Use defaults if config is not easily accessible here; 
      // but usually the plugin can access its own config if needed.
      try {
        const result = await refreshCMTokenToken({ refreshToken: cred.refresh });
        // Invalidate discovery cache logic removed
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
    classifyFailoverReason(ctx: any) {
      const errorMsg = ctx.error?.message || String(ctx.error);
      if (errorMsg.includes("订阅套餐") || errorMsg.includes("订阅已过期") || errorMsg.includes("余额不足")) {
        return "billing";
      }
      return undefined;
    },
  });
}
