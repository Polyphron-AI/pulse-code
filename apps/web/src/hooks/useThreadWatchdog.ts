import type { ScopedThreadRef, ThreadWatchdog } from "@t3tools/contracts";
import { useCallback } from "react";

import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Flips the per-thread watchdog on or off while keeping its rules and model.
 * Shared by the sidebar row menu, the chat header menu, and the command
 * palette so every entry point writes the same command.
 */
export function useThreadWatchdogToggle() {
  const setWatchdog = useAtomCommand(threadEnvironment.setWatchdog, { reportFailure: false });
  return useCallback(
    (threadRef: ScopedThreadRef, watchdog: ThreadWatchdog | null | undefined, enabled: boolean) =>
      setWatchdog({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          enabled,
          rules: watchdog?.rules ?? "",
          modelSelection: watchdog?.modelSelection ?? null,
        },
      }),
    [setWatchdog],
  );
}
