import {
  buildChannelOutboundSessionRoute,
  createChatChannelPlugin,
} from "openclaw/plugin-sdk/channel-core";
import { getChatChannelMeta } from "openclaw/plugin-sdk/channel-plugin-common";
import {
  DEFAULT_ACCOUNT_ID,
  listClawbotHubAccountIds,
  resolveClawbotHubAccount,
  resolveDefaultClawbotHubAccountId,
} from "./accounts.js";
import { clawbotHubPluginConfigSchema } from "./config-schema.js";
import { startClawbotHubGatewayAccount } from "./gateway.js";
import { sendClawbotHubText } from "./outbound.js";
import { normalizeClawbotHubTarget, parseClawbotHubTarget } from "./target.js";
import type { ChannelPlugin } from "./runtime-api.js";
import { applyClawbotHubSetup } from "./setup.js";
import { clawbotHubStatus } from "./status.js";
import type { CoreConfig, ResolvedClawbotHubAccount } from "./types.js";

const CHANNEL_ID = "clawbot-hub" as const;
const meta = {
  ...getChatChannelMeta(CHANNEL_ID),
  label: "ClawBot Hub",
};

export const clawbotHubPlugin: ChannelPlugin<ResolvedClawbotHubAccount> = createChatChannelPlugin({
  base: {
    id: CHANNEL_ID,
    meta,
    capabilities: {
      chatTypes: ["direct"],
    },
    reload: { configPrefixes: ["channels.clawbot-hub"] },
    configSchema: clawbotHubPluginConfigSchema,
    setup: {
      applyAccountConfig: ({ cfg, accountId, input }) =>
        applyClawbotHubSetup({
          cfg,
          accountId,
          input: input as Record<string, unknown>,
        }),
    },
    config: {
      listAccountIds: (cfg) => listClawbotHubAccountIds(cfg as CoreConfig),
      resolveAccount: (cfg, accountId) =>
        resolveClawbotHubAccount({ cfg: cfg as CoreConfig, accountId }),
      defaultAccountId: (cfg) => resolveDefaultClawbotHubAccountId(cfg as CoreConfig),
      isConfigured: (account) => account.configured,
      resolveAllowFrom: ({ cfg, accountId }) =>
        resolveClawbotHubAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom,
      resolveDefaultTo: ({ cfg, accountId }) =>
        resolveClawbotHubAccount({ cfg: cfg as CoreConfig, accountId }).config.defaultTo,
    },
    messaging: {
      normalizeTarget: normalizeClawbotHubTarget,
      parseExplicitTarget: ({ raw }) => {
        const parsed = parseClawbotHubTarget(raw);
        return {
          to: normalizeClawbotHubTarget(parsed.conversationId)!,
          chatType: "direct",
        };
      },
      inferTargetChatType: () => "direct",
      targetResolver: {
        looksLikeId: (raw) => raw.trim().length > 0,
        hint: "<conversationId|conversation:conversationId>",
      },
      resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target }) => {
        const parsed = parseClawbotHubTarget(target);
        const to = normalizeClawbotHubTarget(parsed.conversationId)!;
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
          from: `clawbot-hub:${accountId ?? DEFAULT_ACCOUNT_ID}`,
          to,
        });
      },
    },
    status: clawbotHubStatus,
    gateway: {
      startAccount: async (ctx) => {
        await startClawbotHubGatewayAccount(CHANNEL_ID, meta.label, ctx);
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
        await sendClawbotHubText({
          cfg: cfg as CoreConfig,
          accountId,
          to,
          text,
          replyToId,
        }),
    },
  },
});
