import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { ProjectId, ThreadId, NonNegativeInt } from "./baseSchemas.ts";
import { ScheduledTaskUpsertInput, ScheduledTaskMutationResult } from "./scheduledTask.ts";
import { WorkspaceLinkEndpoint } from "./pulseLinks.ts";
export const WorkspaceTaskId = Schema.String.check(Schema.isPattern(/^wskt_[a-f0-9-]{36}$/));
const Title = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240));
const Column = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40));
export const WorkspaceProjectConfig = Schema.Struct({
  projectId: ProjectId,
  taskColumns: Schema.Array(Column).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  browserThreadId: Schema.NullOr(ThreadId),
});
export type WorkspaceProjectConfig = typeof WorkspaceProjectConfig.Type;
export const WorkspaceTask = Schema.Struct({
  id: WorkspaceTaskId,
  projectId: ProjectId,
  title: Title,
  column: Column,
});
export type WorkspaceTask = typeof WorkspaceTask.Type;
export const WorkspaceTaskUpsert = Schema.Struct({
  id: Schema.optionalKey(WorkspaceTaskId),
  projectId: ProjectId,
  title: Title,
  column: Column,
});
export type WorkspaceTaskUpsert = typeof WorkspaceTaskUpsert.Type;
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
    message: Schema.String,
  },
) {}
const error = Schema.Union([WorkspaceToolsError, EnvironmentAuthorizationError]);
export const PULSE_WORKSPACE_TOOLS_METHODS = {
  workspaceGetProjectConfig: "pulse.workspace.getProjectConfig",
  workspaceSaveProjectConfig: "pulse.workspace.saveProjectConfig",
  workspaceListTasks: "pulse.workspace.listTasks",
  workspaceGetTask: "pulse.workspace.getTask",
  workspaceUpsertTask: "pulse.workspace.upsertTask",
  workspaceDeleteTask: "pulse.workspace.deleteTask",
  workspaceSubscribeChanges: "pulse.workspace.subscribeChanges",
  workspaceSaveAutomation: "pulse.workspace.saveAutomation",
} as const;
export const PulseWorkspaceToolsRpcs = [
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceGetProjectConfig, {
    payload: Schema.Struct({ projectId: ProjectId }),
    success: WorkspaceProjectConfig,
    error,
  }),
  Rpc.make(PULSE_WORKSPACE_TOOLS_METHODS.workspaceSaveProjectConfig, {
    payload: WorkspaceProjectConfig,
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
