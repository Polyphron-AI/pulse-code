import {
  CommandId,
  ORCHESTRATION_WS_METHODS,
  type ClientOrchestrationCommand,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { EnvironmentSupervisor } from "../connection/supervisor.ts";
import {
  type EnvironmentRpcFailure,
  type EnvironmentRpcSuccess,
  type EnvironmentRpcUnavailableError,
  request,
} from "../rpc/client.ts";

type CommandType = ClientOrchestrationCommand["type"];
type CommandOf<T extends CommandType> = Extract<ClientOrchestrationCommand, { readonly type: T }>;
type CommandInput<T extends CommandType> = Omit<
  CommandOf<T>,
  "type" | "commandId" | "createdAt"
> & {
  readonly commandId?: CommandId;
} & ("createdAt" extends keyof CommandOf<T>
    ? {
        readonly createdAt?: CommandOf<T>["createdAt"];
      }
    : {});

export type CreateProjectInput = CommandInput<"project.create">;
export type UpdateProjectInput = CommandInput<"project.meta.update">;
export type DeleteProjectInput = CommandInput<"project.delete">;
export type CreateThreadInput = CommandInput<"thread.create">;
export type DeleteThreadInput = CommandInput<"thread.delete">;
export type ArchiveThreadInput = CommandInput<"thread.archive">;
export type UnarchiveThreadInput = CommandInput<"thread.unarchive">;
export type SettleThreadInput = CommandInput<"thread.settle">;
export type UnsettleThreadInput = CommandInput<"thread.unsettle">;
export type SnoozeThreadInput = CommandInput<"thread.snooze">;
export type UnsnoozeThreadInput = CommandInput<"thread.unsnooze">;
export type PinThreadInput = CommandInput<"thread.pin">;
export type UnpinThreadInput = CommandInput<"thread.unpin">;
export type ReorderPinnedThreadInput = CommandInput<"thread.pin.reorder">;
export type UpdateThreadMetadataInput = CommandInput<"thread.meta.update">;
export type SetThreadRuntimeModeInput = CommandInput<"thread.runtime-mode.set">;
export type SetThreadInteractionModeInput = CommandInput<"thread.interaction-mode.set">;
export type StartThreadTurnInput = CommandInput<"thread.turn.start">;
export type InterruptThreadTurnInput = CommandInput<"thread.turn.interrupt">;
export type RespondToThreadApprovalInput = CommandInput<"thread.approval.respond">;
export type RespondToThreadUserInputInput = CommandInput<"thread.user-input.respond">;
export type SetThreadWatchdogInput = CommandInput<"thread.watchdog.set">;
export type RevertThreadCheckpointInput = CommandInput<"thread.checkpoint.revert">;
export type StopThreadSessionInput = CommandInput<"thread.session.stop">;
export type CreateProjectScheduleInput = CommandInput<"project.schedule.create">;
export type UpdateProjectScheduleInput = CommandInput<"project.schedule.update">;
export type PauseProjectScheduleInput = CommandInput<"project.schedule.pause">;
export type ResumeProjectScheduleInput = CommandInput<"project.schedule.resume">;
export type DeleteProjectScheduleInput = CommandInput<"project.schedule.delete">;
export type RunProjectScheduleInput = CommandInput<"project.schedule.run">;
export type CreateManagerInput = CommandInput<"manager.create">;
export type UpdateManagerInput = CommandInput<"manager.update">;
export type PauseManagerInput = CommandInput<"manager.pause">;
export type CycleNowManagerInput = CommandInput<"manager.cycle-now">;
export type ResumeManagerInput = CommandInput<"manager.resume">;
export type DeleteManagerInput = CommandInput<"manager.delete">;
export type CreateAssistantInput = CommandInput<"assistant.create">;
export type UpdateAssistantInput = CommandInput<"assistant.update">;
export type ResetAssistantInput = CommandInput<"assistant.reset">;
export type SendAssistantMessageInput = CommandInput<"assistant.message">;

type DispatchTag = typeof ORCHESTRATION_WS_METHODS.dispatchCommand;
type CommandEffect = Effect.Effect<
  EnvironmentRpcSuccess<DispatchTag>,
  EnvironmentRpcFailure<DispatchTag> | EnvironmentRpcUnavailableError,
  Crypto.Crypto | EnvironmentSupervisor
>;

function commandId(input: { readonly commandId?: CommandId }) {
  return Effect.gen(function* () {
    if (input.commandId !== undefined) {
      return input.commandId;
    }
    const crypto = yield* Crypto.Crypto;
    return yield* crypto.randomUUIDv4.pipe(Effect.orDie, Effect.map(CommandId.make));
  });
}

function timestampedCommandMetadata(input: {
  readonly commandId?: CommandId;
  readonly createdAt?: string;
}) {
  return Effect.all({
    commandId: commandId(input),
    createdAt:
      input.createdAt === undefined
        ? DateTime.now.pipe(Effect.map(DateTime.formatIso))
        : Effect.succeed(input.createdAt),
  });
}

function dispatch(command: ClientOrchestrationCommand) {
  return request(ORCHESTRATION_WS_METHODS.dispatchCommand, command);
}

export const createProject: (input: CreateProjectInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createProject",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "project.create",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const updateProject: (input: UpdateProjectInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.updateProject",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "project.meta.update",
    commandId: yield* commandId(input),
  });
});

