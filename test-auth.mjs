import { ensureApiKeyFromOptionEnvOrPrompt } from "openclaw/plugin-sdk/provider-auth";

const ctx = {
  config: {},
  prompter: {
    text: async (opts) => "test-key"
  }
};

async function run() {
  try {
    await ensureApiKeyFromOptionEnvOrPrompt({
      config: ctx.config,
      env: {},
      provider: "cmtoken",
      envLabels: ["CMTOKEN_API_KEY"],
      promptMessage: "请输入 CMToken API Key",
      setCredential: async () => {}
    });
    console.log("Success");
  } catch (e) {
    console.error("Error:", e.stack);
  }
}
run();
