import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  IssueAssigneeCandidate,
  IssueRef,
  IssueReportId,
  IssueSeverity,
  IssueStatus,
  ProjectId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import {
  ActivityIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDotIcon,
  Clock3Icon,
  FileWarningIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TagIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { issueEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { useEnvironmentQuery } from "~/state/query";
import { cn } from "~/lib/utils";

import { IssueEvidence } from "./IssueEvidence";
import { IssueThreadActions } from "./IssueThreadActions";
import {
  activityLabel,
  compactUnknown,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_PRESENTATION,
  ISSUE_STATUSES,
  ISSUE_STATUS_PRESENTATION,
  issueSeverityLabel,
} from "./issuePresentation";

type IssueDetailTab = "summary" | "evidence" | "activity";

type IssuePatch = {
  readonly status?: IssueStatus;
  readonly severity?: IssueSeverity;
  readonly assignedToId?: string | null;
  readonly labels?: readonly string[];
};

function failureDetail(result: {
  readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"];
}) {
  const error = squashAtomCommandFailure(result);
  if (error && typeof error === "object") {
    return {
      message:
        "detail" in error && typeof error.detail === "string"
          ? error.detail
          : error instanceof Error
            ? error.message
            : "The Issue could not be updated.",
      stale: "reason" in error && error.reason === "stale-version",
    };
  }
  return { message: "The Issue could not be updated.", stale: false };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function AssigneeLabel({ assignee }: { assignee: IssueAssigneeCandidate | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <UserRoundIcon className="size-3.5 shrink-0" />
      <span className="truncate">{assignee?.email ?? "Unassigned"}</span>
    </span>
  );
}

export function IssueDetailPanel({
  environmentId,
  reference,
  onActed,
  currentThreadRef,
  currentProjectId,
}: {
  environmentId: EnvironmentId;
  reference: IssueRef;
  onActed?: () => void;
  currentThreadRef?: ScopedThreadRef;
  currentProjectId?: ProjectId;
}) {
  const [tab, setTab] = useState<IssueDetailTab>("summary");
  const [selectedReportId, setSelectedReportId] = useState<IssueReportId | null>(null);
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  const detailQuery = useEnvironmentQuery(
    issueEnvironment.detail({ environmentId, input: reference }),
  );
  const reportsQuery = useEnvironmentQuery(
    tab === "evidence"
      ? issueEnvironment.reports({
          environmentId,
          input: { ...reference, limit: 50, offset: 0 },
        })
      : null,
  );
  const activityQuery = useEnvironmentQuery(
    tab === "activity"
      ? issueEnvironment.activity({
          environmentId,
          input: { ...reference, limit: 100, offset: 0 },
        })
      : null,
  );
  const assigneesQuery = useEnvironmentQuery(
    issueEnvironment.assignees({
      environmentId,
      input: { projectId: reference.projectId },
    }),
  );

  useEffect(() => {
    if (tab !== "evidence") return;
    const reports = reportsQuery.data?.reports ?? [];
    if (!selectedReportId || !reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(reports[0]?.id ?? null);
    }
  }, [reportsQuery.data?.reports, selectedReportId, tab]);

  const reportDetailQuery = useEnvironmentQuery(
    tab === "evidence" && selectedReportId
      ? issueEnvironment.reportDetail({
          environmentId,
          input: { projectId: reference.projectId, reportId: selectedReportId },
        })
      : null,
  );
  const updateIssue = useAtomCommand(issueEnvironment.update, { reportFailure: false });
  const issue = detailQuery.data?.issue ?? null;
  const assignees = assigneesQuery.data?.assignees ?? [];
  const selectedAssignee = useMemo(
    () => assignees.find((assignee) => assignee.id === issue?.assignedToId) ?? null,
    [assignees, issue?.assignedToId],
  );

  const applyPatch = async (field: string, patch: IssuePatch) => {
    if (!issue || pendingField) return;
    setPendingField(field);
    setActionError(null);
    const result = await updateIssue({
      environmentId,
      input: {
        ...reference,
        expectedVersion: issue.version,
        ...patch,
        ...(patch.labels ? { labels: [...patch.labels] } : {}),
      },
    });
    setPendingField(null);
    if (result._tag === "Failure") {
      const failure = failureDetail(result);
      setActionError(
        failure.stale
          ? "This Issue changed in Pulse. Its latest version has been loaded; review it and try again."
          : failure.message,
      );
      detailQuery.refresh();
      return;
    }
    detailQuery.refresh();
    if (tab === "activity") activityQuery.refresh();
    onActed?.();
  };

  const addLabel = () => {
    const label = labelDraft.trim();
    if (!issue || !label || issue.labels.includes(label)) return;
    setLabelDraft("");
    void applyPatch("labels", { labels: [...issue.labels, label] });
  };

  if (detailQuery.isPending && !detailQuery.data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
        <LoaderCircleIcon className="size-5 animate-spin" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Alert variant="error" className="max-w-md">
          <CircleAlertIcon />
          <AlertTitle>Issue unavailable</AlertTitle>
          <AlertDescription>
            {detailQuery.error ?? "Pulse did not return this Issue."}
            <Button size="xs" variant="outline" onClick={detailQuery.refresh}>
              <RefreshCwIcon /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const statusPresentation = ISSUE_STATUS_PRESENTATION[issue.status];
  const severityPresentation = issue.severity ? ISSUE_SEVERITY_PRESENTATION[issue.severity] : null;
  const isResolved = issue.status === "resolved" || issue.status === "wont_fix";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border/60 bg-background/95 px-4 pt-3 backdrop-blur-sm">
        <div className="flex min-w-0 items-start gap-3">
          <CircleDotIcon className="mt-1 size-4 shrink-0 text-orange-500" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono">{issue.ref}</span>
              <Badge variant={statusPresentation.tone}>{statusPresentation.label}</Badge>
              {severityPresentation ? (
                <Badge variant="outline" className={severityPresentation.className}>
                  {severityPresentation.label}
                </Badge>
              ) : null}
            </div>
            <h1 className="mt-1 line-clamp-2 text-base font-semibold tracking-[-0.015em]">
              {issue.title}
            </h1>
          </div>
          <Button
            size="xs"
            variant={isResolved ? "outline" : "default"}
            disabled={pendingField !== null}
            onClick={() =>
              void applyPatch("lifecycle", { status: isResolved ? "in_progress" : "resolved" })
            }
          >
            {pendingField === "lifecycle" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : isResolved ? (
              <CircleDotIcon />
            ) : (
              <CheckCircle2Icon />
            )}
            {isResolved ? "Reopen" : "Resolve"}
          </Button>
        </div>
        <div className="mt-2 pl-7">
          <IssueThreadActions
            environmentId={environmentId}
            projectId={reference.projectId}
            issue={issue}
            {...(currentThreadRef ? { currentThreadRef } : {})}
            {...(currentProjectId ? { currentProjectId } : {})}
          />
        </div>
        <nav className="mt-3 flex gap-1" aria-label="Issue detail sections">
          {(
            [
              ["summary", "Summary", CircleDotIcon],
              [
                "evidence",
                `Evidence${issue.reportCount ? ` · ${issue.reportCount}` : ""}`,
                FileWarningIcon,
              ],
              ["activity", "Activity", ActivityIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "relative flex h-8 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground",
                tab === value &&
                  "text-foreground after:absolute after:right-1 after:bottom-0 after:left-1 after:h-0.5 after:rounded-full after:bg-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="@container/issue-detail mx-auto w-full max-w-6xl p-4">
          {actionError ? (
            <Alert variant="error" className="mb-3">
              <CircleAlertIcon />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}

          {tab === "summary" ? (
            <div className="grid gap-4 @xl/issue-detail:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.75fr)]">
              <main className="space-y-4">
                <section className="rounded-xl border border-border/60 bg-card/25 p-4">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </h2>
                  {issue.description ? (
                    <p className="whitespace-pre-wrap text-sm leading-6">{issue.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No description was provided.</p>
                  )}
                </section>
                <section className="rounded-xl border border-border/60 bg-card/25 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <TagIcon className="size-3.5 text-muted-foreground" />
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Labels
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {issue.labels.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No labels</span>
                    ) : (
                      issue.labels.map((label) => (
                        <Badge key={label} variant="secondary">
                          {label}
                          <button
                            type="button"
                            aria-label={`Remove ${label}`}
                            disabled={pendingField !== null}
                            onClick={() =>
                              void applyPatch("labels", {
                                labels: issue.labels.filter((candidate) => candidate !== label),
                              })
                            }
                          >
                            <XIcon className="size-2.5" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Input
                      nativeInput
                      size="sm"
                      value={labelDraft}
                      onChange={(event) => setLabelDraft(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addLabel();
                        }
                      }}
                      placeholder="Add label"
                      disabled={pendingField !== null}
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!labelDraft.trim() || pendingField !== null}
                      onClick={addLabel}
                    >
                      Add
                    </Button>
                    {issue.labels.length > 0 ? (
                      <Button
                        size="xs"
                        variant="ghost-muted"
                        disabled={pendingField !== null}
                        onClick={() => void applyPatch("labels", { labels: [] })}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </section>
              </main>

              <aside className="space-y-3">
                <section className="space-y-3 rounded-xl border border-border/60 bg-card/25 p-3">
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    Status
                    <Select
                      value={issue.status}
                      onValueChange={(value) =>
                        value && void applyPatch("status", { status: value as IssueStatus })
                      }
                      disabled={pendingField !== null}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{statusPresentation.label}</SelectValue>
                      </SelectTrigger>
                      <SelectPopup align="end" alignItemWithTrigger={false}>
                        {ISSUE_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {ISSUE_STATUS_PRESENTATION[status].label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </label>
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    Severity
                    <Select
                      value={issue.severity || null}
                      onValueChange={(value) =>
                        value && void applyPatch("severity", { severity: value as IssueSeverity })
                      }
                      disabled={pendingField !== null}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{issueSeverityLabel(issue.severity)}</SelectValue>
                      </SelectTrigger>
                      <SelectPopup align="end" alignItemWithTrigger={false}>
                        {ISSUE_SEVERITIES.map((severity) => (
                          <SelectItem key={severity} value={severity}>
                            {ISSUE_SEVERITY_PRESENTATION[severity].label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </label>
                  <label className="block space-y-1.5 text-xs text-muted-foreground">
                    Assignee
                    <Select
                      value={issue.assignedToId}
                      onValueChange={(value) =>
                        void applyPatch("assignee", { assignedToId: value })
                      }
                      disabled={pendingField !== null}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          <AssigneeLabel assignee={selectedAssignee} />
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup align="end" alignItemWithTrigger={false} className="min-w-60">
                        <SelectItem value={null}>Unassigned</SelectItem>
                        {assignees.map((assignee) => (
                          <SelectItem key={assignee.id} value={assignee.id}>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate">{assignee.email}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {assignee.role}
                                {assignee.pending ? " · pending" : ""}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </label>
                </section>
                <section className="space-y-2 rounded-xl border border-border/60 bg-card/25 p-3 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Clock3Icon className="size-3.5" /> Created {formatDate(issue.createdAt)}
                  </p>
                  <p className="flex items-center gap-2">
                    <RefreshCwIcon className="size-3.5" /> Updated {formatDate(issue.updatedAt)}
                  </p>
                  <p>{detailQuery.data?.mapping.pulseProjectName}</p>
                </section>
              </aside>
            </div>
          ) : null}

          {tab === "evidence" ? (
            reportsQuery.isPending && !reportsQuery.data ? (
              <div className="flex justify-center py-14 text-muted-foreground">
                <LoaderCircleIcon className="size-5 animate-spin" />
              </div>
            ) : reportsQuery.error ? (
              <Alert variant="error">
                <CircleAlertIcon />
                <AlertTitle>Reports unavailable</AlertTitle>
                <AlertDescription>{reportsQuery.error}</AlertDescription>
              </Alert>
            ) : (reportsQuery.data?.reports.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <FileWarningIcon className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No reports linked</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Evidence appears here after a Pulse Report is attached to this Issue.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 @xl/issue-detail:grid-cols-[12rem_minmax(0,1fr)]">
                <aside className="space-y-1">
                  {reportsQuery.data?.reports.map((report) => (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedReportId(report.id)}
                      className={cn(
                        "w-full rounded-lg px-2.5 py-2 text-left text-xs hover:bg-accent/60",
                        report.id === selectedReportId && "bg-accent text-foreground",
                      )}
                    >
                      <span className="line-clamp-2 font-medium">{report.title}</span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {formatDate(report.createdAt)}
                      </span>
                    </button>
                  ))}
                </aside>
                <main className="min-w-0">
                  {reportDetailQuery.isPending && !reportDetailQuery.data ? (
                    <div className="flex justify-center py-14 text-muted-foreground">
                      <LoaderCircleIcon className="size-5 animate-spin" />
                    </div>
                  ) : reportDetailQuery.data ? (
                    <IssueEvidence report={reportDetailQuery.data} />
                  ) : (
                    <Alert variant="error">
                      <CircleAlertIcon />
                      <AlertDescription>
                        {reportDetailQuery.error ?? "This report could not be loaded."}
                      </AlertDescription>
                    </Alert>
                  )}
                </main>
              </div>
            )
          ) : null}

          {tab === "activity" ? (
            activityQuery.isPending && !activityQuery.data ? (
              <div className="flex justify-center py-14 text-muted-foreground">
                <LoaderCircleIcon className="size-5 animate-spin" />
              </div>
            ) : activityQuery.error ? (
              <Alert variant="error">
                <CircleAlertIcon />
                <AlertDescription>{activityQuery.error}</AlertDescription>
              </Alert>
            ) : (
              <div className="mx-auto max-w-3xl space-y-1">
                {(activityQuery.data?.activity ?? []).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/25"
                  >
                    <div className="mt-1 size-2 shrink-0 rounded-full bg-orange-500/70" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{entry.actor?.email ?? "Pulse"}</span>{" "}
                        <span className="text-muted-foreground">{activityLabel(entry)}</span>
                      </p>
                      {entry.payload !== null ? (
                        <pre className="mt-1 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
                          {compactUnknown(entry.payload)}
                        </pre>
                      ) : null}
                    </div>
                    <time className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDate(entry.createdAt)}
                    </time>
                  </div>
                ))}
                {(activityQuery.data?.activity.length ?? 0) === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No activity yet.
                  </p>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
