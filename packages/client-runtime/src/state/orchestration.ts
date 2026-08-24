import { ORCHESTRATION_WS_METHODS } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  type CreateProjectScheduleInput,
  type DeleteProjectScheduleInput,
  type PauseProjectScheduleInput,
  type ResumeProjectScheduleInput,
  type UpdateProjectScheduleInput,
  createProjectSchedule,
  deleteProjectSchedule,
  pauseProjectSchedule,
  resumeProjectSchedule,
  updateProjectSchedule,
} from "../operations/commands.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

export function createOrchestrationEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const scheduleScheduler = createAtomCommandScheduler();
  const scheduleConcurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { scheduleId: string } }) =>
      JSON.stringify([environmentId, input.scheduleId]),
  };

  return {
    turnDiff: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:orchestration:turn-diff",
      tag: ORCHESTRATION_WS_METHODS.getTurnDiff,
    }),
    workflowScript: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:orchestration:workflow-script",
      tag: ORCHESTRATION_WS_METHODS.getWorkflowScript,
      // Scripts are immutable per run: cache generously.
      staleTimeMs: 300_000,
      idleTtlMs: 300_000,
    }),
    fullThreadDiff: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:orchestration:full-thread-diff",
      tag: ORCHESTRATION_WS_METHODS.getFullThreadDiff,
    }),
    threadSearch: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:orchestration:thread-search",
      tag: ORCHESTRATION_WS_METHODS.searchThreads,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
    }),
    archivedShellSnapshot: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:orchestration:archived-shell-snapshot",
      tag: ORCHESTRATION_WS_METHODS.getArchivedShellSnapshot,
    }),
    createSchedule: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:create",
      execute: (input: CreateProjectScheduleInput) => createProjectSchedule(input),
      scheduler: scheduleScheduler,
      concurrency: scheduleConcurrency,
    }),
    updateSchedule: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:update",
      execute: (input: UpdateProjectScheduleInput) => updateProjectSchedule(input),
      scheduler: scheduleScheduler,
      concurrency: scheduleConcurrency,
    }),
    pauseSchedule: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:pause",
      execute: (input: PauseProjectScheduleInput) => pauseProjectSchedule(input),
      scheduler: scheduleScheduler,
      concurrency: scheduleConcurrency,
    }),
    resumeSchedule: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:resume",
      execute: (input: ResumeProjectScheduleInput) => resumeProjectSchedule(input),
      scheduler: scheduleScheduler,
      concurrency: scheduleConcurrency,
    }),
    deleteSchedule: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:delete",
      execute: (input: DeleteProjectScheduleInput) => deleteProjectSchedule(input),
      scheduler: scheduleScheduler,
      concurrency: scheduleConcurrency,
    }),
  };
}
