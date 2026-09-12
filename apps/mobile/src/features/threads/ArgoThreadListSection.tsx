/**
 * The Argo section at the top of the thread list. A row opens the Argo's own
 * thread; the pill, or a long press, pauses and resumes it. Mission editing
 * lives on desktop.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  managerPillAction,
  managerState,
  managerStateLabel,
} from "@t3tools/client-runtime/state/managers";
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { useManagers, useToggleManagerPause } from "./use-managers";

export const ArgoThreadListSection = memo(function ArgoThreadListSection(props: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onSelectThread: (thread: EnvironmentThreadShell) => void;
}) {
  const managers = useManagers();
  const togglePause = useToggleManagerPause();
  const live = managers.filter((manager) => manager.deletedAt === null);

  const openManagerThread = useCallback(
    (threadId: string | null, environmentId: string) => {
      if (threadId === null) return;
      const thread = props.threads.find(
        (entry) => entry.id === threadId && entry.environmentId === environmentId,
      );
      if (thread) props.onSelectThread(thread);
    },
    [props],
  );

  if (live.length === 0) return null;

  return (
    <View testID="argo-thread-list-section" className="mb-2 px-4">
      <Text className="mb-1 text-[11px] font-t3-bold uppercase tracking-wide text-foreground-muted">
        Argo
      </Text>
      {[...live]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((manager) => {
          const state = managerState(manager);
          return (
            <Pressable
              key={`${manager.environmentId}:${manager.id}`}
              testID="argo-thread-list-row"
              accessibilityRole="button"
              accessibilityLabel={`${manager.name}: ${managerStateLabel(manager)}`}
              onPress={() => openManagerThread(manager.threadId, manager.environmentId)}
              onLongPress={() => void togglePause(manager)}
              className="mb-1 flex-row items-center gap-2 rounded-[14px] border border-border bg-card px-3 py-2"
            >
              <Text className="flex-1 text-sm font-t3-bold text-foreground" numberOfLines={1}>
                {manager.name}
              </Text>
              <Pressable
                testID="argo-thread-list-pill"
                accessibilityRole="button"
                accessibilityLabel={
                  managerPillAction(manager) === "resume"
                    ? `Resume ${manager.name}`
                    : `Pause ${manager.name}`
                }
                disabled={managerPillAction(manager) === "open"}
                onPress={() => void togglePause(manager)}
                className="rounded-full border border-secondary-border bg-secondary px-2 py-0.5"
              >
                <Text
                  className={
                    state === "watching"
                      ? "text-[11px] font-t3-bold text-foreground"
                      : "text-[11px] font-t3-bold text-foreground-muted"
                  }
                >
                  {managerStateLabel(manager)}
                </Text>
              </Pressable>
            </Pressable>
          );
        })}
    </View>
  );
});
