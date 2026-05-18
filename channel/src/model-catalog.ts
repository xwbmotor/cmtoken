import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { HubModelCatalog } from "./types.js";

type RecordLike = Record<string, unknown>;

function pickRecord(value: unknown): RecordLike | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as RecordLike;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function collectModelItems(rawModels: unknown): Array<{ id: string; name?: string }> {
  if (!Array.isArray(rawModels)) {
    return [];
  }
  const seen = new Set<string>();
  const models: Array<{ id: string; name?: string }> = [];
  for (const item of rawModels) {
    if (typeof item === "string") {
      const id = asNonEmptyString(item);
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      models.push({ id });
      continue;
    }
    const model = pickRecord(item);
    if (!model) {
      continue;
    }
    const id = asNonEmptyString(model.id) ?? asNonEmptyString(model.model) ?? asNonEmptyString(model.name);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const name = asNonEmptyString(model.name);
    models.push(name ? { id, name } : { id });
  }
  return models;
}

export function buildHubModelCatalog(cfg: OpenClawConfig): HubModelCatalog | undefined {
  const modelsSection = pickRecord((cfg as RecordLike).models);
  const providersSection = pickRecord(modelsSection?.providers);
  if (!providersSection) {
    return undefined;
  }

  const providers = Object.entries(providersSection)
    .map(([providerId, providerValue]) => {
      const id = asNonEmptyString(providerId);
      if (!id) {
        return null;
      }
      const provider = pickRecord(providerValue);
      const models = collectModelItems(provider?.models);
      return { id, models };
    })
    .filter((item): item is { id: string; models: Array<{ id: string; name?: string }> } => {
      return item !== null && item.models.length > 0;
    });

  if (providers.length === 0) {
    return undefined;
  }

  const agentDefaults = pickRecord(pickRecord((cfg as RecordLike).agents)?.defaults);
  const defaultModelRef = asNonEmptyString(agentDefaults?.model);
  let defaultProvider: string | undefined;
  let defaultModel: string | undefined;
  if (defaultModelRef) {
    const slashIndex = defaultModelRef.indexOf("/");
    if (slashIndex > 0 && slashIndex < defaultModelRef.length - 1) {
      defaultProvider = defaultModelRef.slice(0, slashIndex).trim();
      defaultModel = defaultModelRef.slice(slashIndex + 1).trim();
    } else if (providers.length === 1) {
      defaultProvider = providers[0].id;
      defaultModel = defaultModelRef;
    }
  }

  const catalog: HubModelCatalog = { providers };
  if (defaultProvider && defaultModel) {
    const provider = providers.find((item) => item.id === defaultProvider);
    if (provider && provider.models.some((item) => item.id === defaultModel)) {
      catalog.defaultProvider = defaultProvider;
      catalog.defaultModel = defaultModel;
    }
  }

  return catalog;
}

