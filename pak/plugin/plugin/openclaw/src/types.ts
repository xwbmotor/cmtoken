export type ClawbotHubAccountConfig = {
  name?: string;
  enabled?: boolean;
  baseUrl?: string;
  appId?: string;
  appSecret?: string;
  accountId?: string;
  openclawInstanceId?: string;
  pollTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  allowFrom?: Array<string | number>;
  defaultTo?: string;
};

export type HubModelCatalog = {
  defaultProvider?: string;
  defaultModel?: string;
  providers: Array<{
    id: string;
    models: Array<{
      id: string;
      name?: string;
    }>;
  }>;
};

export type ClawbotHubConfig = ClawbotHubAccountConfig & {
  accounts?: Record<string, Partial<ClawbotHubAccountConfig>>;
  defaultAccount?: string;
};

export type CoreConfig = {
  channels?: {
    "clawbot-hub"?: ClawbotHubConfig;
  };
  session?: {
    store?: string;
  };
};

export type ResolvedClawbotHubAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  baseUrl: string;
  appId: string;
  appSecret: string;
  hubAccountId: string;
  openclawInstanceId: string;
  pollTimeoutMs: number;
  heartbeatIntervalMs: number;
  config: ClawbotHubAccountConfig;
};

export type HubLoginResponse = {
  ok: boolean;
  token?: string;
  error?: string;
};

export type HubPollEvent = {
  cursor: number;
  eventKind: "inbound-message" | "outbound-message" | "run-event" | string;
  payload: Record<string, unknown>;
  createdAt?: string;
};

export type HubPollResponse = {
  ok: boolean;
  cursor: number;
  events: HubPollEvent[];
  error?: string;
};

export type HubInboundPayload = {
  appId?: string;
  accountId?: string;
  conversationId?: string;
  runId?: string;
  messageId?: string;
  text?: string;
  timestamp?: number;
  modelProvider?: string;
  model?: string;
};
