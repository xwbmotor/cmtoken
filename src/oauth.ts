import { generatePkceVerifierChallenge, toFormUrlEncoded } from "openclaw/plugin-sdk/provider-auth";
import { ensureGlobalUndiciEnvProxyDispatcher } from "openclaw/plugin-sdk/runtime-env";
import { URL } from "node:url";

import { randomBytes, randomUUID } from "node:crypto";
import * as os from "node:os";
import qrcode from "qrcode-terminal";

export type CMTokenRegion = "cn" | "global";

const CMTOKEN_OAUTH_DEFAULT_CONFIG = {
  baseUrl: process.env.CMTOKEN_OAUTH_URL as string,
  clientId: process.env.CMTOKEN_CLIENT_ID as string,
} as const;

const hostname = os.hostname();
const CMTOKEN_OAUTH_SCOPE = `profile model.completion identity:device:${hostname}`;
const CMTOKEN_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

function getOAuthEndpoints(config?: { oauthBaseUrl?: string, clientId?: string }) {
  const baseUrl = config?.oauthBaseUrl || CMTOKEN_OAUTH_DEFAULT_CONFIG.baseUrl;
  const clientId = config?.clientId || CMTOKEN_OAUTH_DEFAULT_CONFIG.clientId;
  return {
    codeEndpoint: `${baseUrl}/oauth/device/code`,
    tokenEndpoint: `${baseUrl}/oauth/device/token`,
    authorizeEndpoint: `${baseUrl}/oauth/authorize`,
    clientId,
    baseUrl,
  };
}

export type CMTokenOAuthAuthorization = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
};

export type CMTokenOAuthToken = {
  access: string;
  refresh: string;
  expires: number;
  resourceUrl?: string;
  notification_message?: string;
};

type TokenPending = { status: "pending"; message?: string };

type TokenResult =
  | { status: "success"; token: CMTokenOAuthToken }
  | TokenPending
  | { status: "error"; message: string };

function generatePkce(): { verifier: string; challenge: string; state: string } {
  const { verifier, challenge } = generatePkceVerifierChallenge();
  const state = randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}



