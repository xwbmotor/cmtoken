import {
  buildChannelOutboundSessionRoute,
  createChatChannelPlugin,
} from "openclaw/plugin-sdk/channel-core";
import { getChatChannelMeta } from "openclaw/plugin-sdk/channel-plugin-common";
import {
  DEFAULT_ACCOUNT_ID,
  listTukenAccountIds,
  resolveTukenAccount,
  resolveDefaultTukenAccountId,
} from "./accounts.js";
import { tukenPluginConfigSchema } from "./config-schema.js";
import { startTukenGatewayAccount } from "./gateway.js";
import { sendTukenText } from "./outbound.js";
import { normalizeTukenTarget, parseTukenTarget } from "./target.js";
import type { ChannelPlugin } from "./runtime-api.js";
import { applyTukenSetup } from "./setup.js";
import { tukenStatus } from "./status.js";
import type { CoreConfig, ResolvedTukenAccount } from "./types.js";

const CHANNEL_ID = "tuken" as const;
const meta = {
  ...getChatChannelMeta(CHANNEL_ID),
  label: "Tuken",
};

export const tukenPlugin: ChannelPlugin<ResolvedTukenAccount> = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta,
    capabilities: {
      chatTypes: ["direct"],
    },
    reload: { configPrefixes: ["channels.tuken"] },
    configSchema: tukenPluginConfigSchema,
    setup: {
      applyAccountConfig: ({ cfg, accountId, input }) =>
        applyTukenSetup({
          cfg,
          accountId,
          input: input as Record<string, unknown>,
        }),
    },
    config: {
      listAccountIds: (cfg) => listTukenAccountIds(cfg as CoreConfig),
      resolveAccount: (cfg, accountId) =>
        resolveTukenAccount({ cfg: cfg as CoreConfig, accountId }),
      defaultAccountId: (cfg) => resolveDefaultTukenAccountId(cfg as CoreConfig),
      isConfigured: (account) => account.configured,
      resolveAllowFrom: ({ cfg, accountId }) =>
        resolveTukenAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom,
      resolveDefaultTo: ({ cfg, accountId }) =>
        resolveTukenAccount({ cfg: cfg as CoreConfig, accountId }).config.defaultTo,
    },
    messaging: {
      normalizeTarget: normalizeTukenTarget,
      parseExplicitTarget: ({ raw }) => {
        const parsed = parseTukenTarget(raw);
        return {
          to: normalizeTukenTarget(parsed.conversationId)!,
          chatType: "direct",
        };
      },
      inferTargetChatType: () => "direct",
      targetResolver: {
        looksLikeId: (raw) => raw.trim().length > 0,
        hint: "<conversationId|conversation:conversationId>",
      },
      resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target }) => {
        const parsed = parseTukenTarget(target);
        const to = normalizeTukenTarget(parsed.conversationId)!;
        return buildChannelOutboundSessionRoute({
          cfg,
          agentId,
          channel: CHANNEL_ID,
          accountId,
          peer: {
            kind: "direct",
            id: to,
          },
          chatType: "direct",
          from: `tuken:${accountId ?? DEFAULT_ACCOUNT_ID}`,
          to,
        });
      },
    },
    status: tukenStatus,
    gateway: {
      startAccount: async (ctx) => {
        await startTukenGatewayAccount(CHANNEL_ID, meta.label, ctx);
      },
    },
  },
  outbound: {
    base: {
      deliveryMode: "direct",
    },
    attachedResults: {
      channel: CHANNEL_ID,
      sendText: async ({ cfg, to, text, accountId, replyToId }) =>
        await sendTukenText({
          cfg: cfg as CoreConfig,
          accountId,
          to,
          text,
          replyToId,
        }),
    },
  },
});

