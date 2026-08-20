import { useFocusEffect, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  EnvironmentId,
  IssueId,
  IssueReportId,
  ProjectId,
  type Issue,
  type IssueReport,
  type IssueReportSummary,
  type IssueSeverity,
  type IssueStatus,
} from "@t3tools/contracts";
import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { useEnvironmentPresentation } from "../../state/presentation";
import { issueEnvironment } from "../../state/issues";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentServerConfig } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  compactEvidence,
  isStaleIssueFailure,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABEL,
  issueSeverityLabel,
} from "./issuePresentation";

type IssueDetailRouteProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly projectId: string;
  readonly issueId: string;
}>;

export function IssueDetailRouteScreen({ route }: IssueDetailRouteProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const iconColor = useThemeColor("--color-icon");
  const primaryForeground = useThemeColor("--color-primary-foreground");
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const projectId = ProjectId.make(route.params.projectId);
  const issueId = IssueId.make(route.params.issueId);
  const reference = { projectId, issueId };
  const { presentation } = useEnvironmentPresentation(environmentId);
  const serverConfig = useEnvironmentServerConfig(environmentId);
  const supportsIssues = serverConfig?.environment.capabilities.issues === true;
  const detail = useEnvironmentQuery(
    supportsIssues ? issueEnvironment.detail({ environmentId, input: reference }) : null,
  );
  const reports = useEnvironmentQuery(
    supportsIssues
      ? issueEnvironment.reports({
          environmentId,
          input: { ...reference, limit: 100, offset: 0 },
        })
      : null,
  );
  const threadLink = useEnvironmentQuery(
    supportsIssues ? issueEnvironment.threadLink({ environmentId, input: reference }) : null,
  );
  const updateIssue = useAtomCommand(issueEnvironment.update, { reportFailure: false });
  const [updating, setUpdating] = useState<"status" | "severity" | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<IssueReportId | null>(null);

  const refresh = useCallback(() => {
    detail.refresh();
    reports.refresh();
    threadLink.refresh();
  }, [detail.refresh, reports.refresh, threadLink.refresh]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const handleMutationFailure = (error: unknown) => {
    if (isStaleIssueFailure(error)) {
      refresh();
      Alert.alert(
        "Issue changed on another client",
        "The latest Issue has been loaded. Review it, then apply your change again.",
      );
      return;
    }
    Alert.alert(
      "Could not update Issue",
      error instanceof Error ? error.message : "Reconnect this environment and try again.",
    );
  };

  const setStatus = async (issue: Issue, status: IssueStatus) => {
    if (updating || status === issue.status) return;
    setUpdating("status");
    const result = await updateIssue({
      environmentId,
      input: { ...reference, expectedVersion: issue.version, status },
    });
    setUpdating(null);
    if (result._tag === "Failure") {
      handleMutationFailure(squashAtomCommandFailure(result));
      return;
    }
    refresh();
  };

  const setSeverity = async (issue: Issue, severity: IssueSeverity) => {
    if (updating || severity === issue.severity) return;
    setUpdating("severity");
    const result = await updateIssue({
      environmentId,
      input: { ...reference, expectedVersion: issue.version, severity },
    });
    setUpdating(null);
    if (result._tag === "Failure") {
      handleMutationFailure(squashAtomCommandFailure(result));
      return;
    }
    refresh();
  };

  const issue = detail.data?.issue ?? null;
  const linkedThread = threadLink.data?.link ?? null;
  const environmentLabel = presentation?.entry.target.label ?? "Environment";
  const offline = presentation !== null && presentation.connection.phase !== "connected";

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader title={issue?.ref ?? "Issue"} onBack={() => navigation.goBack()} />
        </>
      ) : (
        <NativeStackScreenOptions options={{ title: issue?.ref ?? "Issue" }} />
      )}

      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-5 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        refreshControl={
          <RefreshControl refreshing={detail.isPending && issue !== null} onRefresh={refresh} />
        }
      >
        {offline ? (
          <Notice>
            {environmentLabel} is offline. Reconnect it to refresh evidence or update this Issue.
          </Notice>
        ) : null}

        {serverConfig === null ? (
          offline ? (
            <EmptyState
              title="Environment offline"
              detail="Reconnect this environment so mobile can verify native Issues support and open the Issue."
              actionLabel="Retry"
              onAction={refresh}
            />
          ) : (
            <View className="items-center gap-3 py-20">
              <ActivityIndicator color={iconColor} />
              <Text className="text-base text-foreground-muted">Checking Issues support…</Text>
            </View>
          )
        ) : serverConfig !== null && !supportsIssues ? (
          <EmptyState
            title="Update Pulse Code Server"
            detail="This environment does not support native Issues yet. Update its server, then reconnect mobile."
          />
        ) : detail.isPending && issue === null ? (
          <View className="items-center gap-3 py-20">
            <ActivityIndicator color={iconColor} />
            <Text className="text-base text-foreground-muted">Opening Issue…</Text>
          </View>
        ) : detail.error && issue === null ? (
          <EmptyState
            title="Issue unavailable"
            detail={`${detail.error} Reconnect the environment or verify its Pulse project mapping, then retry.`}
            actionLabel="Retry"
            onAction={refresh}
          />
        ) : issue ? (
          <>
            <View className="gap-3 rounded-[24px] border border-border bg-card p-5">
              <View className="flex-row items-center gap-2">
                <View className="size-2.5 rounded-full bg-orange-500" />
                <Text className="text-xs font-t3-bold tracking-wide text-foreground-muted uppercase">
                  {issue.ref}
                </Text>
                <Text className="ml-auto text-xs text-foreground-tertiary">
                  Updated {relativeTime(issue.updatedAt)}
                </Text>
              </View>
              <Text className="text-2xl font-t3-bold leading-tight text-foreground">
                {issue.title}
              </Text>
              {issue.description ? (
                <Text className="text-base leading-relaxed text-foreground-secondary">
                  {issue.description}
                </Text>
              ) : null}
              <Text className="text-sm text-foreground-muted">
                {detail.data?.mapping.pulseProjectName ?? "Pulse project"} · {environmentLabel}
              </Text>
              {issue.assignedTo?.email ? (
                <Text className="text-sm text-foreground-muted">
                  Assigned to {issue.assignedTo.email}
                </Text>
              ) : null}
              {issue.labels.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {issue.labels.map((label) => (
                    <Badge key={label}>{label}</Badge>
                  ))}
                </View>
              ) : null}
            </View>

            <Section title="Status" detail="Move the Issue through the same lifecycle as desktop.">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {ISSUE_STATUSES.map((status) => (
                  <ActionPill
                    key={status}
                    label={ISSUE_STATUS_LABEL[status]}
                    selected={issue.status === status}
                    disabled={updating !== null || offline}
                    onPress={() => void setStatus(issue, status)}
                  />
                ))}
              </ScrollView>
              {updating === "status" ? <PendingLabel>Updating status…</PendingLabel> : null}
            </Section>

            <Section title="Severity" detail={`Current: ${issueSeverityLabel(issue.severity)}`}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {ISSUE_SEVERITIES.map((severity) => (
                  <ActionPill
                    key={severity}
                    label={ISSUE_SEVERITY_LABEL[severity]}
                    selected={issue.severity === severity}
                    disabled={updating !== null || offline}
                    onPress={() => void setSeverity(issue, severity)}
                  />
                ))}
              </ScrollView>
              {updating === "severity" ? <PendingLabel>Updating severity…</PendingLabel> : null}
            </Section>

            <Section
              title="Fix thread"
              detail={
                linkedThread
                  ? "Resume the thread already linked to this Issue."
                  : "Start or link a fix thread from desktop Pulse Code. It will appear here automatically."
              }
            >
              {threadLink.isPending && !threadLink.data ? (
                <PendingLabel>Checking linked thread…</PendingLabel>
              ) : linkedThread ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    navigation.navigate("Thread", {
                      environmentId: String(environmentId),
                      threadId: String(linkedThread.threadId),
                    })
                  }
                  className="flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 active:opacity-70"
                >
                  <SymbolView
                    name="play"
                    size={15}
                    tintColor={primaryForeground}
                    type="monochrome"
                  />
                  <Text className="font-t3-bold text-sm text-primary-foreground">Resume fix</Text>
                </Pressable>
              ) : null}
            </Section>

            <Section
              title="Evidence"
              detail="Report summaries load first. Open one only when you need its captured evidence."
            >
              {reports.isPending && !reports.data ? (
                <PendingLabel>Loading report summaries…</PendingLabel>
              ) : reports.error && !reports.data ? (
                <InlineError message={reports.error} onRetry={reports.refresh} />
              ) : !reports.data || reports.data.reports.length === 0 ? (
                <Text className="text-sm text-foreground-muted">No linked Reports.</Text>
              ) : (
                <View className="overflow-hidden rounded-2xl border border-border-subtle">
                  {reports.data.reports.map((report, index) => (
                    <ReportRow
                      key={report.id}
                      environmentId={environmentId}
                      projectId={projectId}
                      report={report}
                      first={index === 0}
                      expanded={expandedReportId === report.id}
                      onToggle={() =>
                        setExpandedReportId((current) => (current === report.id ? null : report.id))
                      }
                    />
                  ))}
                </View>
              )}
            </Section>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ReportRow(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly report: IssueReportSummary;
  readonly first: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const iconColor = useThemeColor("--color-icon-muted");
  const counts = [
    props.report.errorCount ? `${props.report.errorCount} errors` : null,
    props.report.consoleCount ? `${props.report.consoleCount} console` : null,
    props.report.networkCount ? `${props.report.networkCount} network` : null,
  ].filter((value): value is string => value !== null);

  return (
    <View className={props.first ? "" : "border-t border-border-subtle"}>
      <Pressable onPress={props.onToggle} className="gap-2 px-4 py-4 active:bg-subtle">
        <View className="flex-row items-start gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-base font-t3-medium text-foreground" numberOfLines={2}>
              {props.report.title}
            </Text>
            <Text className="text-xs text-foreground-muted">
              {props.report.kind || "Report"} · {issueSeverityLabel(props.report.severity)}
              {props.report.createdAt ? ` · ${relativeTime(props.report.createdAt)}` : ""}
            </Text>
            {counts.length > 0 ? (
              <Text className="text-xs text-foreground-tertiary">{counts.join(" · ")}</Text>
            ) : null}
          </View>
          <SymbolView
            name={props.expanded ? "chevron.up" : "chevron.down"}
            size={16}
            tintColor={iconColor}
            type="monochrome"
          />
        </View>
      </Pressable>
      {props.expanded ? (
        <ReportEvidence
          environmentId={props.environmentId}
          projectId={props.projectId}
          reportId={props.report.id}
        />
      ) : null}
    </View>
  );
}

