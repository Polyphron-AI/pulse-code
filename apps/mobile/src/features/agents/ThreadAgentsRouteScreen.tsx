import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";

import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  formatSubagentModelLabel,
  formatSubagentTokenCount,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { LoadingScreen } from "../../components/LoadingScreen";
import { cn } from "../../lib/cn";
import { useThemeColor } from "../../lib/useThemeColor";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useThreadDetail } from "../../state/queries";
import {
  agentRosterSummaryLabel,
  deriveAgentRoster,
  type AgentRosterEntry,
  type AgentRosterSectionId,
} from "./agentRoster";
import { isAgentSessionLive, useThreadAgentPanelModel } from "./threadAgentModel";

type ThreadAgentsRouteScreenProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly threadId: string;
}>;

const STATUS_LABELS: Record<RuntimeSubagent["status"], string> = {
  pending: "starting",
  running: "working",
  waiting: "needs input",
  idle: "idle",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
};

function statusDotClass(status: RuntimeSubagent["status"]): string {
  switch (status) {
    case "waiting":
      return "bg-amber-500";
    case "pending":
    case "running":
      return "bg-sky-500";
    case "idle":
      return "bg-neutral-400";
    case "failed":
      return "bg-rose-500";
    case "completed":
      return "bg-emerald-500";
    default:
      return "bg-neutral-400";
  }
}

/**
 * One agent. The secondary line is the agent's most recent progress line when
 * it has one, otherwise its role/model — the phone screen equivalent of the
 * desktop panel's expanded card, without needing the expansion.
 */
function AgentRow(props: {
  readonly entry: AgentRosterEntry;
  readonly iconSubtleColor: import("react-native").ColorValue;
  readonly onPress: () => void;
}) {
  const pressedBackground = useThemeColor("--color-subtle");
  const { agent, workflowName, phaseTitle } = props.entry;
  const statusLabel = STATUS_LABELS[agent.status];
  const modelLabel = formatSubagentModelLabel(agent.model, agent.effort);
  const secondary =
    agent.progress ??
    agent.lastToolName ??
    [phaseTitle ?? workflowName, agent.role, modelLabel].filter(Boolean).join(" · ");
  const tokens = agent.usage?.totalTokens ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${agent.title}, ${statusLabel}`}
      accessibilityHint="Double tap to see what this agent has done."
      onPress={props.onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? pressedBackground : "transparent",
      })}
      className="flex-row items-center gap-2.5 rounded-xl px-3 py-2.5"
    >
      <View className={cn("h-2 w-2 shrink-0 rounded-full", statusDotClass(agent.status))} />

      <View className="min-w-0 flex-1">
        <Text className="font-t3-medium text-sm text-foreground" numberOfLines={1}>
          {agent.title}
        </Text>
        {secondary.length > 0 ? (
          <Text className="mt-0.5 text-xs text-foreground-muted opacity-70" numberOfLines={1}>
            {secondary}
          </Text>
        ) : null}
      </View>

      <View className="shrink-0 items-end">
        <Text className="font-t3-medium text-2xs text-foreground-muted opacity-80">
          {statusLabel}
        </Text>
        {tokens > 0 ? (
          <Text className="mt-0.5 font-t3-medium text-3xs tabular-nums text-foreground-muted opacity-60">
            {formatSubagentTokenCount(tokens)}
          </Text>
        ) : null}
      </View>

      <SymbolView
        name={{ ios: "chevron.right", android: "chevron_right" }}
        size={12}
        tintColor={props.iconSubtleColor}
        type="monochrome"
      />
    </Pressable>
  );
}

export function ThreadAgentsRouteScreen(props: ThreadAgentsRouteScreenProps) {
  const navigation = useNavigation();
  const environmentId = EnvironmentId.make(props.route.params.environmentId);
  const threadId = ThreadId.make(props.route.params.threadId);
  const detail = useThreadDetail(environmentId, threadId);
  const iconSubtleColor = useThemeColor("--color-icon-muted");
  const [expandedSections, setExpandedSections] = useState<ReadonlySet<AgentRosterSectionId>>(
    () => new Set(),
  );

  const agentPanelModel = useThreadAgentPanelModel(
    detail.data?.activities,
    isAgentSessionLive(detail.data?.session ?? null),
  );
  const roster = useMemo(
    () => deriveAgentRoster(agentPanelModel, { expandedSections }),
    [agentPanelModel, expandedSections],
  );

  const toggleSection = useCallback((id: AgentRosterSectionId) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const openAgent = useCallback(
    (agentId: string) => {
      navigation.navigate("ThreadAgent", {
        environmentId: String(environmentId),
        threadId: String(threadId),
        agentId,
      });
    },
    [environmentId, navigation, threadId],
  );

  if (detail.data === null && detail.isPending) {
    return <LoadingScreen message="Opening agents…" messagePlacement="above-spinner" />;
  }

  const summary = agentRosterSummaryLabel(roster);

  return (
    <>
      <NativeStackScreenOptions
        options={{
          headerShown: Platform.OS !== "android",
          ...(summary ? { unstable_headerSubtitle: summary } : {}),
        }}
      />
      {Platform.OS === "android" ? (
        <AndroidScreenHeader
          title="Agents"
          subtitle={summary ?? undefined}
          onBack={() => navigation.goBack()}
        />
      ) : null}

      {roster.total === 0 ? (
        <View className="flex-1 justify-center bg-screen">
          <EmptyState
            variant="plain"
            title="No agents yet"
            detail="When this thread spawns subagents or runs a workflow, they show up here with live status."
          />
        </View>
      ) : (
        <ScrollView
          className="flex-1 bg-screen"
          contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }}
          contentInsetAdjustmentBehavior="automatic"
        >
          {roster.sections.map((section) => (
            <View key={section.id} className="mb-4 px-3">
              <Text className="px-1 pb-1 font-t3-medium text-2xs uppercase text-foreground-muted opacity-60">
                {section.title} · {section.entries.length + section.hiddenCount}
              </Text>
              <View className="overflow-hidden rounded-2xl border border-border bg-card">
                {section.entries.map((entry, index) => (
                  <View key={entry.agent.id}>
                    {index > 0 ? <View className="ml-3 h-px bg-border" /> : null}
                    <AgentRow
                      entry={entry}
                      iconSubtleColor={iconSubtleColor}
                      onPress={() => openAgent(entry.agent.id)}
                    />
                  </View>
                ))}
                {section.hiddenCount > 0 || section.canCollapse ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: section.canCollapse }}
                    accessibilityLabel={
                      section.canCollapse ? "Show fewer" : `Show ${section.hiddenCount} more`
                    }
                    onPress={() => toggleSection(section.id)}
                    className="border-t border-border px-3 py-2.5 active:opacity-60"
                  >
                    <Text className="font-t3-medium text-xs text-foreground-muted">
                      {section.canCollapse ? "Show fewer" : `… ${section.hiddenCount} more`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </>
  );
}
