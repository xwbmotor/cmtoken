import { setTimeout as sleep } from "node:timers/promises";
import { ackHubCursor, loginToHub, pollHubEvents, pushHubEvent, sendHeartbeat } from "./hub-client.js";
import { handleClawbotHubInbound } from "./inbound.js";
import { buildHubModelCatalog } from "./model-catalog.js";
import type { ChannelGatewayContext } from "./runtime-api.js";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import type { HubInboundPayload, ResolvedClawbotHubAccount } from "./types.js";

function asNonEmptyString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isAuthError(error: unknown): boolean {
  return error instanceof Error && /auth/i.test(error.message);
}

function stringifyUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

const PG_INT_MAX = 2_147_483_647;

function createSafeRunErrorSeq(): number {
  const base = Date.now() % (PG_INT_MAX - 10_000);
  const jitter = Math.floor(Math.random() * 10_000);
  return Math.max(0, Math.min(PG_INT_MAX, Math.floor(base + jitter)));
}

export async function startClawbotHubGatewayAccount(
  channelId: string,
  channelLabel: string,
  ctx: ChannelGatewayContext<ResolvedClawbotHubAccount>,
) {
  const account = ctx.account;
  if (!account.configured) {
    throw new Error(`clawbot-hub is not configured for account "${account.accountId}"`);
  }

  ctx.setStatus({
    accountId: account.accountId,
    running: true,
    configured: true,
    enabled: account.enabled,
    baseUrl: account.baseUrl,
    appId: account.appId,
  });

  let cursor = 0;
  const modelCatalog = buildHubModelCatalog(ctx.cfg as OpenClawConfig);
  const loginWithCurrentConfig = async () =>
    (
      await loginToHub({
        baseUrl: account.baseUrl,
        appId: account.appId,
        appSecret: account.appSecret,
        accountId: account.hubAccountId,
        openclawInstanceId: account.openclawInstanceId,
        modelCatalog,
        signal: ctx.abortSignal,
      })
    ).token;
  let token = await loginWithCurrentConfig();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatInFlight = false;

  const sendHeartbeatTick = async () => {
    if (ctx.abortSignal.aborted || heartbeatInFlight) {
      return;
    }
    heartbeatInFlight = true;
    try {
      try {
        await sendHeartbeat({
          baseUrl: account.baseUrl,
          token,
          modelCatalog,
          signal: ctx.abortSignal,
        });
      } catch (error) {
        if (!isAuthError(error)) {
          throw error;
        }
        token = await loginWithCurrentConfig();
        await sendHeartbeat({
          baseUrl: account.baseUrl,
          token,
          modelCatalog,
          signal: ctx.abortSignal,
        });
      }
    } catch (error) {
      if (!ctx.abortSignal.aborted) {
        console.warn(
          `[clawbot-hub] heartbeat failed for account=${account.accountId}: ${stringifyUnknownError(error)}`,
        );
      }
    } finally {
      heartbeatInFlight = false;
    }
  };

  await sendHeartbeatTick();
  heartbeatTimer = setInterval(() => {
    void sendHeartbeatTick();
  }, account.heartbeatIntervalMs);
  ctx.abortSignal.addEventListener(
    "abort",
    () => {
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    },
    { once: true },
  );

  try {
    while (!ctx.abortSignal.aborted) {
      try {
        const result = await pollHubEvents({
          baseUrl: account.baseUrl,
          token,
          cursor,
          signal: ctx.abortSignal,
        });

        if (!Array.isArray(result.events) || result.events.length === 0) {
          await sleep(account.pollTimeoutMs);
          continue;
        }

        for (const event of result.events) {
          if (ctx.abortSignal.aborted) {
            break;
          }
          if (event.eventKind === "inbound-message") {
            const payload = event.payload as HubInboundPayload;
            try {
              await handleClawbotHubInbound({
                channelId,
                channelLabel,
                account,
                config: ctx.cfg as OpenClawConfig,
                token,
                payload,
              });
            } catch (error) {
              const runId = asNonEmptyString(payload.runId);
              if (runId) {
                try {
                  await pushHubEvent({
                    baseUrl: account.baseUrl,
                    token,
                    eventKind: "run-event",
                    payload: {
                      runId,
                      eventType: "run.error",
                      seq: createSafeRunErrorSeq(),
                      error: error instanceof Error ? error.message : String(error),
                    },
                  });
                } catch (pushError) {
                  console.warn(
                    `[clawbot-hub] failed to push run.error runId=${runId}: ${stringifyUnknownError(pushError)}`,
                  );
                }
              }
            }
          }
          cursor = Math.max(cursor, event.cursor);
          await ackHubCursor({
            baseUrl: account.baseUrl,
            token,
            cursor,
            signal: ctx.abortSignal,
          });
        }
      } catch (error) {
        if (ctx.abortSignal.aborted) {
          break;
        }
        if (isAuthError(error)) {
          token = await loginWithCurrentConfig();
          void sendHeartbeatTick();
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AbortError") {
      throw error;
    }
  } finally {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  ctx.setStatus({
    accountId: account.accountId,
    running: false,
  });
}
