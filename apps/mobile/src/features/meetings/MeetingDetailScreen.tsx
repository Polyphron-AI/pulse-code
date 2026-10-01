import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { formatMeetingDuration, formatMeetingOffset } from "@t3tools/client-runtime/state/meetings";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  EnvironmentId,
  MEETING_TITLE_MAX_LENGTH,
  MeetingId,
  type MeetingDetail,
} from "@t3tools/contracts";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { ControlPillMenu } from "../../components/ControlPill";
import { StatusPill } from "../../components/StatusPill";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useProjects } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  MEETING_TIME_FORMATTER,
  meetingStatusTone,
  meetingSummaryBlocks,
} from "./meetingPresentation";
import { meetingEnvironment } from "./meetingsState";
import { useSendMeetingToThread } from "./useSendMeetingToThread";

type MeetingDetailScreenProps = StaticScreenProps<{
  environmentId: string;
  meetingId: string;
}>;

function commandErrorMessage(result: Parameters<typeof squashAtomCommandFailure>[0]) {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "The request failed. Try again.";
}

export function MeetingDetailScreen({ route }: MeetingDetailScreenProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const meeting = useEnvironmentQuery(
    meetingEnvironment.detail({
      environmentId,
      input: { id: MeetingId.make(route.params.meetingId) },
    }),
  );

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader title="Meeting" onBack={() => navigation.goBack()} />
        </>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        className="flex-1"
        contentContainerClassName="gap-6 p-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {meeting.data !== null ? (
          <MeetingDetailContent
            key={meeting.data.id}
            meeting={meeting.data}
            environmentId={environmentId}
          />
        ) : meeting.error !== null ? (
          <Text className="text-base text-danger-foreground">{meeting.error}</Text>
        ) : (
          <Text className="text-base text-foreground-muted">Loading meeting…</Text>
        )}
      </ScrollView>
    </View>
  );
}

