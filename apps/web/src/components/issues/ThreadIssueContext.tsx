import type { EnvironmentId, IssueId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { CircleDotIcon, Link2Icon, LoaderCircleIcon } from "lucide-react";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { issueEnvironment } from "~/state/issues";
import { useEnvironmentQuery } from "~/state/query";
import { useRightPanelStore } from "~/rightPanelStore";

import { ISSUE_SEVERITY_PRESENTATION, ISSUE_STATUS_PRESENTATION } from "./issuePresentation";

export function ThreadIssueContext({
  target,
  threadRef,
  serverThread,
  issuesAvailable,
}: {
  target: ScopedThreadRef | DraftId;
  threadRef: ScopedThreadRef;
  serverThread: boolean;
  issuesAvailable: boolean;
}) {
  const pendingContext = useComposerDraftStore(
    (state) => state.getComposerDraft(target)?.issueContext ?? null,
  );
  const forThreadQuery = useEnvironmentQuery(
    serverThread && issuesAvailable
      ? issueEnvironment.forThread({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId },
        })
      : null,
  );
  const link = forThreadQuery.data?.link ?? null;
  const detailQuery = useEnvironmentQuery(
    link
      ? issueEnvironment.detail({
          environmentId: threadRef.environmentId,
          input: { projectId: link.projectId, issueId: link.issueId },
        })
      : null,
  );
  const issue = detailQuery.data?.issue ?? null;
  const context = issue
    ? {
        environmentId: threadRef.environmentId,
        projectId: link!.projectId,
        pulseProjectId: issue.pulseProjectId,
        issueId: issue.id,
        ref: issue.ref,
        title: issue.title,
        status: issue.status,
        severity: issue.severity,
      }
    : pendingContext;

  if (!context) {
    if (serverThread && issuesAvailable && forThreadQuery.isPending) {
      return (
        <div className="mx-auto mb-1 flex max-w-3xl items-center gap-1.5 px-2 text-[10px] text-muted-foreground">
          <LoaderCircleIcon className="size-3 animate-spin" /> Checking Issue link…
        </div>
      );
    }
    return null;
  }

  const status = ISSUE_STATUS_PRESENTATION[context.status];
  const severity = context.severity ? ISSUE_SEVERITY_PRESENTATION[context.severity] : null;
  return (
    <div className="mx-auto mb-1 flex w-full max-w-3xl items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/5 px-2.5 py-1.5 text-xs shadow-sm">
      <CircleDotIcon className="size-3.5 shrink-0 text-orange-500" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
        onClick={() =>
          useRightPanelStore.getState().openIssue(threadRef, {
            environmentId: context.environmentId as EnvironmentId,
            projectId: context.projectId as ProjectId,
            pulseProjectId: context.pulseProjectId,
            issueId: context.issueId as IssueId,
          })
        }
      >
        {context.ref} · {context.title}
      </button>
      <Badge size="sm" variant={status.tone}>
        {status.label}
      </Badge>
      {severity ? (
        <Badge size="sm" variant="outline" className={severity.className}>
          {severity.label}
        </Badge>
      ) : null}
      <Button
        size="icon-micro"
        variant="ghost-muted"
        aria-label="Open linked Issue"
        onClick={() =>
          useRightPanelStore.getState().openIssue(threadRef, {
            environmentId: context.environmentId as EnvironmentId,
            projectId: context.projectId as ProjectId,
            pulseProjectId: context.pulseProjectId,
            issueId: context.issueId as IssueId,
          })
        }
      >
        <Link2Icon />
      </Button>
    </div>
  );
}
