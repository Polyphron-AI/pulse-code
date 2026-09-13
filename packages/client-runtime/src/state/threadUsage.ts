/**
 * Thread-level usage derivations shared by client surfaces.
 *
 * @module state/threadUsage
 */
import type { OrchestrationThreadActivity } from "@t3tools/contracts";

/**
 * Activity kind that starts a fresh provider session mid-thread. Pulse Next
 * does not emit it yet; the walk still splits on it so a ported handoff keeps
 * money already spent instead of silently swallowing it.
 */
const THREAD_HANDOFF_ACTIVITY_KIND = "provider.handoff";

/**
 * Total API-rate cost for a thread, in USD, or null when no activity reported
 * one.
 *
 * Providers report `costUsd` cumulatively for the process they run in, so the
 * series resets to a lower value every time that process restarts. Summing
 * monotone runs turns those resets back into one running total.
 *
 * A handoff also starts a fresh provider session, so its cumulative counter
 * restarts from zero there too. That reset is not always a drop: the new
 * provider can climb straight past the old total, which would read as one
 * continuous run and swallow everything spent before the handoff. So the walk
 * splits into segments at each handoff and reconstructs within a segment, then
 * sums the segments. Cost is money already spent, so nothing before a handoff
 * is ever discarded.
 */
export function deriveThreadCostUsd(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  let total = 0;
  let sawCost = false;

  // Per-segment monotone-run state, reset at every handoff boundary.
  let base = 0;
  let runMax: number | null = null;

  const closeSegment = () => {
    if (runMax === null) return;
    total += base + runMax;
    sawCost = true;
    base = 0;
    runMax = null;
  };

  for (const activity of activities) {
    if (activity.kind === THREAD_HANDOFF_ACTIVITY_KIND) {
      closeSegment();
      continue;
    }
    if (activity.kind !== "context-window.updated") continue;

    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const value = payload?.costUsd;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;

    if (runMax === null || value >= runMax) {
      runMax = value;
      continue;
    }
    // A drop means a fresh provider process: bank the finished run.
    base += runMax;
    runMax = value;
  }
  closeSegment();

  return sawCost ? total : null;
}
