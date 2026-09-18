import { describe, expect, it } from "vite-plus/test";

import {
  describeWardenError,
  grantBadgeLabel,
  wardenDraftFromSettings,
  wardenInputFromDraft,
  worstGrantStatus,
} from "./mcpWardenForm";

describe("Warden settings form", () => {
  it("keeps a configured PAT unless replaced or cleared", () => {
    const draft = wardenDraftFromSettings({
      origin: "https://go.example.test",
      patConfigured: true,
    });
    expect(draft).toEqual({ origin: "https://go.example.test", pat: "", replacePat: false });
    expect(wardenInputFromDraft(draft, true, false)).toEqual({ origin: "https://go.example.test" });
    expect(wardenInputFromDraft({ ...draft, replacePat: true, pat: "new" }, true, false)).toEqual({
      origin: "https://go.example.test",
      pat: "new",
    });
    expect(wardenInputFromDraft(draft, true, true)).toEqual({
      origin: "https://go.example.test",
      pat: "",
    });
  });

  it("sends a new PAT when none is configured and trims the origin", () => {
    expect(
      wardenInputFromDraft(
        { origin: " https://go.example.test/ ", pat: "tok", replacePat: false },
        false,
        false,
      ),
    ).toEqual({ origin: "https://go.example.test", pat: "tok" });
  });

  it("labels grant states", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(
      grantBadgeLabel({ status: "active", expiresAt: "2026-09-25T12:00:00.000Z" }, now),
    ).toMatch(/^Active until /);
    expect(grantBadgeLabel({ status: "active" }, now)).toBe("Active");
    expect(grantBadgeLabel({ status: "pending" }, now)).toBe("Pending acceptance");
    expect(grantBadgeLabel({ status: "none" }, now)).toBe("No grant");
  });

  it("picks the worst grant state across a connection", () => {
    expect(worstGrantStatus([])).toBeNull();
    expect(worstGrantStatus(["active", "active"])).toBe("active");
    expect(worstGrantStatus(["active", "pending"])).toBe("pending");
    expect(worstGrantStatus(["pending", "none"])).toBe("none");
  });

  it("describes typed warden errors and falls back for unknown ones", () => {
    expect(
      describeWardenError({ _tag: "PulseMcpWardenError", kind: "unauthorized", message: "x" }),
    ).toBe("Pulse Go rejected the token for this environment. Replace it and test again.");
    expect(
      describeWardenError({ _tag: "PulseMcpWardenError", kind: "not-configured", message: "x" }),
    ).toBe("Enter the Pulse Go origin and a personal access token first.");
    expect(
      describeWardenError({ _tag: "PulseMcpWardenError", kind: "unavailable", message: "x" }),
    ).toBe("Pulse Go Warden is unreachable. Check the origin and try again.");
    expect(
      describeWardenError({ _tag: "PulseMcpWardenError", kind: "denied", message: "Nope" }),
    ).toBe("Pulse Go denied the request: Nope");
    expect(describeWardenError(new Error("boom"))).toBe("boom");
    expect(describeWardenError(42)).toBe("The Warden request failed.");
  });
});
