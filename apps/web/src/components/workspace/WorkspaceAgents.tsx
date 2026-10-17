import { useContext, useLayoutEffect, useRef, useState } from "react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { type WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { useProject, useThreadShells } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { linkSourceText } from "./mail/linkedItems";
import { Button } from "../ui/button";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { linkErrorText, useMailLinks } from "./mail/useMailLinks";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { WorkspaceAgentsView } from "./WorkspaceAgentsView";
import { WorkspaceItemActions } from "./WorkspaceItemActions";
import { WorkspaceLinkPicker } from "./WorkspaceToolsPanel";

export type WorkspaceAgentsProps = WorkspaceResourceBodyProps & { readonly projectTitle?: string };

function agentState(thread: EnvironmentThreadShell | undefined, connected: boolean) {
  if (!connected || !thread) return { label: "Status unavailable", active: false };
  if (thread.hasPendingApprovals || thread.hasPendingUserInput)
    return { label: "Waiting for your input", active: false };
  const status = thread.runtime?.status ?? thread.latestRun?.status;
  switch (status) {
    case "waiting":
      return { label: "Waiting for your input", active: false };
    case "running":
      return { label: "Working", active: true };
    case "queued":
      return { label: "Queued", active: true };
    case "starting":
    case "preparing":
      return { label: "Starting", active: true };
    case "failed":
      return { label: "Last run failed", active: false };
    case "cancelled":
    case "interrupted":
    case "rolled_back":
      return { label: "Not running", active: false };
    case "idle":
    case "completed":
      return { label: "Ready for your next instruction", active: false };
    default:
      return { label: "Status unavailable", active: false };
  }
}
function agentInitials(title: string) {
  const words = title.trim().split(/\s+/u);
  return (
    (Array.from(words[0] ?? "")[0] ?? "?").toLocaleUpperCase() +
    (Array.from(words[1] ?? "")[0] ?? "").toLocaleLowerCase()
  );
}

