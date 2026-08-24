import type * as Crypto from "effect/Crypto";
import type { Atom } from "effect/unstable/reactivity";

import { createAtomCommandScheduler, createEnvironmentCommand } from "./runtime.ts";
import {
  type CreateScheduleInput,
  type DeleteScheduleInput,
  type PauseScheduleInput,
  type ResumeScheduleInput,
  type UpdateScheduleInput,
  createSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
} from "../operations/commands.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export type {
  CreateScheduleInput,
  DeleteScheduleInput,
  PauseScheduleInput,
  ResumeScheduleInput,
  UpdateScheduleInput,
} from "../operations/commands.ts";

/**
 * Schedule mutations for one environment. Serialized per schedule so a pause
 * that lands right after an edit cannot be applied out of order; create has no
 * id to key on yet, so it serializes on the environment.
 */
export function createScheduleEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const perSchedule = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { scheduleId: string } }) =>
      JSON.stringify([environmentId, input.scheduleId]),
  };
  return {
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:create",
      execute: (input: CreateScheduleInput) => createSchedule(input),
      scheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId }: { environmentId: string }) => environmentId,
      },
    }),
    update: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:update",
      execute: (input: UpdateScheduleInput) => updateSchedule(input),
      scheduler,
      concurrency: perSchedule,
    }),
    pause: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:pause",
      execute: (input: PauseScheduleInput) => pauseSchedule(input),
      scheduler,
      concurrency: perSchedule,
    }),
    resume: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:resume",
      execute: (input: ResumeScheduleInput) => resumeSchedule(input),
      scheduler,
      concurrency: perSchedule,
    }),
    delete: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:schedule:delete",
      execute: (input: DeleteScheduleInput) => deleteSchedule(input),
      scheduler,
      concurrency: perSchedule,
    }),
  };
}
