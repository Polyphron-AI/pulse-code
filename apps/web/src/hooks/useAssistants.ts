import { useAtomValue } from "@effect/atom-react";
import {
  assistantForEnvironment,
  type EnvironmentAssistant,
} from "@t3tools/client-runtime/state/assistants";
import { AssistantId, type EnvironmentId } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { randomUUID } from "~/lib/utils";
import { assistantEnvironment, environmentAssistants } from "~/state/assistants";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";

/** Every assistant record the connected environments know about. */
export function useAssistants(): ReadonlyArray<EnvironmentAssistant> {
  return useAtomValue(environmentAssistants.assistantsAtom);
}

/** The assistant for an environment, defaulting to the primary one. */
export function useAssistant(environmentId?: EnvironmentId | null): EnvironmentAssistant | null {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const assistants = useAssistants();
  const target = environmentId === undefined ? primaryEnvironmentId : environmentId;
  return useMemo(() => assistantForEnvironment(assistants, target), [assistants, target]);
}

/**
 * Every assistant mutation the UI needs. `sendMessage` creates the record on
 * first use, so the panel never has to ask the user to make an assistant.
 */
export function useAssistantActions() {
  const create = useAtomCommand(assistantEnvironment.create);
  const update = useAtomCommand(assistantEnvironment.update);
  const reset = useAtomCommand(assistantEnvironment.reset);
  const message = useAtomCommand(assistantEnvironment.message);

  const createAssistant = useCallback(
    async (environmentId: EnvironmentId) => {
      const assistantId = AssistantId.make(randomUUID());
      const result = await create({ environmentId, input: { assistantId } });
      return result._tag === "Success" ? assistantId : null;
    },
    [create],
  );

  const renameAssistant = useCallback(
    (assistant: Pick<EnvironmentAssistant, "id" | "environmentId">, name: string) =>
      update({
        environmentId: assistant.environmentId,
        input: { assistantId: assistant.id, name },
      }),
    [update],
  );

  const resetAssistant = useCallback(
    (assistant: Pick<EnvironmentAssistant, "id" | "environmentId">) =>
      reset({
        environmentId: assistant.environmentId,
        input: { assistantId: assistant.id },
      }),
    [reset],
  );

  const sendMessage = useCallback(
    async (
      target: { readonly environmentId: EnvironmentId; readonly assistantId: AssistantId | null },
      text: string,
    ) => {
      const assistantId = target.assistantId ?? (await createAssistant(target.environmentId));
      if (assistantId === null) return false;
      const result = await message({
        environmentId: target.environmentId,
        input: { assistantId, text },
      });
      return result._tag === "Success";
    },
    [createAssistant, message],
  );

  return { createAssistant, renameAssistant, resetAssistant, sendMessage };
}
