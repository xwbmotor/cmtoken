import { randomUUID } from "node:crypto";
import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { pushHubEvent } from "./hub-client.js";
import { getClawbotHubRuntime } from "./runtime.js";
import { normalizeClawbotHubTarget } from "./target.js";
import type { HubInboundPayload, ResolvedClawbotHubAccount } from "./types.js";

function asNonEmptyString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  return input.length > 0 ? input : undefined;
}

function asFiniteNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  return undefined;
}

function pickRecord(input: unknown): Record<string, unknown> | undefined {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
}

function resolveRequestedModel(params: {
  modelProvider?: unknown;
  model?: unknown;
}): { provider?: string; model?: string; modelRef?: string } {
  const provider = asNonEmptyString(params.modelProvider);
  const model = asNonEmptyString(params.model);
  if (!provider || !model) {
    return {};
  }
  return {
    provider,
    model,
    modelRef: `${provider}/${model}`,
  };
}

function applyRequestedModelToConfig(params: {
  config: OpenClawConfig;
  provider?: string;
  model?: string;
}): OpenClawConfig {
  if (!params.provider || !params.model) {
    return params.config;
  }
  const configRecord = pickRecord(params.config as Record<string, unknown>);
  const nextConfig: Record<string, unknown> = configRecord ? { ...configRecord } : {};
  const currentAgents = pickRecord(nextConfig.agents) ?? {};
  const currentDefaults = pickRecord(currentAgents.defaults) ?? {};
  nextConfig.agents = {
    ...currentAgents,
    defaults: {
      ...currentDefaults,
      model: `${params.provider}/${params.model}`,
    },
  };
  return nextConfig as OpenClawConfig;
}

function extractToolLabel(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine) {
    return "Tool";
  }
  if (firstLine.startsWith("🔧")) {
    return firstLine.replace(/^🔧\s*/, "");
  }
  return firstLine;
}

function mergeAssistantStreamText(previous: string, nextChunk: string): string {
  const incoming = nextChunk;
  if (!incoming) {
    return previous;
  }
  if (!previous) {
    return incoming;
  }
  if (incoming === previous) {
    return previous;
  }
  if (incoming.startsWith(previous)) {
    return incoming;
  }
  if (previous.startsWith(incoming)) {
    return previous;
  }
  if (previous.includes(incoming)) {
    return previous;
  }
  if (incoming.includes(previous)) {
    return incoming;
  }
  if (previous.endsWith(incoming)) {
    return previous;
  }
  const maxOverlap = Math.min(previous.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (previous.endsWith(incoming.slice(0, overlap))) {
      return `${previous}${incoming.slice(overlap)}`;
    }
  }
  return `${previous}${incoming}`;
}

function computeDeltaFromPartialSnapshot(previousSnapshot: string, incomingSnapshot: string): string {
  if (!incomingSnapshot) {
    return "";
  }
  if (!previousSnapshot) {
    return incomingSnapshot;
  }
  if (incomingSnapshot === previousSnapshot) {
    return "";
  }
  if (incomingSnapshot.startsWith(previousSnapshot)) {
    return incomingSnapshot.slice(previousSnapshot.length);
  }
  if (previousSnapshot.startsWith(incomingSnapshot)) {
    return "";
  }
  return incomingSnapshot;
}

function mergeToolOutputText(previous: string, nextChunk: string): string {
  const incoming = nextChunk.trimEnd();
  if (!incoming.trim()) {
    return previous;
  }
  if (!previous.trim()) {
    return incoming;
  }
  if (previous === incoming) {
    return previous;
  }
  if (incoming.includes(previous)) {
    return incoming;
  }
  if (previous.includes(incoming)) {
    return previous;
  }
  if (incoming.startsWith(previous)) {
    return incoming;
  }
  if (previous.endsWith(incoming)) {
    return previous;
  }
  return `${previous}\n${incoming}`;
}

