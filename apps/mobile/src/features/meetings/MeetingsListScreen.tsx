import { useNavigation } from "@react-navigation/native";
import { formatMeetingDuration } from "@t3tools/client-runtime/state/meetings";
import { EnvironmentId, type MeetingSummaryRow } from "@t3tools/contracts";
import { useLayoutEffect, useMemo, useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { ControlPillMenu } from "../../components/ControlPill";
import { EmptyState } from "../../components/EmptyState";
import { RowPressable } from "../../components/RowPressable";
import { StatusPill } from "../../components/StatusPill";
import { cn } from "../../lib/cn";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { SettingsSection } from "../settings/components/SettingsSection";
import { MEETING_TIME_FORMATTER, meetingStatusTone } from "./meetingPresentation";
import { meetingEnvironment } from "./meetingsState";

/** Meetings stored on one environment. The desktop app records them; every client reads them. */
export function MeetingsListScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { environments } = useEnvironments();
  const [chosenId, setChosenId] = useState<EnvironmentId | null>(null);
  // Mobile has no primary environment: keep the user's pick while it exists, else the first
  // connected one.
  const environment =
    environments.find((entry) => entry.environmentId === chosenId) ??
    environments.find((entry) => entry.connection.phase === "connected") ??
    environments[0] ??
    null;
  const environmentId = environment?.environmentId ?? null;
  const meetings = useEnvironmentQuery(
    environmentId === null ? null : meetingEnvironment.list({ environmentId, input: {} }),
  );

  const environmentActions = useMemo(
    () =>
      environments.map((entry) => ({
        id: entry.environmentId,
        title: entry.label,
        state: entry.environmentId === environmentId ? ("on" as const) : ("off" as const),
      })),
    [environments, environmentId],
  );
  const environmentPicker = useMemo(
    () =>
      environments.length > 1 ? (
        <ControlPillMenu
          accessible
          accessibilityRole="button"
          accessibilityLabel="Choose environment"
          title="Environment"
          actions={environmentActions}
          onPressAction={({ nativeEvent }) => setChosenId(EnvironmentId.make(nativeEvent.event))}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose environment"
            className={cn(
              "items-center justify-center rounded-full",
              Platform.OS === "ios" ? "size-[28px]" : "size-[44px]",
            )}
          >
            <SymbolView name="server.rack" size={20} tintColorClassName="accent-icon" />
          </Pressable>
        </ControlPillMenu>
      ) : null,
    [environments.length, environmentActions],
  );

  useLayoutEffect(() => {
    if (Platform.OS === "ios") {
      navigation.setOptions({ headerRight: () => environmentPicker });
    }
  }, [navigation, environmentPicker]);

  const openMeeting = (meeting: MeetingSummaryRow) => {
    if (environmentId === null) return;
    navigation.navigate("SettingsSheet", {
      screen: "SettingsContent",
      params: {
        screen: "SettingsMeeting",
        params: { environmentId: String(environmentId), meetingId: meeting.id },
      },
    });
  };

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader
            title="Meetings"
            onBack={() => navigation.goBack()}
            trailing={environmentPicker}
          />
        </>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        refreshControl={
          <RefreshControl refreshing={meetings.isPending} onRefresh={meetings.refresh} />
        }
      >
        {environments.length > 1 && environment !== null ? (
          <Text className="px-2 text-sm text-foreground-muted">{environment.label}</Text>
        ) : null}
        {environmentId === null ? (
          <EmptyState
            variant="plain"
            title="No environment"
            detail="Connect an environment to see its meetings."
          />
        ) : meetings.error !== null && meetings.data === null ? (
          <Text className="py-16 text-center text-base text-danger-foreground">
            {meetings.error}
          </Text>
        ) : meetings.data === null ? (
          <Text className="py-16 text-center text-base text-foreground-muted">
            Loading meetings…
          </Text>
        ) : meetings.data.length === 0 ? (
          <EmptyState
            variant="plain"
            title="No meetings yet"
            detail="Meetings are recorded from the Pulse desktop app. Their transcripts and summaries show up here on every device connected to this environment."
          />
        ) : (
          <SettingsSection card>
            {meetings.data.map((meeting, index) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                first={index === 0}
                onPress={() => openMeeting(meeting)}
              />
            ))}
          </SettingsSection>
        )}
      </ScrollView>
    </View>
  );
}

function MeetingRow(props: {
  readonly meeting: MeetingSummaryRow;
  readonly first: boolean;
  readonly onPress: () => void;
}) {
  const { meeting } = props;
  const tone = meetingStatusTone(meeting);
  const duration = formatMeetingDuration(meeting.durationMs);
  const startedAt = MEETING_TIME_FORMATTER.format(new Date(meeting.startedAt));
  return (
    <RowPressable
      accessibilityRole="button"
      accessibilityLabel={meeting.title}
      onPress={props.onPress}
      className={cn("gap-1 p-4", props.first ? undefined : "border-t border-border-subtle")}
    >
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-lg text-foreground" numberOfLines={1}>
          {meeting.title}
        </Text>
        {tone === null ? null : <StatusPill {...tone} size="compact" />}
      </View>
      <Text className="text-sm text-foreground-muted">
        {duration === null ? startedAt : `${startedAt} · ${duration}`}
      </Text>
      {meeting.summaryPreview === null ? null : (
        <Text className="text-sm text-foreground-secondary" numberOfLines={2}>
          {meeting.summaryPreview}
        </Text>
      )}
    </RowPressable>
  );
}
