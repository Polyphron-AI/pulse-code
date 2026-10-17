import { useContext, useLayoutEffect, useRef, useState } from "react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { type WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { useProjects, useThreadShells } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
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
  if (!connected || !thread) return "Status unavailable";
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return "Waiting for your input";
  const status = thread.runtime?.status ?? thread.latestRun?.status;
  if (status === "waiting") return "Waiting for your input";
  if (status === "running") return "Working";
  if (status === "queued") return "Queued";
  if (status === "starting" || status === "preparing") return "Starting";
  if (status === "failed") return "Last run failed";
  if (status === "cancelled" || status === "interrupted" || status === "rolled_back")
    return "Not running";
  return status === "idle" || status === "completed"
    ? "Ready for your next instruction"
    : "Status unavailable";
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
  const projects = useProjects();
  const projectTitle =
    suppliedTitle ??
    projects.find((project) => project.environmentId === environmentId && project.id === projectId)
      ?.title ??
    "Unavailable project";
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
  const rows = assignments.map((view) => {
    const thread = view.item.ref.type === "thread" ? byId.get(view.item.ref.threadId) : undefined;
    const title = thread?.title || view.item.title?.trim() || "Unavailable conversation";
    const status = agentState(thread, connected);
    return {
      key: view.id,
      title,
      initials: agentInitials(title),
      status,
      active: ["Working", "Queued", "Starting"].includes(status),
      ...(!thread || !connected
        ? {
            unavailableReason: !connected
              ? "Reconnect to open this conversation."
              : "This conversation is unavailable. You can remove its assignment.",
          }
        : {}),
    };
  });
  const candidates = threads
    .filter(
      (thread) =>
        !assignments.some(
          (view) => view.item.ref.type === "thread" && view.item.ref.threadId === thread.id,
        ),
    )
    .map((thread): WorkspaceLinkEndpoint => ({
      ref: { type: "thread", threadId: thread.id },
      title: thread.title,
    }))
    .filter((endpoint) => endpoint.title?.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
    .slice(0, 50);
  const run = async (command: () => Promise<void>, closePicker = false) => {
    if (!mounted.current || !permitted.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await command();
      if (mounted.current && closePicker) setPicking(false);
    } catch (cause) {
      if (mounted.current) setError(linkErrorText(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const unavailable = !capability.ready
    ? "Checking project agent support..."
    : !capability.workspaceLinks
      ? "Project agents are not available on this server yet."
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
          {!unavailable && !query.data && !query.error ? (
            <p role="status">Loading project agents...</p>
          ) : null}
          {!unavailable && query.data && rows.length === 0 ? (
            <p className="text-muted-foreground">No agents assigned to this project.</p>
          ) : null}
          {query.data?.truncated && available ? (
            <p className="text-muted-foreground">Some project assignments are not shown.</p>
          ) : null}
        </>
      }
      onOpen={(key) => {
        const row = assignments.find((view) => view.id === key);
        if (row?.item.ref.type === "thread" && connected && byId.has(row.item.ref.threadId))
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
        if (assignment) void run(() => unlink(assignment.id));
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
