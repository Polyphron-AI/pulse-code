/**
 * Thread-level usage derivations shared by web and mobile.
 *
 * @module state/threadUsage
 */
import type { OrchestrationThreadActivity } from "@t3tools/contracts";

/**
 * Total API-rate cost for a thread, in USD, or null when no activity reported
 * one.
 *
 * Providers report `costUsd` cumulatively for the process they run in, so the
 * series resets to a lower value every time that process restarts. Summing
 * monotone runs turns those resets back into one running total. Handoffs are
 * deliberately not a boundary: cost is money already spent, so it stays on the
 * thread even after it moves to another provider.
 */
export function deriveThreadCostUsd(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  let base = 0;
  let runMax: number | null = null;

  for (const activity of activities) {
    if (activity.kind !== "context-window.updated") continue;
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const value = payload?.costUsd;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;

    if (runMax === null) {
      runMax = value;
      continue;
    }
    if (value < runMax) {
      // A drop means a fresh provider process: bank the finished run.
      base += runMax;
      runMax = value;
      continue;
    }
    runMax = value;
  }

  return runMax === null ? null : base + runMax;
}
