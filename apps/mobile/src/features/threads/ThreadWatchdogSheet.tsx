/**
 * Watchdog rules editor for the selected thread. Mobile keeps this deliberately
 * small: an on/off switch and the rules text. The model stays whatever the web
 * picker last set, so opening this sheet never silently changes it.
 */
import { useNavigation } from "@react-navigation/native";
import {
  WATCHDOG_RULES_PLACEHOLDER,
  watchdogInterventionsLabel,
} from "@t3tools/client-runtime/state/watchdog";
import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, View } from "react-native";

import { AndroidSheetHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { ThemedSwitch } from "../../components/ThemedSwitch";
import { useThreadSelection } from "../../state/use-thread-selection";
import { SheetActionButton } from "./git/gitSheetComponents";
import { useSetThreadWatchdog } from "./use-thread-watchdog";

export function ThreadWatchdogSheet() {
  const navigation = useNavigation();
  const { selectedThread } = useThreadSelection();
  const setWatchdog = useSetThreadWatchdog();

  const watchdog = selectedThread?.watchdog ?? null;
  const storedRules = watchdog?.rules ?? "";
  const enabled = watchdog?.enabled === true;
  const [rules, setRules] = useState(storedRules);
  // The server value wins whenever it moves under us; typing is only kept
  // while the stored rules are unchanged.
  useEffect(() => {
    setRules(storedRules);
  }, [storedRules]);

  const interventionsLabel = watchdogInterventionsLabel(watchdog?.interventions ?? 0);

  const target = selectedThread
    ? { environmentId: selectedThread.environmentId, threadId: selectedThread.id, watchdog }
    : null;

  const handleToggle = useCallback(
    (next: boolean) => {
      if (!target) return;
      void setWatchdog(target, { enabled: next, rules });
    },
    [rules, setWatchdog, target],
  );

  const handleSave = useCallback(() => {
    if (target) void setWatchdog(target, { rules });
    navigation.goBack();
  }, [navigation, rules, setWatchdog, target]);

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <AndroidSheetHeader title="Watchdog" onBack={() => navigation.goBack()} />
      ) : null}
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 px-5 pt-2 pb-6"
      >
        {Platform.OS !== "android" ? (
          <Text className="text-xl font-t3-bold text-foreground">Watchdog</Text>
        ) : null}
        <View className="flex-row items-center justify-between gap-3">
          <Text className="shrink text-sm leading-normal text-foreground-secondary">
            Answers questions and approves tools in this thread under your rules, and escalates to
            you when it is unsure.
          </Text>
          <ThemedSwitch
            accessibilityLabel={enabled ? "Watchdog on" : "Watchdog off"}
            value={enabled}
            disabled={target === null}
            onValueChange={handleToggle}
          />
        </View>

        {watchdog?.escalatedAt ? (
          <View className="rounded-[18px] border border-border bg-card px-4 py-3">
            <Text className="text-sm font-t3-bold text-foreground">Watchdog stuck</Text>
            <Text className="mt-1 text-xs leading-normal text-foreground-muted">
              It handed this thread back to you. Saving these rules puts it back to work.
            </Text>
          </View>
        ) : null}

        <View className="gap-1.5">
          <Text className="text-xs font-t3-bold text-foreground-muted">Rules</Text>
          <TextInput
            className="min-h-32 rounded-[18px] border border-border bg-card px-4 py-3 text-base text-foreground"
            multiline
            editable={target !== null}
            placeholder={WATCHDOG_RULES_PLACEHOLDER}
            textAlignVertical="top"
            value={rules}
            onChangeText={setRules}
          />
        </View>

        {interventionsLabel ? (
          <Text className="text-xs text-foreground-muted">{interventionsLabel}</Text>
        ) : null}

        <SheetActionButton
          icon="checkmark"
          label="Save"
          tone="primary"
          disabled={target === null}
          onPress={handleSave}
        />
      </ScrollView>
    </View>
  );
}
