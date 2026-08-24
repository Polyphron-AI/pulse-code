/**
 * Surface-agnostic presentation for Scheduled Chats: the labels and sentences
 * a schedule row shows on web and mobile. Kept beside the schedule atoms so
 * both clients say the same thing about the same schedule.
 *
 * @module state/schedulePresentation
 */
import type { OrchestrationSchedule, ProjectId } from "@t3tools/contracts";

import { SCHEDULE_FAILURE_REASON_LABELS } from "./scheduleTime.ts";
import type { ScheduleRowStatus, ScheduleRunSummary } from "./schedules.ts";

/** Longest prompt an editor accepts, so a stray paste cannot become a daily megaturn. */
export const SCHEDULE_PROMPT_MAX_LENGTH = 4_000;

/** First line of the prompt, which is what the row leads with. */
export function scheduleDisplayTitle(schedule: Pick<OrchestrationSchedule, "prompt">): string {
  const firstLine = schedule.prompt.split("\n", 1)[0]?.trim() ?? "";
  if (firstLine.length === 0) return "Scheduled chat";
  return firstLine.length > 90 ? `${firstLine.slice(0, 89)}…` : firstLine;
}

/** "Pulse Code", "Web and 2 more", "Every project" — what the row says it targets. */
export function describeScheduleTarget(
  schedule: Pick<OrchestrationSchedule, "scope">,
  projectTitleById: ReadonlyMap<ProjectId, string>,
): string {
  if (schedule.scope._tag === "project") {
    return projectTitleById.get(schedule.scope.projectId) ?? "Project no longer here";
  }
  if (schedule.scope.projectIds === "all") return "Every project";
  const titles = schedule.scope.projectIds
    .map((projectId) => projectTitleById.get(projectId))
    .filter((title): title is string => title !== undefined);
  const [first, second] = titles;
  if (first === undefined) return "No projects left";
  if (second === undefined) return first;
  if (titles.length === 2) return `${first} and ${second}`;
  return `${first} and ${titles.length - 1} more`;
}

export const SCHEDULE_STATUS_LABELS: Readonly<Record<ScheduleRowStatus, string>> = {
  paused: "Paused",
  running: "Running",
  failed: "Failed",
  completed: "Healthy",
  "never-run": "Not run yet",
};

/** "just now" / "14m ago" / "3h ago" / "2d ago". */
export function formatRelativePastLabel(atMs: number, nowMs: number): string {
  if (!Number.isFinite(atMs)) return "at an unknown time";
  const minutes = Math.floor((nowMs - atMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "in 40m" / "in 14h" / "in 2d". */
export function formatRelativeFutureLabel(atMs: number, nowMs: number): string {
  const minutes = Math.round((atMs - nowMs) / 60_000);
  if (minutes <= 0) return "any moment";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

/**
 * The sentence under a row: what happened last, and what happens next. It only
 * says what it knows — a schedule whose zone this client cannot read gets no
 * next-run claim rather than a guessed one.
 */
export function describeScheduleRuns(input: {
  readonly summary: ScheduleRunSummary;
  readonly nextRunAtMs: number | null;
  readonly nowMs: number;
}): string {
  const parts: Array<string> = [];
  if (input.summary.lastRunAt === null) {
    parts.push("Never run");
  } else {
    const label = formatRelativePastLabel(Date.parse(input.summary.lastRunAt), input.nowMs);
    const reason =
      input.summary.failed > 0 && input.summary.failureReason !== null
        ? ` — ${SCHEDULE_FAILURE_REASON_LABELS[input.summary.failureReason]}`
        : "";
    parts.push(`Last run ${label}${reason}`);
  }
  if (input.nextRunAtMs !== null) {
    parts.push(`next ${formatRelativeFutureLabel(input.nextRunAtMs, input.nowMs)}`);
  }
  return parts.join(" · ");
}

/** Auto-pause hint for a row, or null when the pause was the user's own. */
export function describeAutoPause(
  schedule: Pick<OrchestrationSchedule, "pausedAt" | "autoPausedReason">,
): string | null {
  if (schedule.pausedAt === null) return null;
  const reason = schedule.autoPausedReason ?? null;
  return reason === null ? null : `Pulse Code ${reason}. Resume to run it again.`;
}
