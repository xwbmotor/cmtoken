import {
  resolveAgentDir,
  resolveDefaultAgentId,
} from "openclaw/plugin-sdk/agent-runtime";
import { upsertAuthProfileWithLock } from "openclaw/plugin-sdk/provider-auth";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";

const PROVIDER_ID = "cmtoken";
const DEFAULT_PROFILE_ID = `${PROVIDER_ID}:default`;
const MAX_STDIN_BYTES = 64 * 1024;

type BootstrapCredentialInput = {
  access?: unknown;
  refresh?: unknown;
  expires?: unknown;
};

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing or invalid ${field}.`);
  }
  return value.trim();
}

function normalizeExpires(value: unknown): number {
  const expires = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    throw new Error("Missing or invalid expires timestamp.");
  }
  return Math.trunc(expires);
}

async function readBootstrapCredentialFromStdin(): Promise<BootstrapCredentialInput> {
  if (process.stdin.isTTY) {
    throw new Error("Bootstrap credentials must be provided through stdin.");
  }

  process.stdin.setEncoding("utf8");
  let body = "";
  for await (const chunk of process.stdin) {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > MAX_STDIN_BYTES) {
      throw new Error("Bootstrap credential payload is too large.");
    }
  }

  if (!body.trim()) {
    throw new Error("Bootstrap credential payload is empty.");
  }

  try {
    return JSON.parse(body) as BootstrapCredentialInput;
  } catch {
    throw new Error("Bootstrap credential payload must be valid JSON.");
  }
}

export function registerCMTokenBootstrapCli(api: OpenClawPluginApi) {
  api.registerCli(
    ({ program, config }) => {
      const cmtoken = program
        .command("cmtoken")
        .description("CMToken provider commands");

      cmtoken
        .command("bootstrap-auth")
        .description("Import an already-authorized OAuth credential from stdin")
        .option("--agent <id>", "Target agent id")
        .option("--profile-id <id>", "Auth profile id", DEFAULT_PROFILE_ID)
        .action(async (options: { agent?: string; profileId?: string }) => {
          const input = await readBootstrapCredentialFromStdin();
          const agentId = options.agent?.trim() || resolveDefaultAgentId(config);
          const agentDir = resolveAgentDir(config, agentId);
          const profileId = options.profileId?.trim() || DEFAULT_PROFILE_ID;
          const credential = {
            type: "oauth" as const,
            provider: PROVIDER_ID,
            access: requireNonEmptyString(input.access, "access token"),
            refresh: requireNonEmptyString(input.refresh, "refresh token"),
            expires: normalizeExpires(input.expires),
          };

          const updated = await upsertAuthProfileWithLock({
            profileId,
            credential,
            agentDir,
          });
          if (!updated?.profiles?.[profileId]) {
            throw new Error(`OpenClaw did not persist auth profile ${profileId}.`);
          }

          process.stdout.write(
            JSON.stringify({
              ok: true,
              agentId,
              profileId,
              provider: PROVIDER_ID,
              type: "oauth",
              expires: credential.expires,
            }) + "\n",
          );
        });
    },
    {
      descriptors: [
        {
          name: "cmtoken",
          description: "CMToken provider commands",
          hasSubcommands: true,
        },
      ],
    },
  );
}
