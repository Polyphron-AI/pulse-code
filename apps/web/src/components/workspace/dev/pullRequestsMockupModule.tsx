import { ThreadId, type ThreadPullRequestLink, type WorkspaceLinkView } from "@t3tools/contracts";
import { collectProjectPullRequests } from "@t3tools/client-runtime/projectPullRequests";
import { WorkspacePullRequestsPanelView } from "../WorkspacePullRequestsPanelView";
import type { WorkspaceMockupSession } from "./workspaceMockupFixtures";

/** D23 proposal only. Commands record in memory and never mount live environment hooks. */
export function PullRequestsFixture({ session }: { readonly session: WorkspaceMockupSession }) {
  const state = session.pullRequestsState;
  const pr = (
    number: number,
    snapshot: ThreadPullRequestLink["snapshot"],
  ): ThreadPullRequestLink => ({
    host: "github.com",
    repository: "synkek/site",
    number,
    url: `https://github.com/synkek/site/pull/${number}`,
    source: "manual",
    linkedAt: "2026-10-13T07:00:00Z",
    snapshot,
    stack: null,
  });
  const snapshot = {
    state: "open" as const,
    title: "Refine the product pages",
    headBranch: "product-pages",
    baseBranch: "main",
    isDraft: false,
    updatedAt: null,
    syncedAt: "2026-10-13T07:00:00Z",
  };
  const direct: WorkspaceLinkView = {
    id: "wl_00000000-0000-0000-0000-000000000042",
    item: { ref: { type: "url", url: pr(42, null).url } },
    status: "confirmed",
    source: { type: "user" },
    updatedAt: "2026-10-13T07:00:00Z",
  };
  const populated =
    state !== "prs-empty" && state !== "prs-choose-project" && state !== "prs-error";
  const collection = collectProjectPullRequests({
    environmentId: session.environmentId,
    projectId: session.resourceProjectId,
    threadsComplete: state !== "prs-incomplete",
    linksComplete: true,
    linkMode: "multiple",
    projectLinks: populated ? [direct] : [],
    threads: populated
      ? [
          {
            environmentId: session.environmentId,
            projectId: session.resourceProjectId,
            id: ThreadId.make("fixture-design"),
            title: "Design review",
            pullRequests: [
              pr(42, snapshot),
              pr(43, { ...snapshot, title: "Publish launch assets", state: "merged" }),
              pr(45, { ...snapshot, title: "Retire the old landing page", state: "closed" }),
            ],
          },
          {
            environmentId: session.environmentId,
            projectId: session.resourceProjectId,
            id: ThreadId.make("fixture-build"),
            title: "Build product pages",
            pullRequests: [pr(42, snapshot), pr(44, null)],
          },
        ]
      : [],
  });
  return (
    <WorkspacePullRequestsPanelView
      chosen={state !== "prs-choose-project"}
      {...collection}
      unavailableSources={[]}
      pending={false}
      error={
        state === "prs-error"
          ? "This environment could not read project links. Its saved links have been kept."
          : null
      }
      busy={false}
      canOperate
      canOpenInCode={() => true}
      onOpenInCode={(_event, entry) => {
        void session.record("navigate", { type: "url", url: entry.url }, "Open in Code");
      }}
      onOpenOnHost={(event, entry) => {
        event.preventDefault();
        void session.record("navigate", { type: "url", url: entry.url }, "Open on host");
      }}
      onUnlink={(edge) => {
        void session.record(
          "unlink",
          undefined,
          edge.type === "thread" ? edge.threadId : edge.linkId,
        );
      }}
      onLink={(url) => {
        void session.record("link", { type: "url", url });
      }}
      onRetry={() => {
        void session.record("navigate", undefined, "Retry project pull requests");
      }}
    />
  );
}
