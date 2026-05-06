import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerCMTokenProviders } from "./provider-registration.js";

export default definePluginEntry({
  id: "cmtoken",
  name: "CMToken",
  description: "CMToken provider plugin with OAuth support (browser and QR code)",
  register(api) {
    registerCMTokenProviders(api);
  },
});
