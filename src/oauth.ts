import { generatePkceVerifierChallenge, toFormUrlEncoded } from "openclaw/plugin-sdk/provider-auth";
import { URL, pathToFileURL } from "node:url";

import { randomBytes, randomUUID } from "node:crypto";
import * as tty from "node:tty";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import qrcode from "qrcode-terminal";

const OAUTH_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes for polling requests

function ensureOAuthDispatcher() {
  try {
    const { ensureGlobalUndiciEnvProxyDispatcher } = require("openclaw/plugin-sdk/runtime-env") as typeof import("openclaw/plugin-sdk/runtime-env");
    ensureGlobalUndiciEnvProxyDispatcher();
  } catch {}
}

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

  ensureOAuthDispatcher();

  try {
    const res = await fetch(endpoints.codeEndpoint, {
      method: "POST",
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
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
  ensureOAuthDispatcher();

  let res: Response;
  try {
    res = await fetch(endpoints.tokenEndpoint, {
      method: "POST",
      signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
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
  } catch (err) {
    // Network error during polling, treat as pending to keep retrying
    return { status: "pending", message: `网络请求不稳定，正在重试... (${err instanceof Error ? err.message : String(err)})` };
  }

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

function renderQrAscii(data: string, isSmall: boolean = true): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(data, { small: isSmall }, (output: string) => {
      resolve(output);
    });
  });
}



async function detectModernTerminal(): Promise<{ isModern: boolean; debugInfo: string }> {
  // 不在 TTY 环境里（如被管道重定向），直接认为不支持
  if (!process.stdout.isTTY) return { isModern: false, debugInfo: "not_tty" };

  // 由于 OpenClaw 沙盒限制，我们无法读取 process.env。
  // 在 Windows 上，原生 conhost 也会响应 DA1 查询 (\x1b[c)，导致无法通过 DA1 区分它和 Windows Terminal。
  // 但现代终端（如 Windows Terminal, VS Code, iTerm）支持 OSC 11 查询背景色，而 conhost 不支持且不会乱码。
  // 因此我们通过发送 DA1 和 OSC 11 组合查询，在 Windows 上强依赖 OSC 11 响应来排除 conhost。

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve({ isModern: false, debugInfo: "timeout_no_response" }); // 老式终端不会响应，超时则认为不支持
    }, 300);

    function cleanup() {
      clearTimeout(timeout);
      process.stdin.removeListener("data", onData);
      if (process.stdin.isTTY) (process.stdin as tty.ReadStream).setRawMode(false);
      process.stdin.pause();
    }

    function onData(data: Buffer) {
      cleanup();
      const response = data.toString();
      let isModern = false;
      if (process.platform === "win32") {
        // 在 Windows 上，要求必须响应 OSC 11 才是现代终端
        isModern = response.includes("\x1b]11;");
      } else {
        // Unix 系统下兼容 DA1/DA2 或 OSC 11 响应
        isModern = response.includes("\x1b[?") || response.includes("\x1b[>") || response.includes("\x1b]11;");
      }
      resolve({ isModern, debugInfo: JSON.stringify(response) });
    }

    try {
      process.stdin.resume();
      if (process.stdin.isTTY) (process.stdin as tty.ReadStream).setRawMode(true);
      process.stdin.once("data", onData);

      // 同时发送 DA1 (\x1b[c) 和 OSC 11 查询背景色 (\x1b]11;?\x1b\\)
      process.stdout.write("\x1b[c\x1b]11;?\x1b\\");
    } catch (e) {
      cleanup();
      resolve({ isModern: false, debugInfo: `error_${String(e)}` });
    }
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
  const isWindows = os.platform() === "win32";

  // 通过发送 ANSI 设备查询码探测是否为现代终端
  let isModernTerminal = true;
  if (isWindows) {
    const detection = await detectModernTerminal();
    isModernTerminal = detection.isModern;
  }
  
  // 对于老式终端，关闭 small 模式（使用全方块字符），虽然图案较大，但能完美兼容旧版 conhost 字体
  const qrAscii = await renderQrAscii(verificationUrl, isModernTerminal);

  const noteLines = [
    `验证地址: ${verificationUrl}`,
    `用户代码: ${oauth.user_code}`,
    `请扫描上方二维码，或复制链接在浏览器中授权。`,
  ];

  log(qrAscii);
  await params.note(noteLines.join("\n"), "CMToken OAuth 登录");

  // 暂停加载动画，防止不断刷新的输出导致终端一直自动滚动到底部
  params.progress.stop("等待扫码授权中...（可自由向上滚动查看二维码）");

  let pollIntervalMs = oauth.interval ? oauth.interval * 1000 : 2000;
  const expireTimeMs = Date.now() + oauth.expires_in * 1000;

  while (Date.now() < expireTimeMs) {
    // 不再调用 update 刷新动画，保持终端静止
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

  ensureOAuthDispatcher();

  const res = await fetch(endpoints.tokenEndpoint, {
    method: "POST",
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
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
