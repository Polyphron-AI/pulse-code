import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/unstable/reactivity";
import { useLayoutEffect } from "react";
import type { PullRequestSummary } from "@t3tools/contracts";
import { appAtomRegistry } from "./atom-registry";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  createLinkedPullRequestSummaryAtomFamily,
  createLinkedPullRequestDetailAtomFamily,
  newestPullRequestSummary,
  pullRequestDetailToVcsStatus,
} from "@t3tools/client-runtime/state/pull-requests";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuery } from "./query";
import { presentThreadPr, type ThreadPrPresentation } from "./thread-pr-presentation";
import { vcsEnvironment } from "./vcs";

const linkedPullRequestDetailAtom = createLinkedPullRequestDetailAtomFamily(connectionAtomRuntime);
const linkedPullRequestSummaryAtom =
  createLinkedPullRequestSummaryAtomFamily(connectionAtomRuntime);
const observedSummaryAtom = Atom.family((key: string) =>
  Atom.make<PullRequestSummary | null>(null).pipe(
    Atom.setIdleTTL(5 * 60_000),
    Atom.withLabel(`mobile:pull-request-summary:${key}`),
  ),
);

export {
  presentThreadPr,
  type ThreadPr,
  type ThreadPrPresentation,
} from "./thread-pr-presentation";

/**
 * Live PR status for a thread's branch. Subscriptions are deduplicated per
 * (environmentId, cwd) by the atom family, so many rows on the same worktree
 * or project root share one stream — and virtualization means only visible
 * rows subscribe at all.
 */
export function useThreadPr(
  thread: EnvironmentThreadShell,
  projectCwd: string | null,
): ThreadPrPresentation | null {
  const cwd = thread.worktreePath ?? projectCwd;
  const reference = thread.linkedPullRequest ?? thread.branchPullRequest;
  const serverOwnsBranch = thread.branchPullRequest !== undefined;
  const gitStatus = useEnvironmentQuery(
    !serverOwnsBranch && reference == null && thread.branch !== null && cwd !== null
      ? vcsEnvironment.status({
          environmentId: thread.environmentId,
          input: { cwd },
        })
      : null,
  );
  const linkedPullRequest = useEnvironmentQuery(
    reference == null
      ? null
      : (serverOwnsBranch ? linkedPullRequestSummaryAtom : linkedPullRequestDetailAtom)({
          environmentId: thread.environmentId,
          input: {
            projectId: reference.projectId,
            repository: reference.repository,
            number: reference.number,
          },
        }),
  );

  const atom = observedSummaryAtom(
    reference == null
      ? "none"
      : JSON.stringify([
          thread.environmentId,
          reference.projectId,
          reference.repository.toLowerCase(),
          reference.number,
        ]),
  );
  const observed = useAtomValue(atom);
  const live = linkedPullRequest.data;
  useLayoutEffect(() => {
    if (reference == null || live === null) return;
    appAtomRegistry.modify(atom, (previous) => {
      const next = newestPullRequestSummary(previous, live);
      return next === previous ? [false, previous] : [true, next];
    });
  }, [atom, live, reference]);
  if (reference != null) {
    const detail = newestPullRequestSummary(live, observed);
    return detail === null
      ? null
      : presentThreadPr(pullRequestDetailToVcsStatus(detail), {
          kind: detail.provider,
          name: detail.provider,
          baseUrl: "",
        });
  }

  if (serverOwnsBranch) return null;
  const status = gitStatus.data;
  if (status === null || thread.branch === null || status.refName !== thread.branch) {
    return null;
  }
  if (!status.pr) {
    return null;
  }
  return presentThreadPr(status.pr, status.sourceControlProvider);
}