/** Only confirmed project links assign agents; project ownership grants nothing. */
export function WorkspaceAgents(props: WorkspaceAgentsProps) {
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  if (hidden) return null;
  return <ProjectAgents key={`${props.environmentId}:${props.projectId}`} {...props} />;
}
function ProjectAgents({
  environmentId,
  projectId,
  projectTitle: suppliedTitle,
  onOpen,
}: WorkspaceAgentsProps) {
  const project = useProject({ environmentId, projectId });
  const projectTitle = suppliedTitle ?? project?.title ?? "Unavailable project";
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const capability = useMailCapabilities(environmentId);
  const available = capability.ready && capability.workspaceLinks;
  const canOperate = useWorkspaceCanOperate(environmentId);
  const canAssign = canOperate && connected && available;
  const query = useEnvironmentQuery(
    available
      ? workspaceLinks.list({ environmentId, input: { item: { type: "project", projectId } } })
      : null,
  );
  const threads = useThreadShells().filter((thread) => thread.environmentId === environmentId);
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const { linkItem, unlink } = useMailLinks(environmentId);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unassigning, setUnassigning] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const permitted = useRef(canAssign);
  useLayoutEffect(() => {
    permitted.current = canAssign;
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const projectEndpoint: WorkspaceLinkEndpoint = {
    ref: { type: "project", projectId },
    title: projectTitle,
  };
  const assignments = available
    ? (query.data?.linked ?? []).filter(
        (view) => view.status === "confirmed" && view.item.ref.type === "thread",
      )
    : [];
  const assignedIds = new Set(
    assignments.flatMap((view) =>
      view.item.ref.type === "thread" ? [view.item.ref.threadId] : [],
    ),
  );
  const missingActive = [...assignedIds].some((id) => !byId.has(id));
  const archived = useArchivedThreadSnapshots(missingActive ? [environmentId] : []);
  const archivedById = new Map(
    (
      archived.snapshots.find((entry) => entry.environmentId === environmentId)?.snapshot.threads ??
      []
    ).map((thread) => [thread.id, thread]),
  );
  const rows = assignments.map((view) => {
    const id = view.item.ref.type === "thread" ? view.item.ref.threadId : null;
    const thread = id ? byId.get(id) : undefined;
    const archivedThread = id && !thread ? archivedById.get(id) : undefined;
    const title =
      thread?.title ||
      archivedThread?.title ||
      view.item.title?.trim() ||
      "Unavailable conversation";
    const state =
      connected && archivedThread
        ? { label: "Archived", active: false }
        : agentState(thread, connected);
    return {
      key: view.id,
      title,
      initials: agentInitials(title),
      status: state.label,
      active: state.active,
      ...(!connected || (!thread && !archivedThread)
        ? {
            unavailableReason: !connected
              ? "Reconnect to open or change this assignment."
              : archived.isLoading
                ? "Checking archived conversations..."
                : archived.error
                  ? "Archived conversations could not be checked. Reopen the panel to retry."
                  : "This conversation is unavailable. You can remove its project assignment.",
          }
        : {}),
    };
  });
  const candidates = picking
    ? threads
        .filter(
          (thread) =>
            !assignedIds.has(thread.id) && thread.lineage.relationshipToParent !== "subagent",
        )
        .filter((thread) => thread.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
        .slice(0, 50)
        .map((thread): WorkspaceLinkEndpoint => ({
          ref: { type: "thread", threadId: thread.id },
          title: thread.title,
        }))
    : [];
  const run = async (
    command: () => Promise<void>,
    closePicker = false,
    unassignKey: string | null = null,
  ) => {
    if (!mounted.current || !permitted.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    setUnassigning(unassignKey);
    setError(null);
    try {
      await command();
      if (mounted.current && closePicker) setPicking(false);
    } catch (cause) {
      if (mounted.current) setError(linkErrorText(cause));
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        setUnassigning(null);
      }
    }
  };
  const unavailable = !capability.ready
    ? "Checking project agent support..."
    : !capability.workspaceLinks
      ? "Project links are unavailable on this server."
      : !connected
        ? "Reconnect to manage project agents."
        : !canOperate
          ? "Permission to operate this environment is required to change project agents."
          : null;
  return (
    <WorkspaceAgentsView
      projectTitle={projectTitle}
      rows={rows}
      canAssign={canAssign}
      busy={busy}
      unassigning={unassigning}
      disabledReason={unavailable}
      empty={available && Boolean(query.data) && rows.length === 0}
      notice={
        <>
          {unavailable ? (
            <p role="status" className="text-muted-foreground">
              {unavailable}
            </p>
          ) : null}
          {query.error || error ? (
            <p role="alert" className="text-destructive">
              {error ?? query.error}
            </p>
          ) : null}
          {available && !query.data && !query.error ? (
            <p role="status">Loading project agents...</p>
          ) : null}
          {query.data?.truncated && available ? (
            <p className="text-muted-foreground">Some project assignments are not shown.</p>
          ) : null}
        </>
      }
      onOpen={(key) => {
        const row = assignments.find((view) => view.id === key);
        if (
          row?.item.ref.type === "thread" &&
          connected &&
          (byId.has(row.item.ref.threadId) || archivedById.has(row.item.ref.threadId))
        )
          onOpen(row.item.ref);
      }}
      onAssign={() => {
        if (canAssign) {
          setPicking(true);
          setFilter("");
          setError(null);
        }
      }}
      onUnassign={(key) => {
        const assignment = assignments.find((view) => view.id === key);
        if (assignment) void run(() => unlink(assignment.id), false, key);
      }}
      picker={
        picking ? (
          <div role="region" aria-label="Link existing thread" className="mb-4 space-y-2">
            <WorkspaceLinkPicker
              candidates={candidates}
              filter={filter}
              onFilterChange={setFilter}
              busy={busy || !canAssign}
              placeholder="Find a thread"
              threadOnly
              empty="No matching threads."
              onChoose={(endpoint) => {
                void run(() => linkItem(projectEndpoint, endpoint), true);
              }}
            />
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => setPicking(false)}>
              Cancel
            </Button>
          </div>
        ) : null
      }
      renderRowActions={(key) => {
        const assignment = assignments.find((view) => view.id === key);
        if (!assignment) return null;
        const row = rows.find((row) => row.key === key);
        return (
          <>
            <p className="max-w-56 px-1.75 text-muted-foreground">
              {linkSourceText(assignment.source)}
            </p>
            {canAssign && row && !row.unavailableReason ? (
              <WorkspaceItemActions
                environmentId={environmentId}
                item={{ ...assignment.item, title: row.title }}
                layout="menu"
              />
            ) : null}
          </>
        );
      }}
      projectActions={
        canAssign ? (
          <WorkspaceItemActions
            environmentId={environmentId}
            item={projectEndpoint}
            onlyStartThread
            layout="menu"
          />
        ) : null
      }
    />
  );
}
