export function normalizeTukenTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("conversation:")) {
    return trimmed;
  }
  return `conversation:${trimmed}`;
}

export function parseTukenTarget(raw: string): {
  conversationId: string;
} {
  const normalized = normalizeTukenTarget(raw);
  if (!normalized) {
    throw new Error("tuken target is required");
  }
  if (!normalized.startsWith("conversation:")) {
    throw new Error(`invalid tuken target: ${raw}`);
  }
  const conversationId = normalized.slice("conversation:".length).trim();
  if (!conversationId) {
    throw new Error("invalid tuken target conversation id");
  }
  return { conversationId };
}