function ReportEvidence(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly reportId: IssueReportId;
}) {
  const query = useEnvironmentQuery(
    issueEnvironment.reportDetail({
      environmentId: props.environmentId,
      input: { projectId: props.projectId, reportId: props.reportId },
    }),
  );
  const report = query.data;

  if (query.isPending && report === null) {
    return (
      <PendingLabel className="border-t border-border-subtle px-4 py-5">
        Loading evidence…
      </PendingLabel>
    );
  }
  if (query.error && report === null) {
    return (
      <View className="border-t border-border-subtle p-4">
        <InlineError message={query.error} onRetry={query.refresh} />
      </View>
    );
  }
  if (report === null) return null;

  return (
    <View className="gap-4 border-t border-border-subtle bg-subtle px-4 py-4">
      <ReportMedia report={report} />
      {report.description ? <EvidenceBlock title="Description" value={report.description} /> : null}
      <EvidenceEntries title="Errors and stack traces" entries={report.errors} />
      <EvidenceEntries title="Console" entries={report.consoleEntries} />
      <EvidenceEntries title="Network" entries={report.networkEntries} />
      <EvidenceEntries title="Breadcrumbs" entries={report.breadcrumbs} />
      {report.environment !== null ? (
        <EvidenceBlock title="Environment" value={compactEvidence(report.environment)} mono />
      ) : null}
      {report.pageMetadata !== null || report.backendContext !== null ? (
        <EvidenceBlock
          title="Page and backend context"
          value={compactEvidence({ page: report.pageMetadata, backend: report.backendContext })}
          mono
        />
      ) : null}
    </View>
  );
}