export const deleteProject: (input: DeleteProjectInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.deleteProject",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "project.delete",
    commandId: yield* commandId(input),
  });
});

export const createThread: (input: CreateThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createThread",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.create",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const deleteThread: (input: DeleteThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.deleteThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.delete",
    commandId: yield* commandId(input),
  });
});

export const archiveThread: (input: ArchiveThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.archiveThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.archive",
    commandId: yield* commandId(input),
  });
});

export const unarchiveThread: (input: UnarchiveThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.unarchiveThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.unarchive",
    commandId: yield* commandId(input),
  });
});

export const settleThread: (input: SettleThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.settleThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.settle",
    commandId: yield* commandId(input),
  });
});

export const unsettleThread: (input: UnsettleThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.unsettleThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.unsettle",
    commandId: yield* commandId(input),
  });
});

export const snoozeThread: (input: SnoozeThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.snoozeThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.snooze",
    commandId: yield* commandId(input),
  });
});

export const unsnoozeThread: (input: UnsnoozeThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.unsnoozeThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.unsnooze",
    commandId: yield* commandId(input),
  });
});

export const pinThread: (input: PinThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.pinThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.pin",
    commandId: yield* commandId(input),
  });
});

export const unpinThread: (input: UnpinThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.unpinThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.unpin",
    commandId: yield* commandId(input),
  });
});

export const reorderPinnedThread: (input: ReorderPinnedThreadInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.reorderPinnedThread",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.pin.reorder",
    commandId: yield* commandId(input),
  });
});

export const updateThreadMetadata: (input: UpdateThreadMetadataInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.updateThreadMetadata",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "thread.meta.update",
    commandId: yield* commandId(input),
  });
});

