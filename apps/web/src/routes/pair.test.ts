import { describe, expect, it } from "vite-plus/test";

import { normalizeOAuthReturnPath } from "./pair";

describe("pairing OAuth return path", () => {
  it("preserves a same-origin MCP authorization request", () => {
    expect(
      normalizeOAuthReturnPath(
        "/oauth/authorize?client_id=claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcallback",
      ),
    ).toBe("/oauth/authorize?client_id=claude&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcallback");
  });

  it("rejects other and cross-origin return targets", () => {
    expect(normalizeOAuthReturnPath("/settings")).toBeUndefined();
    expect(
      normalizeOAuthReturnPath("https://attacker.example/oauth/authorize?x=1"),
    ).toBeUndefined();
    expect(normalizeOAuthReturnPath("//attacker.example/oauth/authorize?x=1")).toBeUndefined();
  });
});
