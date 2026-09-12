import { useAtomValue } from "@effect/atom-react";
import {
  managerCycleNowState,
  managerForThread,
  managerPillAction,
  type EnvironmentManager,
} from "@t3tools/client-runtime/state/managers";
import { useCallback, useMemo } from "react";

import { environmentManagers, managerEnvironment } from "../../state/managers";
import { useAtomCommand } from "../../state/use-atom-command";

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
    () => (managerId === null ? null : (managers.find((entry) => entry.id === managerId) ?? null)),
    [managerId, managers],
  );
}

/**
 * The pause toggle, shared by the Argo rows in the thread list and the banner
 * in an Argo's own thread. Mobile does not edit missions.
 */
export function useToggleManagerPause(): (manager: EnvironmentManager) => Promise<boolean> {
  const pause = useAtomCommand(managerEnvironment.pause);
  const resume = useAtomCommand(managerEnvironment.resume);

  return useCallback(
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
}

/** Asks for a cycle on the next sweep. Refused unless the Argo is watching. */
export function useCycleManagerNow(): (manager: EnvironmentManager) => Promise<boolean> {
  const cycleNow = useAtomCommand(managerEnvironment.cycleNow);

  return useCallback(
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
}
