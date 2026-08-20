import { CircleDotIcon, InboxIcon, UserRoundIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import type { EnvironmentIssueEntry } from "~/state/issues";
import { cn } from "~/lib/utils";

import {
  ISSUE_SEVERITY_PRESENTATION,
  ISSUE_STATUS_PRESENTATION,
  issueSeverityLabel,
} from "./issuePresentation";

export function IssueList({
  entries,
  selectedKey,
  environmentLabel,
  projectLabel,
  onSelect,
}: {
  entries: readonly EnvironmentIssueEntry[];
  selectedKey: string | null;
  environmentLabel: (entry: EnvironmentIssueEntry) => string;
  projectLabel: (entry: EnvironmentIssueEntry) => string;
  onSelect: (entry: EnvironmentIssueEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
          <InboxIcon className="size-4 text-muted-foreground" />
        </span>
        <h2 className="mt-3 text-sm font-medium">No Issues match this view</h2>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          Try a different status, severity, assignee, project, or search term.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/45">
      {entries.map((entry) => {
        const issue = entry.issue;
        const key = `${entry.environmentId}:${entry.projectId}:${issue.id}`;
        const selected = selectedKey === key;
        const status = ISSUE_STATUS_PRESENTATION[issue.status];
        const severity = issue.severity ? ISSUE_SEVERITY_PRESENTATION[issue.severity] : null;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(entry)}
            className={cn(
              "group flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/35",
              selected && "bg-accent/60",
            )}
          >
            <CircleDotIcon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                issue.status === "resolved"
                  ? "text-emerald-500"
                  : issue.status === "wont_fix"
                    ? "text-muted-foreground"
                    : "text-orange-500",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium tracking-[-0.005em]">
                  {issue.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {issue.ref}
                </span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge size="sm" variant={status.tone}>
                  {status.label}
                </Badge>
                <Badge
                  size="sm"
                  variant="outline"
                  className={severity?.className ?? "text-muted-foreground"}
                >
                  {issueSeverityLabel(issue.severity)}
                </Badge>
                {issue.assignedTo?.email ? (
                  <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <UserRoundIcon className="size-2.5" />
                    <span className="max-w-36 truncate">{issue.assignedTo.email}</span>
                  </span>
                ) : null}
                {issue.reportCount ? (
                  <span className="text-[10px] text-muted-foreground">
                    {issue.reportCount} {issue.reportCount === 1 ? "report" : "reports"}
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 block truncate text-[10px] text-muted-foreground/80">
                {projectLabel(entry)} · {environmentLabel(entry)} · Updated{" "}
                {new Date(issue.updatedAt).toLocaleDateString()}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
