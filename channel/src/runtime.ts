import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "./runtime-api.js";

const { setRuntime: setTukenRuntime, getRuntime: getTukenRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "tuken",
    errorMessage: "Tuken runtime not initialized",
  });

export { getTukenRuntime, setTukenRuntime };

