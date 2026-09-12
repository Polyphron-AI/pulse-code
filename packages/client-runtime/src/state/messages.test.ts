import { describe, expect, it } from "vite-plus/test";

import { messageAuthorLabel } from "./messages.ts";

describe("messageAuthorLabel", () => {
  it("returns null when the human typed the message", () => {
    expect(messageAuthorLabel(undefined)).toBeNull();
    expect(messageAuthorLabel("user")).toBeNull();
  });

  it("labels each non-user producer", () => {
    expect(messageAuthorLabel("schedule")).toBe("Scheduled");
    expect(messageAuthorLabel("handoff")).toBe("Handoff");
    expect(messageAuthorLabel("assistant")).toBe("Assistant");
    expect(messageAuthorLabel("manager")).toBe("Argo");
    expect(messageAuthorLabel("watchdog")).toBe("Watchdog");
  });

  it("labels a relayed thread message", () => {
    expect(messageAuthorLabel({ kind: "thread", threadId: "thread_123" as never })).toBe(
      "From another thread",
    );
  });
});
