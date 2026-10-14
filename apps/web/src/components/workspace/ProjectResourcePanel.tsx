import { useCallback, useEffect, useRef, useState } from "react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { ProjectOffice, ThreadId } from "@t3tools/contracts";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { Link } from "@tanstack/react-router";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { newThreadId } from "../../lib/utils";
import { NO_PROVIDER_MODEL_SELECTION } from "../../providerInstances";
import { isPreviewSupportedInRuntime } from "../../previewStateStore";
import { useProjects, useThreadShells } from "../../state/entities";
import { previewEnvironment } from "../../state/preview";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { openPreviewSession } from "../preview/openPreviewSession";
import { PreviewPanel } from "../preview/PreviewPanel";
import { PullRequestDetailPanel } from "../pullRequest/PullRequestDetailPanel";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface Props {
  project: EnvironmentProject;
  office: ProjectOffice;
  onSaveOffice: (office: ProjectOffice) => Promise<boolean>;
  targetUrl?: string | undefined;
  resource: "Browser" | "Agents" | "PR reviews";
}

export function ProjectResourcePanel(props: Props) {
  if (props.resource === "Browser") return <ProjectBrowser {...props} />;
  if (props.resource === "Agents") return <ProjectAgents {...props} />;
  return <ProjectReviews {...props} />;
}