function resolveAssistantFinalText(params: {
  finalOutput: string;
  streamedText: string;
}): string {
  const finalTrimmed = params.finalOutput.trim();
  const streamedTrimmed = params.streamedText.trim();
  if (finalTrimmed) {
    return finalTrimmed;
  }
  return streamedTrimmed;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const resolved = asNonEmptyString(value);
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
}

function parseTimestampMs(input: unknown): number | undefined {
  const asNumber = asFiniteNumber(input);
  if (asNumber !== undefined) {
    return asNumber;
  }
  const asString = asNonEmptyString(input);
  if (!asString) {
    return undefined;
  }
  const parsed = Date.parse(asString);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  const numeric = Number(asString);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeToolStatus(input: unknown): "running" | "success" | "error" {
  const normalized = asNonEmptyString(input)?.toLowerCase();
  if (!normalized) {
    return "running";
  }
  if (["error", "failed", "failure"].includes(normalized)) {
    return "error";
  }
  if (["success", "done", "completed", "complete", "ok"].includes(normalized)) {
    return "success";
  }
  return "running";
}

function resolveToolSignal(params: {
  infoKind: string;
  payloadRecord?: Record<string, unknown>;
  channelData?: Record<string, unknown>;
  output: string;
}) {
  const typeRaw = firstNonEmptyString(
    params.channelData?.type,
    params.channelData?.kind,
    params.channelData?.eventType,
    params.channelData?.event_type,
    params.payloadRecord?.type,
    params.payloadRecord?.kind,
    params.payloadRecord?.eventType,
    params.payloadRecord?.event_type,
  );
  const typeNormalized = typeRaw?.toLowerCase() ?? "";
  const toolId = firstNonEmptyString(
    params.channelData?.toolId,
    params.channelData?.tool_call_id,
    params.channelData?.toolCallId,
    params.payloadRecord?.toolId,
    params.payloadRecord?.tool_call_id,
    params.payloadRecord?.toolCallId,
  );
  const label = firstNonEmptyString(
    params.channelData?.label,
    params.channelData?.display,
    params.channelData?.displayText,
    params.channelData?.toolName,
    params.channelData?.name,
    params.payloadRecord?.label,
    params.payloadRecord?.display,
    params.payloadRecord?.displayText,
    params.payloadRecord?.toolName,
    params.payloadRecord?.name,
    params.output ? extractToolLabel(params.output) : undefined,
  );
  const command = firstNonEmptyString(
    params.channelData?.command,
    params.payloadRecord?.command,
  );
  const outputText = firstNonEmptyString(
    params.output,
    params.channelData?.output,
    params.channelData?.text,
    params.channelData?.delta,
    params.payloadRecord?.output,
    params.payloadRecord?.text,
    params.payloadRecord?.delta,
  );
  const startedAtMs = parseTimestampMs(
    params.channelData?.startedAt ??
      params.channelData?.started_at ??
      params.payloadRecord?.startedAt ??
      params.payloadRecord?.started_at,
  );
  const finishedAtMs = parseTimestampMs(
    params.channelData?.finishedAt ??
      params.channelData?.finished_at ??
      params.payloadRecord?.finishedAt ??
      params.payloadRecord?.finished_at,
  );
  const status = normalizeToolStatus(
    firstNonEmptyString(
      params.channelData?.status,
      params.channelData?.resultStatus,
      params.payloadRecord?.status,
      params.payloadRecord?.resultStatus,
    ),
  );
  const hasToolHints =
    params.infoKind === "tool" ||
    typeNormalized.includes("tool") ||
    toolId !== undefined ||
    firstNonEmptyString(params.channelData?.toolName, params.payloadRecord?.toolName) !== undefined;
  const likelyTerminal =
    status !== "running" ||
    /result|complete|completed|done|end|error|failed/.test(typeNormalized);

  return {
    isTool: hasToolHints,
    toolId,
    label,
    command,
    outputText,
    startedAtMs,
    finishedAtMs,
    status,
    likelyTerminal,
  };
}

function normalizePhase(input: unknown): string {
  return asNonEmptyString(input)?.toLowerCase() ?? "";
}

function isPhaseStartLike(phase: string): boolean {
  return ["start", "started", "update", "updated", "running", "progress"].includes(phase);
}

function isPhaseTerminal(phase: string): boolean {
  return [
    "end",
    "ended",
    "done",
    "completed",
    "complete",
    "success",
    "failed",
    "failure",
    "error",
    "cancelled",
    "canceled",
    "aborted",
  ].includes(phase);
}

function stringifyUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function handleClawbotHubInbound(params: {
  channelId: string;
  channelLabel: string;
  account: ResolvedClawbotHubAccount;
  config: OpenClawConfig;
  token: string;
  payload: HubInboundPayload;
}) {
  const runtime = getClawbotHubRuntime();

  const conversationId = asNonEmptyString(params.payload.conversationId);
  const text = asNonEmptyString(params.payload.text);
  if (!conversationId || !text) {
    return;
  }
  const runId = asNonEmptyString(params.payload.runId) ?? randomUUID();
  const runStartedAtMs = Date.now();
  const timestamp = asFiniteNumber(params.payload.timestamp) ?? Date.now();
  const requestedModel = resolveRequestedModel({
    modelProvider: params.payload.modelProvider,
    model: params.payload.model,
  });
  const effectiveConfig = applyRequestedModelToConfig({
    config: params.config,
    provider: requestedModel.provider,
    model: requestedModel.model,
  });
  const target = normalizeClawbotHubTarget(conversationId);
  if (!target) {
    return;
  }

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg: effectiveConfig,
    channel: params.channelId,
    accountId: params.account.accountId,
    peer: {
      kind: "direct",
      id: target,
    },
  });
  const storePath = runtime.channel.session.resolveStorePath(effectiveConfig.session?.store, {
    agentId: route.agentId,
  });
  const previousTimestamp = runtime.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = runtime.channel.reply.formatAgentEnvelope({
    channel: params.channelLabel,
    from: params.payload.accountId || params.account.hubAccountId,
    timestamp,
    previousTimestamp,
    envelope: runtime.channel.reply.resolveEnvelopeFormatOptions(effectiveConfig),
    body: text,
  });

  const ctxPayload = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: text,
    RawBody: text,
    CommandBody: text,
    From: target,
    To: target,
    SessionKey: route.sessionKey,
    AccountId: route.accountId ?? params.account.accountId,
    ChatType: "direct",
    ConversationLabel: conversationId,
    NativeChannelId: conversationId,
    SenderId: params.payload.accountId ?? params.account.hubAccountId,
    Provider: params.channelId,
    Surface: params.channelId,
    MessageSid: asNonEmptyString(params.payload.messageId) ?? runId,
    MessageSidFull: asNonEmptyString(params.payload.messageId) ?? runId,
    Timestamp: timestamp,
    OriginatingChannel: params.channelId,
    OriginatingTo: target,
    CommandAuthorized: true,
    ModelProvider: requestedModel.provider,
    Model: requestedModel.modelRef ?? requestedModel.model,
  });

  let seq = 0;
  let assistantStreamText = "";
  let lastPartialSnapshot = "";
  let assistantFinalSent = false;
  let assistantHadPartialStream = false;
  let structuredToolEventSeen = false;
  let fallbackActiveToolId: string | null = null;
  let toolCounter = 0;
  let pushFailureCount = 0;
  const toolStates = new Map<
    string,
    {
      label: string;
      startedAtMs: number;
      command?: string;
      outputText: string;
    }
  >();

  const nextSeq = () => {
    seq += 1;
    return seq;
  };

  const nextToolId = () => `tool-${++toolCounter}`;

  const warnPushFailure = (scope: string, error: unknown, detail?: Record<string, unknown>) => {
    pushFailureCount += 1;
    const shouldLog = pushFailureCount <= 3 || pushFailureCount % 20 === 0;
    if (!shouldLog) {
      return;
    }
    const detailText = detail ? ` detail=${JSON.stringify(detail)}` : "";
    console.warn(
      `[clawbot-hub] hub push failed (${scope}) runId=${runId} count=${pushFailureCount} error=${stringifyUnknownError(error)}${detailText}`,
    );
  };

  const pushHubEventSafe = async (
    scope: string,
    pushParams: {
      eventKind: "run-event" | "outbound-message";
      payload: Record<string, unknown>;
    },
  ) => {
    try {
      await pushHubEvent({
        baseUrl: params.account.baseUrl,
        token: params.token,
        eventKind: pushParams.eventKind,
        payload: pushParams.payload,
      });
      pushFailureCount = 0;
      return true;
    } catch (error) {
      warnPushFailure(scope, error, {
        eventKind: pushParams.eventKind,
      });
      return false;
    }
  };

  const emitRunEvent = async (eventType: string, payload: Record<string, unknown>) => {
    await pushHubEventSafe(`run-event:${eventType}`, {
      eventKind: "run-event",
      payload: {
        runId,
        eventType,
        seq: nextSeq(),
        ...payload,
      },
    });
  };

  const ensureToolStarted = async (paramsForTool: {
    toolId: string;
    label?: string;
    command?: string;
    startedAtMs?: number;
    extra?: Record<string, unknown>;
  }) => {
    const existing = toolStates.get(paramsForTool.toolId);
    const label = paramsForTool.label ?? existing?.label ?? "Tool";
    const startedAtMs = paramsForTool.startedAtMs ?? existing?.startedAtMs ?? Date.now();
    const command = paramsForTool.command ?? existing?.command;

    if (existing) {
      toolStates.set(paramsForTool.toolId, {
        label,
        startedAtMs,
        command,
        outputText: existing.outputText,
      });
      return;
    }

    toolStates.set(paramsForTool.toolId, {
      label,
      startedAtMs,
      command,
      outputText: "",
    });

    await emitRunEvent("tool.exec.start", {
      toolId: paramsForTool.toolId,
      label,
      command,
      startedAt: new Date(startedAtMs).toISOString(),
      ...(paramsForTool.extra ?? {}),
    });
  };

  const emitToolOutput = async (paramsForTool: {
    toolId: string;
    label?: string;
    command?: string;
    text?: string;
    startedAtMs?: number;
    extra?: Record<string, unknown>;
  }) => {
    const textOutput = paramsForTool.text ?? "";
    if (!textOutput.trim()) {
      return;
    }
    await ensureToolStarted({
      toolId: paramsForTool.toolId,
      label: paramsForTool.label,
      command: paramsForTool.command,
      startedAtMs: paramsForTool.startedAtMs,
    });
    const state = toolStates.get(paramsForTool.toolId);
    if (!state) {
      return;
    }
    const mergedOutput = mergeToolOutputText(state.outputText, textOutput);
    if (mergedOutput === state.outputText) {
      return;
    }
    state.outputText = mergedOutput;
    await emitRunEvent("tool.exec.output", {
      toolId: paramsForTool.toolId,
      label: paramsForTool.label ?? state.label ?? "Tool",
      command: paramsForTool.command ?? state.command,
      text: mergedOutput,
      startedAt: new Date(paramsForTool.startedAtMs ?? state.startedAtMs ?? Date.now()).toISOString(),
      ...(paramsForTool.extra ?? {}),
    });
  };

  const closeTool = async (paramsForTool: {
    toolId?: string | null;
    status?: "success" | "error";
    finishedAtMs?: number;
    extra?: Record<string, unknown>;
  }) => {
    const toolId = paramsForTool.toolId;
    if (!toolId) {
      return;
    }
    const state = toolStates.get(toolId);
    if (!state) {
      if (fallbackActiveToolId === toolId) {
        fallbackActiveToolId = null;
      }
      return;
    }
    await emitRunEvent("tool.exec.end", {
      toolId,
      label: state.label,
      command: state.command,
      status: paramsForTool.status ?? "success",
      startedAt: new Date(state.startedAtMs).toISOString(),
      finishedAt: new Date(paramsForTool.finishedAtMs ?? Date.now()).toISOString(),
      ...(paramsForTool.extra ?? {}),
    });
    toolStates.delete(toolId);
    if (fallbackActiveToolId === toolId) {
      fallbackActiveToolId = null;
    }
  };

  const closeAllTools = async (status: "success" | "error" = "success") => {
    for (const toolId of [...toolStates.keys()]) {
      await closeTool({
        toolId,
        status,
      });
    }
    fallbackActiveToolId = null;
  };

  const sendAssistantFinal = async (text: string) => {
    const finalized = text.trim();
    if (assistantFinalSent) {
      return;
    }
    assistantFinalSent = true;
    await closeAllTools();
    const finishedAtMs = Date.now();
    if (finalized) {
      await pushHubEventSafe("outbound-message:assistant.final", {
        eventKind: "outbound-message",
        payload: {
          runId,
          conversationId,
          role: "assistant",
          text: finalized,
          startedAt: new Date(runStartedAtMs).toISOString(),
          finishedAt: new Date(finishedAtMs).toISOString(),
          durationMs: Math.max(0, finishedAtMs - runStartedAtMs),
          source: "openclaw",
        },
      });
    }
    await emitRunEvent("assistant.final", {
      text: finalized,
      startedAt: new Date(runStartedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: Math.max(0, finishedAtMs - runStartedAtMs),
    });
  };

  await runtime.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (error) => {
      throw error instanceof Error
        ? error
        : new Error(`clawbot-hub session record failed: ${String(error)}`);
    },
  });

  const { onModelSelected, ...replyPipeline } = createChannelReplyPipeline({
    cfg: effectiveConfig,
    agentId: route.agentId,
    channel: params.channelId,
    accountId: params.account.accountId,
  });

  try {
    await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: effectiveConfig,
      dispatcherOptions: {
        ...replyPipeline,
        deliver: async (payload, info) => {
          const payloadRecord = pickRecord(payload);
          const output = asString(payloadRecord?.text) ?? "";
          const channelData = pickRecord(payloadRecord?.channelData);

          const toolSignal = resolveToolSignal({
            infoKind: info.kind,
            payloadRecord,
            channelData,
            output,
          });

          if (!structuredToolEventSeen && (toolSignal.isTool || info.kind === "tool")) {
            const resolvedToolId = toolSignal.toolId ?? fallbackActiveToolId ?? nextToolId();
            fallbackActiveToolId = resolvedToolId;
            await ensureToolStarted({
              toolId: resolvedToolId,
              label: toolSignal.label,
              command: toolSignal.command,
              startedAtMs: toolSignal.startedAtMs,
              extra: {
                source: "dispatcher.fallback",
              },
            });
            await emitToolOutput({
              toolId: resolvedToolId,
              label: toolSignal.label,
              command: toolSignal.command,
              text: toolSignal.outputText,
              startedAtMs: toolSignal.startedAtMs,
              extra: {
                channelData: channelData ?? null,
                source: "dispatcher.fallback",
              },
            });
            if (toolSignal.likelyTerminal) {
              await closeTool({
                toolId: resolvedToolId,
                status: toolSignal.status === "error" ? "error" : "success",
                finishedAtMs: toolSignal.finishedAtMs,
                extra: {
                  channelData: channelData ?? null,
                  source: "dispatcher.fallback",
                },
              });
            }
            return;
          }

          if (!structuredToolEventSeen && fallbackActiveToolId) {
            await closeTool({
              toolId: fallbackActiveToolId,
            });
          }

          if (info.kind === "block") {
            if (!output) {
              return;
            }
            if (assistantHadPartialStream) {
              return;
            }
            assistantStreamText = mergeAssistantStreamText(assistantStreamText, output);
            await emitRunEvent("assistant.delta", {
              delta: output,
              text: assistantStreamText,
              channelData: channelData ?? null,
            });
            return;
          }

          if (info.kind === "final") {
            const finalText = resolveAssistantFinalText({
              finalOutput: output,
              streamedText: assistantStreamText,
            });
            await sendAssistantFinal(finalText);
          }
        },
        onError: (error) => {
          throw error instanceof Error
            ? error
            : new Error(`clawbot-hub dispatch failed: ${String(error)}`);
        },
      },
      replyOptions: {
        onModelSelected,
        onPartialReply: async (partialPayload) => {
          const payloadRecord = pickRecord(partialPayload);
          const directDelta = asString(payloadRecord?.delta);
          const partialTextSnapshot = asString(payloadRecord?.text);
          let delta = directDelta;
          if (delta === undefined && partialTextSnapshot !== undefined) {
            delta = computeDeltaFromPartialSnapshot(lastPartialSnapshot, partialTextSnapshot);
          }
          if (delta === undefined || delta.length === 0) {
            if (partialTextSnapshot !== undefined) {
              lastPartialSnapshot = partialTextSnapshot;
            }
            return;
          }
          if (partialTextSnapshot !== undefined) {
            lastPartialSnapshot = partialTextSnapshot;
          }
          assistantHadPartialStream = true;
          assistantStreamText = mergeAssistantStreamText(assistantStreamText, delta);
          await emitRunEvent("assistant.delta", {
            delta,
            text: assistantStreamText,
            source: "onPartialReply",
          });
        },
        onToolStart: async (toolPayload) => {
          structuredToolEventSeen = true;
          const phase = normalizePhase(toolPayload.phase);
          if (phase && !isPhaseStartLike(phase)) {
            return;
          }
          const label = firstNonEmptyString(toolPayload.name, "Tool");
          const toolId = fallbackActiveToolId ?? nextToolId();
          fallbackActiveToolId = toolId;
          await ensureToolStarted({
            toolId,
            label,
            startedAtMs: Date.now(),
            extra: {
              phase,
              source: "onToolStart",
            },
          });
        },
        onItemEvent: async (itemPayload) => {
          structuredToolEventSeen = true;
          const kind = normalizePhase(itemPayload.kind);
          const phase = normalizePhase(itemPayload.phase);
          const status = normalizePhase(itemPayload.status);
          const isToolLike =
            kind.includes("tool") ||
            kind.includes("command") ||
            asNonEmptyString(itemPayload.name) !== undefined;
          if (!isToolLike) {
            return;
          }
          const toolId = firstNonEmptyString(itemPayload.itemId, fallbackActiveToolId) ?? nextToolId();
          fallbackActiveToolId = toolId;
          const label = firstNonEmptyString(itemPayload.title, itemPayload.name, "Tool");
          await ensureToolStarted({
            toolId,
            label,
            startedAtMs: Date.now(),
            extra: {
              kind,
              phase,
              status,
              source: "onItemEvent",
            },
          });
          const progressText = firstNonEmptyString(itemPayload.progressText, itemPayload.summary);
          await emitToolOutput({
            toolId,
            label,
            text: progressText,
            startedAtMs: Date.now(),
            extra: {
              kind,
              phase,
              status,
              source: "onItemEvent",
            },
          });
          if (isPhaseTerminal(phase) || status === "success" || status === "error" || status === "failed") {
            await closeTool({
              toolId,
              status: status === "error" || status === "failed" ? "error" : "success",
              finishedAtMs: Date.now(),
              extra: {
                kind,
                phase,
                status,
                source: "onItemEvent",
              },
            });
          }
        },
        onCommandOutput: async (commandPayload) => {
          structuredToolEventSeen = true;
          const phase = normalizePhase(commandPayload.phase);
          const status = normalizePhase(commandPayload.status);
          const toolId =
            firstNonEmptyString(commandPayload.toolCallId, commandPayload.itemId, fallbackActiveToolId) ??
            nextToolId();
          fallbackActiveToolId = toolId;
          const label = firstNonEmptyString(commandPayload.title, commandPayload.name, "Exec");
          const command = firstNonEmptyString(commandPayload.title, commandPayload.name);
          await ensureToolStarted({
            toolId,
            label,
            command,
            startedAtMs: Date.now(),
            extra: {
              phase,
              status,
              source: "onCommandOutput",
            },
          });
          await emitToolOutput({
            toolId,
            label,
            command,
            text: commandPayload.output,
            startedAtMs: Date.now(),
            extra: {
              phase,
              status,
              cwd: commandPayload.cwd,
              durationMs: commandPayload.durationMs,
              exitCode: commandPayload.exitCode,
              source: "onCommandOutput",
            },
          });
          const exitCode = typeof commandPayload.exitCode === "number" ? commandPayload.exitCode : undefined;
          const shouldEnd =
            isPhaseTerminal(phase) ||
            status === "success" ||
            status === "error" ||
            status === "failed" ||
            exitCode !== undefined;
          if (shouldEnd) {
            const resolvedStatus =
              status === "error" || status === "failed" || (exitCode !== undefined && exitCode !== 0)
                ? "error"
                : "success";
            await closeTool({
              toolId,
              status: resolvedStatus,
              finishedAtMs: Date.now(),
              extra: {
                phase,
                status,
                cwd: commandPayload.cwd,
                durationMs: commandPayload.durationMs,
                exitCode: commandPayload.exitCode,
                source: "onCommandOutput",
              },
            });
          }
        },
        onPatchSummary: async (patchPayload) => {
          structuredToolEventSeen = true;
          const phase = normalizePhase(patchPayload.phase);
          const toolId =
            firstNonEmptyString(patchPayload.toolCallId, patchPayload.itemId, fallbackActiveToolId) ??
            nextToolId();
          fallbackActiveToolId = toolId;
          const label = firstNonEmptyString(patchPayload.title, patchPayload.name, "Patch");
          await ensureToolStarted({
            toolId,
            label,
            startedAtMs: Date.now(),
            extra: {
              phase,
              source: "onPatchSummary",
            },
          });
          const summaryParts = [
            asNonEmptyString(patchPayload.summary),
            Array.isArray(patchPayload.added) && patchPayload.added.length > 0
              ? `added: ${patchPayload.added.join(", ")}`
              : undefined,
            Array.isArray(patchPayload.modified) && patchPayload.modified.length > 0
              ? `modified: ${patchPayload.modified.join(", ")}`
              : undefined,
            Array.isArray(patchPayload.deleted) && patchPayload.deleted.length > 0
              ? `deleted: ${patchPayload.deleted.join(", ")}`
              : undefined,
          ].filter((value): value is string => Boolean(value));
          await emitToolOutput({
            toolId,
            label,
            text: summaryParts.join("\n"),
            startedAtMs: Date.now(),
            extra: {
              phase,
              source: "onPatchSummary",
            },
          });
          if (isPhaseTerminal(phase)) {
            await closeTool({
              toolId,
              status: "success",
              finishedAtMs: Date.now(),
              extra: {
                phase,
                source: "onPatchSummary",
              },
            });
          }
        },
      },
    });
  } catch (error) {
    await closeAllTools("error");
    throw error;
  }

  if (!assistantFinalSent) {
    await sendAssistantFinal(assistantStreamText);
  }
}
