/**
 * Pure helpers behind Settings → Scheduled Chats: the row labels, the editor's
 * form model, and the create/update payloads it dispatches. Kept out of the
 * component so the payload diffing — the part that decides what the server is
 * actually told to change — is testable without React.
 *
 * @module ScheduledChatsSettings.logic
 */
import { SCHEDULE_PROMPT_MAX_LENGTH } from "@t3tools/client-runtime/state/schedules";
import {
  DEFAULT_SCHEDULE_HANDOFF_PATH_TEMPLATE,
  DEFAULT_SCHEDULE_MAX_RUN_MINUTES,
  DEFAULT_SCHEDULE_MAX_TURN_MINUTES,
  SCHEDULE_LIMIT_MINUTES_MAX,
  SCHEDULE_LIMIT_MINUTES_MIN,
  type ModelSelection,
  type OrchestrationSchedule,
  type ProjectId,
} from "@t3tools/contracts";

export interface ScheduleFormState {
  readonly scopeKind: "project" | "environment";
  /** Target for project scope; null until one is picked. */
  readonly projectId: ProjectId | null;
  /** Target for environment scope: every project, or an explicit set. */
  readonly environmentTargets: "all" | ReadonlyArray<ProjectId>;
  readonly hourLocal: number;
  readonly minuteLocal: number;
  readonly timezone: string;
  readonly prompt: string;
  readonly handoffPathTemplate: string;
  readonly modelSelection: ModelSelection | null;
  /** null means "use the scope default" (see scheduleSkipIfDirty). */
  readonly skipIfDirty: boolean | null;
  readonly maxRunMinutes: number;
  readonly maxTurnMinutes: number;
}

export function emptyScheduleForm(input: {
  readonly timezone: string;
  readonly projectId: ProjectId | null;
}): ScheduleFormState {
  return {
    scopeKind: "project",
    projectId: input.projectId,
    environmentTargets: "all",
    hourLocal: 6,
    minuteLocal: 0,
    timezone: input.timezone,
    prompt: "",
    handoffPathTemplate: DEFAULT_SCHEDULE_HANDOFF_PATH_TEMPLATE,
    modelSelection: null,
    skipIfDirty: null,
    maxRunMinutes: DEFAULT_SCHEDULE_MAX_RUN_MINUTES,
    maxTurnMinutes: DEFAULT_SCHEDULE_MAX_TURN_MINUTES,
  };
}

export function scheduleFormFromSchedule(schedule: OrchestrationSchedule): ScheduleFormState {
  return {
    scopeKind: schedule.scope._tag,
    projectId: schedule.scope._tag === "project" ? schedule.scope.projectId : null,
    environmentTargets: schedule.scope._tag === "environment" ? schedule.scope.projectIds : "all",
    hourLocal: schedule.hourLocal,
    minuteLocal: schedule.minuteLocal,
    timezone: schedule.timezone,
    prompt: schedule.prompt,
    handoffPathTemplate: schedule.handoffPathTemplate,
    modelSelection: schedule.modelSelection ?? null,
    skipIfDirty: schedule.skipIfDirty ?? null,
    maxRunMinutes: schedule.maxRunMinutes,
    maxTurnMinutes: schedule.maxTurnMinutes,
  };
}

function isAbsoluteHandoffPath(template: string): boolean {
  return template.startsWith("/") || template.startsWith("\\") || /^[a-zA-Z]:[\\/]/.test(template);
}

function isWholeNumberInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

/**
 * The reason this form cannot be saved, or null when it can. One message at a
 * time, in the order the fields are laid out, so the editor never has to rank
 * several complaints at once.
 */
export function scheduleFormIssue(form: ScheduleFormState): string | null {
  if (form.scopeKind === "project" && form.projectId === null) {
    return "Pick the project this chat runs in.";
  }
  if (
    form.scopeKind === "environment" &&
    form.environmentTargets !== "all" &&
    form.environmentTargets.length === 0
  ) {
    return "Pick at least one project, or target every project.";
  }
  if (!isWholeNumberInRange(form.hourLocal, 0, 23)) return "Hour must be between 0 and 23.";
  if (!isWholeNumberInRange(form.minuteLocal, 0, 59)) return "Minute must be between 0 and 59.";
  if (form.timezone.trim().length === 0) return "Pick a time zone.";
  const prompt = form.prompt.trim();
  if (prompt.length === 0) return "Write the prompt this chat sends every day.";
  if (prompt.length > SCHEDULE_PROMPT_MAX_LENGTH) {
    return `Keep the prompt under ${SCHEDULE_PROMPT_MAX_LENGTH.toLocaleString()} characters.`;
  }
  const handoff = form.handoffPathTemplate.trim();
  if (handoff.length === 0) return "Set where the handoff file is written.";
  if (isAbsoluteHandoffPath(handoff)) {
    return "The handoff path is relative to the project, so it cannot start at the filesystem root.";
  }
  if (
    !isWholeNumberInRange(
      form.maxRunMinutes,
      SCHEDULE_LIMIT_MINUTES_MIN,
      SCHEDULE_LIMIT_MINUTES_MAX,
    )
  ) {
    return `Run limit must be between ${SCHEDULE_LIMIT_MINUTES_MIN} and ${SCHEDULE_LIMIT_MINUTES_MAX} minutes.`;
  }
  if (
    !isWholeNumberInRange(
      form.maxTurnMinutes,
      SCHEDULE_LIMIT_MINUTES_MIN,
      SCHEDULE_LIMIT_MINUTES_MAX,
    )
  ) {
    return `Turn limit must be between ${SCHEDULE_LIMIT_MINUTES_MIN} and ${SCHEDULE_LIMIT_MINUTES_MAX} minutes.`;
  }
  if (form.maxTurnMinutes > form.maxRunMinutes) {
    return "A turn cannot be allowed to run longer than the whole occurrence.";
  }
  return null;
}

