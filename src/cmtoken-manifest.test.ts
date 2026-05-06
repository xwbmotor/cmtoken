import { describe, expect, it } from "vitest";
import cmTokenManifest from "./openclaw.plugin.json";

describe("cmtoken manifest contract", () => {
  it("contains the correct unique id", () => {
    expect(cmTokenManifest.id).toBe("cmtoken");
  });

  it("defines the expected provider auth choices", () => {
    // We expect at least OAuth and API Key choices to be defined in the manifest
    const providers = cmTokenManifest.providers || [];
    const cmtokenProvider = providers.find(p => p.id === "cmtoken");
    
    expect(cmtokenProvider).toBeDefined();
    
    const authMethods = cmtokenProvider?.auth?.methods || [];
    
    // Verify OAuth method
    const oauthMethod = authMethods.find(m => m.id === "oauth");
    expect(oauthMethod).toBeDefined();
    expect(oauthMethod).toMatchObject({
      label: "CMToken OAuth",
      hint: "Login via browser or QR code",
    });

    // Verify API Key method
    const apiKeyMethod = authMethods.find(m => m.id === "api-key");
    expect(apiKeyMethod).toBeDefined();
    expect(apiKeyMethod).toMatchObject({
      optionKey: "cmtokenApiKey",
    });
  });
});