function ReportMedia({ report }: { readonly report: IssueReport }) {
  const screenshot = report.annotatedScreenshotUrl ?? report.screenshotUrl;
  if (!screenshot && !report.audioUrl && !report.videoUrl) return null;
  return (
    <View className="gap-3">
      <Text className="text-xs font-t3-bold tracking-wide text-foreground-muted uppercase">
        Captured media
      </Text>
      {screenshot ? (
        <Pressable
          accessibilityLabel="Open captured screenshot"
          accessibilityRole="link"
          onPress={() => void Linking.openURL(screenshot)}
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          <Image source={{ uri: screenshot }} resizeMode="contain" className="h-56 w-full" />
        </Pressable>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {report.audioUrl ? <MediaLink label="Open audio" url={report.audioUrl} /> : null}
        {report.videoUrl ? <MediaLink label="Open video" url={report.videoUrl} /> : null}
      </View>
    </View>
  );
}

function MediaLink(props: { readonly label: string; readonly url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(props.url)}
      className="rounded-full border border-border bg-card px-3 py-2 active:bg-subtle-strong"
    >
      <Text className="text-sm font-t3-medium text-foreground">{props.label}</Text>
    </Pressable>
  );
}

function EvidenceEntries(props: { readonly title: string; readonly entries: readonly unknown[] }) {
  if (props.entries.length === 0) return null;
  const occurrences = new Map<string, number>();
  const entries = props.entries.slice(0, 3).map((entry) => {
    const value = compactEvidence(entry);
    const occurrence = occurrences.get(value) ?? 0;
    occurrences.set(value, occurrence + 1);
    return { key: `${stableEvidenceHash(value)}:${occurrence}`, value };
  });
  return (
    <View className="gap-2">
      <Text className="text-xs font-t3-bold tracking-wide text-foreground-muted uppercase">
        {props.title} · {props.entries.length}
      </Text>
      {entries.map((entry) => (
        <EvidenceBlock key={entry.key} value={entry.value} mono />
      ))}
      {props.entries.length > 3 ? (
        <Text className="text-xs text-foreground-tertiary">
          {props.entries.length - 3} more entries are available in desktop Pulse Code.
        </Text>
      ) : null}
    </View>
  );
}

function stableEvidenceHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function EvidenceBlock(props: {
  readonly title?: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-3">
      {props.title ? (
        <Text className="text-xs font-t3-bold tracking-wide text-foreground-muted uppercase">
          {props.title}
        </Text>
      ) : null}
      <Text
        className={
          props.mono
            ? "font-mono text-xs leading-relaxed text-foreground-secondary"
            : "text-sm leading-relaxed text-foreground-secondary"
        }
      >
        {props.value}
      </Text>
    </View>
  );
}

function Section(props: {
  readonly title: string;
  readonly detail: string;
  readonly children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <View className="gap-0.5 px-1">
        <Text className="text-lg font-t3-bold text-foreground">{props.title}</Text>
        <Text className="text-sm leading-relaxed text-foreground-muted">{props.detail}</Text>
      </View>
      {props.children}
    </View>
  );
}

function ActionPill(props: {
  readonly label: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected, disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={
        props.selected
          ? "rounded-full bg-primary px-3.5 py-2.5"
          : props.disabled
            ? "rounded-full border border-border bg-card px-3.5 py-2.5 opacity-50"
            : "rounded-full border border-border bg-card px-3.5 py-2.5 active:bg-subtle"
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

function Badge({ children }: { readonly children: string }) {
  return (
    <View className="rounded-full bg-subtle px-2.5 py-1">
      <Text className="text-xs text-foreground-muted">{children}</Text>
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

function PendingLabel(props: { readonly children: string; readonly className?: string }) {
  return (
    <View className={`flex-row items-center gap-2 ${props.className ?? ""}`}>
      <ActivityIndicator size="small" />
      <Text className="text-sm text-foreground-muted">{props.children}</Text>
    </View>
  );
}

function InlineError(props: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <View className="gap-3 rounded-2xl border border-danger-border bg-danger p-4">
      <Text className="text-sm leading-relaxed text-danger-foreground">{props.message}</Text>
      <Pressable onPress={props.onRetry} className="self-start rounded-full bg-card px-3 py-2">
        <Text className="text-sm font-t3-bold text-foreground">Retry</Text>
      </Pressable>
    </View>
  );
}
