/**
 * Shown at the top of a thread Argo owns. In the Argo's own thread it reports
 * the state and toggles pause; in a child it names the Argo that spawned it.
 */
import {
  isManagerOwnThread,
  managerBadgeLabel,
  managerCycleNowLabel,
  managerCycleNowState,
  managerPillAction,
  managerStateLabel,
} from "@t3tools/client-runtime/state/managers";
import type { OrchestrationThreadShell } from "@t3tools/contracts";
import { memo } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { useCycleManagerNow, useManagerForThread, useToggleManagerPause } from "./use-managers";

export const ArgoThreadBanner = memo(function ArgoThreadBanner(props: {
  readonly thread: OrchestrationThreadShell;
}) {
  const manager = useManagerForThread(props.thread);
  const togglePause = useToggleManagerPause();
  const cycleNow = useCycleManagerNow();
  if (manager === null) return null;

  if (!isManagerOwnThread(manager, { id: props.thread.id })) {
    return (
      <View
        testID="argo-child-banner"
        className="mx-4 mb-3 self-start rounded-full border border-border bg-card px-3 py-1"
      >
        <Text className="text-xs font-t3-bold text-foreground-muted">
          {managerBadgeLabel(manager)}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="argo-thread-banner"
      className="mx-4 mb-3 flex-row items-center gap-2 rounded-[18px] border border-border bg-card px-4 py-3"
    >
      <Text className="flex-1 text-sm font-t3-bold text-foreground" numberOfLines={1}>
        {manager.name}
      </Text>
      <Pressable
        testID="argo-cycle-now"
        accessibilityRole="button"
        accessibilityLabel={managerCycleNowLabel(manager)}
        disabled={managerCycleNowState(manager) !== "available"}
        onPress={() => void cycleNow(manager)}
        className="rounded-full border border-border px-3 py-1.5"
      >
        <Text className="text-xs font-t3-bold text-foreground-muted">
          {managerCycleNowLabel(manager)}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={managerPillAction(manager) === "resume" ? "Resume Argo" : "Pause Argo"}
        disabled={managerPillAction(manager) === "open"}
        onPress={() => void togglePause(manager)}
        className="rounded-full border border-secondary-border bg-secondary px-3 py-1.5"
      >
        <Text className="text-xs font-t3-bold text-secondary-foreground">
          {managerStateLabel(manager)}
        </Text>
      </Pressable>
    </View>
  );
});
