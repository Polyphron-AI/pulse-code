/**
 * "Watchdog stuck" banner for the thread view. Shown only while the selected
 * thread's watchdog has escalated; "Take action" re-writes the same config,
 * which is how the server clears the escalation, then hands the thread back to
 * the composer.
 */
import type { EnvironmentId, OrchestrationThreadShell } from "@t3tools/contracts";
import { latestWatchdogEscalationReason } from "@t3tools/client-runtime/state/watchdog";
import { useCallback, useMemo } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { useSelectedThreadDetail } from "../../state/use-thread-detail";
import { useSetThreadWatchdog } from "./use-thread-watchdog";

export function ThreadWatchdogBanner(props: {
  readonly environmentId: EnvironmentId;
  readonly thread: OrchestrationThreadShell;
}) {
  const { environmentId, thread } = props;
  const detail = useSelectedThreadDetail();
  const setWatchdog = useSetThreadWatchdog();
  const watchdog = thread.watchdog ?? null;
  const reason = useMemo(
    () => (detail ? latestWatchdogEscalationReason(detail.activities) : null),
    [detail],
  );

  const handleTakeAction = useCallback(() => {
    void setWatchdog({
      environmentId,
      threadId: thread.id,
      watchdog,
    });
  }, [environmentId, setWatchdog, thread.id, watchdog]);

  if (!watchdog?.escalatedAt) return null;

  return (
    <View className="mx-4 mb-3 gap-2 rounded-[18px] border border-border bg-card px-4 py-3">
      <Text className="text-sm font-t3-bold text-foreground">Watchdog stuck</Text>
      <Text className="text-xs leading-normal text-foreground-muted">
        {reason ?? "The watchdog stopped and handed this thread back to you."}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Take action"
        className="self-start rounded-full border border-secondary-border bg-secondary px-3 py-1.5"
        onPress={handleTakeAction}
      >
        <Text className="text-xs font-t3-bold text-secondary-foreground">Take action</Text>
      </Pressable>
    </View>
  );
}
