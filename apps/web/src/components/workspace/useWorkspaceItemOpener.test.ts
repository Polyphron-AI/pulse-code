import { describe, expect, it } from "vite-plus/test";
import { parseMailLocation } from "./useWorkspaceItemOpener";

describe("workspace source-message locations", () => {
  it("retains account and Message-ID when opening source from another space", () => {
    const source = { type: "mail", accountId: "account-b", messageId: "<captured@example.test>" };
    expect(parseMailLocation(JSON.stringify(source))).toEqual(source);
  });
  it("rejects malformed locations and unrelated item kinds", () => {
    expect(parseMailLocation("{")).toBeNull();
    expect(parseMailLocation(JSON.stringify({ type: "mail", accountId: "account-b" }))).toBeNull();
    expect(
      parseMailLocation(JSON.stringify({ type: "url", url: "https://example.test" })),
    ).toBeNull();
  });
});
