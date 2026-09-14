import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import type {
  EnvironmentId,
  ProviderInstanceId,
  ScopedThreadRef,
  ServerProvider,
} from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { toastManager } from "../components/ui/toast";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  getDefaultProviderInstanceModel,
  isProviderInstancePickerReady,
  isProviderInstancePickerVisible,
  sortProviderInstanceEntries,
} from "../providerInstances";
import { readThreadShell, useServerConfigs } from "../state/entities";
import { orchestrationEnvironment } from "../state/orchestration";
import { useAtomCommand } from "../state/use-atom-command";
import { useComposerDraftStore } from "../composerDraftStore";
import { useNewThreadHandler } from "./useHandleNewThread";

export interface ThreadHandoffTarget {
  readonly instanceId: ProviderInstanceId;
  readonly label: string;
  /** The instance cannot start right now, so the menu shows it greyed out. */
  readonly disabled: boolean;
}

/**
 * The provider instances a thread can be handed off to: everything the model
 * picker would show for that environment. Callers drop the thread's own
 * instance, which they know from the thread snapshot they are acting on.
 */
export function buildThreadHandoffTargets(
  providers: ReadonlyArray<ServerProvider>,
  settings: Parameters<typeof applyProviderInstanceSettings>[1],
): ReadonlyArray<ThreadHandoffTarget> {
  return sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
  )
    .filter(isProviderInstancePickerVisible)
    .map((entry) => ({
      instanceId: entry.instanceId,
      label: entry.displayName,
      disabled: !isProviderInstancePickerReady(entry),
    }));
}

/** React binding for {@link buildThreadHandoffTargets}, for single-environment surfaces. */
export function useThreadHandoffTargets(
  environmentId: EnvironmentId | null,
): ReadonlyArray<ThreadHandoffTarget> {
  const serverConfigs = useServerConfigs();
  return useMemo(() => {
    const serverConfig = environmentId ? serverConfigs.get(environmentId) : undefined;
    return buildThreadHandoffTargets(
      serverConfig?.providers ?? [],
      serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS,
    );
  }, [environmentId, serverConfigs]);
}

/**
 * Move an in-flight thread to another provider. Providers cannot be swapped
 * inside a live thread (each holds its own session), so the work moves instead:
 * the thread's own provider writes a handoff brief, and that brief lands in a
 * fresh draft on the chosen provider for the user to review and send.
 */
export function useThreadHandoff() {
  const generateHandoff = useAtomCommand(orchestrationEnvironment.generateThreadHandoff, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();
  const serverConfigs = useServerConfigs();

  return useCallback(
    async (input: {
      readonly threadRef: ScopedThreadRef;
      readonly instanceId: ProviderInstanceId;
    }): Promise<void> => {
      const thread = readThreadShell(input.threadRef);
      if (!thread) return;
      const providers = serverConfigs.get(input.threadRef.environmentId)?.providers ?? [];
      const model = getDefaultProviderInstanceModel(providers, input.instanceId);
      if (!model) {
        toastManager.add({
          type: "error",
          title: "Could not continue in that provider",
          description: "That provider has no model available on this server.",
        });
        return;
      }

      const pendingToastId = toastManager.add({
        type: "loading",
        title: "Summarizing thread…",
        description: "Its current provider is writing a handoff brief.",
        timeout: 0,
      });

      const generated = await generateHandoff({
        environmentId: input.threadRef.environmentId,
        input: { threadId: input.threadRef.threadId },
      });
      toastManager.close(pendingToastId);
      if (generated._tag === "Failure") {
        if (!isAtomCommandInterrupted(generated)) {
          const error = squashAtomCommandFailure(generated);
          toastManager.add({
            type: "error",
            title: "Could not summarize this thread",
            description:
              error instanceof Error ? error.message : "The handoff summary could not be written.",
          });
        }
        return;
      }

      const opened = await settlePromise(() =>
        handleNewThread(scopeProjectRef(input.threadRef.environmentId, thread.projectId)),
      );
      if (opened._tag === "Failure" || opened.value === null) {
        toastManager.add({
          type: "error",
          title: "Could not open the new thread",
          description: "The handoff summary was written but no draft could be opened for it.",
        });
        return;
      }

      // The draft is seeded rather than sent: the brief is a starting point the
      // user edits, and the provider choice only takes effect on that send.
      const store = useComposerDraftStore.getState();
      const draftId = opened.value.draftId;
      store.setModelSelection(draftId, { instanceId: input.instanceId, model }, { explicit: true });
      if ((store.getComposerDraft(draftId)?.prompt ?? "").trim().length === 0) {
        store.setPrompt(draftId, generated.value.summary);
      }

      toastManager.add({
        type: "success",
        title: "Handoff ready",
        description: generated.value.truncated
          ? "This thread was long, so earlier content was left out. Review the brief, then send it."
          : "Review the brief, then send it to start the new thread.",
      });
    },
    [generateHandoff, handleNewThread, serverConfigs],
  );
}
