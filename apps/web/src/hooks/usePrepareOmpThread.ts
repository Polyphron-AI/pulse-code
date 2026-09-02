import type { ModelSelection, ScopedProjectRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { useNewThreadHandler } from "./useHandleNewThread";

export interface PrepareOmpThreadInput {
  readonly projectRef: ScopedProjectRef;
  readonly modelSelection: ModelSelection;
  readonly prompt: string;
}

/**
 * Opens a normal Pulse draft and pins it to one exact OMP instance and
 * discovered model before navigation. The user still reviews and sends the first message,
 * so thread bootstrap, permissions, worktree setup, and provider validation
 * continue through the established composer path.
 */
export function usePrepareOmpThread() {
  const openNewThread = useNewThreadHandler();

  return useCallback(
    (input: PrepareOmpThreadInput) =>
      openNewThread(input.projectRef, {
        composerSeed: {
          modelSelection: input.modelSelection,
          prompt: input.prompt,
        },
      }),
    [openNewThread],
  );
}
