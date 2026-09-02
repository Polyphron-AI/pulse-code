import { useAtomValue } from "@effect/atom-react";
import type { MenuAction } from "@react-native-menu/menu";
import { StackActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  EnvironmentId,
  ProjectId,
  ScheduleId,
  type ModelSelection,
  type OrchestrationSchedule,
  type OrchestrationShellSnapshot,
  type ProviderOptionSelection,
  type ServerConfig,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { ControlPill, ControlPillMenu } from "../../components/ControlPill";
import { EmptyState } from "../../components/EmptyState";
import { SymbolView } from "../../components/AppSymbol";
import { relativeTime } from "../../lib/time";
import { useThemeColor } from "../../lib/useThemeColor";
import { uuidv4 } from "../../lib/uuid";
import { NativeHeaderToolbar, NativeStackScreenOptions } from "../../native/StackHeader";
import {
  buildModelOptions,
  groupByProvider,
  resolveDefaultableModelSelection,
  resolveSelectableModelSelection,
} from "../../lib/modelOptions";
import { resolveProviderOptionDescriptors } from "../../lib/providerOptions";
import { useEnvironments } from "../../state/environments";
import { orchestrationEnvironment } from "../../state/orchestration";
import { serverEnvironment } from "../../state/server";
import { environmentSnapshotAtom } from "../../state/shell";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  type ExistingThreadSettingsRouteSession,
  useExistingThreadSettingsRoutePresentation,
} from "../threads/ThreadSettingsSheet";
import {
  latestScheduleOccurrence,
  mobileOccurrenceSummary,
  mobileScheduleCanEdit,
  mobileScheduleHeadline,
  mobileScheduleModelLabel,
  mobileScheduleScopeLabel,
  mobileScheduleStatus,
} from "./SettingsScheduledChatsRouteScreen.logic";

const EMPTY_SNAPSHOT_ATOM = Atom.make<OrchestrationShellSnapshot | null>(null).pipe(
  Atom.withLabel("mobile-scheduled-chats-empty-snapshot"),
);
const EMPTY_SERVER_CONFIG_ATOM = Atom.make<ServerConfig | null>(null).pipe(
  Atom.withLabel("mobile-scheduled-chats-empty-server-config"),
);

interface ScheduleDraft {
  readonly allProjects: boolean;
  readonly projectId: ProjectId | null;
  readonly modelSelection: ModelSelection | null;
  readonly time: string;
  readonly timezone: string;
  readonly prompt: string;
  readonly skipIfDirty: boolean;
}

function defaultDraft(projectId: ProjectId | null): ScheduleDraft {
  return {
    allProjects: false,
    projectId,
    modelSelection: null,
    time: "09:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    prompt: "",
    skipIfDirty: false,
  };
}

function draftFromSchedule(schedule: OrchestrationSchedule): ScheduleDraft {
  const allProjects = schedule.scope._tag === "environment";
  const projectId =
    schedule.scope._tag === "project"
      ? schedule.scope.projectId
      : schedule.scope.projectIds === "all"
        ? null
        : (schedule.scope.projectIds[0] ?? null);
  return {
    allProjects,
    projectId,
    modelSelection: schedule.modelSelection ?? null,
    time: `${String(schedule.hourLocal).padStart(2, "0")}:${String(schedule.minuteLocal).padStart(2, "0")}`,
    timezone: schedule.timezone,
    prompt: schedule.prompt,
    skipIfDirty: schedule.skipIfDirty ?? allProjects,
  };
}

function validTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function commandFailureMessage(result: Parameters<typeof squashAtomCommandFailure>[0]): string {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "Reconnect this environment and try again.";
}