function formScope(form: ScheduleFormState): OrchestrationSchedule["scope"] {
  if (form.scopeKind === "project" && form.projectId !== null) {
    return { _tag: "project", projectId: form.projectId };
  }
  return { _tag: "environment", projectIds: form.environmentTargets };
}

function sameScope(
  left: OrchestrationSchedule["scope"],
  right: OrchestrationSchedule["scope"],
): boolean {
  if (left._tag === "project" || right._tag === "project") {
    return (
      left._tag === "project" && right._tag === "project" && left.projectId === right.projectId
    );
  }
  if (left.projectIds === "all" || right.projectIds === "all") {
    return left.projectIds === right.projectIds;
  }
  const rightIds = right.projectIds;
  return (
    left.projectIds.length === rightIds.length &&
    left.projectIds.every((projectId, index) => projectId === rightIds[index])
  );
}

function sameModelSelection(left: ModelSelection | null, right: ModelSelection | null): boolean {
  if (left === null || right === null) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Everything a create command carries, minus the ids the command layer mints. */
export interface ScheduleCreatePayload {
  readonly scope: OrchestrationSchedule["scope"];
  readonly hourLocal: number;
  readonly minuteLocal: number;
  readonly timezone: string;
  readonly prompt: string;
  readonly handoffPathTemplate: string;
  readonly maxRunMinutes: number;
  readonly maxTurnMinutes: number;
  readonly modelSelection?: ModelSelection;
  readonly skipIfDirty?: boolean;
}

export function scheduleCreatePayload(form: ScheduleFormState): ScheduleCreatePayload {
  return {
    scope: formScope(form),
    hourLocal: form.hourLocal,
    minuteLocal: form.minuteLocal,
    timezone: form.timezone.trim(),
    prompt: form.prompt.trim(),
    handoffPathTemplate: form.handoffPathTemplate.trim(),
    maxRunMinutes: form.maxRunMinutes,
    maxTurnMinutes: form.maxTurnMinutes,
    ...(form.modelSelection === null ? {} : { modelSelection: form.modelSelection }),
    ...(form.skipIfDirty === null ? {} : { skipIfDirty: form.skipIfDirty }),
  };
}

/**
 * Only the fields the editor actually changed. Update reads absent as "leave
 * alone" and null as "clear", so sending the whole form back would rewrite
 * values another client edited while this editor sat open.
 */
export interface ScheduleUpdatePayload {
  readonly scope?: OrchestrationSchedule["scope"];
  readonly hourLocal?: number;
  readonly minuteLocal?: number;
  readonly timezone?: string;
  readonly prompt?: string;
  readonly handoffPathTemplate?: string;
  readonly maxRunMinutes?: number;
  readonly maxTurnMinutes?: number;
  readonly modelSelection?: ModelSelection | null;
  readonly skipIfDirty?: boolean | null;
}

export function scheduleUpdatePayload(
  original: OrchestrationSchedule,
  form: ScheduleFormState,
): ScheduleUpdatePayload {
  const scope = formScope(form);
  const timezone = form.timezone.trim();
  const prompt = form.prompt.trim();
  const handoffPathTemplate = form.handoffPathTemplate.trim();
  const originalSkipIfDirty = original.skipIfDirty ?? null;
  const originalModelSelection = original.modelSelection ?? null;
  return {
    ...(sameScope(scope, original.scope) ? {} : { scope }),
    ...(form.hourLocal === original.hourLocal ? {} : { hourLocal: form.hourLocal }),
    ...(form.minuteLocal === original.minuteLocal ? {} : { minuteLocal: form.minuteLocal }),
    ...(timezone === original.timezone ? {} : { timezone }),
    ...(prompt === original.prompt ? {} : { prompt }),
    ...(handoffPathTemplate === original.handoffPathTemplate ? {} : { handoffPathTemplate }),
    ...(form.maxRunMinutes === original.maxRunMinutes ? {} : { maxRunMinutes: form.maxRunMinutes }),
    ...(form.maxTurnMinutes === original.maxTurnMinutes
      ? {}
      : { maxTurnMinutes: form.maxTurnMinutes }),
    ...(sameModelSelection(form.modelSelection, originalModelSelection)
      ? {}
      : { modelSelection: form.modelSelection }),
    ...(form.skipIfDirty === originalSkipIfDirty ? {} : { skipIfDirty: form.skipIfDirty }),
  };
}

export function scheduleUpdateHasChanges(payload: ScheduleUpdatePayload): boolean {
  return Object.keys(payload).length > 0;
}

export {
  SCHEDULE_PROMPT_MAX_LENGTH,
  SCHEDULE_STATUS_LABELS,
  describeAutoPause,
  describeScheduleRuns,
  describeScheduleTarget,
  formatRelativeFutureLabel,
  formatRelativePastLabel,
  scheduleDisplayTitle,
} from "@t3tools/client-runtime/state/schedules";