function MeetingDetailContent(props: {
  readonly meeting: MeetingDetail;
  readonly environmentId: EnvironmentId;
}) {
  const { meeting, environmentId } = props;
  const navigation = useNavigation();
  const rename = useAtomCommand(meetingEnvironment.rename, { reportFailure: false });
  const summarize = useAtomCommand(meetingEnvironment.summarize, { reportFailure: false });
  const deleteMeeting = useAtomCommand(meetingEnvironment.delete, { reportFailure: false });
  const [titleDraft, setTitleDraft] = useState(meeting.title);
  const [syncedTitle, setSyncedTitle] = useState(meeting.title);
  // A rename from another device or a generated title replaces the field's text.
  if (meeting.title !== syncedTitle) {
    setSyncedTitle(meeting.title);
    setTitleDraft(meeting.title);
  }
  const [busy, setBusy] = useState(false);

  const tone = meetingStatusTone(meeting);
  const duration = formatMeetingDuration(meeting.durationMs);
  const startedAt = MEETING_TIME_FORMATTER.format(new Date(meeting.startedAt));

  const commitTitle = async () => {
    const title = titleDraft.trim();
    if (title.length === 0 || title === meeting.title) {
      setTitleDraft(meeting.title);
      return;
    }
    const result = await rename({ environmentId, input: { id: meeting.id, title } });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      setTitleDraft(meeting.title);
      Alert.alert("Could not rename the meeting", commandErrorMessage(result));
    }
  };

  const regenerate = async () => {
    setBusy(true);
    const result = await summarize({ environmentId, input: { id: meeting.id } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      Alert.alert("Could not regenerate the summary", commandErrorMessage(result));
    }
  };

  const remove = async () => {
    setBusy(true);
    const result = await deleteMeeting({ environmentId, input: { id: meeting.id } });
    setBusy(false);
    if (result._tag === "Success") {
      navigation.goBack();
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      Alert.alert("Could not delete the meeting", commandErrorMessage(result));
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "Delete this meeting?",
      "The transcript and summary are removed from this environment for every device.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void remove() },
      ],
    );

  const canRegenerate = meeting.summaryStatus === "ready" || meeting.summaryStatus === "failed";

  return (
    <>
      <View className="gap-2">
        <TextInput
          accessibilityLabel="Meeting title"
          className="rounded-xl bg-card px-3 py-2 text-xl font-t3-bold"
          value={titleDraft}
          maxLength={MEETING_TITLE_MAX_LENGTH}
          returnKeyType="done"
          onChangeText={setTitleDraft}
          onBlur={() => void commitTitle()}
        />
        <View className="flex-row flex-wrap items-center gap-2 px-1">
          <Text className="text-sm text-foreground-muted">
            {duration === null ? startedAt : `${startedAt} · ${duration}`}
          </Text>
          {tone === null ? null : <StatusPill {...tone} size="compact" />}
        </View>
        <View className="flex-row flex-wrap gap-2 pt-1">
          <SendToThreadButton meeting={meeting} />
          {canRegenerate ? (
            <ActionButton
              icon="arrow.clockwise"
              label="Regenerate"
              disabled={busy}
              onPress={() => void regenerate()}
            />
          ) : null}
          <ActionButton icon="trash" label="Delete" disabled={busy} onPress={confirmDelete} />
        </View>
      </View>

      <View className="gap-2">
        <Text className="px-1 text-sm font-t3-medium text-foreground-muted">Summary</Text>
        <View className="gap-2 rounded-[24px] border-continuous bg-card p-4">
          <MeetingSummary meeting={meeting} />
        </View>
      </View>

      <View className="gap-2">
        <Text className="px-1 text-sm font-t3-medium text-foreground-muted">Transcript</Text>
        <View className="gap-2 rounded-[24px] border-continuous bg-card p-4">
          {meeting.segments.length === 0 ? (
            <Text className="text-base text-foreground-muted">No transcript yet.</Text>
          ) : (
            meeting.segments.map((segment) => (
              <View key={segment.index} className="flex-row gap-3">
                <Text className="w-12 font-mono text-xs leading-6 text-foreground-muted">
                  {formatMeetingOffset(segment.startMs)}
                </Text>
                <Text selectable className="min-w-0 flex-1 text-base text-foreground">
                  {segment.text}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </>
  );
}

function MeetingSummary({ meeting }: { readonly meeting: MeetingDetail }) {
  switch (meeting.summaryStatus) {
    case "ready":
      return meeting.summary === null
        ? null
        : meetingSummaryBlocks(meeting.summary).map((block) =>
            block.kind === "heading" ? (
              <Text key={block.key} className="pt-1 text-base font-t3-bold text-foreground">
                {block.text}
              </Text>
            ) : (
              <Text key={block.key} selectable className="text-base text-foreground">
                {block.kind === "bullet" ? `•  ${block.text}` : block.text}
              </Text>
            ),
          );
    case "pending":
      return <Text className="text-base text-foreground-muted">Writing the summary…</Text>;
    case "failed":
      return (
        <Text className="text-base text-danger-foreground">
          {meeting.summaryError ?? "The summary failed."}
        </Text>
      );
    case "none":
      return (
        <Text className="text-base text-foreground-muted">
          {meeting.status === "recording"
            ? "The summary is written when the recording finishes."
            : "No summary yet."}
        </Text>
      );
  }
}

const projectKey = (project: { readonly environmentId: string; readonly id: string }) =>
  `${project.environmentId}\u0000${project.id}`;

/** A project menu: picking a project opens a new task draft there with the meeting in it. */
function SendToThreadButton({ meeting }: { readonly meeting: MeetingDetail }) {
  const projects = useProjects();
  const { environments } = useEnvironments();
  const send = useSendMeetingToThread();
  if (projects.length === 0 || meeting.segments.length === 0) return null;
  const showEnvironment = new Set(projects.map((project) => project.environmentId)).size > 1;
  const actions = projects.map((project) => ({
    id: projectKey(project),
    title: project.title,
    subtitle: showEnvironment
      ? environments.find((entry) => entry.environmentId === project.environmentId)?.label
      : undefined,
  }));
  return (
    <ControlPillMenu
      accessible
      accessibilityRole="button"
      accessibilityLabel="Send to thread"
      title="Send to a new thread in"
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const project = projects.find((entry) => projectKey(entry) === nativeEvent.event);
        if (project) send(meeting, project);
      }}
    >
      <ActionButton icon="text.bubble" label="Send to thread" />
    </ControlPillMenu>
  );
}

function ActionButton(props: {
  readonly icon: "arrow.clockwise" | "trash" | "text.bubble";
  readonly label: string;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      className={
        props.disabled
          ? "min-h-[40px] flex-row items-center gap-2 rounded-full bg-card px-4 opacity-[0.45]"
          : "min-h-[40px] flex-row items-center gap-2 rounded-full bg-card px-4 active:opacity-70"
      }
    >
      <SymbolView name={props.icon} size={16} tintColorClassName="accent-icon" />
      <Text className="text-sm font-t3-medium text-foreground">{props.label}</Text>
    </Pressable>
  );
}
