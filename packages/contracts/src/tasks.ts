import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { NonNegativeInt, TrimmedNonEmptyString, ProjectId } from "./baseSchemas.ts";

export const PulseTaskId = TrimmedNonEmptyString.check(Schema.isMaxLength(100));
export const PulseTaskDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));
export const PulseTaskRecurrence = Schema.Struct({
  mode: Schema.Literals(["fixed", "after_completion"]),
  frequency: Schema.Literals(["daily", "weekly", "monthly"]),
  interval: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 365 })),
});
export type PulseTaskRecurrence = typeof PulseTaskRecurrence.Type;
export const PulseTaskStatus = Schema.Literals(["todo", "in_progress", "review", "done"]);
export const PulseTaskColumn = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(60)),
  status: PulseTaskStatus,
});
export const PulseTaskMember = Schema.Struct({
  provider: Schema.Literals(["slack", "discord"]),
  accountId: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
  conversationId: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
  memberId: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
  displayName: TrimmedNonEmptyString.check(Schema.isMaxLength(240)),
});
export type PulseTaskMember = typeof PulseTaskMember.Type;
export const PulseTaskSource = Schema.Struct({
  url: Schema.String.check(Schema.isMaxLength(8192)),
  excerpt: Schema.String.check(Schema.isMaxLength(10000)),
});
export type PulseTaskSource = typeof PulseTaskSource.Type;
export const PulseTaskFields = Schema.Struct({
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(240)),
  description: Schema.String.check(Schema.isMaxLength(10000)),
  status: PulseTaskStatus,
  columnId: Schema.NullOr(PulseTaskId).pipe(Schema.withDecodingDefault(Effect.succeed(null))),
  assignee: Schema.NullOr(PulseTaskMember).pipe(Schema.withDecodingDefault(Effect.succeed(null))),
  followers: Schema.Array(PulseTaskMember)
    .check(Schema.isMaxLength(20))
    .pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  source: Schema.NullOr(PulseTaskSource).pipe(Schema.withDecodingDefault(Effect.succeed(null))),
  projectId: Schema.NullOr(ProjectId),
  dueDate: Schema.NullOr(PulseTaskDate),
  recurrence: Schema.NullOr(PulseTaskRecurrence).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  parentTaskId: Schema.NullOr(PulseTaskId),
  dependencyIds: Schema.Array(PulseTaskId).check(Schema.isMaxLength(100)),
  tags: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(40))).check(
    Schema.isMaxLength(20),
  ),
});
export type PulseTaskFields = typeof PulseTaskFields.Type;
export const PulseTask = Schema.Struct({
  ...PulseTaskFields.fields,
  id: PulseTaskId,
  revision: NonNegativeInt,
  archived: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  recurrenceAnchorDate: Schema.NullOr(PulseTaskDate).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
  nextOccurrenceId: Schema.NullOr(PulseTaskId).pipe(
    Schema.withDecodingDefault(Effect.succeed(null)),
  ),
});
export type PulseTask = typeof PulseTask.Type;
export const PulseTaskMutation = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("create"), ...PulseTaskFields.fields }),
  Schema.Struct({
    operation: Schema.Literal("update"),
    id: PulseTaskId,
    revision: NonNegativeInt,
    ...PulseTaskFields.fields,
  }),
  Schema.Struct({
    operation: Schema.Literal("archive"),
    id: PulseTaskId,
    revision: NonNegativeInt,
    archived: Schema.Boolean,
  }),
]);
export type PulseTaskMutation = typeof PulseTaskMutation.Type;
export class PulseTasksError extends Schema.TaggedError<PulseTasksError>()("PulseTasksError", {
  message: Schema.String,
}) {}
export const PULSE_TASKS_METHODS = {
  tasksSubscribe: "tasks.subscribe",
  tasksMutate: "tasks.mutate",
} as const;
export const PulseTasksRpcs = [
  Rpc.make(PULSE_TASKS_METHODS.tasksSubscribe, {
    payload: Schema.Struct({}),
    success: Schema.Array(PulseTask),
    stream: true,
    error: Schema.Union([PulseTasksError, EnvironmentAuthorizationError]),
  }),
  Rpc.make(PULSE_TASKS_METHODS.tasksMutate, {
    payload: PulseTaskMutation,
    success: PulseTask,
    error: Schema.Union([PulseTasksError, EnvironmentAuthorizationError]),
  }),
] as const;
