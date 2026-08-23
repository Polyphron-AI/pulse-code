import * as Haptics from "expo-haptics";
import { type AppSymbolName, SymbolView } from "../../components/AppSymbol";
import { LayoutAnimation, Pressable, ScrollView, View } from "react-native";

import {
  deriveAgentSpawnRowModel,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { AppText as Text } from "../../components/AppText";
import { useAgentFleetContext } from "../agents/AgentFleetContext";
import { cn } from "../../lib/cn";
import type { ThreadFeedActivity } from "../../lib/threadActivity";
import { useThemeColor } from "../../lib/useThemeColor";
import {
  fleetCardMemberCount,
  fleetCardSlotCount,
  MAX_FLEET_CARD_CHIPS,
  visibleWorkLogActivities,
} from "./thread-work-log-metrics";
import Animated, { FadeIn } from "react-native-reanimated";

export {
  collapsedWorkLogHeight,
  visibleWorkLogActivities,
  WORK_GROUP_TOGGLE_HEIGHT,
} from "./thread-work-log-metrics";

const WORK_LOG_LAYOUT_ANIMATION = {
  duration: 180,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
} as const;

function triggerDisclosureFeedback() {
  LayoutAnimation.configureNext(WORK_LOG_LAYOUT_ANIMATION);
  void Haptics.selectionAsync();
}

function stripShellWrapper(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\/bin\/zsh -lc ['"]?([\s\S]*?)['"]?$/);
  return (match?.[1] ?? trimmed).trim();
}

function compactActivityDetail(detail: string | null): string | null {
  if (!detail) {
    return null;
  }

  const cleaned = stripShellWrapper(detail).replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function workRowSymbolName(icon: ThreadFeedActivity["icon"]): AppSymbolName {
  switch (icon) {
    case "agent":
      return { ios: "sparkles", android: "auto_awesome" };
    case "alert":
      return { ios: "exclamationmark.triangle", android: "error" };
    case "check":
      return { ios: "checkmark", android: "check" };
    case "command":
      return { ios: "terminal", android: "terminal" };
    case "edit":
      return { ios: "square.and.pencil", android: "edit" };
    case "eye":
      return { ios: "eye", android: "visibility" };
    case "globe":
      return { ios: "globe", android: "public" };
    case "hammer":
      return { ios: "hammer", android: "construction" };
    case "message":
      return { ios: "bubble.left", android: "chat_bubble" };
    case "warning":
      return { ios: "xmark", android: "close" };
    case "wrench":
      return { ios: "wrench", android: "build" };
    case "zap":
      return { ios: "bolt", android: "bolt" };
  }
}

// Entering fades only for rows created moments ago: rows remount whenever the
// list scrolls them back into view, and old rows must not replay an entrance.
const FRESH_ROW_WINDOW_MS = 3_000;
function isFreshRow(createdAt: string): boolean {
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp < FRESH_ROW_WINDOW_MS;
}

const AGENT_STATUS_LABELS: Record<RuntimeSubagent["status"], string> = {
  pending: "starting",
  running: "working",
  waiting: "needs input",
  idle: "idle",
  completed: "done",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "interrupted",
};

function agentDotClass(status: RuntimeSubagent["status"]): string {
  switch (status) {
    case "waiting":
      return "bg-amber-500";
    case "pending":
    case "running":
      return "bg-sky-500";
    case "failed":
      return "bg-rose-500";
    case "completed":
      return "bg-emerald-500";
    default:
      return "bg-neutral-400";
  }
}

// State first, spawn order second — the same rule the Agents screen sorts by.
// With room for two or three chips, the agent that needs you must be one of
// them, not the one that happened to spawn first.
const AGENT_SLOT_RANK: Record<RuntimeSubagent["status"], number> = {
  waiting: 0,
  running: 1,
  pending: 1,
  idle: 2,
  failed: 3,
  interrupted: 4,
  cancelled: 4,
  completed: 5,
};

function orderFleetSlots(agents: ReadonlyArray<RuntimeSubagent>): ReadonlyArray<RuntimeSubagent> {
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort(
      (left, right) =>
        AGENT_SLOT_RANK[left.agent.status] - AGENT_SLOT_RANK[right.agent.status] ||
        left.index - right.index,
    )
    .map((entry) => entry.agent);
}

/** One agent inside the card. Single line, same min-h-8 as every work row. */
function AgentFleetChip(props: {
  readonly agent: RuntimeSubagent;
  readonly iconSubtleColor: import("react-native").ColorValue;
  readonly onPress: () => void;
}) {
  const pressedBackground = useThemeColor("--color-subtle");
  const { agent } = props;
  const statusLabel = AGENT_STATUS_LABELS[agent.status];
  const detail = compactActivityDetail(agent.progress ?? agent.lastToolName);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${agent.title}, ${statusLabel}`}
      accessibilityHint="Double tap to see what this agent has done."
      hitSlop={2}
      onPress={() => {
        void Haptics.selectionAsync();
        props.onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? pressedBackground : "transparent",
      })}
      className="rounded-md px-0.5"
    >
      <View className="min-h-8 flex-row items-center gap-1.5">
        <View className="h-[18px] w-3 shrink-0 items-center justify-center">
          <View className={cn("h-1.5 w-1.5 rounded-full", agentDotClass(agent.status))} />
        </View>

        <Text className="min-w-0 flex-1 text-xs text-foreground" numberOfLines={1}>
          <Text className="text-foreground">{agent.title}</Text>
          {detail ? <Text className="text-foreground-muted opacity-60"> · {detail}</Text> : null}
        </Text>

        <View className="shrink-0 flex-row items-center gap-1">
          <Text className="font-t3-medium text-3xs tabular-nums text-foreground-muted opacity-70">
            {statusLabel}
          </Text>
          <View className="h-4 w-4 items-center justify-center">
            <SymbolView
              name={{ ios: "chevron.right", android: "chevron_right" }}
              size={11}
              tintColor={props.iconSubtleColor}
              type="monochrome"
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Inline fleet card: the parent thread's window into a spawn batch, naming the
 * agents instead of only counting them. Header text and tone come from the
 * shared spawn-row model, so this card and the desktop CTA row can never
 * disagree about whether the fleet is still live.
 *
 * Slot count comes from the spawn group, never from the live model, so the
 * card's height always matches what the feed pre-measured; a slot the fold has
 * not caught up to renders as "starting…" rather than collapsing the card.
 * Every dot is static: a continuously repainting card pegs the GPU on
 * high-refresh phones.
 */
function AgentFleetCard(props: {
  readonly activity: ThreadFeedActivity;
  readonly iconSubtleColor: import("react-native").ColorValue;
}) {
  const { agentPanelModel, onOpenAgent, onOpenAgents } = useAgentFleetContext();
  const pressedBackground = useThemeColor("--color-subtle");
  const spawn = props.activity.agentSpawn;
  if (!spawn) {
    return null;
  }

  const row = deriveAgentSpawnRowModel(agentPanelModel, spawn);
  const label = row.workflowName ? `${row.lead} · ${row.workflowName}` : row.lead;
  const slots = fleetCardSlotCount(spawn);
  const truncated = fleetCardMemberCount(spawn) > MAX_FLEET_CARD_CHIPS;
  const chipSlots = truncated ? slots - 1 : slots;
  const chips = orderFleetSlots(row.agents).slice(0, chipSlots);
  const hiddenCount = Math.max(row.agentCount - chips.length, 0);

  return (
    <View className="rounded-lg border border-border bg-card px-1 py-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${row.status}`}
        accessibilityHint="Double tap to open the agents for this thread."
        hitSlop={2}
        onPress={() => {
          void Haptics.selectionAsync();
          onOpenAgents();
        }}
        style={({ pressed }) => ({
          backgroundColor: pressed ? pressedBackground : "transparent",
        })}
        className="rounded-md px-0.5"
      >
        <View className="min-h-8 flex-row items-center gap-1.5">
          <View className="h-[18px] w-3 shrink-0 items-center justify-center">
            <View
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                row.tone === "live"
                  ? "bg-sky-500"
                  : row.tone === "failed"
                    ? "bg-rose-500"
                    : "bg-emerald-500",
              )}
            />
          </View>

          <Text className="min-w-0 flex-1 text-xs text-foreground" numberOfLines={1}>
            <Text className="font-t3-medium text-foreground">{row.lead}</Text>
            {row.workflowName ? (
              <Text className="text-foreground-muted opacity-60"> · {row.workflowName}</Text>
            ) : null}
          </Text>

          <View className="shrink-0 flex-row items-center gap-1">
            <Text className="font-t3-medium text-3xs tabular-nums text-foreground-muted opacity-70">
              {row.status}
            </Text>
            <View className="h-4 w-4 items-center justify-center">
              <SymbolView
                name={{ ios: "chevron.right", android: "chevron_right" }}
                size={11}
                tintColor={props.iconSubtleColor}
                type="monochrome"
              />
            </View>
          </View>
        </View>
      </Pressable>

      <View className="gap-px">
        {chips.map((agent) => (
          <AgentFleetChip
            key={agent.id}
            agent={agent}
            iconSubtleColor={props.iconSubtleColor}
            onPress={() => onOpenAgent(agent.id)}
          />
        ))}

        {Array.from({ length: Math.max(chipSlots - chips.length, 0) }, (_, index) => (
          <View key={`pending-${index}`} className="min-h-8 flex-row items-center gap-1.5 px-0.5">
            <View className="h-[18px] w-3 shrink-0 items-center justify-center">
              <View className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
            </View>
            <Text className="min-w-0 flex-1 text-xs text-foreground-muted opacity-50">
              starting…
            </Text>
          </View>
        ))}

        {truncated ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${hiddenCount} more agents`}
            accessibilityHint="Double tap to open the agents for this thread."
            hitSlop={2}
            onPress={() => {
              void Haptics.selectionAsync();
              onOpenAgents();
            }}
            style={({ pressed }) => ({
              backgroundColor: pressed ? pressedBackground : "transparent",
            })}
            className="rounded-md px-0.5"
          >
            <View className="min-h-8 flex-row items-center gap-1.5">
              <View className="h-[18px] w-3 shrink-0" />
              <Text className="min-w-0 flex-1 font-t3-medium text-2xs text-foreground-muted opacity-70">
                +{hiddenCount} more
              </Text>
              <View className="h-4 w-4 items-center justify-center">
                <SymbolView
                  name={{ ios: "chevron.right", android: "chevron_right" }}
                  size={11}
                  tintColor={props.iconSubtleColor}
                  type="monochrome"
                />
              </View>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function ThreadWorkLog(props: {
  readonly activities: ReadonlyArray<ThreadFeedActivity>;
  readonly copiedRowId: string | null;
  readonly expandedRows: Readonly<Record<string, boolean>>;
  readonly iconSubtleColor: import("react-native").ColorValue;
  readonly onCopyRow: (rowId: string, value: string) => void;
  readonly onToggleRow: (rowId: string) => void;
}) {
  const pressedBackground = useThemeColor("--color-subtle");
  const rows = visibleWorkLogActivities(props.activities).map((activity) => ({
    ...activity,
    detail: compactActivityDetail(activity.detail),
  }));

  if (rows.length === 0) {
    return null;
  }

  const onlyToolRows = rows.every((row) => row.toolLike);

  return (
    <View className="-mx-1 mb-1 px-1 py-0">
      {!onlyToolRows ? (
        <Text className="px-0.5 pb-0.5 font-t3-medium text-2xs text-foreground-muted opacity-60">
          work log
        </Text>
      ) : null}

      <View className="gap-px">
        {rows.map((row) => {
          const expanded = props.expandedRows[row.id] ?? false;
          const canExpand = row.canExpand;
          const fullDetail = expanded ? row.getFullDetail() : null;
          const displayText = row.detail ? `${row.summary} ${row.detail}` : row.summary;
          const iconIsDestructive = row.icon === "alert" || row.icon === "warning";

          if (row.agentSpawn) {
            return (
              <Animated.View
                key={row.id}
                {...(isFreshRow(row.createdAt) ? { entering: FadeIn.duration(200) } : {})}
              >
                <AgentFleetCard activity={row} iconSubtleColor={props.iconSubtleColor} />
              </Animated.View>
            );
          }

          return (
            <Animated.View
              key={row.id}
              {...(isFreshRow(row.createdAt) ? { entering: FadeIn.duration(200) } : {})}
            >
              <Pressable
                accessibilityRole={canExpand ? "button" : undefined}
                accessibilityLabel={displayText}
                accessibilityHint={
                  canExpand
                    ? "Double tap to show full details. Long press to copy."
                    : "Long press to copy."
                }
                accessibilityState={canExpand ? { expanded } : undefined}
                hitSlop={4}
                onPress={() => {
                  if (canExpand) {
                    triggerDisclosureFeedback();
                    props.onToggleRow(row.id);
                  }
                }}
                onLongPress={() => props.onCopyRow(row.id, row.getCopyText())}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? pressedBackground : "transparent",
                })}
                className="rounded-md px-0.5 py-0"
              >
                <View className="min-h-8 flex-row items-center gap-1.5">
                  <View className="h-[18px] w-5 shrink-0 items-center justify-center">
                    <SymbolView
                      name={workRowSymbolName(row.icon)}
                      size={13}
                      weight="medium"
                      tintColor={iconIsDestructive ? "#e11d48" : props.iconSubtleColor}
                      type="monochrome"
                    />
                  </View>

                  <Text className="min-w-0 flex-1 text-xs text-foreground" numberOfLines={1}>
                    <Text
                      className={cn(
                        "font-t3-medium text-foreground",
                        iconIsDestructive && "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      {row.summary}
                    </Text>
                    {row.detail ? (
                      <Text className="text-foreground-muted opacity-60"> {row.detail}</Text>
                    ) : null}
                  </Text>

                  <View className="shrink-0 flex-row items-center gap-px">
                    {props.copiedRowId === row.id ? (
                      <Text className="pr-1 font-t3-medium text-3xs text-emerald-600 dark:text-emerald-400">
                        Copied
                      </Text>
                    ) : null}
                    <View className="h-4 w-4 items-center justify-center">
                      {canExpand ? (
                        <SymbolView
                          name={
                            expanded
                              ? { ios: "chevron.up", android: "keyboard_arrow_up" }
                              : { ios: "chevron.down", android: "keyboard_arrow_down" }
                          }
                          size={11}
                          tintColor={props.iconSubtleColor}
                          type="monochrome"
                        />
                      ) : null}
                    </View>
                    <View className="h-4 w-4 items-center justify-center">
                      {row.status ? (
                        <SymbolView
                          name={
                            row.status === "failure"
                              ? { ios: "xmark", android: "close" }
                              : row.status === "success"
                                ? { ios: "checkmark", android: "check" }
                                : { ios: "minus", android: "remove" }
                          }
                          size={11}
                          tintColor={row.status === "failure" ? "#e11d48" : props.iconSubtleColor}
                          type="monochrome"
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              </Pressable>

              {fullDetail ? (
                <View className="ml-7 border-l border-neutral-300/60 pb-1 pl-3 pt-0.5 dark:border-white/[0.12]">
                  <ScrollView
                    nestedScrollEnabled
                    directionalLockEnabled
                    showsVerticalScrollIndicator
                    className="max-h-60"
                    contentContainerStyle={{ paddingRight: 8 }}
                  >
                    <Text
                      selectable
                      className="font-mono text-2xs leading-normal text-foreground-muted"
                    >
                      {fullDetail}
                    </Text>
                  </ScrollView>
                </View>
              ) : null}
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

export function ThreadWorkGroupToggle(props: {
  readonly expanded: boolean;
  readonly hiddenCount: number;
  readonly iconSubtleColor: import("react-native").ColorValue;
  readonly onlyToolActivities: boolean;
  readonly onToggle: () => void;
}) {
  const pressedBackground = useThemeColor("--color-subtle");
  const noun = props.onlyToolActivities
    ? props.hiddenCount === 1
      ? "tool call"
      : "tool calls"
    : props.hiddenCount === 1
      ? "log entry"
      : "log entries";
  const collapsedLabel = `Show ${props.hiddenCount} previous ${noun}`;
  const expandedLabel = props.onlyToolActivities
    ? "Show fewer tool calls"
    : "Show fewer log entries";

  return (
    <View className="-mx-1 mb-1 px-1 py-0">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: props.expanded }}
        accessibilityLabel={props.expanded ? expandedLabel : collapsedLabel}
        hitSlop={4}
        onPress={() => {
          void Haptics.selectionAsync();
          props.onToggle();
        }}
        style={({ pressed }) => ({
          backgroundColor: pressed ? pressedBackground : "transparent",
        })}
        className="min-h-8 flex-row items-center gap-1.5 rounded-md px-0.5 py-0"
      >
        <View className="h-[18px] w-5 items-center justify-center">
          <SymbolView
            name={
              props.expanded
                ? { ios: "chevron.up", android: "keyboard_arrow_up" }
                : { ios: "chevron.down", android: "keyboard_arrow_down" }
            }
            size={12}
            tintColor={props.iconSubtleColor}
            type="monochrome"
          />
        </View>
        <Text className="font-t3-medium text-xs text-foreground opacity-80">
          {props.expanded ? expandedLabel : `+${props.hiddenCount} previous ${noun}`}
        </Text>
      </Pressable>
    </View>
  );
}
