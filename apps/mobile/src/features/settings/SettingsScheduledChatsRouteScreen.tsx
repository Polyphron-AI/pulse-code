import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import {
  compareSchedulesForDisplay,
  describeAutoPause,
  describeScheduleRuns,
  describeScheduleTarget,
  formatScheduleLocalTime,
  formatScheduleTimeZoneLabel,
  nextScheduleRunAtMs,
  scheduleDisplayTitle,
  scheduleRowStatus,
  scheduleRunSummary,
} from "@t3tools/client-runtime/state/schedules";
import type { EnvironmentId, OrchestrationSchedule, ProjectId } from "@t3tools/contracts";
import { useMemo } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { StatusPill } from "../../components/StatusPill";
import { useThemeColor } from "../../lib/useThemeColor";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useProjects } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { environmentSchedules } from "../../state/schedules";
import { SettingsSection } from "./components/SettingsSection";
import { scheduleStatusTone } from "./scheduledChats.logic";
import { useMinuteTick } from "./useMinuteTick";

const HEADER_NOTE =
  "A scheduled chat sends one prompt a day to its own thread, and hands that day's notes to tomorrow through a handoff file. Runs happen while the environment's Pulse Code server is running; a run missed while it was off fires the next time it starts.";

export function SettingsScheduledChatsRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const nowMs = useMinuteTick();
  const entries = useAtomValue(environmentSchedules.schedulesAtom);
  const projects = useProjects();
  const { environments } = useEnvironments();

  const sections = useMemo(() => {
    const projectTitlesByEnvironment = new Map<EnvironmentId, Map<ProjectId, string>>();
    for (const project of projects) {
      const titles = projectTitlesByEnvironment.get(project.environmentId) ?? new Map();
      titles.set(project.id, project.title);
      projectTitlesByEnvironment.set(project.environmentId, titles);
    }
    const schedulesByEnvironment = new Map<EnvironmentId, OrchestrationSchedule[]>();
    for (const entry of entries) {
      const list = schedulesByEnvironment.get(entry.environmentId) ?? [];
      list.push(entry.schedule);
      schedulesByEnvironment.set(entry.environmentId, list);
    }
    return environments.map((environment) => {
      const projectTitleById =
        projectTitlesByEnvironment.get(environment.environmentId) ?? new Map<ProjectId, string>();
      return {
        environmentId: environment.environmentId,
        label: environment.label,
        hasProjects: projectTitleById.size > 0,
        projectTitleById,
        schedules: (schedulesByEnvironment.get(environment.environmentId) ?? []).toSorted(
          compareSchedulesForDisplay,
        ),
      };
    });
  }, [entries, environments, projects]);

  const anySchedules = sections.some((section) => section.schedules.length > 0);

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader title="Scheduled Chats" onBack={() => navigation.goBack()} />
        </>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <Text className="px-2 text-sm leading-normal text-foreground-muted">{HEADER_NOTE}</Text>
        {environments.length === 0 ? (
          <EmptyState
            title="No environment connected"
            detail="Connect an environment to schedule a daily chat in one of its projects."
          />
        ) : null}
        {environments.length > 0 && !anySchedules ? (
          <EmptyState
            title="No scheduled chats yet"
            detail="Pick a project, a time, and the prompt it should send every day."
          />
        ) : null}
        {sections.map((section) => (
          <SettingsSection
            key={section.environmentId}
            title={environments.length > 1 ? section.label : "Scheduled chats"}
            card
          >
            {section.schedules.map((schedule, index) => (
              <ScheduleListRow
                key={schedule.id}
                schedule={schedule}
                environmentId={section.environmentId}
                projectTitleById={section.projectTitleById}
                nowMs={nowMs}
                divided={index > 0}
              />
            ))}
            <NewScheduleRow
              environmentId={section.environmentId}
              disabled={!section.hasProjects}
              divided={section.schedules.length > 0}
            />
          </SettingsSection>
        ))}
      </ScrollView>
    </View>
  );
}

function ScheduleListRow({
  schedule,
  environmentId,
  projectTitleById,
  nowMs,
  divided,
}: {
  readonly schedule: OrchestrationSchedule;
  readonly environmentId: EnvironmentId;
  readonly projectTitleById: ReadonlyMap<ProjectId, string>;
  readonly nowMs: number;
  readonly divided: boolean;
}) {
  const navigation = useNavigation();
  const chevron = useThemeColor("--color-chevron");
  const summary = scheduleRunSummary(schedule);
  const tone = scheduleStatusTone(scheduleRowStatus(schedule, summary));
  const autoPause = describeAutoPause(schedule);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${scheduleDisplayTitle(schedule)}`}
      onPress={() =>
        navigation.navigate("SettingsScheduledChatEdit", {
          environmentId: String(environmentId),
          scheduleId: String(schedule.id),
        })
      }
      className={
        divided
          ? "flex-row items-start gap-3 border-t border-border-subtle p-4"
          : "flex-row items-start gap-3 p-4"
      }
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-lg text-foreground" numberOfLines={2}>
          {scheduleDisplayTitle(schedule)}
        </Text>
        <Text className="text-sm leading-normal text-foreground-muted">
          {`Every day at ${formatScheduleLocalTime(schedule)} ${formatScheduleTimeZoneLabel(
            schedule.timezone,
            nowMs,
          )} · ${describeScheduleTarget(schedule, projectTitleById)}`}
        </Text>
        <Text className="text-sm leading-normal text-foreground-muted">
          {describeScheduleRuns({
            summary,
            nextRunAtMs: nextScheduleRunAtMs(schedule, nowMs),
            nowMs,
          })}
        </Text>
        {autoPause ? (
          <Text className="text-sm leading-normal text-rose-600 dark:text-rose-400">
            {autoPause}
          </Text>
        ) : null}
      </View>
      <View className="shrink-0 flex-row items-center gap-2 pt-0.5">
        <StatusPill {...tone} size="compact" />
        <SymbolView
          name="chevron.right"
          size={16}
          tintColor={chevron}
          type="monochrome"
          weight="semibold"
        />
      </View>
    </Pressable>
  );
}

function NewScheduleRow({
  environmentId,
  disabled,
  divided,
}: {
  readonly environmentId: EnvironmentId;
  readonly disabled: boolean;
  readonly divided: boolean;
}) {
  const navigation = useNavigation();
  const icon = useThemeColor("--color-icon");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New scheduled chat"
      disabled={disabled}
      onPress={() =>
        navigation.navigate("SettingsScheduledChatNew", { environmentId: String(environmentId) })
      }
      className={
        divided
          ? "flex-row items-center gap-4 border-t border-border-subtle p-4"
          : "flex-row items-center gap-4 p-4"
      }
      style={disabled ? { opacity: 0.45 } : undefined}
    >
      <SymbolView name="plus" size={20} tintColor={icon} type="monochrome" weight="regular" />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-lg text-foreground">New scheduled chat</Text>
        {disabled ? (
          <Text className="text-sm leading-normal text-foreground-muted">
            Add a project to this environment first.
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
