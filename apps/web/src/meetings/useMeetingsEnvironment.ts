import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";

/**
 * The environment whose meetings a page shows: the one named in the URL, else the primary
 * environment, else the first connected one. A named environment is trusted until the catalog
 * loads so a deep link does not flash another environment's meetings.
 */
export function useMeetingsEnvironment(requested: EnvironmentId | undefined) {
  const { environments, isReady } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = useMemo((): EnvironmentId | null => {
    if (requested !== undefined) {
      if (!isReady || environments.some((entry) => entry.environmentId === requested)) {
        return requested;
      }
    }
    if (primaryEnvironmentId !== null) return primaryEnvironmentId;
    const connected = environments.find((entry) => entry.connection.phase === "connected");
    return connected?.environmentId ?? environments[0]?.environmentId ?? null;
  }, [environments, isReady, primaryEnvironmentId, requested]);
  return { environments, environmentId };
}
