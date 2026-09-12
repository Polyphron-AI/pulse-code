import { useAtomValue } from "@effect/atom-react";
import {
  managerCycleNowState,
  managerForThread,
  managerPillAction,
  type EnvironmentManager,
} from "@t3tools/client-runtime/state/managers";
import { EnvironmentId, ManagerId, type ThreadId } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { randomUUID } from "~/lib/utils";
import { environmentManagers, managerEnvironment } from "~/state/managers";
import { useAtomCommand } from "~/state/use-atom-command";

/** Every Argo the connected environments know about. */
export function useManagers(): ReadonlyArray<EnvironmentManager> {
  return useAtomValue(environmentManagers.managersAtom);
}

/** The Argo that owns a thread, whether the thread is the Argo's own or a child. */
export function useManagerForThread(
  thread: { readonly origin?: string | null | undefined } | null | undefined,
): EnvironmentManager | null {
  const managers = useManagers();
  const managerId = managerForThread(thread);
  return useMemo(
    () => (managerId === null ? null : (managers.find((m) => m.id === managerId) ?? null)),
    [managerId, managers],
  );
}

/**
 * Every Argo mutation the UI needs, in one place, so the sidebar row, the
 * thread header, the fleet view, and the command palette all write the same
 * commands.
 */
export function useManagerActions() {
  const create = useAtomCommand(managerEnvironment.create);
  const update = useAtomCommand(managerEnvironment.update);
  const pause = useAtomCommand(managerEnvironment.pause);
  const resume = useAtomCommand(managerEnvironment.resume);
  const remove = useAtomCommand(managerEnvironment.delete);
  const cycleNow = useAtomCommand(managerEnvironment.cycleNow);

  const createManager = useCallback(
    async (environmentId: EnvironmentId, name = "New Argo") => {
      const managerId = ManagerId.make(randomUUID());
      const result = await create({
        environmentId,
        input: {
          managerId,
          name,
          scope: { _tag: "environment", projectIds: "all" },
          mission: "",
        },
      });
      return result._tag === "Success" ? managerId : null;
    },
    [create],
  );

  /** The pill is the toggle. A no-mission Argo has nothing to toggle. */
  const togglePause = useCallback(
    async (manager: EnvironmentManager) => {
      const action = managerPillAction(manager);
      if (action === "open") return false;
      const input = { managerId: manager.id };
      const result =
        action === "pause"
          ? await pause({ environmentId: manager.environmentId, input })
          : await resume({ environmentId: manager.environmentId, input });
      return result._tag === "Success";
    },
    [pause, resume],
  );

  const setPaused = useCallback(
    async (manager: EnvironmentManager, paused: boolean) => {
      const input = { managerId: manager.id };
      return paused
        ? await pause({ environmentId: manager.environmentId, input })
        : await resume({ environmentId: manager.environmentId, input });
    },
    [pause, resume],
  );

  const updateManager = useCallback(
    (
      manager: Pick<EnvironmentManager, "id" | "environmentId">,
      input: Omit<Parameters<typeof update>[0]["input"], "managerId">,
    ) =>
      update({
        environmentId: manager.environmentId,
        input: { ...input, managerId: manager.id },
      }),
    [update],
  );

  const deleteManager = useCallback(
    (manager: Pick<EnvironmentManager, "id" | "environmentId">, keepChildren: boolean) =>
      remove({
        environmentId: manager.environmentId,
        input: { managerId: manager.id, keepChildren },
      }),
    [remove],
  );

  /** Asks for a cycle on the next sweep. Refused unless the Argo is watching. */
  const cycleManagerNow = useCallback(
    async (manager: EnvironmentManager) => {
      if (managerCycleNowState(manager) !== "available") return false;
      const result = await cycleNow({
        environmentId: manager.environmentId,
        input: { managerId: manager.id },
      });
      return result._tag === "Success";
    },
    [cycleNow],
  );

  return {
    createManager,
    togglePause,
    setPaused,
    updateManager,
    deleteManager,
    cycleManagerNow,
  };
}

export type ManagerThreadTarget = {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
};

/** Route target for an Argo's own thread, or null until the server binds one. */
export function managerThreadTarget(manager: EnvironmentManager): ManagerThreadTarget | null {
  return manager.threadId === null
    ? null
    : { environmentId: manager.environmentId, threadId: manager.threadId };
}
