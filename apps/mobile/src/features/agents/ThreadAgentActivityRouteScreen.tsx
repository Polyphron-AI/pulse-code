import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { LayoutAnimation, Platform, Pressable, ScrollView, View } from "react-native";
import * as Haptics from "expo-haptics";

import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  formatSubagentModelLabel,
  formatSubagentTokenCount,
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
import { deriveAgentActivityRows } from "./agentActivityFeed";
import { deriveAgentNowBlock, deriveAgentStepWindow, type AgentNowBlock } from "./agentDrillDown";
import { isAgentSessionLive, useThreadAgentPanelModel } from "./threadAgentModel";

type ThreadAgentActivityRouteScreenProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly threadId: string;
  readonly agentId: string;
}>;

function formatClockTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Section label. Same voice on every block so the order reads as an order. */
function SectionLabel(props: { readonly children: string }) {
  return (
    <Text className="px-1 pb-1 font-t3-medium text-2xs uppercase text-foreground-muted opacity-60">
      {props.children}
    </Text>
  );
}

/**
 * What the agent is doing this second, at the very top.
 *
 * Rendered only for a live agent, and with a static dot rather than a spinner:
 * a settled agent has an outcome to show instead, and an animation that keeps
 * repainting is the thing our users notice first on a high-refresh phone.
 */
