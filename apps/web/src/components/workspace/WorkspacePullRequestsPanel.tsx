import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadPullRequestLinkMode } from "@t3tools/client-runtime/thread-pull-request-compatibility";
import {
  collectProjectPullRequests,
  type ProjectPullRequestProvenance,
} from "@t3tools/client-runtime/projectPullRequests";
import type {
  EnvironmentId,
  ProjectId,
  WorkspaceItemRef,
  WorkspaceLinkEndpoint,
  WorkspaceLinkList,
} from "@t3tools/contracts";
import { useContext, useState } from "react";
import {
  resolvePullRequestPreviewTarget,
  useOpenChangeRequestLink,
  parseChangeRequestUrl,
} from "../../lib/openPullRequestLink";
import { usePullRequestLinking } from "../../hooks/usePullRequestLinking";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useServerConfigs,
  useThreadShells,
} from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useMailLinks, linkErrorText } from "./mail/useMailLinks";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { WorkspacePullRequestsPanelView } from "./WorkspacePullRequestsPanelView";

export interface WorkspacePullRequestsPanelProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
  readonly selectedItem?: WorkspaceLinkEndpoint | null;
  readonly request?: WorkspaceItemRef | null;
}

/** The scope key prevents state from a previous environment/project entering new actions. */
export function WorkspacePullRequestsPanel(props: WorkspacePullRequestsPanelProps) {
  return <ProjectPullRequests key={`${props.environmentId}:${props.projectId}`} {...props} />;
}

function ProjectPullRequests({
  environmentId,
  projectId,
  selectedItem,
  request,
}: WorkspacePullRequestsPanelProps) {
  const shells = useThreadShells();
  const threadsComplete = useAllEnvironmentShellsBootstrapped();
  const projects = useProjects();
  const configs = useServerConfigs();
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  const capability = useMailCapabilities(environmentId);
  const available = connected && !hidden && capability.workspaceLinks && projectId !== null;
  const query = useEnvironmentQuery(
    available
      ? workspaceLinks.list({ environmentId, input: { item: { type: "project", projectId } } })
      : null,
  );
  const linking = usePullRequestLinking(environmentId);
  const links = useMailLinks(environmentId);
  const open = useOpenChangeRequestLink();
  const canOperate = useWorkspaceCanOperate(environmentId) && available;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retained, setRetained] = useState<Pick<WorkspaceLinkList, "linked" | "truncated"> | null>(
    null,
  );
  if (
    query.data !== null &&
    (query.data.linked !== retained?.linked || query.data.truncated !== retained.truncated)
  ) {
    setRetained({ linked: query.data.linked, truncated: query.data.truncated });
  }
  const data = query.data ?? retained;
  const projectLinks = data?.linked ?? [];
  const collection =
    projectId === null
      ? { entries: [], incomplete: false }
      : collectProjectPullRequests({
          environmentId,
          projectId,
          threads: shells,
          projectLinks,
          threadsComplete: threadsComplete && connected,
          linksComplete: available && data !== null && !query.error && !data.truncated,
          linkMode: threadPullRequestLinkMode(configs.get(environmentId)?.environment.capabilities),
        });
  const unavailableSources = projectLinks.flatMap((link) => {
    const ref = link.item.ref;
    return link.status === "confirmed" &&
      ref.type === "thread" &&
      !shells.some(
        (thread) =>
          thread.environmentId === environmentId && thread.id === ref.threadId && !thread.deletedAt,
      )
      ? [{ id: link.id, title: link.item.title ?? `Thread ${ref.threadId}` }]
      : [];
  });
  const perform = async (action: () => Promise<void>) => {
    if (!canOperate || busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(linkErrorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const unlink = (edge: ProjectPullRequestProvenance) =>
    void perform(() =>
      edge.type === "thread"
        ? linking.changeLink(scopeThreadRef(environmentId, edge.threadId), edge.url, false)
        : links.unlink(edge.linkId),
    );
  const initialRef = request ?? selectedItem?.ref;
  const supportsPreview =
    connected &&
    !query.error &&
    configs.get(environmentId)?.environment.capabilities.pullRequests === true;
  return (
    <WorkspacePullRequestsPanelView
      chosen={projectId !== null}
      {...collection}
      unavailableSources={unavailableSources}
      pending={query.isPending}
      error={
        error ??
        query.error ??
        (projectId !== null && !connected
          ? "This environment is disconnected. Its loaded links have been kept."
          : projectId !== null && capability.ready && !capability.workspaceLinks
            ? "Project links need a newer server."
            : null)
      }
      busy={busy}
      canOperate={canOperate}
      {...(initialRef?.type === "url" ? { initialUrl: initialRef.url } : {})}
      canOpenInCode={(entry) =>
        resolvePullRequestPreviewTarget({
          environmentId,
          projects,
          pullRequestsEnabled: supportsPreview,
          url: entry.url,
        }) !== null
      }
      onOpenInCode={(event, entry) => {
        if (supportsPreview) open(event, entry.url, undefined, environmentId);
      }}
      onUnlink={unlink}
      onLink={(value) => {
        const url = value.trim();
        if (projectId === null || parseChangeRequestUrl(url) === null) {
          setError("Enter a supported pull request URL.");
          return;
        }
        void perform(() =>
          links.linkItem({ ref: { type: "project", projectId } }, { ref: { type: "url", url } }),
        );
      }}
      onRetry={() => {
        setError(null);
        if (available) query.refresh();
      }}
    />
  );
}
