import type { ModelDefinitionConfig } from "openclaw/plugin-sdk/provider-onboard";
import { STATIC_MODELS } from "./provider-models.js";

export class CMTokenSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CMTokenSubscriptionError";
  }
}

export class CMTokenDiscoveryError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CMTokenDiscoveryError";
    this.status = status;
  }
}

export async function fetchCMTokenModels(
  url: string,
  timeoutMs: number = 15000,
  token?: string
): Promise<ModelDefinitionConfig[]> {
  if (!token) {
    return STATIC_MODELS;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = { "Accept": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "N/A");
      
      // Handle subscription error specifically (not in plan or expired)
      const isSubscriptionError = response.status === 403 && 
        (errorText.includes("订阅套餐") || errorText.includes("订阅已过期") || errorText.includes("余额不足"));

      if (isSubscriptionError) {
        console.warn(`[CMToken] Subscription issue: ${errorText}`);
        throw new CMTokenSubscriptionError(errorText);
      }

      console.error(`[CMToken] Fetch models failed (${response.status}): ${errorText}`);
      throw new CMTokenDiscoveryError(errorText, response.status);
    }

    const data = await response.json();
    const modelsArray = Array.isArray(data.models) ? data.models : (data.data && Array.isArray(data.data) ? data.data : null);
    
    if (modelsArray) {
      return modelsArray;
    }

    if (data && data.code && data.code !== 100200) {
      const msg = data.msg || data.message || "Unknown error";
      if (data.code === 403 && msg.includes("订阅套餐")) {
         throw new CMTokenSubscriptionError(msg);
      }
      console.error(`[CMToken] Models API returned error code ${data.code}: ${msg}`);
    }
    
    return STATIC_MODELS;
  } catch (err: any) {
    if (err instanceof CMTokenSubscriptionError) {
      throw err;
    }
    console.error(`[CMToken] Fetch models error: ${err.message || err}`);
    return STATIC_MODELS;
  }
}
