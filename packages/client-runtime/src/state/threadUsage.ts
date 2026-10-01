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

/**
 * Turns averaged by `deriveOutputTokensPerSecond`. Five smooths over a single
 * tool-heavy or tiny turn while still catching up within a few turns after a
 * model switch.
 */
export const OUTPUT_RATE_TURN_WINDOW = 5;

/**
 * Minimum sample before the rate is shown. Two turns stop one unusual turn
 * from standing for the thread. Thirty seconds keeps out quick exchanges,
 * where fixed latency (startup, time to first token) dominates and the rate
 * reads far lower than steady output.
 */
const OUTPUT_RATE_MIN_TURNS = 2;
const OUTPUT_RATE_MIN_DURATION_MS = 30_000;

/**
 * Average output tokens per second over the last few turns that reported
 * throughput, or null until the sample is large enough to trust.
 *
 * Weighted by time (total tokens over total seconds), so a two-second turn
 * cannot swing the figure the way a mean of per-turn rates would. Turn time
 * is wall clock from start to completion, so tool runs and approvals count:
 * this is the rate the user sees work arrive, not raw model decode speed.
 */
export function deriveOutputTokensPerSecond(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): number | null {
  let tokens = 0;
  let durationMs = 0;
  let turns = 0;
  for (let index = activities.length - 1; index >= 0 && turns < OUTPUT_RATE_TURN_WINDOW; index--) {
    const activity = activities[index];
    if (activity?.kind !== "context-window.updated") continue;
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const turnTokens = payload?.turnOutputTokens;
    const turnMs = payload?.turnDurationMs;
    if (typeof turnTokens !== "number" || typeof turnMs !== "number") continue;
    if (!(turnTokens > 0) || !(turnMs > 0)) continue;
    tokens += turnTokens;
    durationMs += turnMs;
    turns += 1;
  }
  return turns >= OUTPUT_RATE_MIN_TURNS && durationMs >= OUTPUT_RATE_MIN_DURATION_MS
    ? tokens / (durationMs / 1000)
    : null;
}
