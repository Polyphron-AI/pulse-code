import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentAssistant } from "@t3tools/client-runtime/state/assistants";
import { useCallback } from "react";

import { assistantEnvironment, environmentAssistants } from "../../state/assistants";
import { useAtomCommand } from "../../state/use-atom-command";

/** Every assistant record the connected environments know about. */
export function useAssistants(): ReadonlyArray<EnvironmentAssistant> {
  return useAtomValue(environmentAssistants.assistantsAtom);
}

/**
 * Mobile only resets. Creating, renaming, and briefing the assistant live on
 * desktop; the phone is where you read the conversation and start over.
 */
export function useResetAssistant(): (assistant: EnvironmentAssistant) => Promise<boolean> {
  const reset = useAtomCommand(assistantEnvironment.reset);

  return useCallback(
    async (assistant: EnvironmentAssistant) => {
      const result = await reset({
        environmentId: assistant.environmentId,
        input: { assistantId: assistant.id },
      });
      return result._tag === "Success";
    },
    [reset],
  );
}
