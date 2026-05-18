import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { clawbotHubPlugin, setClawbotHubRuntime } from "./api.js";

export default defineChannelPluginEntry({
  id: "clawbot-hub",
  name: "ClawBot Hub",
  description: "ClawBot Hub channel extension",
  plugin: clawbotHubPlugin,
  setRuntime: setClawbotHubRuntime,
});
