import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { EnvironmentId, ProjectId, ThreadId, NonNegativeInt } from "./baseSchemas.ts";
import { ScheduledTaskUpsertInput, ScheduledTaskMutationResult } from "./scheduledTask.ts";
import { WorkspaceLinkEndpoint } from "./pulseLinks.ts";
import { WorkspaceDriveRoot } from "./pulseDrive.ts";
export const WorkspaceTaskId = Schema.String.check(Schema.isPattern(/^wskt_[a-f0-9-]{36}$/));
const Title = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240));
const Column = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40));
const isGregorianDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1]!;
};
export const WorkspaceTaskDueOn = Schema.String.check(Schema.makeFilter(isGregorianDate));
const AreaLabel = Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(120));
export const WorkspaceTaskOwner = Schema.NullOr(Schema.Literal("environment-owner"));
export const WorkspaceProjectDescriptionMaxLength = 600;
export const WorkspaceProjectConfig = Schema.Struct({
  description: Schema.optionalKey(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(WorkspaceProjectDescriptionMaxLength))),
  ),
  driveRoot: Schema.optionalKey(Schema.NullOr(WorkspaceDriveRoot)),
  projectId: ProjectId,
  taskColumns: Schema.Array(Column).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  browserThreadId: Schema.NullOr(ThreadId),
  completedColumn: Schema.optionalKey(Schema.NullOr(Column)),
  revision: Schema.optionalKey(NonNegativeInt),
});
export type WorkspaceProjectConfig = typeof WorkspaceProjectConfig.Type;
export const WorkspaceProjectOverviewQuery = Schema.Struct({
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })).pipe(
    Schema.withDecodingDefault(Effect.succeed(50)),
  ),
  filter: Schema.String.check(Schema.isMaxLength(256)).pipe(
    Schema.withDecodingDefault(Effect.succeed("")),
  ),
  drive: Schema.Literals(["all", "linked", "unlinked"]).pipe(
    Schema.withDecodingDefault(Effect.succeed("all")),
  ),
  order: Schema.Literal("title").pipe(Schema.withDecodingDefault(Effect.succeed("title"))),
  cursor: Schema.optional(
    Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(2048),
      Schema.isPattern(/^[A-Za-z0-9_-]+$/),
    ),
  ),
});
export type WorkspaceProjectOverviewQuery = typeof WorkspaceProjectOverviewQuery.Type;
// SQLite lower() folds ASCII only, including when the filter is compared to descriptions.
export const normalizeWorkspaceProjectOverviewFilter = (value: string) =>
  value.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