async function requestDeviceCode(params: {
  challenge: string;
  state: string;
  config?: { oauthBaseUrl?: string, clientId?: string };
}): Promise<CMTokenOAuthAuthorization> {
  const endpoints = getOAuthEndpoints(params.config);

  ensureGlobalUndiciEnvProxyDispatcher();

  try {
    const res = await fetch(endpoints.codeEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "x-request-id": randomUUID(),
      },
      body: toFormUrlEncoded({
        response_type: "device_code",
        client_id: endpoints.clientId,
        scope: CMTOKEN_OAUTH_SCOPE,
        code_challenge: params.challenge,
        code_challenge_method: "S256",
        state: params.state,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`CMToken OAuth device code request failed: ${text || res.status}`);
    }

    const payload = JSON.parse(text) as CMTokenOAuthAuthorization & { error?: string };
    if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
      throw new Error(
        payload.error ??
        "CMToken OAuth returned an incomplete payload (missing device_code, user_code or verification_uri).",
      );
    }
    return payload;
  } catch (err) {
    throw new Error(`CMToken OAuth 设备请求连接失败 (${endpoints.codeEndpoint}): ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function pollOAuthToken(params: {
  deviceCode: string;
  verifier: string;
  config?: { oauthBaseUrl?: string, clientId?: string };
}): Promise<TokenResult> {
  const endpoints = getOAuthEndpoints(params.config);
  ensureGlobalUndiciEnvProxyDispatcher();

  const res = await fetch(endpoints.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: toFormUrlEncoded({
      grant_type: CMTOKEN_OAUTH_GRANT_TYPE,
      client_id: endpoints.clientId,
      device_code: params.deviceCode,
      code_verifier: params.verifier,
    }),
  });

  const text = await res.text();

  let payload: TokenResponsePayload | undefined;
  try {
    payload = JSON.parse(text) as TokenResponsePayload;
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    if (payload?.error === "authorization_pending") {
      return { status: "pending", message: "正在等待用户授权..." };
    }
    if (payload?.error === "slow_down") {
      return { status: "pending", message: "速率受限，正在减慢请求..." };
    }
    return {
      status: "error",
      message: payload?.error_description ?? payload?.error ?? text ?? "OAuth 令牌请求失败",
    };
  }

  if (!payload) {
    return { status: "error", message: "CMToken OAuth 无法解析响应。" };
  }

  if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
    return { status: "error", message: "CMToken OAuth 返回的令牌负载不完整。" };
  }

  return {
    status: "success",
    token: {
      access: payload.access_token,
      refresh: payload.refresh_token,
      expires: Date.now() + payload.expires_in * 1000,
      resourceUrl: payload.resource_url,
      notification_message: payload.notification_message,
    },
  };
}

function renderQrAscii(data: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(data, { small: true }, (output: string) => {
      resolve(output);
    });
  });
}

export async function loginCMTokenOAuth(params: {
  openUrl: (url: string) => Promise<void>;
  note: (message: string, title?: string) => Promise<void>;
  progress: { update: (message: string) => void; stop: (message?: string) => void };
  runtime?: { log: (message: string) => void; error: (message: string) => void };
  region?: CMTokenRegion;
  config?: { oauthBaseUrl?: string, clientId?: string };
}): Promise<CMTokenOAuthToken> {
  const endpoints = getOAuthEndpoints(params.config);
  const log = params.runtime?.log ?? console.log;
  const error = params.runtime?.error ?? console.error;

  params.progress.update("正在初始化 CMToken OAuth...");

  let oauth: CMTokenOAuthAuthorization;
  const { verifier, challenge, state } = generatePkce();

  try {
    params.progress.update("正在从服务器获取身份验证链接...");
    oauth = await requestDeviceCode({ challenge, state, config: params.config });
  } catch (err) {
    // Graceful Fallback: Show a generic QR even if the fetch fails
    const fallbackUrl = endpoints.baseUrl;
    const fallbackQr = await renderQrAscii(fallbackUrl);
    const errorMsg = err instanceof Error ? err.message : String(err);

    const fallbackLines = [
      `🚨 **身份验证连接失败**`,
      "",
      `错误详情: ${errorMsg}`,
      "",
      "由于网络或安全拦截，无法获取动态二维码。请检查您的网络连接并尝试在终端查看验证链接。",
      `访问地址: [${fallbackUrl}](${fallbackUrl})`,
    ];

    await params.note(fallbackLines.join("\n"), "CMToken 认证失败 (备选方案)");
    throw err;
  }

  const verificationUrl = oauth.verification_uri_complete ?? oauth.verification_uri;
  const qrAscii = await renderQrAscii(verificationUrl);

  const noteLines = [
    `CMToken OAuth 登录`,
    ``,
    `验证地址: [${verificationUrl}](${verificationUrl})`,
    `用户代码: **${oauth.user_code}**`,
    ``,
    `请查看**终端日志**扫描二维码，或点击上方链接。`,
  ];

  // PRIMARY display is in terminal LOG, as it is monospace and stable.
  log("\n" + qrAscii);
  log(`\n验证地址: ${verificationUrl}`);
  log(`用户代码: ${oauth.user_code}\n`);

  await params.note(noteLines.join("\n"), "CMToken OAuth");

  // params.progress.update("正在尝试打开浏览器进行 CMToken OAuth 认证...");
  // try {
  //   await params.openUrl(verificationUrl);
  // } catch (err) {
  //   error(`自动打开浏览器失败，请手动打开或扫描下方的二维码`);
  // }

  let pollIntervalMs = oauth.interval ? oauth.interval * 1000 : 2000;
  const expireTimeMs = Date.now() + oauth.expires_in * 1000;

  while (Date.now() < expireTimeMs) {
    params.progress.update("正在等待 CMToken OAuth 授权...");
    const result = await pollOAuthToken({
      deviceCode: oauth.device_code,
      verifier,
      config: params.config,
    });

    if (result.status === "success") {
      return result.token;
    }

    if (result.status === "error") {
      throw new Error(result.message);
    }

    if (result.message?.includes("slow down")) {
      pollIntervalMs = Math.min(pollIntervalMs * 1.5, 10000);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("CMToken OAuth 在授权完成前超时。");
}

export async function refreshCMTokenToken(params: {
  refreshToken: string;
  config?: { oauthBaseUrl?: string, clientId?: string };
}): Promise<CMTokenOAuthToken> {
  const endpoints = getOAuthEndpoints(params.config);

  ensureGlobalUndiciEnvProxyDispatcher();

  const res = await fetch(endpoints.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: toFormUrlEncoded({
      grant_type: "refresh_token",
      client_id: endpoints.clientId,
      refresh_token: params.refreshToken,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`CMToken OAuth refresh failed: ${text || res.status}`);
  }

  const payload = JSON.parse(text) as TokenResponsePayload;

  if (payload.error) {
    throw new Error(`CMToken OAuth refresh failed: ${payload.error_description || payload.error}`);
  }

  if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
    throw new Error("CMToken OAuth refresh returned incomplete token payload.");
  }

  return {
    access: payload.access_token,
    refresh: payload.refresh_token,
    expires: Date.now() + payload.expires_in * 1000,
    resourceUrl: payload.resource_url,
    notification_message: payload.notification_message,
  };
}


export async function fetchCMTokenModels(params: {
  accessToken: string;
  baseUrl: string;
}): Promise<Array<{ id: string; name: string; context_window?: number }>> {
  const apiBaseUrl = params.baseUrl;

  const response = await fetch(`${apiBaseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch models: ${text || response.statusText}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ id: string; name?: string; context_window?: number }>;
  };

  return (data.data ?? []).map((model) => ({
    id: model.id,
    name: model.name ?? model.id,
    context_window: model.context_window,
  }));
}
