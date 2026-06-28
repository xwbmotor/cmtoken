import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerCMTokenBootstrapCli } from "./bootstrap-auth.js";
import { registerCMTokenProviders } from "./provider-registration.js";

export default definePluginEntry({
  id: "cmtoken",
  name: "CMToken",
  description: "CMToken provider plugin with OAuth support (browser and QR code)",
  register(api) {
    registerCMTokenProviders(api);
    registerCMTokenBootstrapCli(api);
  },
});
