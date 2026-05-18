import { resolveClawbotHubAccount } from "./accounts.js";
import { loginToHub, pushHubEvent } from "./hub-client.js";
import { parseClawbotHubTarget } from "./target.js";
import type { CoreConfig } from "./types.js";

export async function sendClawbotHubText(params: {
  cfg: CoreConfig;
  accountId?: string | null;
  to: string;
  text: string;
  replyToId?: string | number | null;
}) {
  const account = resolveClawbotHubAccount({ cfg: params.cfg, accountId: params.accountId });
  const target = parseClawbotHubTarget(params.to);
  const auth = await loginToHub({
    baseUrl: account.baseUrl,
    appId: account.appId,
    appSecret: account.appSecret,
    accountId: account.hubAccountId,
    openclawInstanceId: account.openclawInstanceId,
  });

  await pushHubEvent({
    baseUrl: account.baseUrl,
    token: auth.token,
    eventKind: "outbound-message",
    payload: {
      conversationId: target.conversationId,
      text: params.text,
      role: "assistant",
      source: "openclaw",
      replyToId: params.replyToId == null ? undefined : String(params.replyToId),
    },
  });

  return {
    to: params.to,
    messageId: "",
  };
}
