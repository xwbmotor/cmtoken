import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import { resolveMergedAccountConfig } from "openclaw/plugin-sdk/account-resolution";
import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";
import type {
  TukenAccountConfig,
  CoreConfig,
  ResolvedTukenAccount,
} from "./types.js";

const DEFAULT_POLL_TIMEOUT_MS = 1_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

const {
  listAccountIds: listTukenAccountIds,
  resolveDefaultAccountId: resolveDefaultTukenAccountId,
} = createAccountListHelpers("tuken", { normalizeAccountId });

export { listTukenAccountIds, resolveDefaultTukenAccountId };

function resolveMergedTukenAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): TukenAccountConfig {
  return resolveMergedAccountConfig<TukenAccountConfig>({
    channelConfig: cfg.channels?.["tuken"] as TukenAccountConfig | undefined,
    accounts: cfg.channels?.["tuken"]?.accounts,
    accountId,
    omitKeys: ["defaultAccount"],
    normalizeAccountId,
  });
}

export function resolveTukenAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedTukenAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = resolveMergedTukenAccountConfig(params.cfg, accountId);
  const baseEnabled = params.cfg.channels?.["tuken"]?.enabled !== false;
  const enabled = baseEnabled && merged.enabled !== false;
  const baseUrl = (merged.baseUrl?.trim() || process.env.TUKEN_HUB_BASE_URL?.trim() || "");
  const appId = merged.appId?.trim() || process.env.TUKEN_HUB_APP_ID?.trim() || "";
  const appSecret = merged.appSecret?.trim() || process.env.TUKEN_HUB_APP_SECRET?.trim() || "";
  const hubAccountId = merged.accountId?.trim() || (appId ? `tuken-${appId}` : accountId);
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
export type { ResolvedTukenAccount } from "./types.js";

