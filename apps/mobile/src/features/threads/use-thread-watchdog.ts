import type { EnvironmentId, ModelSelection, ThreadId, ThreadWatchdog } from "@t3tools/contracts";
import { useCallback } from "react";

import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

export interface ThreadWatchdogTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly watchdog: ThreadWatchdog | null | undefined;
}

/**
 * Writes a thread's watchdog config. Every mobile entry point (thread row menu,
 * thread header, rules sheet, the stuck banner) goes through this so they all
 * send the same command. The server clears the escalation on every write, so
 * re-saving the current values is also the "Take action" gesture.
 */
export function useSetThreadWatchdog() {
  const setWatchdog = useAtomCommand(threadEnvironment.setWatchdog, { reportFailure: false });
  return useCallback(
    (
      target: ThreadWatchdogTarget,
      patch: {
        readonly enabled?: boolean;
        readonly rules?: string;
        readonly modelSelection?: ModelSelection | null;
      } = {},
    ) =>
      setWatchdog({
        environmentId: target.environmentId,
        input: {
          threadId: target.threadId,
          enabled: patch.enabled ?? target.watchdog?.enabled === true,
          rules: patch.rules ?? target.watchdog?.rules ?? "",
          modelSelection:
            patch.modelSelection !== undefined
              ? patch.modelSelection
              : (target.watchdog?.modelSelection ?? null),
        },
      }),
    [setWatchdog],
  );
}
