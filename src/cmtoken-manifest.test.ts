import { describe, expect, it } from "vitest";
import cmTokenManifest from "./openclaw.plugin.json" with { type: "json" };

describe("cmtoken manifest contract", () => {
  it("contains the correct unique id", () => {
    expect(cmTokenManifest.id).toBe("cmtoken");
  });

  it("defines the expected provider auth choices", () => {
    // We expect at least OAuth and API Key choices to be defined in the manifest auth choices
    const authChoices = cmTokenManifest.providerAuthChoices || [];
    
    // Verify OAuth choice
    const oauthChoice = authChoices.find(c => c.method === "oauth" && c.provider === "cmtoken");
    expect(oauthChoice).toBeDefined();
    expect(oauthChoice).toMatchObject({
      choiceLabel: "CMToken OAuth",
      choiceHint: "Login via browser or QR code",
    });

    // Verify API Key choice
    const apiKeyChoice = authChoices.find(c => c.method === "api-key" && c.provider === "cmtoken");
    expect(apiKeyChoice).toBeDefined();
    expect(apiKeyChoice).toMatchObject({
      optionKey: "cmtokenApiKey",
    });
  });
});
