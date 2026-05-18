import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { tukenPlugin, setTukenRuntime } from "./api.js";

export default defineChannelPluginEntry({
  id: "tuken",
  name: "Tuken",
  description: "Tuken channel extension",
  plugin: tukenPlugin,
  setRuntime: setTukenRuntime,
});

