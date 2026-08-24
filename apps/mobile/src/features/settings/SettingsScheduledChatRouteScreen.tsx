import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  formatScheduleTimeZoneLabel,
  nextScheduleRunAtMs,
  resolveViewerTimeZone,
} from "@t3tools/client-runtime/state/schedules";
import {
  EnvironmentId,
  ScheduleId,
  scheduleTargetsProject,
  type OrchestrationSchedule,
  type ProjectId,
} from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useThemeColor } from "../../lib/useThemeColor";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useProjects } from "../../state/entities";
import { environmentSchedules, scheduleEnvironment } from "../../state/schedules";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import {
  newScheduleDraft,
  scheduleDraftFromSchedule,
  scheduleDraftHasChanges,
  scheduleDraftIssue,
  scheduleDraftPatch,
  shiftScheduleDraftTime,
  type ScheduleDraft,
} from "./scheduledChats.logic";
import { useMinuteTick } from "./useMinuteTick";

/**
 * Mobile edits the two things worth editing on a phone: when the chat runs and
 * what it says. Everything else a schedule carries — model override, handoff
 * path, run limits, environment-wide fan-out — stays desktop-only, and the
 * screen says so rather than pretending it is not there.
 */
const ADVANCED_NOTE =
  "Model, handoff file, run limits, and environment-wide targets are set from desktop Pulse Code. Editing here leaves them as they are.";

type NewRouteProps = StaticScreenProps<{
  readonly environmentId: string;
}>;

export function SettingsScheduledChatNewRouteScreen({ route }: NewRouteProps) {
  return <ScheduledChatEditor environmentId={EnvironmentId.make(route.params.environmentId)} />;
}

type EditRouteProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly scheduleId: string;
}>;

export function SettingsScheduledChatEditRouteScreen({ route }: EditRouteProps) {
  return (
    <ScheduledChatEditor
      environmentId={EnvironmentId.make(route.params.environmentId)}
      scheduleId={ScheduleId.make(route.params.scheduleId)}
    />
  );
}