function StatusPill(props: { readonly schedule: OrchestrationSchedule }) {
  const status = mobileScheduleStatus(props.schedule);
  const className =
    status.kind === "failed" || status.kind === "auto-paused"
      ? "bg-danger"
      : status.kind === "running"
        ? "bg-primary"
        : "bg-subtle-strong";
  const textClassName =
    status.kind === "failed" || status.kind === "auto-paused"
      ? "text-danger-foreground"
      : status.kind === "running"
        ? "text-primary-foreground"
        : "text-foreground";

  return (
    <View className={`rounded-full px-2.5 py-1 ${className}`}>
      <Text className={`text-[11px] font-t3-bold uppercase tracking-wide ${textClassName}`}>
        {status.label}
      </Text>
    </View>
  );
}

function ScopeSegment(props: {
  readonly allProjects: boolean;
  readonly onChange: (allProjects: boolean) => void;
}) {
  return (
    <View className="flex-row overflow-hidden rounded-full bg-subtle">
      {[
        { label: "One project", value: false },
        { label: "All projects", value: true },
      ].map((option) => {
        const active = option.value === props.allProjects;
        return (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={
              active
                ? "flex-1 items-center rounded-full bg-subtle-strong px-3 py-2.5"
                : "flex-1 items-center px-3 py-2.5"
            }
            onPress={() => props.onChange(option.value)}
          >
            <Text
              className={
                active ? "text-sm font-t3-bold text-foreground" : "text-sm text-foreground-muted"
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FieldLabel(props: { readonly children: React.ReactNode }) {
  return (
    <Text className="mb-1.5 text-xs font-t3-bold text-foreground-muted">{props.children}</Text>
  );
}

function ScheduleEditor(props: {
  readonly draft: ScheduleDraft;
  readonly projects: OrchestrationShellSnapshot["projects"];
  readonly editing: OrchestrationSchedule | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly modelLabel: string;
  readonly modelAvailable: boolean;
  readonly onOpenAgentSettings: () => void;
  readonly onChange: (draft: ScheduleDraft) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}) {
  const projectTitle =
    props.projects.find((project) => project.id === props.draft.projectId)?.title ??
    "Choose project";
  const projectActions = useMemo<MenuAction[]>(
    () =>
      props.projects.map((project) => ({
        id: project.id,
        title: project.title,
        state: project.id === props.draft.projectId ? "on" : "off",
      })),
    [props.draft.projectId, props.projects],
  );

  return (
    <View className="gap-4 rounded-[24px] border border-primary/30 bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xl font-t3-bold text-foreground">
            {props.editing ? "Edit schedule" : "New schedule"}
          </Text>
          <Text className="mt-1 text-sm leading-normal text-foreground-muted">
            Each run opens a fresh agent session in one persistent chat.
          </Text>
        </View>
        <View className="rounded-full bg-subtle px-2.5 py-1">
          <Text className="text-[11px] font-t3-bold uppercase tracking-wide text-foreground-muted">
            Daily
          </Text>
        </View>
      </View>

      <View>
        <FieldLabel>Scope</FieldLabel>
        <ScopeSegment
          allProjects={props.draft.allProjects}
          onChange={(allProjects) =>
            props.onChange({
              ...props.draft,
              allProjects,
              skipIfDirty: allProjects,
            })
          }
        />
      </View>

      {!props.draft.allProjects ? (
        <View>
          <FieldLabel>Project</FieldLabel>
          <ControlPillMenu
            actions={projectActions}
            onPressAction={({ nativeEvent }) =>
              props.onChange({
                ...props.draft,
                projectId: ProjectId.make(nativeEvent.event),
              })
            }
          >
            <ControlPill
              accessibilityLabel="Choose scheduled project"
              icon="folder"
              label={projectTitle}
              variant="pill"
              className="self-start"
            />
          </ControlPillMenu>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <FieldLabel>Local time</FieldLabel>
          <TextInput
            accessibilityLabel="Schedule local time"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            onChangeText={(time) => props.onChange({ ...props.draft, time })}
            placeholder="09:00"
            value={props.draft.time}
          />
        </View>
        <View className="flex-[1.45]">
          <FieldLabel>Time zone</FieldLabel>
          <TextInput
            accessibilityLabel="Schedule time zone"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(timezone) => props.onChange({ ...props.draft, timezone })}
            placeholder="Africa/Johannesburg"
            value={props.draft.timezone}
          />
        </View>
      </View>

      <View className="gap-3 rounded-2xl bg-subtle px-4 py-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="font-t3-bold text-foreground">Agent setup</Text>
            <Text className="mt-0.5 text-xs leading-normal text-foreground-muted">
              Model, reasoning, and context for every run.
            </Text>
          </View>
          {props.draft.modelSelection !== null ? (
            <ControlPill
              accessibilityLabel="Use project default model"
              label="Reset"
              variant="pill"
              onPress={() => props.onChange({ ...props.draft, modelSelection: null })}
            />
          ) : null}
        </View>
        <ControlPill
          accessibilityLabel="Choose scheduled chat model, reasoning, and context"
          disabled={!props.modelAvailable}
          label={props.modelLabel}
          variant="pill"
          className="self-start"
          onPress={props.onOpenAgentSettings}
        />
        <Text className="text-xs leading-normal text-foreground-muted">
          {props.draft.modelSelection === null
            ? props.draft.allProjects
              ? "Each project uses its own default until you choose a shared override."
              : "Uses the project's default until you choose an override."
            : "Uses this model and its options instead of the project default."}
        </Text>
      </View>

      <View>
        <FieldLabel>Prompt</FieldLabel>
        <TextInput
          accessibilityLabel="Schedule prompt"
          className="min-h-28"
          multiline
          onChangeText={(prompt) => props.onChange({ ...props.draft, prompt })}
          placeholder="Review the project, run the relevant checks, and leave a concise handoff."
          textAlignVertical="top"
          value={props.draft.prompt}
        />
      </View>

      <View className="flex-row items-center gap-4 rounded-2xl bg-subtle px-4 py-3">
        <View className="min-w-0 flex-1">
          <Text className="font-t3-bold text-foreground">Skip dirty working trees</Text>
          <Text className="mt-0.5 text-xs leading-normal text-foreground-muted">
            Avoid unattended edits over uncommitted work.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Skip dirty working trees"
          value={props.draft.skipIfDirty}
          onValueChange={(skipIfDirty) => props.onChange({ ...props.draft, skipIfDirty })}
        />
      </View>

      <Text className="text-xs leading-normal text-foreground-muted">
        Handoffs go to handoff/&#123;date&#125;.md.
      </Text>

      {props.error ? (
        <View className="flex-row items-start gap-2 rounded-2xl border border-danger-border bg-danger px-3 py-2.5">
          <Text className="flex-1 text-sm text-danger-foreground">{props.error}</Text>
        </View>
      ) : null}

      <View className="flex-row justify-end gap-2">
        <ControlPill disabled={props.busy} label="Cancel" variant="pill" onPress={props.onCancel} />
        <ControlPill
          disabled={props.busy || props.projects.length === 0}
          icon={props.busy ? "clock" : undefined}
          label={props.busy ? "Saving…" : props.editing ? "Save changes" : "Create schedule"}
          variant="primary"
          onPress={props.onSave}
        />
      </View>
    </View>
  );
}

function ScheduleCard(props: {
  readonly schedule: OrchestrationSchedule;
  readonly projectTitles: ReadonlyMap<ProjectId, string>;
  readonly busy: boolean;
  readonly onPauseChange: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onOpenThread: (threadId: string) => void;
  readonly serverConfig: ServerConfig | null;
}) {
  const icon = useThemeColor("--color-icon-muted");
  const latest = latestScheduleOccurrence(props.schedule);
  const canEdit = mobileScheduleCanEdit(props.schedule);
  const threadStates = props.schedule.projectStates.filter((state) => state.threadId !== null);
  const menuActions = useMemo<MenuAction[]>(
    () => [{ id: "delete", title: "Delete schedule", attributes: { destructive: true } }],
    [],
  );

  return (
    <View className="overflow-hidden rounded-[24px] bg-card">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <View className="flex-row items-center gap-2">
          <SymbolView name="clock" size={16} tintColor={icon} type="monochrome" weight="semibold" />
          <Text className="font-t3-bold tabular-nums text-foreground">
            {String(props.schedule.hourLocal).padStart(2, "0")}:
            {String(props.schedule.minuteLocal).padStart(2, "0")}
          </Text>
        </View>
        <Text className="min-w-0 flex-1 text-xs text-foreground-muted" numberOfLines={1}>
          {props.schedule.timezone}
        </Text>
        <StatusPill schedule={props.schedule} />
      </View>

      <View className="gap-3 p-4">
        <View>
          <Text className="text-lg font-t3-bold leading-snug text-foreground" numberOfLines={2}>
            {mobileScheduleHeadline(props.schedule.prompt)}
          </Text>
          <Text className="mt-1 text-sm text-foreground-muted">
            {mobileScheduleScopeLabel(props.schedule, props.projectTitles)} ·{" "}
            {mobileScheduleModelLabel(props.schedule, props.serverConfig)}
          </Text>
        </View>

        {props.schedule.autoPausedReason ? (
          <View className="rounded-2xl border border-danger-border bg-danger px-3 py-2.5">
            <Text className="text-sm text-danger-foreground">
              {props.schedule.autoPausedReason}
            </Text>
          </View>
        ) : null}

        <View className="flex-row items-center gap-2">
          <View className="h-1.5 w-1.5 rounded-full bg-foreground-muted" />
          <Text className="text-xs text-foreground-muted">
            {mobileOccurrenceSummary(latest, relativeTime)}
          </Text>
        </View>

        {threadStates.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {threadStates.map((state) => (
              <ControlPill
                key={state.projectId}
                accessibilityLabel={`Open scheduled thread for ${props.projectTitles.get(state.projectId) ?? "missing project"}`}
                label={
                  threadStates.length === 1
                    ? "Open thread"
                    : (props.projectTitles.get(state.projectId) ?? "Missing project")
                }
                variant="pill"
                onPress={() => props.onOpenThread(String(state.threadId))}
              />
            ))}
          </View>
        ) : null}

        <View className="flex-row items-center gap-2 pt-1">
          <ControlPill
            disabled={props.busy}
            label={props.schedule.pausedAt === null ? "Pause" : "Resume"}
            variant="pill"
            onPress={props.onPauseChange}
          />
          <ControlPill
            disabled={props.busy || !canEdit}
            icon="square.and.pencil"
            label="Edit"
            variant="pill"
            onPress={props.onEdit}
          />
          <View className="flex-1" />
          <ControlPillMenu
            actions={menuActions}
            onPressAction={({ nativeEvent }) => {
              if (nativeEvent.event === "delete") props.onDelete();
            }}
          >
            <ControlPill
              accessibilityLabel="More schedule actions"
              disabled={props.busy}
              icon="ellipsis"
            />
          </ControlPillMenu>
        </View>

        {!canEdit ? (
          <Text className="text-xs leading-normal text-foreground-muted">
            Edit selected-project schedules from desktop. Pause, resume, and delete remain available
            here.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function SettingsScheduledChatsRouteScreen() {
  const navigation = useNavigation();
  const settingsRoutePresentation = useExistingThreadSettingsRoutePresentation();
  const settingsRoutePresentedRef = useRef(false);
  const insets = useSafeAreaInsets();
  const { environments } = useEnvironments();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OrchestrationSchedule | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(() => defaultDraft(null));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
  const snapshot = useAtomValue(
    selectedEnvironmentId === null
      ? EMPTY_SNAPSHOT_ATOM
      : environmentSnapshotAtom(selectedEnvironmentId),
  );
  const serverConfig = useAtomValue(
    selectedEnvironmentId === null
      ? EMPTY_SERVER_CONFIG_ATOM
      : serverEnvironment.configValueAtom(selectedEnvironmentId),
  );
  const createSchedule = useAtomCommand(orchestrationEnvironment.createSchedule, {
    reportFailure: false,
  });
  const updateSchedule = useAtomCommand(orchestrationEnvironment.updateSchedule, {
    reportFailure: false,
  });
  const pauseSchedule = useAtomCommand(orchestrationEnvironment.pauseSchedule, {
    reportFailure: false,
  });
  const resumeSchedule = useAtomCommand(orchestrationEnvironment.resumeSchedule, {
    reportFailure: false,
  });
  const deleteSchedule = useAtomCommand(orchestrationEnvironment.deleteSchedule, {
    reportFailure: false,
  });

  useEffect(() => {
    if (
      selectedEnvironmentId === null ||
      !environments.some((environment) => environment.environmentId === selectedEnvironmentId)
    ) {
      setSelectedEnvironmentId(environments[0]?.environmentId ?? null);
    }
  }, [environments, selectedEnvironmentId]);

  useEffect(() => {
    setEditorOpen(false);
    setEditing(null);
    setError(null);
  }, [selectedEnvironmentId]);

  const projects = snapshot?.projects ?? [];
  const schedules = useMemo(
    () => (snapshot?.schedules ?? []).filter((schedule) => schedule.deletedAt === null),
    [snapshot?.schedules],
  );
  const projectTitles = useMemo(
    () => new Map(projects.map((project) => [project.id, project.title])),
    [projects],
  );
  const selectedEnvironment = environments.find(
    (environment) => environment.environmentId === selectedEnvironmentId,
  );
  const selectedProject = projects.find((project) => project.id === draft.projectId) ?? null;
  const explicitModelSelection = resolveSelectableModelSelection(
    serverConfig,
    draft.modelSelection,
  );
  const projectDefaultModelSelection = resolveDefaultableModelSelection(
    serverConfig,
    draft.allProjects ? null : (selectedProject?.defaultModelSelection ?? null),
  );
  const modelOptions = useMemo(
    () => buildModelOptions(serverConfig, explicitModelSelection ?? projectDefaultModelSelection),
    [explicitModelSelection, projectDefaultModelSelection, serverConfig],
  );
  const selectedModel =
    explicitModelSelection ??
    projectDefaultModelSelection ??
    modelOptions.find((option) => option.isDefault)?.selection ??
    modelOptions[0]?.selection ??
    null;
  const selectedModelOption =
    modelOptions.find(
      (option) =>
        selectedModel !== null &&
        option.selection.instanceId === selectedModel.instanceId &&
        option.selection.model === selectedModel.model,
    ) ?? null;
  const providerGroups = useMemo(() => groupByProvider(modelOptions), [modelOptions]);
  const providerOptionDescriptors = useMemo(
    () =>
      resolveProviderOptionDescriptors({
        capabilities: selectedModelOption?.capabilities,
        selections: selectedModel?.options,
      }),
    [selectedModel?.options, selectedModelOption?.capabilities],
  );
  const settingsOwnerId = `schedule:${selectedEnvironmentId ?? "none"}:${editing?.id ?? "new"}`;
  const settingsRouteSession = useMemo<ExistingThreadSettingsRouteSession>(
    () => ({
      ownerId: settingsOwnerId,
      title: "Agent settings",
      providerGroups,
      selectedModel,
      onSelectModel: (option) =>
        setDraft((current) => ({ ...current, modelSelection: option.selection })),
      optionDescriptors: providerOptionDescriptors,
      onUpdateOptionSelections: (options: ReadonlyArray<ProviderOptionSelection>) => {
        if (selectedModel === null) return;
        setDraft((current) => ({
          ...current,
          modelSelection: { ...selectedModel, options },
        }));
      },
    }),
    [providerGroups, providerOptionDescriptors, selectedModel, settingsOwnerId],
  );
  const openAgentSettings = useCallback(() => {
    if (selectedModel === null) return;
    settingsRoutePresentation.present(settingsRouteSession);
    settingsRoutePresentedRef.current = true;
    setAgentSettingsOpen(true);
    navigation.dispatch(StackActions.push("ThreadSettingsSheet"));
  }, [navigation, selectedModel, settingsRoutePresentation, settingsRouteSession]);

  useEffect(() => {
    if (agentSettingsOpen) {
      settingsRoutePresentation.present(settingsRouteSession);
    }
  }, [agentSettingsOpen, settingsRoutePresentation, settingsRouteSession]);

  useFocusEffect(
    useCallback(() => {
      if (!settingsRoutePresentedRef.current) return;
      settingsRoutePresentedRef.current = false;
      setAgentSettingsOpen(false);
      settingsRoutePresentation.clear(settingsOwnerId);
    }, [settingsOwnerId, settingsRoutePresentation]),
  );
  const environmentActions = useMemo<MenuAction[]>(
    () =>
      environments.map((environment) => ({
        id: environment.environmentId,
        title: environment.label,
        state: environment.environmentId === selectedEnvironmentId ? "on" : "off",
      })),
    [environments, selectedEnvironmentId],
  );

  const openNew = () => {
    setEditing(null);
    setDraft(defaultDraft(projects[0]?.id ?? null));
    setError(null);
    setEditorOpen(true);
  };

  const openEdit = (schedule: OrchestrationSchedule) => {
    if (!mobileScheduleCanEdit(schedule)) return;
    setEditing(schedule);
    setDraft(draftFromSchedule(schedule));
    setError(null);
    setEditorOpen(true);
  };

  const save = async () => {
    if (selectedEnvironmentId === null) return;
    const [hourText, minuteText] = draft.time.split(":");
    const hourLocal = Number(hourText);
    const minuteLocal = Number(minuteText);
    if (
      !Number.isInteger(hourLocal) ||
      hourLocal < 0 ||
      hourLocal > 23 ||
      !Number.isInteger(minuteLocal) ||
      minuteLocal < 0 ||
      minuteLocal > 59
    ) {
      setError("Enter a valid local time, such as 09:00.");
      return;
    }
    const timezone = draft.timezone.trim();
    if (!validTimezone(timezone)) {
      setError("Enter a valid IANA time zone, such as Africa/Johannesburg.");
      return;
    }
    const prompt = draft.prompt.trim();
    if (!prompt) {
      setError("Add the prompt the agent should run.");
      return;
    }
    if (!draft.allProjects && draft.projectId === null) {
      setError("Choose a project.");
      return;
    }

    const scope = draft.allProjects
      ? { _tag: "environment" as const, projectIds: "all" as const }
      : { _tag: "project" as const, projectId: draft.projectId! };
    const actionId = editing?.id ?? "new";
    setError(null);
    setBusyId(actionId);
    const result =
      editing === null
        ? await createSchedule({
            environmentId: selectedEnvironmentId,
            input: {
              scheduleId: ScheduleId.make(uuidv4()),
              scope,
              hourLocal,
              minuteLocal,
              timezone,
              prompt,
              ...(draft.modelSelection !== null ? { modelSelection: draft.modelSelection } : {}),
              skipIfDirty: draft.skipIfDirty,
            },
          })
        : await updateSchedule({
            environmentId: selectedEnvironmentId,
            input: {
              scheduleId: editing.id,
              scope,
              hourLocal,
              minuteLocal,
              timezone,
              prompt,
              modelSelection: draft.modelSelection,
              skipIfDirty: draft.skipIfDirty,
            },
          });
    setBusyId(null);
    if (result._tag === "Failure") {
      setError(commandFailureMessage(result));
      return;
    }
    setEditorOpen(false);
    setEditing(null);
  };

  const setPaused = async (schedule: OrchestrationSchedule) => {
    if (selectedEnvironmentId === null || busyId !== null) return;
    setBusyId(schedule.id);
    const result = await (schedule.pausedAt === null ? pauseSchedule : resumeSchedule)({
      environmentId: selectedEnvironmentId,
      input: { scheduleId: schedule.id },
    });
    setBusyId(null);
    if (result._tag === "Failure") {
      Alert.alert(
        schedule.pausedAt === null ? "Could not pause schedule" : "Could not resume schedule",
        commandFailureMessage(result),
      );
    }
  };

  const remove = (schedule: OrchestrationSchedule) => {
    if (selectedEnvironmentId === null || busyId !== null) return;
    Alert.alert("Delete schedule?", "Existing chats and handoff files will be kept.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusyId(schedule.id);
            const result = await deleteSchedule({
              environmentId: selectedEnvironmentId,
              input: { scheduleId: schedule.id },
            });
            setBusyId(null);
            if (result._tag === "Failure") {
              Alert.alert("Could not delete schedule", commandFailureMessage(result));
            }
          })();
        },
      },
    ]);
  };

  const supportsSchedules = snapshot?.schedules !== undefined;
  const canCreate = selectedEnvironmentId !== null && projects.length > 0 && supportsSchedules;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader
            title="Scheduled chats"
            onBack={() => navigation.goBack()}
            actions={[
              {
                accessibilityLabel: "Add schedule",
                disabled: !canCreate,
                icon: "plus",
                onPress: openNew,
              },
            ]}
          />
        </>
      ) : (
        <NativeHeaderToolbar placement="right">
          <NativeHeaderToolbar.Button
            accessibilityLabel="Add schedule"
            disabled={!canCreate}
            icon="plus"
            onPress={openNew}
            separateBackground
          />
        </NativeHeaderToolbar>
      )}

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {environments.length > 0 ? (
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-t3-bold uppercase tracking-wide text-foreground-muted">
                Runs on
              </Text>
              <Text className="mt-1 text-sm text-foreground-muted">
                The host must be online when a schedule is due.
              </Text>
            </View>
            <ControlPillMenu
              actions={environmentActions}
              onPressAction={({ nativeEvent }) =>
                setSelectedEnvironmentId(EnvironmentId.make(nativeEvent.event))
              }
            >
              <ControlPill
                accessibilityLabel="Choose environment"
                icon="desktopcomputer"
                label={selectedEnvironment?.label ?? "Environment"}
                variant="pill"
              />
            </ControlPillMenu>
          </View>
        ) : null}

        {editorOpen ? (
          <ScheduleEditor
            busy={busyId !== null}
            draft={draft}
            editing={editing}
            error={error}
            modelAvailable={selectedModel !== null}
            modelLabel={
              draft.modelSelection === null && draft.allProjects
                ? "Choose shared override"
                : (selectedModelOption?.label ?? selectedModel?.model ?? "No model available")
            }
            projects={projects}
            onCancel={() => {
              setEditorOpen(false);
              setEditing(null);
              setError(null);
            }}
            onChange={setDraft}
            onOpenAgentSettings={openAgentSettings}
            onSave={() => void save()}
          />
        ) : null}

        {selectedEnvironmentId === null ? (
          <EmptyState
            detail="Connect an environment before creating a daily schedule."
            title="No environment connected"
          />
        ) : snapshot === null ? (
          <View className="items-center py-12">
            <ActivityIndicator />
            <Text className="mt-3 text-sm text-foreground-muted">Loading schedules…</Text>
          </View>
        ) : !supportsSchedules ? (
          <EmptyState
            detail="Update this environment's Pulse Code server to manage scheduled chats from mobile."
            title="Server update required"
          />
        ) : schedules.length === 0 && !editorOpen ? (
          <EmptyState
            actionLabel="Create schedule"
            detail="Run a recurring daily prompt in one project or across the environment."
            onAction={openNew}
            title="No scheduled chats"
          />
        ) : (
          schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              busy={busyId === schedule.id}
              projectTitles={projectTitles}
              schedule={schedule}
              serverConfig={serverConfig}
              onDelete={() => remove(schedule)}
              onEdit={() => openEdit(schedule)}
              onOpenThread={(threadId) =>
                navigation.navigate("Thread", {
                  environmentId: String(selectedEnvironmentId),
                  threadId,
                })
              }
              onPauseChange={() => void setPaused(schedule)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
