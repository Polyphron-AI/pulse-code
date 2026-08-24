/**
 * Pure logic behind Settings → Scheduled Chats on mobile: the pill tone and the
 * small draft the editor screen edits. Mobile deliberately edits only the time
 * and the prompt, so the patch it sends stays a diff and never clobbers a scope
 * or model override that was set from a desktop.
 *
 * @module features/settings/scheduledChats.logic
 */
import {
  SCHEDULE_PROMPT_MAX_LENGTH,
  SCHEDULE_STATUS_LABELS,
  type ScheduleRowStatus,
} from "@t3tools/client-runtime/state/schedules";
import type { OrchestrationSchedule } from "@t3tools/contracts";

import type { StatusTone } from "../../components/StatusPill";

const MINUTES_PER_DAY = 24 * 60;

export function scheduleStatusTone(status: ScheduleRowStatus): StatusTone {
  const label = SCHEDULE_STATUS_LABELS[status];
  switch (status) {
    case "running":
      return {
        label,
        pillClassName: "bg-sky-500/12 dark:bg-sky-500/16",
        textClassName: "text-sky-700 dark:text-sky-300",
      };
    case "failed":
      return {
        label,
        pillClassName: "bg-rose-500/12 dark:bg-rose-500/16",
        textClassName: "text-rose-700 dark:text-rose-300",
      };
    case "completed":
      return {
        label,
        pillClassName: "bg-emerald-500/12 dark:bg-emerald-500/16",
        textClassName: "text-emerald-700 dark:text-emerald-300",
      };
    case "paused":
    case "never-run":
      return {
        label,
        pillClassName: "bg-neutral-500/10 dark:bg-neutral-500/16",
        textClassName: "text-foreground-muted",
      };
  }
}

export interface ScheduleDraft {
  readonly hourLocal: number;
  readonly minuteLocal: number;
  readonly prompt: string;
}

export function newScheduleDraft(): ScheduleDraft {
  return { hourLocal: 6, minuteLocal: 0, prompt: "" };
}

export function scheduleDraftFromSchedule(
  schedule: Pick<OrchestrationSchedule, "hourLocal" | "minuteLocal" | "prompt">,
): ScheduleDraft {
  return {
    hourLocal: schedule.hourLocal,
    minuteLocal: schedule.minuteLocal,
    prompt: schedule.prompt,
  };
}

/** Steps the wall clock, wrapping within the day so a tap can never leave the range. */
export function shiftScheduleDraftTime(draft: ScheduleDraft, deltaMinutes: number): ScheduleDraft {
  const total = draft.hourLocal * 60 + draft.minuteLocal + deltaMinutes;
  const wrapped = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return {
    ...draft,
    hourLocal: Math.floor(wrapped / 60),
    minuteLocal: wrapped % 60,
  };
}

export function scheduleDraftIssue(draft: ScheduleDraft): string | null {
  const prompt = draft.prompt.trim();
  if (prompt.length === 0) return "Write the prompt this chat sends every day.";
  if (prompt.length > SCHEDULE_PROMPT_MAX_LENGTH) {
    return `Keep the prompt under ${SCHEDULE_PROMPT_MAX_LENGTH.toLocaleString("en-US")} characters.`;
  }
  return null;
}

export interface ScheduleDraftPatch {
  readonly hourLocal?: number;
  readonly minuteLocal?: number;
  readonly prompt?: string;
}

/** Only what this screen actually changed; absent fields are left alone server-side. */
export function scheduleDraftPatch(
  schedule: Pick<OrchestrationSchedule, "hourLocal" | "minuteLocal" | "prompt">,
  draft: ScheduleDraft,
): ScheduleDraftPatch {
  const prompt = draft.prompt.trim();
  return {
    ...(draft.hourLocal === schedule.hourLocal ? {} : { hourLocal: draft.hourLocal }),
    ...(draft.minuteLocal === schedule.minuteLocal ? {} : { minuteLocal: draft.minuteLocal }),
    ...(prompt === schedule.prompt ? {} : { prompt }),
  };
}

export function scheduleDraftHasChanges(patch: ScheduleDraftPatch): boolean {
  return Object.keys(patch).length > 0;
}