export const WorkspaceProjectOverviewCursor = Schema.Struct({
  version: Schema.Literal(1),
  environmentId: EnvironmentId,
  filter: WorkspaceProjectOverviewQuery.fields.filter,
  drive: Schema.Literals(["all", "linked", "unlinked"]),
  order: Schema.Literal("title"),
  sortTitle: Schema.String,
  projectId: ProjectId,
});
export const WorkspaceProjectOverview = Schema.Struct({
  projectId: ProjectId,
  title: Schema.String,
  description: Schema.NullOr(
    Schema.String.check(Schema.isMaxLength(WorkspaceProjectDescriptionMaxLength)),
  ),
  driveRoot: Schema.Literals(["linked", "none", "unavailable"]),
  channels: Schema.Struct({
    count: Schema.NullOr(NonNegativeInt),
    complete: Schema.Boolean,
    providers: Schema.Array(
      Schema.Struct({ provider: Schema.String, count: NonNegativeInt, complete: Schema.Boolean }),
    ).check(Schema.isMaxLength(100)),
  }),
  members: Schema.optionalKey(
    Schema.Struct({
      count: NonNegativeInt,
      complete: Schema.Literal(true),
      source: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
      observedAt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
    }),
  ),
});
export type WorkspaceProjectOverview = typeof WorkspaceProjectOverview.Type;
export const WorkspaceProjectOverviewPage = Schema.Struct({
  projects: Schema.Array(WorkspaceProjectOverview).check(Schema.isMaxLength(50)),
  nextCursor: WorkspaceProjectOverviewQuery.fields.cursor,
  // Paging and unavailable metadata do not make the selected native project rows incomplete.
  incomplete: Schema.Boolean,
});
export type WorkspaceProjectOverviewPage = typeof WorkspaceProjectOverviewPage.Type;
export const WorkspaceProjectConfigSave = Schema.Struct({
  description: WorkspaceProjectConfig.fields.description,
  projectId: ProjectId,
  taskColumns: WorkspaceProjectConfig.fields.taskColumns,
  browserThreadId: Schema.NullOr(ThreadId),
  completedColumn: Schema.optionalKey(Schema.NullOr(Column)),
  expectedRevision: Schema.optionalKey(NonNegativeInt),
  confirmCompletionChanges: Schema.optionalKey(Schema.Boolean),
  expectedAffectedCount: Schema.optionalKey(NonNegativeInt),
});
export type WorkspaceProjectConfigSave = typeof WorkspaceProjectConfigSave.Type;
export const WorkspaceTask = Schema.Struct({
  id: WorkspaceTaskId,
  projectId: ProjectId,
  title: Title,
  column: Column,
  revision: Schema.optionalKey(NonNegativeInt),
  done: Schema.optionalKey(Schema.Boolean),
  dueOn: Schema.optionalKey(Schema.NullOr(WorkspaceTaskDueOn)),
  areaLabel: Schema.optionalKey(Schema.NullOr(AreaLabel)),
  owner: Schema.optionalKey(WorkspaceTaskOwner),
});
export type WorkspaceTask = typeof WorkspaceTask.Type;
export const WorkspaceTaskTransition = Schema.Struct({
  id: WorkspaceTaskId,
  expectedRevision: NonNegativeInt,
  change: Schema.Union([
    Schema.Struct({ type: Schema.Literal("completion"), completed: Schema.Boolean }),
    Schema.Struct({ type: Schema.Literal("column"), column: Column }),
  ]),
});
export type WorkspaceTaskTransition = typeof WorkspaceTaskTransition.Type;
export const WorkspaceTaskPatch = Schema.Struct({
  id: WorkspaceTaskId,
  expectedRevision: NonNegativeInt,
  title: Schema.optionalKey(Title),
  column: Schema.optionalKey(Column),
  dueOn: Schema.optionalKey(Schema.NullOr(WorkspaceTaskDueOn)),
  areaLabel: Schema.optionalKey(Schema.NullOr(AreaLabel)),
  owner: Schema.optionalKey(WorkspaceTaskOwner),
});
export type WorkspaceTaskPatch = typeof WorkspaceTaskPatch.Type;
export const WorkspaceTaskUpsert = Schema.Struct({
  id: Schema.optionalKey(WorkspaceTaskId),
  projectId: ProjectId,
  title: Title,
  column: Column,
  dueOn: Schema.optionalKey(Schema.NullOr(WorkspaceTaskDueOn)),
  areaLabel: Schema.optionalKey(Schema.NullOr(AreaLabel)),
  owner: Schema.optionalKey(WorkspaceTaskOwner),
});
export type WorkspaceTaskUpsert = typeof WorkspaceTaskUpsert.Type;
export const WorkspaceTaskSummary = Schema.Struct({
  ...WorkspaceTask.fields,
  projectTitle: Schema.String,
  revision: NonNegativeInt,
  done: Schema.Boolean,
  dueOn: Schema.NullOr(WorkspaceTaskDueOn),
  areaLabel: Schema.NullOr(AreaLabel),
  owner: WorkspaceTaskOwner,
});
export type WorkspaceTaskSummary = typeof WorkspaceTaskSummary.Type;
export const WorkspaceTaskQuery = Schema.Struct({
  projectId: Schema.optionalKey(ProjectId),
  state: Schema.Literals(["all", "open", "done"]).pipe(
    Schema.withDecodingDefault(Effect.succeed("all")),
  ),
  text: Schema.optionalKey(Schema.Trim.check(Schema.isMaxLength(240))),
  dueFrom: Schema.optionalKey(WorkspaceTaskDueOn),
  dueTo: Schema.optionalKey(WorkspaceTaskDueOn),
  owner: Schema.Literals(["all", "environment-owner", "unassigned"]).pipe(
    Schema.withDecodingDefault(Effect.succeed("all")),
  ),
  limit: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100)).pipe(
    Schema.withDecodingDefault(Effect.succeed(50)),
  ),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8192))),
}).check(
  Schema.makeFilter((query) => !query.dueFrom || !query.dueTo || query.dueFrom <= query.dueTo),
);
export type WorkspaceTaskQuery = typeof WorkspaceTaskQuery.Type;
export const WorkspaceTaskPage = Schema.Struct({
  tasks: Schema.Array(WorkspaceTaskSummary).check(Schema.isMaxLength(100)),
  total: NonNegativeInt,
  openTotal: NonNegativeInt,
  nextCursor: Schema.NullOr(Schema.String.check(Schema.isMaxLength(8192))),
  projects: Schema.Array(WorkspaceProjectConfig).check(Schema.isMaxLength(100)),
  laneTotals: Schema.Array(
    Schema.Struct({ projectId: ProjectId, column: Column, total: NonNegativeInt }),
  ).check(Schema.isMaxLength(1200)),
});
export type WorkspaceTaskPage = typeof WorkspaceTaskPage.Type;
export const WorkspaceAutomationSave = Schema.Struct({
  requestId: Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/)),
  source: WorkspaceLinkEndpoint,
  task: ScheduledTaskUpsertInput,
});
export type WorkspaceAutomationSave = typeof WorkspaceAutomationSave.Type;
export class WorkspaceToolsError extends Schema.TaggedError<WorkspaceToolsError>()(
  "WorkspaceToolsError",
  {
    kind: Schema.Literals(["invalid-input", "not-found", "conflict", "unavailable"]),
    reason: Schema.optionalKey(Schema.Literal("completion-confirmation-required")),
    affectedCount: Schema.optionalKey(NonNegativeInt),
    message: Schema.String,
  },
) {}
const error = Schema.Union([WorkspaceToolsError, EnvironmentAuthorizationError]);
export const PULSE_WORKSPACE_TOOLS_METHODS = {
  workspaceListProjectOverview: "pulse.workspace.listProjectOverview",
  workspaceGetProjectConfig: "pulse.workspace.getProjectConfig",
  workspaceSaveProjectConfig: "pulse.workspace.saveProjectConfig",
  workspaceQueryTasks: "pulse.workspace.queryTasks",
  workspaceListTasks: "pulse.workspace.listTasks",
  workspaceGetTask: "pulse.workspace.getTask",
  workspacePatchTask: "pulse.workspace.patchTask",
  workspaceTransitionTask: "pulse.workspace.transitionTask",
  workspaceUpsertTask: "pulse.workspace.upsertTask",
  workspaceDeleteTask: "pulse.workspace.deleteTask",
  workspaceSubscribeChanges: "pulse.workspace.subscribeChanges",
  workspaceSaveAutomation: "pulse.workspace.saveAutomation",
} as const;
export const PulseWorkspaceToolsRpcs = [
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceListProjectOverview, {
    payload: WorkspaceProjectOverviewQuery,
    success: WorkspaceProjectOverviewPage,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceQueryTasks, {
    payload: WorkspaceTaskQuery,
    success: WorkspaceTaskPage,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceGetProjectConfig, {
    payload: Schema.Struct({ projectId: ProjectId }),
    success: WorkspaceProjectConfig,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceSaveProjectConfig, {
    payload: WorkspaceProjectConfigSave,
    success: WorkspaceProjectConfig,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceListTasks, {
    payload: Schema.Struct({ projectId: ProjectId }),
    success: Schema.Struct({ tasks: Schema.Array(WorkspaceTask), incomplete: Schema.Boolean }),
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceGetTask, {
    payload: Schema.Struct({ id: WorkspaceTaskId }),
    success: WorkspaceTask,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceUpsertTask, {
    payload: WorkspaceTaskUpsert,
    success: WorkspaceTask,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspacePatchTask, {
    payload: WorkspaceTaskPatch,
    success: WorkspaceTask,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceTransitionTask, {
    payload: WorkspaceTaskTransition,
    success: WorkspaceTask,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceDeleteTask, {
    payload: Schema.Struct({ id: WorkspaceTaskId }),
    success: Schema.Void,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceSubscribeChanges, {
    payload: Schema.Struct({}),
    success: NonNegativeInt,
    error: EnvironmentAuthorizationError,
    stream: true,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceSaveAutomation, {
    payload: WorkspaceAutomationSave,
    success: ScheduledTaskMutationResult,
    error,
  }),
] as const;
