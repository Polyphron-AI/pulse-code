import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { visibleThreadPullRequests } from "@t3tools/shared/threadPullRequests";
import { useState } from "react";
import { useThreadShell, useProjects } from "../../state/entities";
import { usePullRequestLinking } from "../../hooks/usePullRequestLinking";
import { useRightPanelStore } from "../../rightPanelStore";
import { Button } from "../ui/button";
import { ThreadDetailsPrRow } from "../chat/ThreadDetailsPrRow";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { LinkedSection } from "./mail/LinkedSection";
import { WorkspaceItemActions } from "./WorkspaceItemActions";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";

/** Existing PR links keep their own operations and records inside the shared Linked panel. */
type ThreadLinkProps = { environmentId: EnvironmentId; threadId: ThreadId };
export function ThreadWorkspaceLinks(props: ThreadLinkProps) {
  return useMailCapabilities(props.environmentId).workspaceLinks ? (
    <AvailableThreadWorkspaceLinks {...props} />
  ) : null;
}
function AvailableThreadWorkspaceLinks({ environmentId, threadId }: ThreadLinkProps) {
  const ref = scopeThreadRef(environmentId, threadId);
  const thread = useThreadShell(ref);
  const project =
    useProjects().find(
      (candidate) =>
        candidate.environmentId === environmentId && candidate.id === thread?.projectId,
    ) ?? null;
  const open = useWorkspaceItemOpener(environmentId);
  const prs = visibleThreadPullRequests(thread?.pullRequests ?? []);
  const legacy = thread?.linkedPullRequest;
  const entries = [
    ...prs.map((link) => ({
      url: link.url,
      number: link.number,
      label: `#${link.number}${link.snapshot ? `: ${link.snapshot.title}` : ""}`,
      reference: link,
    })),
    ...(prs.length === 0 && legacy
      ? [{ url: legacy.url, number: legacy.number, label: `#${legacy.number}` }]
      : []),
  ];
  const linking = usePullRequestLinking(environmentId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <LinkedSection
        key={threadId}
        environmentId={environmentId}
        item={{ type: "thread", threadId }}
        title={thread?.title ?? "Thread"}
        onOpen={open}
        nativeLinkedUrls={new Set(entries.map((entry) => entry.url))}
        additionalLinks={
          entries.length === 0 ? null : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <div key={entry.url}>
                  <ThreadDetailsPrRow
                    environmentId={environmentId}
                    pr={null}
                    number={entry.number}
                    reference={"reference" in entry ? entry.reference : null}
                    status={null}
                    project={project}
                    label={entry.label}
                    openAriaLabel={entry.url}
                    onOpen={() => useRightPanelStore.getState().open(ref, "pull-requests")}
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      setError(null);
                      void linking
                        .changeLink(ref, entry.url, false)
                        .catch((cause) =>
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not unlink this pull request.",
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    Unlink pull request
                  </Button>
                </div>
              ))}
              {error !== null ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          )
        }
      />
      <WorkspaceItemActions
        shortcuts
        confirmed={entries.map((entry) => ({
          ref: { type: "url", url: entry.url },
          title: entry.label,
        }))}
        environmentId={environmentId}
        item={{ ref: { type: "thread", threadId }, title: thread?.title ?? "Thread" }}
      />
    </div>
  );
}
