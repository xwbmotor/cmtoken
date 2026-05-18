import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { clawbotHubPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(clawbotHubPlugin);
