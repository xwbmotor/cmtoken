import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { tukenPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(tukenPlugin);