function ScheduledChatEditor({
  environmentId,
  scheduleId,
}: {
  readonly environmentId: EnvironmentId;
  readonly scheduleId?: ScheduleId;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const nowMs = useMinuteTick();
  const index = useAtomValue(environmentSchedules.environmentScheduleIndexAtom(environmentId));
  const projects = useProjects();

  // A tombstoned schedule stays in the snapshot, so treat it as gone rather
  // than opening an editor that can never save.
  const found = scheduleId === undefined ? null : (index.get(scheduleId) ?? null);
  const original = found !== null && found.deletedAt === null ? found : null;
  const environmentProjects = useMemo(
    () =>
      projects
        .filter((project) => project.environmentId === environmentId)
        .map((project) => ({ id: project.id, title: project.title })),
    [environmentId, projects],
  );

  const [draft, setDraft] = useState<ScheduleDraft>(() =>
    original === null ? newScheduleDraft() : scheduleDraftFromSchedule(original),
  );
  const [projectId, setProjectId] = useState<ProjectId | null>(
    () => environmentProjects[0]?.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const createSchedule = useAtomCommand(scheduleEnvironment.create, { reportFailure: false });
  const updateSchedule = useAtomCommand(scheduleEnvironment.update, { reportFailure: false });
  const pauseSchedule = useAtomCommand(scheduleEnvironment.pause, { reportFailure: false });
  const resumeSchedule = useAtomCommand(scheduleEnvironment.resume, { reportFailure: false });
  const deleteSchedule = useAtomCommand(scheduleEnvironment.delete, { reportFailure: false });

  const timezone = original?.timezone ?? resolveViewerTimeZone();
  const issue = scheduleDraftIssue(draft);
  const nextRunAtMs = nextScheduleRunAtMs(
    {
      hourLocal: draft.hourLocal,
      minuteLocal: draft.minuteLocal,
      timezone,
      pausedAt: original?.pausedAt ?? null,
    },
    nowMs,
  );
  const patch = original === null ? null : scheduleDraftPatch(original, draft);
  const canSave =
    !pending &&
    issue === null &&
    (original === null ? projectId !== null : patch !== null && scheduleDraftHasChanges(patch));

  const save = async (): Promise<void> => {
    if (pending) return;
    if (issue !== null) {
      setError(issue);
      return;
    }
    setError(null);
    setPending(true);
    if (original === null) {
      if (projectId === null) {
        setPending(false);
        setError("Pick the project this chat runs in.");
        return;
      }
      const result = await createSchedule({
        environmentId,
        input: {
          scope: { _tag: "project", projectId },
          hourLocal: draft.hourLocal,
          minuteLocal: draft.minuteLocal,
          timezone,
          prompt: draft.prompt.trim(),
        },
      });
      setPending(false);
      if (result._tag === "Failure") {
        setError("Could not create the schedule. Check the connection and try again.");
        return;
      }
    } else {
      if (patch === null || !scheduleDraftHasChanges(patch)) {
        setPending(false);
        navigation.goBack();
        return;
      }
      const result = await updateSchedule({
        environmentId,
        input: { scheduleId: original.id, ...patch },
      });
      setPending(false);
      if (result._tag === "Failure") {
        setError("Could not save the schedule. Check the connection and try again.");
        return;
      }
    }
    navigation.goBack();
  };

  const setPaused = async (paused: boolean): Promise<void> => {
    if (original === null || pending) return;
    setError(null);
    setPending(true);
    const input = { scheduleId: original.id };
    const result = paused
      ? await pauseSchedule({ environmentId, input })
      : await resumeSchedule({ environmentId, input });
    setPending(false);
    if (result._tag === "Failure") {
      setError(paused ? "Could not pause the schedule." : "Could not resume the schedule.");
    }
  };

  const confirmDelete = (): void => {
    if (original === null) return;
    Alert.alert(
      "Delete this scheduled chat?",
      "It stops running from now on. The threads it already created stay where they are.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setPending(true);
              const result = await deleteSchedule({
                environmentId,
                input: { scheduleId: original.id },
              });
              setPending(false);
              if (result._tag === "Failure") {
                setError("Could not delete the schedule.");
                return;
              }
              navigation.goBack();
            })();
          },
        },
      ],
    );
  };

  const title = original === null ? "New Scheduled Chat" : "Scheduled Chat";
  const missing = scheduleId !== undefined && original === null;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader title={title} onBack={() => navigation.goBack()} />
        </>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        {missing ? (
          <EmptyState
            title="This schedule is gone"
            detail="It was deleted, or this environment is not connected right now."
          />
        ) : (
          <>
            {error ? <ErrorBanner message={error} /> : null}

            {original === null ? (
              <SettingsSection title="Project" card>
                {environmentProjects.length === 0 ? (
                  <View className="p-4">
                    <Text className="text-sm leading-normal text-foreground-muted">
                      Add a project to this environment first.
                    </Text>
                  </View>
                ) : (
                  environmentProjects.map((project, projectIndex) => (
                    <ProjectChoiceRow
                      key={project.id}
                      title={project.title}
                      selected={project.id === projectId}
                      divided={projectIndex > 0}
                      onPress={() => setProjectId(project.id)}
                    />
                  ))
                )}
              </SettingsSection>
            ) : (
              <SettingsSection title="Project" card>
                <View className="p-4">
                  <Text className="text-lg text-foreground">
                    {describeEditorTarget(original, environmentProjects)}
                  </Text>
                </View>
              </SettingsSection>
            )}

            <SettingsSection title="Time" card>
              <TimeStepperRow
                label="Hour"
                value={String(draft.hourLocal).padStart(2, "0")}
                disabled={pending}
                onStep={(direction) => setDraft(shiftScheduleDraftTime(draft, direction * 60))}
              />
              <TimeStepperRow
                label="Minute"
                value={String(draft.minuteLocal).padStart(2, "0")}
                divided
                disabled={pending}
                onStep={(direction) => setDraft(shiftScheduleDraftTime(draft, direction * 5))}
              />
              <View className="border-t border-border-subtle p-4">
                <Text className="text-sm leading-normal text-foreground-muted">
                  {`${formatScheduleTimeZoneLabel(timezone, nowMs)} · ${timezone}`}
                </Text>
                <Text className="mt-1 text-sm leading-normal text-foreground-muted">
                  {nextRunAtMs === null
                    ? "Paused, so it has no next run."
                    : `Next run ${new Intl.DateTimeFormat(undefined, {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(nextRunAtMs)} your time.`}
                </Text>
              </View>
            </SettingsSection>

            <SettingsSection title="Prompt" card>
              <View className="gap-2 p-4">
                <TextInput
                  className="min-h-32 rounded-[18px] px-4 py-3 text-base leading-snug"
                  value={draft.prompt}
                  onChangeText={(prompt) => setDraft({ ...draft, prompt })}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  placeholder="Read yesterday's handoff, then check CI and open issues."
                />
                <Text className="text-sm leading-normal text-foreground-muted">
                  This exact prompt is sent every day. The agent reads the handoff file first, so
                  write it as a standing instruction rather than a one-off.
                </Text>
              </View>
            </SettingsSection>

            {original === null ? null : (
              <SettingsSection title="Schedule" card>
                <SettingsSwitchRow
                  icon="pause.circle"
                  label="Paused"
                  subtitle={
                    original.pausedAt === null
                      ? "Runs every day."
                      : "Skips every day until resumed."
                  }
                  disabled={pending}
                  value={original.pausedAt !== null}
                  onValueChange={(paused) => void setPaused(paused)}
                />
                <DestructiveRow
                  label="Delete scheduled chat"
                  disabled={pending}
                  onPress={confirmDelete}
                />
              </SettingsSection>
            )}

            <Text className="px-2 text-sm leading-normal text-foreground-muted">
              {ADVANCED_NOTE}
            </Text>

            <SaveButton
              label={original === null ? "Create scheduled chat" : "Save changes"}
              disabled={!canSave}
              loading={pending}
              onPress={() => void save()}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** What the schedule already targets, in the words the list uses. */
function describeEditorTarget(
  schedule: OrchestrationSchedule,
  environmentProjects: ReadonlyArray<{ readonly id: ProjectId; readonly title: string }>,
): string {
  if (schedule.scope._tag === "project") {
    const projectId = schedule.scope.projectId;
    return (
      environmentProjects.find((project) => project.id === projectId)?.title ?? "Unknown project"
    );
  }
  if (schedule.scope.projectIds === "all") return "Every project in this environment";
  const titles = environmentProjects
    .filter((project) => scheduleTargetsProject(schedule, project.id))
    .map((project) => project.title);
  return titles.length === 0 ? "No matching projects" : titles.join(", ");
}

function ProjectChoiceRow({
  title,
  selected,
  divided,
  onPress,
}: {
  readonly title: string;
  readonly selected: boolean;
  readonly divided: boolean;
  readonly onPress: () => void;
}) {
  const checkmark = useThemeColor("--color-icon");
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={
        divided
          ? "flex-row items-center gap-4 border-t border-border-subtle p-4"
          : "flex-row items-center gap-4 p-4"
      }
    >
      <Text className="min-w-0 flex-1 text-lg text-foreground" numberOfLines={1}>
        {title}
      </Text>
      {selected ? (
        <SymbolView
          name="checkmark"
          size={18}
          tintColor={checkmark}
          type="monochrome"
          weight="semibold"
        />
      ) : null}
    </Pressable>
  );
}

function TimeStepperRow({
  label,
  value,
  divided,
  disabled,
  onStep,
}: {
  readonly label: string;
  readonly value: string;
  readonly divided?: boolean;
  readonly disabled: boolean;
  readonly onStep: (direction: 1 | -1) => void;
}) {
  const icon = useThemeColor("--color-icon");
  return (
    <View
      className={
        divided
          ? "flex-row items-center gap-4 border-t border-border-subtle p-4"
          : "flex-row items-center gap-4 p-4"
      }
    >
      <Text className="min-w-0 flex-1 text-lg text-foreground">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label.toLowerCase()}`}
        disabled={disabled}
        onPress={() => onStep(-1)}
        className="size-9 items-center justify-center rounded-full bg-subtle active:opacity-70"
      >
        <SymbolView name="minus" size={16} tintColor={icon} type="monochrome" weight="semibold" />
      </Pressable>
      <Text className="w-10 text-center text-lg font-t3-bold text-foreground">{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label.toLowerCase()}`}
        disabled={disabled}
        onPress={() => onStep(1)}
        className="size-9 items-center justify-center rounded-full bg-subtle active:opacity-70"
      >
        <SymbolView name="plus" size={16} tintColor={icon} type="monochrome" weight="semibold" />
      </Pressable>
    </View>
  );
}

function DestructiveRow({
  label,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={
        disabled
          ? "flex-row items-center gap-4 border-t border-border-subtle p-4 opacity-[0.45]"
          : "flex-row items-center gap-4 border-t border-border-subtle p-4 active:opacity-70"
      }
    >
      <Text className="text-lg text-rose-600 dark:text-rose-400">{label}</Text>
    </Pressable>
  );
}

function SaveButton({
  label,
  disabled,
  loading,
  onPress,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onPress: () => void;
}) {
  const primaryForeground = useThemeColor("--color-primary-foreground");
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className="h-12 items-center justify-center rounded-full bg-primary active:opacity-70 disabled:opacity-45"
    >
      {loading ? (
        <ActivityIndicator color={String(primaryForeground)} />
      ) : (
        <Text className="text-base font-t3-bold text-primary-foreground">{label}</Text>
      )}
    </Pressable>
  );
}
