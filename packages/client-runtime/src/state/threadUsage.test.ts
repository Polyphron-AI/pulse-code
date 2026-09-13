import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationThreadActivity } from "@t3tools/contracts";

import { deriveThreadCostUsd } from "./threadUsage.ts";

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

  it("keeps cost across a handoff", () => {
    const activities = [
      activity("context-window.updated", { usedTokens: 1, costUsd: 3 }, 0),
      activity("thread.handoff", {}, 1),
      activity("context-window.updated", { usedTokens: 1, costUsd: 0.5 }, 2),
    ];
    expect(deriveThreadCostUsd(activities)).toBeCloseTo(3.5, 10);
  });
});
