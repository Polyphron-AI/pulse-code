import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  Issue,
  IssueRef,
  ProjectId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  Link2Icon,
  LoaderCircleIcon,
  MessageSquareCodeIcon,
  PlayIcon,
  UnlinkIcon,
} from "lucide-react";
import { useState } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { issueEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";

export function buildIssueFixPrompt(issue: Issue): string {
  const reports = issue.reportCount
    ? `${issue.reportCount} linked ${issue.reportCount === 1 ? "Report" : "Reports"}`
    : "linked Report evidence";
  return [
    `Fix Pulse Issue ${issue.ref}: ${issue.title}`,
    "",
    `Status: ${issue.status.replaceAll("_", " ")}`,
    `Severity: ${issue.severity || "unspecified"}`,
    issue.description ? `Summary: ${issue.description}` : null,
    "",
    `Review the ${reports} in the native Issue panel before changing code. Reproduce the problem, identify the root cause, implement the smallest complete fix, and verify it with focused tests.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function IssueThreadActions({
  environmentId,
  projectId,
  issue,
  currentThreadRef,
  currentProjectId,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  issue: Issue;
  currentThreadRef?: ScopedThreadRef;
  currentProjectId?: ProjectId;
}) {
  const navigate = useNavigate();
  const newThread = useNewThreadHandler();
  const reference: IssueRef = { projectId, issueId: issue.id };
  const linkQuery = useEnvironmentQuery(
    issueEnvironment.threadLink({ environmentId, input: reference }),
  );
  const setLink = useAtomCommand(issueEnvironment.setThreadLink, { reportFailure: false });
  const removeLink = useAtomCommand(issueEnvironment.removeThreadLink, { reportFailure: false });
  const [pending, setPending] = useState<"start" | "link" | "unlink" | null>(null);
  const linkedThread = linkQuery.data?.link ?? null;
  const canLinkCurrent =
    !linkedThread &&
    currentThreadRef?.environmentId === environmentId &&
    currentProjectId === projectId;

  const reportFailure = (
    title: string,
    result: { readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"] },
  ) => {
    const error = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "The Issue link could not be updated.",
    });
  };

  const startFix = async () => {
    if (pending) return;
    setPending("start");
    const opened = await newThread(scopeProjectRef(environmentId, projectId)).catch(() => null);
    setPending(null);
    if (!opened) {
      toastManager.add({ type: "error", title: "Could not open a fix thread" });
      return;
    }
    const store = useComposerDraftStore.getState();
    store.setPrompt(opened.draftId, buildIssueFixPrompt(issue));
    store.setIssueContext(opened.draftId, {
      environmentId,
      projectId,
      pulseProjectId: issue.pulseProjectId,
      issueId: issue.id,
      ref: issue.ref,
      title: issue.title,
      status: issue.status,
      severity: issue.severity,
    });
    toastManager.add({
      type: "success",
      title: "Fix thread ready",
      description: "Review the Issue-aware prompt, then send it to create and link the thread.",
    });
  };

  const linkCurrent = async () => {
    if (!currentThreadRef || pending) return;
    setPending("link");
    const result = await setLink({
      environmentId,
      input: { ...reference, threadId: currentThreadRef.threadId },
    });
    setPending(null);
    if (result._tag === "Failure") {
      reportFailure("Could not link this thread", result);
      return;
    }
    linkQuery.refresh();
  };

  const unlink = async () => {
    if (pending) return;
    setPending("unlink");
    const result = await removeLink({ environmentId, input: reference });
    setPending(null);
    if (result._tag === "Failure") {
      reportFailure("Could not unlink the fix thread", result);
      return;
    }
    linkQuery.refresh();
  };

  if (linkQuery.isPending && !linkQuery.data) {
    return (
      <Button size="xs" variant="outline" disabled>
        <LoaderCircleIcon className="animate-spin" /> Checking thread…
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {linkedThread ? (
        <>
          <Button
            size="xs"
            onClick={() =>
              void navigate({
                to: "/$environmentId/$threadId",
                params: { environmentId, threadId: linkedThread.threadId },
              })
            }
          >
            <PlayIcon /> Resume fix
          </Button>
          <Button
            size="xs"
            variant="ghost-muted"
            disabled={pending !== null}
            onClick={() => void unlink()}
          >
            {pending === "unlink" ? <LoaderCircleIcon className="animate-spin" /> : <UnlinkIcon />}
            Unlink
          </Button>
        </>
      ) : (
        <>
          <Button size="xs" disabled={pending !== null} onClick={() => void startFix()}>
            {pending === "start" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <MessageSquareCodeIcon />
            )}
            Start fix
          </Button>
          {canLinkCurrent ? (
            <Button
              size="xs"
              variant="outline"
              disabled={pending !== null}
              onClick={() => void linkCurrent()}
            >
              {pending === "link" ? <LoaderCircleIcon className="animate-spin" /> : <Link2Icon />}
              Link this thread
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