export const setThreadRuntimeMode: (input: SetThreadRuntimeModeInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.setThreadRuntimeMode",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.runtime-mode.set",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const setThreadInteractionMode: (input: SetThreadInteractionModeInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.setThreadInteractionMode")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "thread.interaction-mode.set",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

export const startThreadTurn: (input: StartThreadTurnInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.startThreadTurn",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.turn.start",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const interruptThreadTurn: (input: InterruptThreadTurnInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.interruptThreadTurn",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.turn.interrupt",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const respondToThreadApproval: (input: RespondToThreadApprovalInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.respondToThreadApproval")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "thread.approval.respond",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

export const respondToThreadUserInput: (input: RespondToThreadUserInputInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.respondToThreadUserInput")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "thread.user-input.respond",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

/**
 * Writes the per-thread watchdog config. The server clears `escalatedAt` and
 * `interventions` on every set, so re-sending the current values is also the
 * "Take action" gesture that dismisses a stuck watchdog.
 */
export const setThreadWatchdog: (input: SetThreadWatchdogInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.setThreadWatchdog",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.watchdog.set",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const revertThreadCheckpoint: (input: RevertThreadCheckpointInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.revertThreadCheckpoint")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "thread.checkpoint.revert",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

export const stopThreadSession: (input: StopThreadSessionInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.stopThreadSession",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "thread.session.stop",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const createProjectSchedule: (input: CreateProjectScheduleInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.createProjectSchedule")(function* (input) {
    const metadata = yield* timestampedCommandMetadata(input);
    return yield* dispatch({
      ...input,
      type: "project.schedule.create",
      commandId: metadata.commandId,
      createdAt: metadata.createdAt,
    });
  });

export const updateProjectSchedule: (input: UpdateProjectScheduleInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.updateProjectSchedule")(function* (input) {
    return yield* dispatch({
      ...input,
      type: "project.schedule.update",
      commandId: yield* commandId(input),
    });
  });

export const pauseProjectSchedule: (input: PauseProjectScheduleInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.pauseProjectSchedule",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "project.schedule.pause",
    commandId: yield* commandId(input),
  });
});

export const resumeProjectSchedule: (input: ResumeProjectScheduleInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.resumeProjectSchedule")(function* (input) {
    return yield* dispatch({
      ...input,
      type: "project.schedule.resume",
      commandId: yield* commandId(input),
    });
  });

export const deleteProjectSchedule: (input: DeleteProjectScheduleInput) => CommandEffect =
  Effect.fn("EnvironmentCommands.deleteProjectSchedule")(function* (input) {
    return yield* dispatch({
      ...input,
      type: "project.schedule.delete",
      commandId: yield* commandId(input),
    });
  });

export const runProjectSchedule: (input: RunProjectScheduleInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.runProjectSchedule",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "project.schedule.run",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

// Managers ship to users as Argo. Only the identifiers say manager.

export const createManager: (input: CreateManagerInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createManager",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "manager.create",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const updateManager: (input: UpdateManagerInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.updateManager",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "manager.update",
    commandId: yield* commandId(input),
  });
});

export const pauseManager: (input: PauseManagerInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.pauseManager",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "manager.pause",
    commandId: yield* commandId(input),
  });
});

export const cycleNowManager: (input: CycleNowManagerInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.cycleNowManager",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "manager.cycle-now",
    commandId: yield* commandId(input),
  });
});

export const resumeManager: (input: ResumeManagerInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.resumeManager",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "manager.resume",
    commandId: yield* commandId(input),
  });
});

export const deleteManager: (input: DeleteManagerInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.deleteManager",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "manager.delete",
    commandId: yield* commandId(input),
  });
});

// The assistant ships to users as Luna. Only the identifiers say assistant.

export const createAssistant: (input: CreateAssistantInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.createAssistant",
)(function* (input) {
  const metadata = yield* timestampedCommandMetadata(input);
  return yield* dispatch({
    ...input,
    type: "assistant.create",
    commandId: metadata.commandId,
    createdAt: metadata.createdAt,
  });
});

export const updateAssistant: (input: UpdateAssistantInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.updateAssistant",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "assistant.update",
    commandId: yield* commandId(input),
  });
});

export const resetAssistant: (input: ResetAssistantInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.resetAssistant",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "assistant.reset",
    commandId: yield* commandId(input),
  });
});

export const sendAssistantMessage: (input: SendAssistantMessageInput) => CommandEffect = Effect.fn(
  "EnvironmentCommands.sendAssistantMessage",
)(function* (input) {
  return yield* dispatch({
    ...input,
    type: "assistant.message",
    commandId: yield* commandId(input),
  });
});
