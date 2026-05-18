import type { HubLoginResponse, HubModelCatalog, HubPollResponse } from "./types.js";

type HubAuthState = {
  token: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text.trim()) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const explicitError =
        (typeof parsed.error === "string" && parsed.error.trim()) ||
        (typeof parsed.message === "string" && parsed.message.trim()) ||
        "";
      if (explicitError) {
        return explicitError;
      }
    } catch {
      // non-json payload
    }
    const compact = text.replace(/\s+/g, " ").trim().slice(0, 400);
    return compact ? `${fallback}: ${compact}` : fallback;
  } catch {
    return fallback;
  }
}

export async function loginToHub(params: {
  baseUrl: string;
  appId: string;
  appSecret: string;
  accountId: string;
  openclawInstanceId: string;
  modelCatalog?: HubModelCatalog;
  signal?: AbortSignal;
}): Promise<HubAuthState> {
  const response = await fetch(new URL("channel/v1/login", normalizeBaseUrl(params.baseUrl)), {
    method: "POST",
    signal: params.signal,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: params.appId,
      secret: params.appSecret,
      accountId: params.accountId,
      openclawInstanceId: params.openclawInstanceId,
      modelCatalog: params.modelCatalog,
    }),
  });

  const data = await parseJsonSafe<HubLoginResponse>(response);
  if (!response.ok || !data?.ok || !data.token) {
    throw new Error(data?.error ?? `hub login failed (${response.status})`);
  }
  return { token: data.token };
}

export async function sendHeartbeat(params: {
  baseUrl: string;
  token: string;
  modelCatalog?: HubModelCatalog;
  signal?: AbortSignal;
}) {
  const response = await fetch(new URL("channel/v1/heartbeat", normalizeBaseUrl(params.baseUrl)), {
    method: "POST",
    signal: params.signal,
    headers: {
      authorization: `Bearer ${params.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      modelCatalog: params.modelCatalog,
    }),
  });
  if (response.status === 401) {
    throw new Error("hub auth expired");
  }
  if (!response.ok) {
    throw new Error(`hub heartbeat failed (${response.status})`);
  }
}

export async function pollHubEvents(params: {
  baseUrl: string;
  token: string;
  cursor: number;
  signal?: AbortSignal;
}): Promise<HubPollResponse> {
  const response = await fetch(
    new URL(`channel/v1/poll?cursor=${encodeURIComponent(String(params.cursor))}`, normalizeBaseUrl(params.baseUrl)),
    {
      method: "GET",
      signal: params.signal,
      headers: {
        authorization: `Bearer ${params.token}`,
      },
    },
  );
  const data = await parseJsonSafe<HubPollResponse>(response);
  if (response.status === 401) {
    throw new Error("hub auth expired");
  }
  if (!response.ok || !data) {
    throw new Error(data?.error ?? `hub poll failed (${response.status})`);
  }
  return data;
}

export async function ackHubCursor(params: {
  baseUrl: string;
  token: string;
  cursor: number;
  signal?: AbortSignal;
}) {
  const response = await fetch(new URL("channel/v1/ack", normalizeBaseUrl(params.baseUrl)), {
    method: "POST",
    signal: params.signal,
    headers: {
      authorization: `Bearer ${params.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cursor: params.cursor,
    }),
  });
  if (response.status === 401) {
    throw new Error("hub auth expired");
  }
  if (!response.ok) {
    const data = await parseJsonSafe<{ error?: string }>(response);
    throw new Error(data?.error ?? `hub ack failed (${response.status})`);
  }
}

export async function pushHubEvent(params: {
  baseUrl: string;
  token: string;
  eventKind: "run-event" | "outbound-message";
  payload: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  const response = await fetch(new URL("channel/v1/push", normalizeBaseUrl(params.baseUrl)), {
    method: "POST",
    signal: params.signal,
    headers: {
      authorization: `Bearer ${params.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      eventKind: params.eventKind,
      payload: params.payload,
    }),
  });
  if (response.status === 401) {
    throw new Error("hub auth expired");
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `hub push failed (${response.status})`));
  }
}