function ProjectBrowser({ project, office, onSaveOffice, targetUrl }: Props) {
  const threads = useThreadShells();
  const settings = useEnvironmentSettings(project.environmentId);
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const existingThreadId = threads.find(
    (thread) =>
      thread.environmentId === project.environmentId && thread.id === office.browserThreadId,
  )?.id;
  const [createdThreadId, setCreatedThreadId] = useState<ThreadId>();
  const threadId = createdThreadId ?? existingThreadId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const openedTarget = useRef<string | undefined>(undefined);
  const created = useRef<ThreadId | undefined>(undefined);
  const supported = isPreviewSupportedInRuntime();
  const openBrowser = useCallback(
    async (url?: string) => {
      if (pending.current || !supported) return;
      pending.current = true;
      setBusy(true);
      setError(undefined);
      try {
        let destinationId = created.current ?? existingThreadId;
        if (!destinationId) {
          const nextId = newThreadId();
          const defaults = resolveProjectSettings(settings, project.id, project).settings;
          const result = await createThread({
            environmentId: project.environmentId,
            input: {
              threadId: nextId,
              projectId: project.id,
              title: "Project browser",
              modelSelection: defaults.defaultModelSelection ?? NO_PROVIDER_MODEL_SELECTION,
              runtimeMode: defaults.defaultRuntimeMode,
              interactionMode: "default",
              branch: null,
              worktreePath: null,
              createdAt: new Date().toISOString(),
            },
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
          created.current = nextId;
          destinationId = nextId;
        }
        if (office.browserThreadId !== destinationId) {
          const saved = await onSaveOffice({ ...office, browserThreadId: destinationId });
          if (!saved)
            throw new Error(
              "The browser was created, but its project connection could not be saved. Retry to reconnect this browser.",
            );
        }
        setCreatedThreadId(destinationId);
        if (url) {
          const result = await openPreviewSession({
            openPreview,
            threadRef: { environmentId: project.environmentId, threadId: destinationId },
            url,
          });
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        }
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The project browser could not be opened. Try again.",
        );
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [
      createThread,
      existingThreadId,
      office,
      onSaveOffice,
      openPreview,
      project,
      settings,
      supported,
    ],
  );
  useEffect(() => {
    if (!targetUrl || openedTarget.current === targetUrl || !supported || busy || pending.current)
      return;
    openedTarget.current = targetUrl;
    void openBrowser(targetUrl);
  }, [targetUrl, openBrowser, supported, busy]);
  if (!supported)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        The integrated browser is available in the Pulse desktop app.
      </p>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div role="alert" className="space-y-2 border-b border-border p-3 text-sm">
          <p>{error}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void openBrowser(targetUrl)}
          >
            Retry
          </Button>
        </div>
      )}
      {threadId ? (
        <PreviewPanel
          mode="embedded"
          threadRef={{ environmentId: project.environmentId, threadId }}
          visible
        />
      ) : (
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            Browse beside this project’s conversation. Opening the browser creates an empty project
            session without starting an agent.
          </p>
          <Button disabled={busy} onClick={() => void openBrowser(targetUrl)}>
            {busy ? "Opening browser…" : "Open project browser"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ProjectAgents({ project, office, onSaveOffice }: Props) {
  const threads = useThreadShells();
  const projects = useProjects();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const browserThreadIds = new Set(
    projects
      .filter((item) => item.environmentId === project.environmentId)
      .map((item) => item.office?.browserThreadId),
  );
  browserThreadIds.add(office.browserThreadId);
  const candidates = threads.filter(
    (thread) => thread.environmentId === project.environmentId && !browserThreadIds.has(thread.id),
  );
  const assigned = candidates.filter(
    (thread) => thread.projectId === project.id || office.agentThreadIds.includes(thread.id),
  );
  const available = candidates.filter(
    (thread) =>
      thread.projectId !== project.id &&
      !office.agentThreadIds.includes(thread.id) &&
      !thread.archivedAt,
  );
  async function save(threadId: ThreadId, remove = false) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const success = await onSaveOffice({
        ...office,
        agentThreadIds: remove
          ? office.agentThreadIds.filter((id) => id !== threadId)
          : [...office.agentThreadIds, threadId],
      });
      if (success) setSelected("");
      else setError("The agent assignment could not be saved. Try again.");
    } catch {
      setError("The agent assignment could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h3 className="text-sm font-semibold">Project agents</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Assigning an existing agent conversation gives this project a reference to it. Assignment
          does not start work or change its working folder.
        </p>
      </div>
      {assigned.map((thread) => (
        <article key={thread.id} className="space-y-2 rounded-lg border border-border p-3">
          <Link
            to="/$environmentId/$threadId"
            params={{ threadId: thread.id, environmentId: thread.environmentId }}
            className="block text-sm font-medium hover:underline"
          >
            {thread.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {thread.session?.providerName ?? "Agent not started"} ·{" "}
            {thread.session?.status ?? "No session"}
            {thread.hasPendingApprovals
              ? " · Approval needed"
              : thread.hasPendingUserInput
                ? " · Input needed"
                : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {projects.find(
              (item) => item.environmentId === thread.environmentId && item.id === thread.projectId,
            )?.title ?? "Source project"}
            {thread.projectId === project.id ? " · Project agent" : " · Assigned here"}
          </p>
          {thread.projectId !== project.id && (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => void save(thread.id, true)}
            >
              Unassign
            </Button>
          )}
        </article>
      ))}
      {office.agentThreadIds
        .filter((id) => !candidates.some((thread) => thread.id === id))
        .map((id) => (
          <div key={id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <span className="text-xs text-muted-foreground">Assigned conversation unavailable</span>
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void save(id, true)}>
              Unassign
            </Button>
          </div>
        ))}
      {!assigned.length && (
        <p className="text-sm text-muted-foreground">
          No agent conversations are assigned to this project yet. Start an agent from the Code
          workspace, or assign an existing one below.
        </p>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const thread = available.find((item) => item.id === selected);
          if (thread) void save(thread.id);
        }}
      >
        <label className="block text-xs font-medium" htmlFor="project-agent">
          Assign an existing agent
        </label>
        <select
          id="project-agent"
          className="w-full rounded-md border border-input bg-background p-2 text-sm"
          value={selected}
          disabled={busy}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Choose an agent conversation</option>
          {available.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {thread.title}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          type="submit"
          disabled={busy || !selected || office.agentThreadIds.length >= 100}
        >
          Assign to project
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ProjectReviews({ project, targetUrl }: Props) {
  const [url, setUrl] = useState(targetUrl ?? "");
  const [reference, setReference] = useState(() =>
    targetUrl ? parseChangeRequestUrl(targetUrl) : null,
  );
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!targetUrl) return;
    const parsed = parseChangeRequestUrl(targetUrl);
    setUrl(targetUrl);
    setReference(parsed);
    setError(parsed ? undefined : "Enter a supported pull request or merge request URL.");
  }, [targetUrl]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="shrink-0 space-y-2 border-b border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = parseChangeRequestUrl(url);
          setError(parsed ? undefined : "Enter a supported pull request or merge request URL.");
          if (parsed) setReference(parsed);
        }}
      >
        <label className="text-xs font-medium" htmlFor="project-review-url">
          PR review link
        </label>
        <div className="flex gap-2">
          <Input
            id="project-review-url"
            value={url}
            placeholder="https://github.com/team/repo/pull/42"
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button size="sm" type="submit">
            Open
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
      {reference ? (
        <PullRequestDetailPanel
          environmentId={project.environmentId}
          reference={{
            projectId: project.id,
            repository: reference.repository,
            number: reference.number,
            host: reference.host,
          }}
          shortcutsEnabled={false}
          getShortcutContext={() => ({
            terminalFocus: false,
            terminalOpen: false,
            previewFocus: false,
            previewOpen: false,
            isWeb: !window.desktopBridge,
            isDesktop: !!window.desktopBridge,
          })}
        />
      ) : (
        <p className="p-5 text-sm text-muted-foreground">
          Open a shared PR link to inspect its changes, comments, and review status using this
          environment’s source-control connection.
        </p>
      )}
    </div>
  );
}
