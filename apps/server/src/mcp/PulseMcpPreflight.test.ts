import { describe, expect, it, vi } from "vitest";

import { makePulseMcpTurnPreflight, type McpConnectionReadiness } from "./PulseMcpPreflight.ts";

const makeDependencies = (readiness: Record<string, McpConnectionReadiness> = {}) => ({
  supportsProvider: (provider: string) => provider !== "opencode",
  checkConnection: vi.fn(async (id: string) => readiness[id] ?? { status: "available" as const }),
});

describe("Pulse MCP turn preflight decisions", () => {
  it("uses instance defaults, while an explicit empty thread override selects none", async () => {
    const defaults = makePulseMcpTurnPreflight(makeDependencies(), {
      turnId: "turn-defaults",
      provider: "codex",
      defaultConnectionIds: ["docs", "issues"],
    });
    expect((await defaults.start()).type).toBe("submit");
    expect(defaults.snapshot).toMatchObject({
      selectionSource: "default",
      selectedConnectionIds: ["docs", "issues"],
    });

    const none = makePulseMcpTurnPreflight(makeDependencies(), {
      turnId: "turn-none",
      provider: "codex",
      defaultConnectionIds: ["docs"],
      threadConnectionIds: [],
    });
    expect(none.snapshot).toMatchObject({ selectionSource: "thread", selectedConnectionIds: [] });
    expect((await none.start()).type).toBe("submit");
  });

  it("freezes and deduplicates the effective selection for the lifetime of a turn", async () => {
    const selected = ["docs", "docs", "issues"];
    const dependencies = makeDependencies();
    const preflight = makePulseMcpTurnPreflight(dependencies, {
      turnId: "turn-1",
      provider: "claude",
      defaultConnectionIds: [],
      threadConnectionIds: selected,
    });
    selected.splice(0, selected.length, "changed-after-send");

    const decision = await preflight.start();
    expect(decision.type === "submit" && decision.snapshot.selectedConnectionIds).toEqual([
      "docs",
      "issues",
    ]);
    expect(Object.isFrozen(preflight.snapshot.selectedConnectionIds)).toBe(true);
    expect(dependencies.checkConnection).toHaveBeenCalledTimes(2);
  });

  it("keeps unknown readiness distinct from available and does not call it a failure", async () => {
    const preflight = makePulseMcpTurnPreflight(
      makeDependencies({ native: { status: "unknown" }, pulse: { status: "available" } }),
      { turnId: "turn-1", provider: "antigravity", defaultConnectionIds: ["native", "pulse"] },
    );
    expect(await preflight.start()).toMatchObject({
      type: "submit",
      readiness: { native: "unknown", pulse: "available" },
    });
  });

  it("blocks unsupported providers before probing connections", async () => {
    const dependencies = makeDependencies();
    const preflight = makePulseMcpTurnPreflight(dependencies, {
      turnId: "turn-1",
      provider: "opencode",
      defaultConnectionIds: ["docs"],
    });
    expect(await preflight.start()).toMatchObject({
      type: "pause",
      reason: "unsupported-provider",
    });
    expect(dependencies.checkConnection).not.toHaveBeenCalled();
  });

  it("allows an ordinary turn with no selected connections on an unsupported provider", async () => {
    const dependencies = makeDependencies();
    const preflight = makePulseMcpTurnPreflight(dependencies, {
      turnId: "turn-1",
      provider: "opencode",
      defaultConnectionIds: [],
    });
    expect(await preflight.start()).toMatchObject({ type: "submit" });
    expect(dependencies.checkConnection).not.toHaveBeenCalled();
  });

  it("turns a thrown readiness probe into a pre-send failure", async () => {
    const preflight = makePulseMcpTurnPreflight(
      {
        supportsProvider: () => true,
        checkConnection: async () => {
          throw new Error("probe crashed");
        },
      },
      { turnId: "turn-1", provider: "codex", defaultConnectionIds: ["docs"] },
    );
    expect(await preflight.start()).toMatchObject({
      type: "pause",
      reason: "connection-failed",
      failures: { docs: "probe crashed" },
    });
  });

  it("pauses on a selected failure and retry reevaluates without submitting", async () => {
    const checkConnection = vi
      .fn<(id: string) => Promise<McpConnectionReadiness>>()
      .mockResolvedValueOnce({ status: "failed", reason: "sign-in required" })
      .mockResolvedValueOnce({ status: "available" });
    const preflight = makePulseMcpTurnPreflight(
      { supportsProvider: () => true, checkConnection },
      { turnId: "turn-1", provider: "codex", defaultConnectionIds: ["docs"] },
    );
    expect(await preflight.start()).toMatchObject({
      type: "pause",
      reason: "connection-failed",
      failures: { docs: "sign-in required" },
    });
    expect(await preflight.act({ id: "retry-1", type: "retry" })).toMatchObject({ type: "ready" });
    expect(checkConnection).toHaveBeenCalledTimes(2);
  });

  it("continues once without failed connections and leaves the saved snapshot intact", async () => {
    const preflight = makePulseMcpTurnPreflight(
      makeDependencies({ docs: { status: "failed", reason: "offline" } }),
      { turnId: "turn-1", provider: "cursor", defaultConnectionIds: ["docs", "issues"] },
    );
    await preflight.start();
    const continued = await preflight.act({ id: "continue-1", type: "continue-without-failed" });
    expect(continued.type === "submit" && continued.snapshot.selectedConnectionIds).toEqual([
      "issues",
    ]);
    expect(preflight.snapshot.selectedConnectionIds).toEqual(["docs", "issues"]);
    expect(await preflight.act({ id: "continue-2", type: "continue-without-failed" })).toEqual({
      type: "no-op",
      reason: "turn-finalized",
    });
  });

  it("deduplicates repeated action delivery and initial authorization", async () => {
    const dependencies = makeDependencies({ docs: { status: "failed", reason: "offline" } });
    const preflight = makePulseMcpTurnPreflight(dependencies, {
      turnId: "turn-1",
      provider: "codex",
      defaultConnectionIds: ["docs"],
    });
    await preflight.start();
    expect(await preflight.start()).toEqual({ type: "no-op", reason: "duplicate-action" });
    await preflight.act({ id: "retry-1", type: "retry" });
    expect(await preflight.act({ id: "retry-1", type: "retry" })).toEqual({
      type: "no-op",
      reason: "duplicate-action",
    });
    expect(dependencies.checkConnection).toHaveBeenCalledTimes(2);
  });

  it("serializes competing continue actions behind an in-flight preflight", async () => {
    let release!: (value: McpConnectionReadiness) => void;
    const checkConnection = vi.fn(
      () =>
        new Promise<McpConnectionReadiness>((resolve) => {
          release = resolve;
        }),
    );
    const preflight = makePulseMcpTurnPreflight(
      { supportsProvider: () => true, checkConnection },
      { turnId: "turn-1", provider: "codex", defaultConnectionIds: ["docs"] },
    );

    const starting = preflight.start();
    const firstContinue = preflight.act({ id: "continue-1", type: "continue-without-failed" });
    const secondContinue = preflight.act({ id: "continue-2", type: "continue-without-failed" });
    await Promise.resolve();
    release({ status: "failed", reason: "offline" });

    expect(await starting).toMatchObject({ type: "pause" });
    expect(await firstContinue).toMatchObject({ type: "submit" });
    expect(await secondContinue).toEqual({ type: "no-op", reason: "turn-finalized" });
  });

  it("does not let Continue bypass an unsupported provider", async () => {
    const preflight = makePulseMcpTurnPreflight(makeDependencies(), {
      turnId: "turn-1",
      provider: "opencode",
      defaultConnectionIds: ["docs"],
    });
    await preflight.start();
    expect(await preflight.act({ id: "continue-1", type: "continue-without-failed" })).toEqual({
      type: "no-op",
      reason: "turn-finalized",
    });
  });
});
