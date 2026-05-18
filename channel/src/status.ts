import { DEFAULT_ACCOUNT_ID } from "./accounts.js";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "./runtime-api.js";
import type { ResolvedTukenAccount } from "./types.js";

export const tukenStatus = createComputedAccountStatusAdapter<ResolvedTukenAccount>({
  defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
  buildChannelSummary: ({ snapshot }) => ({
    baseUrl: snapshot.baseUrl ?? "[missing]",
    appId: snapshot.appId ?? "[missing]",
  }),
  resolveAccountSnapshot: ({ account }) => ({
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: account.configured,
    extra: {
      baseUrl: account.baseUrl || "[missing]",
      appId: account.appId || "[missing]",
      hubAccountId: account.hubAccountId || "[missing]",
    },
  }),
});

