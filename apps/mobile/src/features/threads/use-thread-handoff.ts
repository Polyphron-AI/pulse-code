import { buildThreadHandoffTargets } from "@t3tools/client-runtime/state/thread-handoff";
/**
 * Move an in-flight thread to another provider. Providers cannot be swapped
 * inside a live thread (each holds its own session), so the work moves
 * instead: the destination provider writes a handoff brief, and that brief
 * lands in a fresh new-task draft on the chosen provider.
 *
 * Minted at the root stack, like the other new-thread actions, because the
 * sidebar renders in its own navigation tree on iOS.
 */
import { useNavigation } from "@react-navigation/native";
import { getDefaultProviderInstanceModel } from "@t3tools/client-runtime/state/provider-instances";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  DEFAULT_SERVER_SETTINGS,
  type ModelSelection,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { useCallback } from "react";
import { Alert } from "react-native";

import { useServerConfigs } from "../../state/entities";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  createNewTaskDraft,
  getComposerDraftSnapshot,
  setComposerDraftText,
  updateComposerDraftSettings,
} from "../../state/use-composer-drafts";

const pendingHandoffs = new Set<string>();

export function useThreadHandoff(): (
  thread: EnvironmentThreadShell,
  instanceId: ProviderInstanceId,
  modelSelection?: ModelSelection,
) => Promise<void> {
  const navigation = useNavigation();
  const serverConfigs = useServerConfigs();
  const generateHandoff = useAtomCommand(orchestrationEnvironment.generateThreadHandoff, {
    reportFailure: false,
  });

  return useCallback(
    async (thread, instanceId, selectedModel) => {
      const key = `${thread.environmentId}:${thread.id}`;
      if (pendingHandoffs.has(key)) return;
      pendingHandoffs.add(key);
      try {
        const providers = serverConfigs.get(thread.environmentId)?.providers ?? [];
        const config = serverConfigs.get(thread.environmentId);
        const target = buildThreadHandoffTargets(
          providers,
          config?.settings ?? DEFAULT_SERVER_SETTINGS,
        ).find((target) => target.instanceId === instanceId);
        const model =
          selectedModel?.model ?? getDefaultProviderInstanceModel(providers, instanceId);
        if (
          !model ||
          !target ||
          target.disabled ||
          (selectedModel && selectedModel.instanceId !== instanceId)
        ) {
          Alert.alert(
            "Could not continue in that provider",
            "That provider has no model available on this server.",
          );
          return;
        }

        const modelSelection = selectedModel ?? { instanceId, model };
        const generated = await generateHandoff({
          environmentId: thread.environmentId,
          input: { threadId: thread.id, destination: modelSelection },
        });
        if (generated._tag === "Failure") {
          if (!isAtomCommandInterrupted(generated)) {
            const error = squashAtomCommandFailure(generated);
            Alert.alert(
              "Could not summarize this thread",
              error instanceof Error ? error.message : "The handoff summary could not be written.",
            );
          }
          return;
        }

        // The draft is seeded rather than sent: the brief is a starting point
        // the user edits, and the provider choice only takes effect on send.
        const draftId = createNewTaskDraft({
          environmentId: thread.environmentId,
          projectId: thread.projectId,
        });
        updateComposerDraftSettings(draftId, {
          modelSelection,
          workspaceSelection: {
            mode: thread.worktreePath ? "worktree" : "local",
            branch: thread.branch,
            worktreePath: thread.worktreePath,
          },
        });
        if (getComposerDraftSnapshot(draftId).text.trim().length === 0) {
          setComposerDraftText(draftId, generated.value.summary);
        }

        if (generated.value.capabilityNotice || generated.value.truncated) {
          Alert.alert(
            "Handoff ready",
            [
              generated.value.capabilityNotice,
              generated.value.truncated
                ? "This thread was long, so earlier content was left out. Review the brief, then send it."
                : null,
            ]
              .filter(Boolean)
              .join(" "),
          );
        }
        navigation.navigate("NewTaskSheet", {
          screen: "NewTaskDraft",
          params: {
            draftId,
            environmentId: String(thread.environmentId),
            projectId: String(thread.projectId),
          },
        });
      } finally {
        pendingHandoffs.delete(key);
      }
    },
    [generateHandoff, navigation, serverConfigs],
  );
}
