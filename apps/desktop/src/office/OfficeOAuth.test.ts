// @effect-diagnostics globalFetch:off -- Requests exercise only the test-owned loopback OAuth listener.
import * as NodeCrypto from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import {
  authorizeOfficeOAuth,
  oauthScopes,
  refreshOfficeOAuth,
  type OAuthInput,
} from "./OfficeOAuth.ts";

describe("Office native OAuth", () => {
  it("uses PKCE, rejects mismatched state, and closes its loopback listener", async () => {
    let callback = "";
    let challenge = "";
    const input: OAuthInput = {
      provider: "google",
      capabilities: ["mail", "calendar"],
      configuration: { googleClientId: "public-client" },
      now: () => 1000,
      signal: new AbortController().signal,
      openExternal: async (href) => {
        const url = new URL(href);
        expect(url.origin).toBe("https://accounts.google.com");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("access_type")).toBe("offline");
        callback = url.searchParams.get("redirect_uri") ?? "";
        challenge = url.searchParams.get("code_challenge") ?? "";
        const invalid = new URL(callback);
        invalid.search = new URLSearchParams({ code: "wrong", state: "wrong" }).toString();
        expect((await globalThis.fetch(invalid)).status).toBe(400);
        const valid = new URL(callback);
        valid.search = new URLSearchParams({
          code: "test-code",
          state: url.searchParams.get("state") ?? "",
        }).toString();
        expect((await globalThis.fetch(valid)).status).toBe(200);
      },
      fetch: async (url, init) => {
        if (String(url).includes("/token")) {
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("code")).toBe("test-code");
          expect(
            NodeCrypto.createHash("sha256")
              .update(body.get("code_verifier") ?? "")
              .digest("base64url"),
          ).toBe(challenge);
          return Response.json({
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 3600,
          });
        }
        return Response.json({ email: "person@example.com" });
      },
    };
    expect(await authorizeOfficeOAuth(input)).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 3_601_000,
      email: "person@example.com",
    });
    await expect(globalThis.fetch(callback)).rejects.toThrow();
  });

  it("rejects consent denial without exchanging an authorization code", async () => {
    let exchanges = 0;
    const input: OAuthInput = {
      provider: "microsoft",
      capabilities: ["mail"],
      configuration: { microsoftClientId: "public-client" },
      now: () => 0,
      signal: new AbortController().signal,
      openExternal: async (href) => {
        const url = new URL(href);
        const callback = new URL(url.searchParams.get("redirect_uri") ?? "");
        callback.search = new URLSearchParams({
          state: url.searchParams.get("state") ?? "",
          error: "access_denied",
        }).toString();
        await globalThis.fetch(callback);
      },
      fetch: async () => {
        exchanges++;
        return Response.json({});
      },
    };
    await expect(authorizeOfficeOAuth(input)).rejects.toMatchObject({ code: "cancelled" });
    expect(exchanges).toBe(0);
  });

  it("retains a refresh token when the provider omits a replacement", async () => {
    const input: OAuthInput = {
      provider: "google",
      capabilities: ["mail"],
      configuration: { googleClientId: "client" },
      now: () => 0,
      signal: new AbortController().signal,
      openExternal: async () => {},
      fetch: async () => Response.json({ access_token: "new", expires_in: 300 }),
    };
    expect(await refreshOfficeOAuth(input, "existing")).toEqual({
      accessToken: "new",
      refreshToken: "existing",
      expiresAt: 300_000,
    });
    expect(oauthScopes("microsoft", ["mail"])).not.toContain("Mail.Send");
    expect(oauthScopes("google", ["mail"])).not.toContain("calendar");
  });
});