function AgentNowCard(props: { readonly now: AgentNowBlock }) {
  const { now } = props;
  return (
    <View className="mb-3">
      <SectionLabel>Now</SectionLabel>
      <View
        className={cn(
          "rounded-2xl border p-3",
          now.needsInput ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card",
        )}
      >
        <View className="flex-row items-center gap-2">
          <View
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              now.needsInput ? "bg-amber-500" : "bg-sky-500",
            )}
          />
          <Text className="min-w-0 flex-1 font-t3-medium text-sm text-foreground">
            {now.headline}
          </Text>
        </View>
        {now.detail ? (
          <Text
            selectable
            className="mt-1.5 text-xs leading-normal text-foreground-muted opacity-80"
            numberOfLines={4}
          >
            {now.detail}
          </Text>
        ) : null}
        {now.context ? (
          <Text className="mt-1.5 font-t3-medium text-2xs text-foreground-muted opacity-60">
            {now.context}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * One agent, read top-down: what it is doing now, what came of it, then the
 * steps that got there. The step rows are exactly the ones the thread feed
 * suppresses to stay quiet — this screen is where "what is it actually doing"
 * gets answered — so history is never summarized, only collapsed.
 */
export function ThreadAgentActivityRouteScreen(props: ThreadAgentActivityRouteScreenProps) {
  const navigation = useNavigation();
  const environmentId = EnvironmentId.make(props.route.params.environmentId);
  const threadId = ThreadId.make(props.route.params.threadId);
  const agentId = props.route.params.agentId;
  const detail = useThreadDetail(environmentId, threadId);
  const iconSubtleColor = useThemeColor("--color-icon-muted");
  const pressedBackground = useThemeColor("--color-subtle");
  const [stepsExpanded, setStepsExpanded] = useState(false);

  const agentPanelModel = useThreadAgentPanelModel(
    detail.data?.activities,
    isAgentSessionLive(detail.data?.session ?? null),
  );
  const agent = useMemo(() => {
    for (const group of agentPanelModel.workflows) {
      if (group.workflow.id === agentId) {
        return group.workflow;
      }
      for (const phase of group.phases) {
        const found = phase.members.find((member) => member.id === agentId);
        if (found) {
          return found;
        }
      }
      const orphan = group.unphasedMembers.find((member) => member.id === agentId);
      if (orphan) {
        return orphan;
      }
    }
    return agentPanelModel.directAgents.find((candidate) => candidate.id === agentId) ?? null;
  }, [agentId, agentPanelModel]);

  const rows = useMemo(
    () => deriveAgentActivityRows(detail.data?.activities ?? [], agentId),
    [agentId, detail.data?.activities],
  );
  const now = useMemo(() => deriveAgentNowBlock(agent, rows), [agent, rows]);
  const steps = useMemo(() => deriveAgentStepWindow(rows, stepsExpanded), [rows, stepsExpanded]);

  const toggleSteps = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 180,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    void Haptics.selectionAsync();
    setStepsExpanded((current) => !current);
  }, []);

  if (detail.data === null && detail.isPending) {
    return <LoadingScreen message="Opening agent…" messagePlacement="above-spinner" />;
  }

  const title = agent?.title ?? "Agent";
  const subtitleParts = [
    agent?.status,
    formatSubagentModelLabel(agent?.model ?? null, agent?.effort ?? null),
    agent?.usage?.totalTokens ? formatSubagentTokenCount(agent.usage.totalTokens) : null,
  ].filter((value): value is string => Boolean(value));
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined;
  const outcome = agent?.error ?? agent?.result ?? null;
  const hasContent = now !== null || outcome !== null || rows.length > 0;

  return (
    <>
      <NativeStackScreenOptions
        options={{
          headerShown: Platform.OS !== "android",
          headerTitle: title,
          title,
          ...(subtitle ? { unstable_headerSubtitle: subtitle } : {}),
        }}
      />
      {Platform.OS === "android" ? (
        <AndroidScreenHeader title={title} subtitle={subtitle} onBack={() => navigation.goBack()} />
      ) : null}

      {!hasContent ? (
        <View className="flex-1 justify-center bg-screen">
          <EmptyState
            variant="plain"
            title="Nothing reported yet"
            detail="This agent has not sent any tool calls or progress updates."
          />
        </View>
      ) : (
        <ScrollView
          className="flex-1 bg-screen"
          contentContainerStyle={{ paddingBottom: 32, paddingTop: 8, paddingHorizontal: 12 }}
          contentInsetAdjustmentBehavior="automatic"
        >
          {now ? <AgentNowCard now={now} /> : null}

          {outcome !== null ? (
            <View className="mb-3">
              <SectionLabel>{agent?.error ? "Error" : "Outcome"}</SectionLabel>
              <View
                className={cn(
                  "rounded-2xl border p-3",
                  agent?.error ? "border-rose-500/40 bg-rose-500/5" : "border-border bg-card",
                )}
              >
                <Text selectable className="text-xs leading-normal text-foreground">
                  {outcome}
                </Text>
              </View>
            </View>
          ) : null}

          {rows.length > 0 ? (
            <View>
              <SectionLabel>Steps</SectionLabel>
              <View className="overflow-hidden rounded-2xl border border-border bg-card">
                {steps.hiddenCount > 0 || stepsExpanded ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      stepsExpanded
                        ? "Show recent steps only"
                        : `Show ${steps.hiddenCount} earlier steps`
                    }
                    accessibilityState={{ expanded: stepsExpanded }}
                    onPress={toggleSteps}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? pressedBackground : "transparent",
                    })}
                  >
                    <View className="flex-row items-center gap-1.5 px-3 py-2.5">
                      <Text className="min-w-0 flex-1 font-t3-medium text-2xs text-foreground-muted opacity-70">
                        {stepsExpanded
                          ? `all ${rows.length} steps`
                          : `+${steps.hiddenCount} earlier steps`}
                      </Text>
                      <SymbolView
                        name={
                          stepsExpanded
                            ? { ios: "chevron.up", android: "keyboard_arrow_up" }
                            : { ios: "chevron.down", android: "keyboard_arrow_down" }
                        }
                        size={11}
                        tintColor={iconSubtleColor}
                        type="monochrome"
                      />
                    </View>
                  </Pressable>
                ) : null}

                {steps.visible.map((row, index) => (
                  <View key={row.id}>
                    {index > 0 || steps.hiddenCount > 0 || stepsExpanded ? (
                      <View className="ml-3 h-px bg-border" />
                    ) : null}
                    <View className="px-3 py-2.5">
                      <View className="flex-row items-baseline gap-2">
                        <Text
                          className={cn(
                            "min-w-0 flex-1 text-xs",
                            row.isLifecycle
                              ? "font-t3-medium text-foreground-muted"
                              : "font-t3-medium text-foreground",
                          )}
                        >
                          {row.summary}
                        </Text>
                        <Text className="shrink-0 font-t3-medium text-3xs tabular-nums text-foreground-muted opacity-50">
                          {formatClockTime(row.createdAt)}
                        </Text>
                      </View>
                      {row.detail ? (
                        <Text
                          selectable
                          className="mt-1 font-mono text-2xs leading-normal text-foreground-muted opacity-80"
                          numberOfLines={6}
                        >
                          {row.detail}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </>
  );
}
