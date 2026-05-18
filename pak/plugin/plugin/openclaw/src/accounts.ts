import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { resolveMergedAccountConfig } from "openclaw/plugin-sdk/account-resolution";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import type {
  ClawbotHubAccountConfig,
  CoreConfig,
  ResolvedClawbotHubAccount,
} from "./types.js";

const DEFAULT_POLL_TIMEOUT_MS = 1_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

const {
  listAccountIds: listClawbotHubAccountIds,
  resolveDefaultAccountId: resolveDefaultClawbotHubAccountId,
} = createAccountListHelpers("clawbot-hub", { normalizeAccountId });

export { listClawbotHubAccountIds, resolveDefaultClawbotHubAccountId };

function resolveMergedClawbotHubAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): ClawbotHubAccountConfig {
  return resolveMergedAccountConfig<ClawbotHubAccountConfig>({
    channelConfig: cfg.channels?.["clawbot-hub"] as ClawbotHubAccountConfig | undefined,
    accounts: cfg.channels?.["clawbot-hub"]?.accounts,
    accountId,
    omitKeys: ["defaultAccount"],
    normalizeAccountId,
  });
}

export function resolveClawbotHubAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedClawbotHubAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = resolveMergedClawbotHubAccountConfig(params.cfg, accountId);
  const baseEnabled = params.cfg.channels?.["clawbot-hub"]?.enabled !== false;
  const enabled = baseEnabled && merged.enabled !== false;
  const baseUrl = (merged.baseUrl?.trim() || process.env.CLAWBOT_HUB_BASE_URL?.trim() || "");
  const appId = merged.appId?.trim() || process.env.CLAWBOT_HUB_APP_ID?.trim() || "";
  const appSecret = merged.appSecret?.trim() || process.env.CLAWBOT_HUB_APP_SECRET?.trim() || "";
  const hubAccountId = merged.accountId?.trim() || (appId ? `clawbot-hub-${appId}` : accountId);
  const openclawInstanceId = merged.openclawInstanceId?.trim() || `openclaw-${accountId}`;

  return {
    accountId,
    enabled,
    configured: Boolean(baseUrl && appId && appSecret),
    name: normalizeOptionalString(merged.name),
    baseUrl,
    appId,
    appSecret,
    hubAccountId,
    openclawInstanceId,
    pollTimeoutMs: merged.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS,
    heartbeatIntervalMs: merged.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    config: {
      ...merged,
      allowFrom: merged.allowFrom ?? ["*"],
    },
  };
}

export { DEFAULT_ACCOUNT_ID };
export type { ResolvedClawbotHubAccount } from "./types.js";
