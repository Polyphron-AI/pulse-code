import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { SymbolView } from "../../components/AppSymbol";
import { useThemeColor } from "../../lib/useThemeColor";

/** Driver kinds that read as an "agent" rather than a plain provider CLI. */
const AGENT_DRIVER_KINDS: ReadonlySet<string> = new Set(["hermes"]);

export type AgentScopeTab = "projects" | "agents";

export interface AgentScopeEntry {
  readonly instanceId: string;
  readonly label: string;
  readonly driver: string;
}

interface ServerConfigLike {
  readonly providers: ReadonlyArray<{
    readonly instanceId: string;
    readonly driver: string;
    readonly displayName?: string | undefined;
    readonly enabled: boolean;
  }>;
}

/**
 * The thread list can scope to one agent instead of one project. Both screens
 * that render a thread list (home and the split-view sidebar) share this hook
 * so the segmented control behaves identically on each.
 *
 * Returns `entries` empty when no agent instance is configured — callers hide
 * the segmented control entirely in that case rather than offering a tab that
 * leads nowhere.
 */
export function useAgentScope(props: {
  readonly serverConfigs: ReadonlyMap<EnvironmentId, ServerConfigLike>;
  readonly selectedEnvironmentId: EnvironmentId | null;
}) {
  const { selectedEnvironmentId, serverConfigs } = props;
  const [tab, setTab] = useState<AgentScopeTab>("projects");
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  const entries = useMemo(() => {
    const byInstanceId = new Map<string, AgentScopeEntry>();
    for (const [environmentId, config] of serverConfigs) {
      if (selectedEnvironmentId !== null && environmentId !== selectedEnvironmentId) {
        continue;
      }
      for (const provider of config.providers) {
        if (!AGENT_DRIVER_KINDS.has(provider.driver) || !provider.enabled) {
          continue;
        }
        if (!byInstanceId.has(provider.instanceId)) {
          byInstanceId.set(provider.instanceId, {
            instanceId: provider.instanceId,
            label: provider.displayName || provider.instanceId,
            driver: provider.driver,
          });
        }
      }
    }
    return [...byInstanceId.values()];
  }, [selectedEnvironmentId, serverConfigs]);

  const selectedAgent = useMemo(
    () =>
      selectedInstanceId === null
        ? null
        : (entries.find((entry) => entry.instanceId === selectedInstanceId) ?? null),
    [entries, selectedInstanceId],
  );

  // An instance that is removed, disabled, or filtered out by the environment
  // picker must not strand the list on a scope with no way back.
  useEffect(() => {
    if (selectedInstanceId !== null && selectedAgent === null) {
      setSelectedInstanceId(null);
    }
  }, [selectedAgent, selectedInstanceId]);
  useEffect(() => {
    if (entries.length === 0) {
      setTab("projects");
    }
  }, [entries.length]);

  const selectAgent = useCallback((instanceId: string | null) => {
    setSelectedInstanceId(instanceId);
  }, []);

  return {
    entries,
    tab: entries.length === 0 ? ("projects" as const) : tab,
    setTab,
    selectedAgent,
    selectedAgentInstanceId: selectedAgent?.instanceId ?? null,
    selectAgent,
    /** True while the agent index is showing, i.e. no thread list at all. */
    showsAgentIndex: entries.length > 0 && tab === "agents" && selectedAgent === null,
  } as const;
}

/** Resolves the instance a thread belongs to: live session first, draft second. */
export function threadAgentInstanceId(thread: {
  readonly session?: { readonly providerInstanceId?: string | null } | null;
  readonly modelSelection: { readonly instanceId: string };
}): string {
  return thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
}

export function AgentScopeSegmented(props: {
  readonly tab: AgentScopeTab;
  readonly onTabChange: (tab: AgentScopeTab) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="mx-4 mb-2 mt-1 flex-row rounded-full border border-border bg-card p-1"
    >
      {(["projects", "agents"] as const).map((tab) => {
        const selected = props.tab === tab;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => props.onTabChange(tab)}
            className={`flex-1 items-center rounded-full py-1.5 ${
              selected ? "bg-screen" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-sm ${
                selected ? "font-t3-bold text-foreground" : "font-sans text-foreground-muted"
              }`}
            >
              {tab === "projects" ? "Projects" : "Agents"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The Agents-tab card itself, without scrolling — embeddable in a list header. */
export function AgentScopeList(props: {
  readonly entries: ReadonlyArray<AgentScopeEntry>;
  readonly threadCountByInstanceId: ReadonlyMap<string, number>;
  readonly onSelect: (instanceId: string) => void;
}) {
  const chevronColor = useThemeColor("--color-icon-subtle");
  return (
    <View className="mx-4 overflow-hidden rounded-[18px] border border-border bg-card">
      {props.entries.map((entry, index) => {
        const count = props.threadCountByInstanceId.get(entry.instanceId) ?? 0;
        return (
          <Pressable
            key={entry.instanceId}
            onPress={() => props.onSelect(entry.instanceId)}
            className={`flex-row items-center gap-3 px-4 py-3 active:opacity-70 ${
              index === 0 ? "" : "border-t border-separator"
            }`}
          >
            <ProviderIcon provider={entry.driver} size={22} />
            <View className="flex-1">
              <Text className="font-t3-bold text-base text-foreground">{entry.label}</Text>
              <Text className="mt-0.5 font-sans text-xs text-foreground-muted">
                {count === 1 ? "1 thread" : `${count} threads`}
              </Text>
            </View>
            <SymbolView name="chevron.right" size={13} tintColor={chevronColor} type="monochrome" />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Top level of the Agents tab: one row per instance, tap to drill in. */
export function AgentScopeIndex(props: {
  readonly entries: ReadonlyArray<AgentScopeEntry>;
  readonly threadCountByInstanceId: ReadonlyMap<string, number>;
  readonly onSelect: (instanceId: string) => void;
  readonly contentPaddingBottom?: number;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: props.contentPaddingBottom ?? 24 }}
    >
      <AgentScopeList
        entries={props.entries}
        threadCountByInstanceId={props.threadCountByInstanceId}
        onSelect={props.onSelect}
      />
    </ScrollView>
  );
}

/** Drilled-in header: names the agent and is the way back to the index. */
export function AgentScopeBackRow(props: {
  readonly agent: AgentScopeEntry;
  readonly onBack: () => void;
}) {
  const chevronColor = useThemeColor("--color-icon-muted");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to all agents"
      onPress={props.onBack}
      className="mx-4 mb-2 flex-row items-center gap-2 active:opacity-70"
    >
      <SymbolView name="chevron.left" size={13} tintColor={chevronColor} type="monochrome" />
      <ProviderIcon provider={props.agent.driver} size={16} />
      <Text className="font-t3-bold text-sm text-foreground">{props.agent.label}</Text>
    </Pressable>
  );
}
