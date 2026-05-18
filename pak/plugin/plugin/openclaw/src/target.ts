export function normalizeClawbotHubTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("conversation:")) {
    return trimmed;
  }
  return `conversation:${trimmed}`;
}

export function parseClawbotHubTarget(raw: string): {
  conversationId: string;
} {
  const normalized = normalizeClawbotHubTarget(raw);
  if (!normalized) {
    throw new Error("clawbot-hub target is required");
  }
  if (!normalized.startsWith("conversation:")) {
    throw new Error(`invalid clawbot-hub target: ${raw}`);
  }
  const conversationId = normalized.slice("conversation:".length).trim();
  if (!conversationId) {
    throw new Error("invalid clawbot-hub target conversation id");
  }
  return { conversationId };
}
