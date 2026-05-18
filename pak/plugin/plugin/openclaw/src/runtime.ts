import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "./runtime-api.js";

const { setRuntime: setClawbotHubRuntime, getRuntime: getClawbotHubRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "clawbot-hub",
    errorMessage: "ClawBot Hub runtime not initialized",
  });

export { getClawbotHubRuntime, setClawbotHubRuntime };
