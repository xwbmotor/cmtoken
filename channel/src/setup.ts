import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { DEFAULT_ACCOUNT_ID } from "./accounts.js";
import type { CoreConfig } from "./types.js";

export function applyTukenSetup(params: {
  cfg: OpenClawConfig;
  accountId: string;
  input: Record<string, unknown>;
}): OpenClawConfig {
  const nextCfg = structuredClone(params.cfg) as CoreConfig;
  const section = nextCfg.channels?.["tuken"] ?? {};
  const accounts = { ...section.accounts };
  const target =
    params.accountId === DEFAULT_ACCOUNT_ID ? { ...section } : { ...accounts[params.accountId] };

  if (typeof params.input.baseUrl === "string") {
    target.baseUrl = params.input.baseUrl;
  }
  if (typeof params.input.appId === "string") {
    target.appId = params.input.appId;
  }
  if (typeof params.input.appSecret === "string") {
    target.appSecret = params.input.appSecret;
  }
  if (typeof params.input.accountId === "string") {
    target.accountId = params.input.accountId;
  }
  if (typeof params.input.openclawInstanceId === "string") {
    target.openclawInstanceId = params.input.openclawInstanceId;
  }

  nextCfg.channels ??= {};
  if (params.accountId === DEFAULT_ACCOUNT_ID) {
    nextCfg.channels["tuken"] = {
      ...section,
      ...target,
    };
  } else {
    accounts[params.accountId] = target;
    nextCfg.channels["tuken"] = {
      ...section,
      accounts,
    };
  }
  return nextCfg as OpenClawConfig;
}

