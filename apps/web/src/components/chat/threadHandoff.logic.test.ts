import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";

import {
  classifyThreadModelPick,
  isThreadHandoffSendBlocked,
  resolveThreadHandoffBasisNote,
  resolveThreadHandoffErrorMessage,
  resolveThreadHandoffModelLabel,
  type ThreadHandoffModelLabel,
} from "./threadHandoff.logic";
import type { ProviderInstanceEntry } from "../../providerInstances";

describe("classifyThreadModelPick", () => {
  it("is normal when the thread is not locked yet", () => {
    expect(
      classifyThreadModelPick({
        isLocked: false,
        threadHandoffEnabled: true,
        matchesLockedProvider: false,
        disabledReason: "blocked",
      }),
    ).toBe("normal");
  });

  it("is normal for a same-group pick with no block reason", () => {
    expect(
      classifyThreadModelPick({
        isLocked: true,
        threadHandoffEnabled: true,
        matchesLockedProvider: true,
        disabledReason: null,
      }),
    ).toBe("normal");
  });

  it("is disabled for an out-of-group pick when handoff is unsupported", () => {
    expect(
      classifyThreadModelPick({
        isLocked: true,
        threadHandoffEnabled: false,
        matchesLockedProvider: false,
        disabledReason: null,
      }),
    ).toBe("disabled");
  });

  it("is disabled for a same-group pick blocked by the change-reason check when handoff is unsupported", () => {
    expect(
      classifyThreadModelPick({
        isLocked: true,
        threadHandoffEnabled: false,
        matchesLockedProvider: true,
        disabledReason: "Start a new thread to use this model.",
      }),
    ).toBe("disabled");
  });

  it("is handoff for an out-of-group pick when handoff is supported", () => {
    expect(
      classifyThreadModelPick({
        isLocked: true,
        threadHandoffEnabled: true,
        matchesLockedProvider: false,
        disabledReason: null,
      }),
    ).toBe("handoff");
  });

  it("is handoff for a same-group pick blocked by the change-reason check when handoff is supported", () => {
    expect(
      classifyThreadModelPick({
        isLocked: true,
        threadHandoffEnabled: true,
        matchesLockedProvider: true,
        disabledReason: "Start a new thread to use this model.",
      }),
    ).toBe("handoff");
  });
});

function makeEntry(overrides: Partial<ProviderInstanceEntry> = {}): ProviderInstanceEntry {
  return {
    instanceId: ProviderInstanceId.make("claude_default"),
    driverKind: ProviderDriverKind.make("claudeAgent"),
    displayName: "Claude",
    enabled: true,
    installed: true,
    status: "ready",
    isDefault: true,
    isAvailable: true,
    snapshot: {} as ProviderInstanceEntry["snapshot"],
    models: [
      { slug: "opus", name: "Claude Opus", isCustom: false, capabilities: null },
      { slug: "sonnet", name: "Claude Sonnet", isCustom: false, capabilities: null },
    ] as ProviderInstanceEntry["models"],
    ...overrides,
  };
}

describe("resolveThreadHandoffModelLabel", () => {
  it("returns null when there is no selection", () => {
    expect(resolveThreadHandoffModelLabel([makeEntry()], null)).toBeNull();
  });

  it("resolves provider and model names from the matching instance entry", () => {
    const label: ThreadHandoffModelLabel | null = resolveThreadHandoffModelLabel([makeEntry()], {
      instanceId: "claude_default",
      model: "opus",
    });
    expect(label).toEqual({ providerLabel: "Claude", modelLabel: "Claude Opus" });
  });

  it("falls back to the raw ids when the instance or model can't be found", () => {
    expect(
      resolveThreadHandoffModelLabel([makeEntry()], {
        instanceId: "unknown_instance",
        model: "unknown_model",
      }),
    ).toEqual({ providerLabel: "unknown_instance", modelLabel: "unknown_model" });
  });
});

describe("resolveThreadHandoffBasisNote", () => {
  it("is a warning note for fallback", () => {
    expect(resolveThreadHandoffBasisNote("fallback", "Claude Opus")).toEqual({
      text: "Summary unavailable, only the first line of each older message is included.",
      tone: "warning",
    });
  });

  it("credits the destination model for generated summaries", () => {
    expect(resolveThreadHandoffBasisNote("generated", "Claude Opus")).toEqual({
      text: "Summary written by Claude Opus",
      tone: "neutral",
    });
  });

  it("notes the full conversation was kept for verbatim", () => {
    expect(resolveThreadHandoffBasisNote("verbatim", "Claude Opus")).toEqual({
      text: "Full conversation included",
      tone: "neutral",
    });
  });
});

describe("isThreadHandoffSendBlocked", () => {
  it("blocks while running or starting", () => {
    expect(isThreadHandoffSendBlocked("running")).toBe(true);
    expect(isThreadHandoffSendBlocked("starting")).toBe(true);
  });

  it("does not block other statuses", () => {
    expect(isThreadHandoffSendBlocked("idle")).toBe(false);
    expect(isThreadHandoffSendBlocked(null)).toBe(false);
    expect(isThreadHandoffSendBlocked(undefined)).toBe(false);
  });
});

describe("resolveThreadHandoffErrorMessage", () => {
  it("maps thread-busy to an actionable message", () => {
    expect(resolveThreadHandoffErrorMessage("thread-busy", "server said busy")).toBe(
      "Stop the current turn before switching.",
    );
  });

  it("passes through the server message for other reasons", () => {
    expect(resolveThreadHandoffErrorMessage("generation-failed", "could not summarize")).toBe(
      "could not summarize",
    );
    expect(resolveThreadHandoffErrorMessage(null, "unknown error")).toBe("unknown error");
  });
});
