import type { OrchestrationSchedule, ProjectId, ScheduleProjectState } from "@t3tools/contracts";

export type MobileScheduleStatus = "active" | "running" | "paused" | "auto-paused" | "failed";

export function mobileScheduleStatus(schedule: OrchestrationSchedule): {
  readonly kind: MobileScheduleStatus;
  readonly label: string;
} {
  if (schedule.pausedAt !== null) {
    return schedule.autoPausedReason
      ? { kind: "auto-paused", label: "Auto-paused" }
      : { kind: "paused", label: "Paused" };
  }
  if (schedule.projectStates.some((state) => state.lastOccurrenceStatus === "running")) {
    return { kind: "running", label: "Running" };
  }
  if (schedule.projectStates.some((state) => state.lastOccurrenceStatus === "failed")) {
    return { kind: "failed", label: "Needs attention" };
  }
  return { kind: "active", label: "Active" };
}

export function mobileScheduleScopeLabel(
  schedule: OrchestrationSchedule,
  projectTitles: ReadonlyMap<ProjectId, string>,
): string {
  if (schedule.scope._tag === "project") {
    return projectTitles.get(schedule.scope.projectId) ?? "Missing project";
  }
  if (schedule.scope.projectIds === "all") return "All projects";
  const count = schedule.scope.projectIds.length;
  return `${count} selected project${count === 1 ? "" : "s"}`;
}

export function mobileScheduleHeadline(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/, 1)[0]?.replace(/\s+/g, " ").trim();
  if (!firstLine) return "Scheduled chat";
  return firstLine.length > 78 ? `${firstLine.slice(0, 75)}…` : firstLine;
}

export function latestScheduleOccurrence(
  schedule: OrchestrationSchedule,
): ScheduleProjectState | null {
  let latest: ScheduleProjectState | null = null;
  for (const state of schedule.projectStates) {
    if (
      state.lastOccurrenceAt !== null &&
      (latest?.lastOccurrenceAt == null || state.lastOccurrenceAt > latest.lastOccurrenceAt)
    ) {
      latest = state;
    }
  }
  return latest;
}

function failureReasonLabel(reason: ScheduleProjectState["lastOccurrenceFailureReason"]): string {
  switch (reason) {
    case "auth":
      return "Sign-in required";
    case "dirty":
      return "Skipped a dirty working tree";
    case "provider":
      return "Provider unavailable";
    case "timeout:run":
    case "timeout:turn":
      return "Run timed out";
    default:
      return "Run failed";
  }
}

export function mobileOccurrenceSummary(
  occurrence: ScheduleProjectState | null,
  relativeTime: (timestamp: string) => string,
): string {
  if (occurrence?.lastOccurrenceAt == null || occurrence.lastOccurrenceStatus == null) {
    return "No runs yet";
  }
  const age = relativeTime(occurrence.lastOccurrenceAt);
  if (occurrence.lastOccurrenceStatus === "running") return `Running now · ${age}`;
  if (occurrence.lastOccurrenceStatus === "completed") return `Last run succeeded · ${age}`;
  return `${failureReasonLabel(occurrence.lastOccurrenceFailureReason)} · ${age}`;
}

export function mobileScheduleCanEdit(schedule: OrchestrationSchedule): boolean {
  return schedule.scope._tag === "project" || schedule.scope.projectIds === "all";
}
