import { StackActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import type { EnvironmentId, IssueSeverity, IssueStatus } from "@t3tools/contracts";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { SymbolView } from "../../components/AppSymbol";
import { relativeTime } from "../../lib/time";
import { useThemeColor } from "../../lib/useThemeColor";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useProjects } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useIssueConnections, useIssueList } from "../../state/issues";
import { useDebouncedValue } from "../../state/queries";
import {
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABEL,
  issueSeverityLabel,
  shouldShowInitialIssuesLoading,
} from "./issuePresentation";

export function IssuesRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const iconColor = useThemeColor("--color-icon");
  const { environments, isReady } = useEnvironments();
  const projects = useProjects();
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<IssueStatus | null>(null);
  const [severity, setSeverity] = useState<IssueSeverity | null>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 200);

  const capableEnvironments = useMemo(
    () =>
      environments.filter(
        (environment) => environment.serverConfig?.environment.capabilities.issues === true,
      ),
    [environments],
  );
  const capableEnvironmentIds = useMemo(
    () => capableEnvironments.map((environment) => environment.environmentId),
    [capableEnvironments],
  );
  const connections = useIssueConnections(capableEnvironmentIds);
  const listTargets = useMemo(
    () =>
      connections.values.flatMap(([target, snapshot]) =>
        snapshot.status !== "connected"
          ? []
          : snapshot.mappings.flatMap((mapping) => {
              if (
                selectedEnvironmentId !== null &&
                selectedEnvironmentId !== target.environmentId
              ) {
                return [];
              }
              return [
                {
                  environmentId: target.environmentId,
                  input: {
                    projectId: mapping.projectId,
                    ...(status ? { status } : {}),
                    ...(severity ? { severities: [severity] } : {}),
                    ...(debouncedSearch ? { search: debouncedSearch } : {}),
                    sort: "updated" as const,
                    limit: 100,
                    offset: 0,
                  },
                },
              ];
            }),
      ),
    [connections.values, debouncedSearch, selectedEnvironmentId, severity, status],
  );
  const issues = useIssueList(listTargets);
  const sortedEntries = useMemo(
    () =>
      [...issues.entries].sort(
        (left, right) => Date.parse(right.issue.updatedAt) - Date.parse(left.issue.updatedAt),
      ),
    [issues.entries],
  );
  const environmentById = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );
  const projectByKey = useMemo(
    () =>
      new Map(projects.map((project) => [`${project.environmentId}:${project.id}`, project.title])),
    [projects],
  );

  const refresh = useCallback(() => {
    connections.refresh();
    issues.refresh();
  }, [connections.refresh, issues.refresh]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const connectedCount = connections.values.filter(
    ([, value]) => value.status === "connected",
  ).length;
  const hasFilters =
    searchQuery.length > 0 ||
    status !== null ||
    severity !== null ||
    selectedEnvironmentId !== null;
  const unavailableEnvironments = capableEnvironments.filter(
    (environment) => environment.connection.phase !== "connected",
  );
  const reachableCapableEnvironmentCount =
    capableEnvironments.length - unavailableEnvironments.length;
  const isInitialLoading = shouldShowInitialIssuesLoading({
    catalogReady: isReady,
    reachableCapableEnvironmentCount,
    connectionPending: connections.isPending,
    connectionValueCount: connections.values.length,
    listTargetCount: listTargets.length,
    listPending: issues.isPending,
    issueEntryCount: issues.entries.length,
  });

  const openEnvironments = () =>
    navigation.navigate("SettingsSheet", {
      screen: "SettingsContent",
      params: { screen: "SettingsEnvironments" },
    });

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader title="Issues" onBack={() => navigation.goBack()} />
        </>
      ) : null}

      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        refreshControl={
          <RefreshControl
            refreshing={(connections.isPending || issues.isPending) && sortedEntries.length > 0}
            onRefresh={refresh}
          />
        }
      >
        <View className="min-h-12 flex-row items-center gap-2.5 rounded-2xl border border-input-border bg-input px-3.5">
          <SymbolView name="magnifyingglass" size={17} tintColor={iconColor} type="monochrome" />
          <TextInput
            accessibilityLabel="Search Issues"
            autoCapitalize="none"
            onChangeText={setSearchQuery}
            placeholder="Search Issues"
            placeholderTextColorClassName="accent-placeholder"
            className="flex-1 py-2.5 text-base font-sans text-foreground"
            value={searchQuery}
          />
          {searchQuery ? (
            <Pressable accessibilityLabel="Clear Issue search" onPress={() => setSearchQuery("")}>
              <SymbolView
                name="xmark.circle.fill"
                size={17}
                tintColor={iconColor}
                type="monochrome"
              />
            </Pressable>
          ) : null}
        </View>

        <FilterStrip
          label="Status"
          values={ISSUE_STATUSES}
          selected={status}
          labelFor={(value) => ISSUE_STATUS_LABEL[value]}
          onSelect={setStatus}
        />
        <FilterStrip
          label="Severity"
          values={ISSUE_SEVERITIES}
          selected={severity}
          labelFor={(value) => ISSUE_SEVERITY_LABEL[value]}
          onSelect={setSeverity}
        />
        {capableEnvironments.length > 1 ? (
          <FilterStrip
            label="Server"
            values={capableEnvironmentIds}
            selected={selectedEnvironmentId}
            labelFor={(value) => environmentById.get(value)?.label ?? "Server"}
            onSelect={setSelectedEnvironmentId}
          />
        ) : null}

        {connections.errors.length > 0 || issues.errors.length > 0 ? (
          <Notice>
            One server could not load Issues. Results from the other connected servers are still
            shown. Pull to retry.
          </Notice>
        ) : null}
        {unavailableEnvironments.length > 0 && reachableCapableEnvironmentCount > 0 ? (
          <Notice>
            {unavailableEnvironments.map((environment) => environment.label).join(", ")} is offline;
            reconnect it to include its Issues.
          </Notice>
        ) : null}

        {isInitialLoading ? (
          <View className="items-center gap-3 py-20">
            <ActivityIndicator color={iconColor} />
            <Text className="text-base text-foreground-muted">Loading Issues…</Text>
          </View>
        ) : environments.length === 0 ? (
          <EmptyState
            title="Connect an environment"
            detail="Issues live on a Pulse Code Server. Connect a local or remote environment first."
            actionLabel="Open environments"
            onAction={openEnvironments}
          />
        ) : capableEnvironments.length === 0 ? (
          <EmptyState
            title="Update Pulse Code Server"
            detail="None of the connected servers advertises native Issues yet. Update the server, then reconnect this client."
            actionLabel="Open environments"
            onAction={openEnvironments}
          />
        ) : reachableCapableEnvironmentCount === 0 ? (
          <EmptyState
            title="Reconnect an environment"
            detail={`${unavailableEnvironments.map((environment) => environment.label).join(", ")} cannot be reached. Reconnect it to load its Issues.`}
            actionLabel="Open environments"
            onAction={openEnvironments}
          />
        ) : connectedCount === 0 ? (
          <EmptyState
            title="Connect Pulse"
            detail="Use Integrations in Pulse Code desktop to connect Pulse for this server. Mobile never receives or stores the Pulse token."
            actionLabel="Check environments"
            onAction={openEnvironments}
          />
        ) : listTargets.length === 0 ? (
          <EmptyState
            title="Map a Pulse project"
            detail="Use Integrations in Pulse Code desktop to map a workspace on this server to its Pulse project."
          />
        ) : sortedEntries.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No matching Issues" : "No Issues yet"}
            detail={
              hasFilters
                ? "Clear a filter or adjust the search to see more Issues."
                : "Reports captured from Preview will appear here after they become Issues."
            }
            {...(hasFilters
              ? {
                  actionLabel: "Clear filters",
                  onAction: () => {
                    setSearchQuery("");
                    setStatus(null);
                    setSeverity(null);
                    setSelectedEnvironmentId(null);
                  },
                }
              : {})}
          />
        ) : (
          <View className="overflow-hidden rounded-[22px] border border-border bg-card">
            <View className="flex-row items-center border-b border-border-subtle px-4 py-3">
              <Text className="font-t3-bold text-base text-foreground">Issue inbox</Text>
              <Text className="ml-auto text-sm tabular-nums text-foreground-muted">
                {issues.total || sortedEntries.length}
              </Text>
            </View>
            {sortedEntries.map((entry, index) => {
              const environmentLabel = environmentById.get(entry.environmentId)?.label ?? "Server";
              const projectLabel =
                projectByKey.get(`${entry.environmentId}:${entry.projectId}`) ?? "Workspace";
              return (
                <Pressable
                  key={`${entry.environmentId}:${entry.projectId}:${entry.issue.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${entry.issue.ref}: ${entry.issue.title}`}
                  onPress={() =>
                    navigation.dispatch(
                      StackActions.push("IssueDetail", {
                        environmentId: String(entry.environmentId),
                        projectId: String(entry.projectId),
                        issueId: String(entry.issue.id),
                      }),
                    )
                  }
                  className={
                    index === 0
                      ? "gap-2 px-4 py-4 active:bg-subtle"
                      : "gap-2 border-t border-border-subtle px-4 py-4 active:bg-subtle"
                  }
                >
                  <View className="flex-row items-start gap-3">
                    <View className="mt-1 size-2.5 rounded-full bg-orange-500" />
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="text-xs font-t3-bold tracking-wide text-foreground-muted uppercase">
                        {entry.issue.ref}
                      </Text>
                      <Text className="text-base font-t3-medium text-foreground" numberOfLines={2}>
                        {entry.issue.title}
                      </Text>
                    </View>
                    <SymbolView
                      name="chevron.right"
                      size={15}
                      tintColor={iconColor}
                      type="monochrome"
                    />
                  </View>
                  <View className="ml-5 flex-row flex-wrap items-center gap-2">
                    <IssuePill label={ISSUE_STATUS_LABEL[entry.issue.status]} />
                    <IssuePill label={issueSeverityLabel(entry.issue.severity)} />
                    {entry.issue.reportCount ? (
                      <Text className="text-xs text-foreground-muted">
                        {entry.issue.reportCount}{" "}
                        {entry.issue.reportCount === 1 ? "report" : "reports"}
                      </Text>
                    ) : null}
                    <Text className="ml-auto text-xs text-foreground-tertiary">
                      {relativeTime(entry.issue.updatedAt)}
                    </Text>
                  </View>
                  <Text className="ml-5 text-xs text-foreground-tertiary" numberOfLines={1}>
                    {projectLabel} · {environmentLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function FilterStrip<Value extends string>(props: {
  readonly label: string;
  readonly values: readonly Value[];
  readonly selected: Value | null;
  readonly labelFor: (value: Value) => string;
  readonly onSelect: (value: Value | null) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="px-1 text-xs font-t3-bold tracking-wide text-foreground-tertiary uppercase">
        {props.label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        <FilterPill
          label="All"
          selected={props.selected === null}
          onPress={() => props.onSelect(null)}
        />
        {props.values.map((value) => (
          <FilterPill
            key={value}
            label={props.labelFor(value)}
            selected={props.selected === value}
            onPress={() => props.onSelect(value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function FilterPill(props: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      className={
        props.selected
          ? "rounded-full bg-primary px-3.5 py-2"
          : "rounded-full border border-border bg-card px-3.5 py-2"
      }
    >
      <Text
        className={
          props.selected
            ? "text-sm font-t3-medium text-primary-foreground"
            : "text-sm text-foreground-muted"
        }
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function IssuePill({ label }: { readonly label: string }) {
  return (
    <View className="rounded-full bg-subtle px-2.5 py-1">
      <Text className="text-xs text-foreground-muted">{label}</Text>
    </View>
  );
}

function Notice({ children }: { readonly children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-border bg-card px-4 py-3">
      <Text className="text-sm leading-relaxed text-foreground-muted">{children}</Text>
    </View>
  );
}
