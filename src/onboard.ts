import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { applyOnboardAuthAgentModelsAndProviders } from "openclaw/plugin-sdk/provider-onboard";

const PROVIDER_ID = "cmtoken";

export function applyCMTokenConfig(
  cfg: OpenClawConfig,
  params: { baseUrl: string; models: any[] },
): OpenClawConfig {
  const { baseUrl, models } = params;

  // 1. Prepare providers map
  const providers = {
    ...cfg.models?.providers,
    [PROVIDER_ID]: {
      ...cfg.models?.providers?.[PROVIDER_ID],
      baseUrl,
      api: "openai-completions" as const,
      models,
    },
  };

  // 2. Prepare agent models map
  // We spread the existing config to preserve other models like ollama or deepseek.
  const agentModels = { ...cfg.agents?.defaults?.models } as any;

  for (const model of models) {
    const modelRef = `${PROVIDER_ID}/${model.id}`;
    agentModels[modelRef] = {
      ...agentModels[modelRef],
      alias: agentModels[modelRef]?.alias ?? (model.name || model.id),
    };
  }

  // 3. Finalize and apply
  // Since we are using the 'expectedProviders' contract in registration,
  // the core picker will return standard IDs (like 'ollama/gemma3').
  // These are already in the agentModels spread above, so no special logic is needed.
  return applyOnboardAuthAgentModelsAndProviders(cfg, {
    agentModels,
    providers,
  });
}
