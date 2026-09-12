import type { OrchestrationThreadActivity, ThreadWatchdog } from "@t3tools/contracts";

/** Placeholder shown in every watchdog rules editor, web and mobile. */
export const WATCHDOG_RULES_PLACEHOLDER =
  "Approve safe read-only commands. Ask me before anything that deletes files or pushes.";

/** Activity kind the server appends when a watchdog gives up and asks for a human. */
export const WATCHDOG_ESCALATED_ACTIVITY_KIND = "watchdog.escalated";

/**
 * Reason text carried by the newest `watchdog.escalated` activity, for the
 * "Watchdog stuck" block. Null when the thread has never escalated or the
 * payload carries no reason.
 */
export function latestWatchdogEscalationReason(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): string | null {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== WATCHDOG_ESCALATED_ACTIVITY_KIND) continue;
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const reason = payload?.reason;
    return typeof reason === "string" && reason.trim().length > 0 ? reason : null;
  }
  return null;
}

/**
 * What a thread row should draw for its watchdog: nothing, a plain eye, or a
 * warning-tinted eye when the watchdog is stuck waiting on the user.
 */
export type WatchdogMarker = "none" | "on" | "stuck";

export function watchdogMarker(watchdog: ThreadWatchdog | null | undefined): WatchdogMarker {
  if (!watchdog || !watchdog.enabled) return "none";
  return watchdog.escalatedAt !== null ? "stuck" : "on";
}

/** Small muted line under the rules editor: "3 interventions". */
export function watchdogInterventionsLabel(interventions: number): string | null {
  if (interventions <= 0) return null;
  return `${interventions} ${interventions === 1 ? "intervention" : "interventions"}`;
}
