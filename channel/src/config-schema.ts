import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

export const TukenAccountConfigSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    baseUrl: z.string().url().optional(),
    appId: z.string().min(3).max(128).optional(),
    appSecret: z.string().min(3).max(256).optional(),
    accountId: z.string().min(1).max(120).optional(),
    openclawInstanceId: z.string().min(1).max(120).optional(),
    pollTimeoutMs: z.number().int().min(100).max(30_000).optional(),
    heartbeatIntervalMs: z.number().int().min(1_000).max(120_000).optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    defaultTo: z.string().optional(),
  })
  .strict();

export const TukenConfigSchema = TukenAccountConfigSchema.extend({
  accounts: z.record(z.string(), TukenAccountConfigSchema.partial()).optional(),
  defaultAccount: z.string().optional(),
}).strict();

export const tukenPluginConfigSchema = buildChannelConfigSchema(TukenConfigSchema);

