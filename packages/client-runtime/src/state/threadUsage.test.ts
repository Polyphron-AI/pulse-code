import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationThreadActivity } from "@t3tools/contracts";

/** Pulse Next has no handoff activity yet; the derive still segments on it. */
const THREAD_HANDOFF_ACTIVITY_KIND = "provider.handoff";

import { deriveOutputTokensPerSecond, deriveThreadCostUsd } from "./threadUsage.ts";

function activity(
  kind: string,
  payload: Record<string, unknown>,
  index: number,
): OrchestrationThreadActivity {
  return {
    id: `activity-${index}`,
    kind,
    createdAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    payload,
  } as unknown as OrchestrationThreadActivity;
}

function costActivities(values: ReadonlyArray<number | null>) {
  return values.map((value, index) =>
    activity(
      "context-window.updated",
      value === null ? { usedTokens: 10 } : { usedTokens: 10, costUsd: value },
      index,
    ),
  );
}

describe("deriveThreadCostUsd", () => {
  it("returns the last value of a single monotone run", () => {
    expect(deriveThreadCostUsd(costActivities([0.25, 0.5, 1.75]))).toBeCloseTo(1.75, 10);
  });

  it("sums runs across a process restart drop", () => {
    // 2.0 banked, then a new process climbs to 0.75.
    expect(deriveThreadCostUsd(costActivities([0.5, 2, 0.25, 0.75]))).toBeCloseTo(2.75, 10);
  });

  it("returns null when no activity reports cost", () => {
    expect(deriveThreadCostUsd(costActivities([null, null]))).toBeNull();
    expect(deriveThreadCostUsd([])).toBeNull();
  });

  it("ignores non-cost activities and unusable values", () => {
    const activities = [
      activity("message.created", { costUsd: 100 }, 0),
      activity("context-window.updated", { usedTokens: 1, costUsd: 1 }, 1),
      activity("context-window.updated", { usedTokens: 1, costUsd: -3 }, 2),
      activity("context-window.updated", { usedTokens: 1, costUsd: "2" }, 3),
      activity("context-window.updated", { usedTokens: 1 }, 4),
      activity("context-window.updated", { usedTokens: 1, costUsd: 1.5 }, 5),
    ];
    expect(deriveThreadCostUsd(activities)).toBeCloseTo(1.5, 10);
  });

  it("restarts the cumulative counter at each handoff and sums the segments", () => {
    const activities = [
      activity("context-window.updated", { usedTokens: 1, costUsd: 10 }, 0),
      activity(THREAD_HANDOFF_ACTIVITY_KIND, {}, 1),
      activity("context-window.updated", { usedTokens: 1, costUsd: 2 }, 2),
      activity(THREAD_HANDOFF_ACTIVITY_KIND, {}, 3),
      activity("context-window.updated", { usedTokens: 1, costUsd: 2 }, 4),
      activity(THREAD_HANDOFF_ACTIVITY_KIND, {}, 5),
      activity("context-window.updated", { usedTokens: 1, costUsd: 3 }, 6),
    ];
    expect(deriveThreadCostUsd(activities)).toBeCloseTo(17, 10);
  });

  it("still treats a drop without a handoff as a process restart", () => {
    expect(deriveThreadCostUsd(costActivities([10, 2]))).toBeCloseTo(12, 10);
  });

  it("contributes nothing for a segment that reported no cost", () => {
    const activities = [
      activity("context-window.updated", { usedTokens: 1 }, 0),
      activity(THREAD_HANDOFF_ACTIVITY_KIND, {}, 1),
      activity("context-window.updated", { usedTokens: 1, costUsd: 4 }, 2),
      activity(THREAD_HANDOFF_ACTIVITY_KIND, {}, 3),
      activity("context-window.updated", { usedTokens: 1 }, 4),
    ];
    expect(deriveThreadCostUsd(activities)).toBeCloseTo(4, 10);
  });
});

describe("deriveOutputTokensPerSecond", () => {
  const turn = (turnOutputTokens: number, turnDurationMs: number, index: number) =>
    activity("context-window.updated", { turnOutputTokens, turnDurationMs }, index);

  it("stays null until two turns cover thirty seconds", () => {
    expect(deriveOutputTokensPerSecond(costActivities([0.5]))).toBeNull();
    // One long turn is still one turn.
    expect(deriveOutputTokensPerSecond([turn(6_000, 60_000, 0)])).toBeNull();
    // Two quick exchanges are latency, not throughput.
    expect(deriveOutputTokensPerSecond([turn(100, 5_000, 0), turn(100, 5_000, 1)])).toBeNull();
    expect(deriveOutputTokensPerSecond([turn(1_500, 15_000, 0), turn(1_500, 15_000, 1)])).toBe(100);
  });

  it("weights by time across the last five turns, ignoring older ones", () => {
    const activities = [
      turn(1_000_000, 1_000, 0), // outside the window
      ...[1, 2, 3, 4].map((index) => turn(1_000, 10_000, index)),
      activity("context-window.updated", { usedTokens: 10 }, 5),
      turn(1_000, 1_000, 6),
    ];
    // 5,000 tokens over 41 seconds, not the 280 tok/s mean of per-turn rates.
    expect(deriveOutputTokensPerSecond(activities)).toBeCloseTo(5_000 / 41, 10);
  });
});
