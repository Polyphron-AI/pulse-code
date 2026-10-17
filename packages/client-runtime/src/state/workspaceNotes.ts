import { WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createWorkspaceNoteAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const changes = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "workspace-notes:changes",
    tag: WS_METHODS.notesSubscribeChanges,
    idleTtlMs: 0,
  });
  const refreshTrigger = ({ environmentId }: { environmentId: EnvironmentId }) =>
    changes({ environmentId, input: {} });
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial",
    key: ({ environmentId }: { environmentId: EnvironmentId }) => environmentId,
  } as const;
  return {
    changes,
    get: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "workspace-notes:get",
      tag: WS_METHODS.notesGet,
      refreshTrigger,
      idleTtlMs: 0,
    }),
    read: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "workspace-notes:read",
      tag: WS_METHODS.notesRead,
      refreshTrigger,
      idleTtlMs: 0,
    }),
    create: createEnvironmentRpcCommand(runtime, {
      label: "workspace-notes:create",
      tag: WS_METHODS.notesCreate,
      scheduler,
      concurrency,
    }),
    update: createEnvironmentRpcCommand(runtime, {
      label: "workspace-notes:update",
      tag: WS_METHODS.notesUpdate,
      scheduler,
      concurrency,
    }),
    delete: createEnvironmentRpcCommand(runtime, {
      label: "workspace-notes:delete",
      tag: WS_METHODS.notesDelete,
      scheduler,
      concurrency,
    }),
    restore: createEnvironmentRpcCommand(runtime, {
      label: "workspace-notes:restore",
      tag: WS_METHODS.notesRestore,
      scheduler,
      concurrency,
    }),
  };
}
