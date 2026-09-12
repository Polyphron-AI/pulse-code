/**
 * The assistant (Luna) row above the thread list. Tapping it opens her
 * conversation; a long press starts a new one. There is only ever one row,
 * because there is one assistant per environment.
 */
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { buildAssistantThreadListEntry } from "./assistant-entry.logic";
import { useAssistants, useResetAssistant } from "./use-assistants";

export const AssistantThreadListEntry = memo(function AssistantThreadListEntry(props: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onSelectThread: (thread: EnvironmentThreadShell) => void;
}) {
  const assistants = useAssistants();
  const resetAssistant = useResetAssistant();
  const assistant = assistants[0] ?? null;
  const entry = buildAssistantThreadListEntry({ assistant, threads: props.threads });

  const openThread = useCallback(() => {
    if (entry.threadId === null || entry.environmentId === null) return;
    const thread = props.threads.find(
      (candidate) =>
        candidate.id === entry.threadId && candidate.environmentId === entry.environmentId,
    );
    if (thread) props.onSelectThread(thread);
  }, [entry.environmentId, entry.threadId, props]);

  if (assistant === null) return null;

  return (
    <View testID="assistant-thread-list-entry" className="mb-2 px-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}: ${entry.subtitle}`}
        disabled={entry.threadId === null}
        onPress={openThread}
        className="flex-row items-center gap-2 rounded-[14px] border border-border bg-card px-3 py-2"
      >
        <View className="size-6 items-center justify-center rounded-full bg-secondary">
          <Text className="text-[11px] font-t3-bold text-foreground">{entry.avatar}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm font-t3-bold text-foreground" numberOfLines={1}>
            {entry.name}
          </Text>
          <Text className="text-[11px] text-foreground-muted" numberOfLines={1}>
            {entry.subtitle}
          </Text>
        </View>
        {entry.canReset ? (
          <Pressable
            testID="assistant-thread-list-reset"
            accessibilityRole="button"
            accessibilityLabel={`Reset ${entry.name}`}
            onPress={() => void resetAssistant(assistant)}
            className="rounded-full border border-secondary-border bg-secondary px-2 py-0.5"
          >
            <Text className="text-[11px] font-t3-bold text-foreground-muted">Reset</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
});
