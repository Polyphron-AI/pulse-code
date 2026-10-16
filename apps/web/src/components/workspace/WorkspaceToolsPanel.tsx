import {
  normalizeLinkUrl,
  type EnvironmentId,
  type ProjectId,
  type WorkspaceLinkEndpoint,
  type WorkspaceItemRef,
  type WorkspaceLinkList,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useContext, useState, lazy, Suspense } from "react";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { workspaceLinks } from "../../state/workspaceLinks";
import { workspaceTools } from "../../state/workspaceTools";
import { previewEnvironment } from "../../state/preview";
import { useThreadPreviewState, isPreviewSupportedInRuntime } from "../../previewStateStore";
import { readLocalApi } from "../../localApi";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogPanel } from "../ui/dialog";
const PreviewPanel = lazy(() =>
  import("../preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);
import { openPreviewSession } from "../preview/openPreviewSession";
import { WorkspaceItemActions } from "./WorkspaceItemActions";
import { DriveFileAccess } from "./DriveFiles";
import { workspaceEndpointTitle } from "./mail/linkedItems";
import { useMailLinks } from "./mail/useMailLinks";
import { workspaceToolsError } from "./ProjectTasks";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import type { WorkspaceResourceScope } from "./workspaceResourceState";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { ProjectPickerView } from "./ProjectPickerView";
export function WorkspaceToolsPanel({
  environmentId,
  item,
  onOpen,
  linkedData,
  tool,
  scope,
  selectedItem,
}: {
  environmentId: EnvironmentId;
  item: WorkspaceLinkEndpoint;
  onOpen: (ref: WorkspaceItemRef) => void;
  linkedData?: WorkspaceLinkList;
  tool?: "browser" | "files" | "agents";
  scope?: WorkspaceResourceScope;
  selectedItem?: WorkspaceLinkEndpoint | null;
}) {
  const [choice, setChoice] = useState<{
    environmentId: EnvironmentId;
    projectId: ProjectId;
  } | null>(null);
  const ref = scope ? { type: "project" as const, projectId: scope.projectId } : item.ref;
  const target = selectedItem === undefined ? item : selectedItem;
  const query = useEnvironmentQuery(
    linkedData === undefined ? workspaceLinks.list({ environmentId, input: { item: ref } }) : null,
  );
  const links = linkedData === undefined ? query : { ...query, data: linkedData, error: null };
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const threads = useThreadShells().filter((thread) => thread.environmentId === environmentId);
  const threadTitles = new Map(threads.map((thread) => [thread.id, thread.title]));
  const task = useEnvironmentQuery(
    ref.type === "task" ? workspaceTools.task({ environmentId, input: { id: ref.taskId } }) : null,
  );
  const ids = new Set(
    (links.data?.linked ?? []).flatMap((view) =>
      view.item.ref.type === "project" ? [view.item.ref.projectId] : [],
    ),
  );
  if (ref.type === "project") ids.add(ref.projectId);
  if (task.data) ids.add(task.data.projectId);
  if (ref.type === "thread") {
    const owner = threads.find((thread) => thread.id === ref.threadId);
    if (owner) ids.add(owner.projectId);
  }
  const related = projects.filter((project) => ids.has(project.id));
  const candidates = related.length === 0 ? projects : related;
  const project = scope
    ? projects.find((project) => project.id === scope.projectId)
    : (candidates.find(
        (project) => choice?.environmentId === environmentId && project.id === choice.projectId,
      ) ?? (related.length === 1 ? related[0] : undefined));
  const files = links.data?.linked.filter((view) => view.item.ref.type === "file") ?? [];
  const agents = links.data?.linked.filter((view) => view.item.ref.type === "thread") ?? [];
  return (
    <div className="flex flex-col gap-3">
      {!tool || tool === "browser" ? (
        <section
          className="space-y-2 rounded-lg border border-border p-3"
          aria-label="Browser tool"
        >
          <h2 className="text-sm font-medium">Browser</h2>
          {!scope && candidates.length > 0 ? (
            <ProjectPickerView
              projects={candidates}
              selectedProjectId={project?.id ?? null}
              onChooseProject={(projectId) => {
                if (projectId !== null) setChoice({ environmentId, projectId });
              }}
            />
          ) : null}
          {project ? (
            <WorkspaceBrowser
              key={project.id}
              environmentId={environmentId}
              projectId={project.id}
              selectedItem={target}
              request={null}
              onOpen={onOpen}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {scope
                ? "This project is unavailable."
                : candidates.length === 0
                  ? "No projects available for Browser."
                  : "Choose the project whose browser you want to use."}
            </p>
          )}
        </section>
      ) : null}
      {!tool || tool === "files" ? (
        <section className="space-y-2 rounded-lg border border-border p-3" aria-label="Files tool">
          <h2 className="text-sm font-medium">Files</h2>
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {scope
                ? "No Drive files linked to this project."
                : "No Drive files linked to this item."}
            </p>
          ) : (
            <ul className="space-y-2">
              {files.map((view) => (
                <li key={view.id} className="text-sm">
                  <button
                    className="max-w-full truncate text-left hover:underline"
                    type="button"
                    onClick={() => onOpen(view.item.ref)}
                  >
                    {workspaceEndpointTitle(view.item)}
                  </button>
                  {view.item.ref.type === "file" ? (
                    <DriveFileAccess environmentId={environmentId} fileId={view.item.ref.fileId} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {!tool || tool === "agents" ? (
        <section className="space-y-2 rounded-lg border border-border p-3" aria-label="Agents tool">
          <h2 className="text-sm font-medium">Agents</h2>
          {agents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No threads linked to this item.</p>
          ) : (
            <ul className="space-y-1">
              {agents.map((view) => (
                <li key={view.id}>
                  <button
                    className="max-w-full truncate text-left text-sm hover:underline"
                    type="button"
                    onClick={() => onOpen(view.item.ref)}
                  >
                    {view.item.ref.type === "thread"
                      ? (threadTitles.get(view.item.ref.threadId) ??
                        workspaceEndpointTitle(view.item))
                      : workspaceEndpointTitle(view.item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {target ? (
            <WorkspaceItemActions environmentId={environmentId} item={target} onlyStartThread />
          ) : (
            <p className="text-xs text-muted-foreground">
              Select an item to start a linked thread.
            </p>
          )}
        </section>
      ) : null}
      {links.error ? (
        <p role="alert" className="text-xs text-destructive">
          {links.error}
        </p>
      ) : null}
    </div>
  );
}
export function WorkspaceProjectFiles(props: WorkspaceResourceBodyProps) {
  const capability = useMailCapabilities(props.environmentId);
  return capability.workspaceLinks ? (
    <WorkspaceToolsPanel
      {...props}
      scope={props}
      item={{ ref: { type: "project", projectId: props.projectId } }}
      tool="files"
    />
  ) : (
    <p>Project files are not available on this server yet.</p>
  );
}
export function WorkspaceProjectAgents(props: WorkspaceResourceBodyProps) {
  const capability = useMailCapabilities(props.environmentId);
  return capability.workspaceLinks ? (
    <WorkspaceToolsPanel
      {...props}
      scope={props}
      item={{ ref: { type: "project", projectId: props.projectId } }}
      tool="agents"
    />
  ) : (
    <p>Project agents are not available on this server yet.</p>
  );
}
export function WorkspaceBrowser({
  environmentId,
  projectId,
  selectedItem: item,
}: WorkspaceResourceBodyProps) {
  const config = useEnvironmentQuery(
    workspaceTools.config({ environmentId, input: { projectId } }),
  );
  const threads = useThreadShells();
  const browserThread = threads.find(
    (thread) =>
      thread.environmentId === environmentId &&
      thread.projectId === projectId &&
      thread.id === config.data?.browserThreadId,
  );
  const threadRef = browserThread ? scopeThreadRef(environmentId, browserThread.id) : null;
  const preview = useThreadPreviewState(threadRef);
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const { linkItem } = useMailLinks(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId);
  const [address, setAddress] = useState("");
  const [opened, setOpened] = useState(false);
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  if (hidden && opened) setOpened(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const desktop = isPreviewSupportedInRuntime();
  const status = preview.snapshot?.navStatus;
  const current = desktop && status && status._tag !== "Idle" ? status.url : address;
  const page = normalizeLinkUrl(current);
  return (
    <div className="space-y-2">
      <Input
        aria-label="Browser page address"
        placeholder="https://"
        maxLength={2048}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="xs"
          variant="outline"
          disabled={busy || !normalizeLinkUrl(address) || (desktop && (!threadRef || !canOperate))}
          onClick={async () => {
            const url = normalizeLinkUrl(address);
            if (!url) return;
            setBusy(true);
            setError(null);
            try {
              if (desktop && threadRef) {
                const result = await openPreviewSession({ openPreview, threadRef, url });
                if (result._tag === "Failure") setError(workspaceToolsError(result));
                else setOpened(true);
              } else {
                const api = readLocalApi();
                if (!api) throw new Error("Browser is unavailable on this client.");
                await api.shell.openExternal(url);
              }
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "The page could not be opened.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {desktop ? "Open Browser" : "Open in new tab"}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy || !canOperate || !page || item === null}
          onClick={async () => {
            if (!page || item === null) return;
            setBusy(true);
            setError(null);
            try {
              await linkItem(item, {
                ref: { type: "url", url: page },
                title: desktop && status && status._tag !== "Idle" ? status.title : page,
              });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "This page could not be linked.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Link this page
        </Button>
        {desktop && threadRef && preview.snapshot ? (
          <Button size="xs" variant="ghost" onClick={() => setOpened(true)}>
            Show Browser
          </Button>
        ) : null}
      </div>
      {item === null ? (
        <p className="text-xs text-muted-foreground">Select an item to link this page.</p>
      ) : null}
      {desktop && !browserThread ? (
        <p className="text-xs text-muted-foreground">
          Choose an available Browser thread in this project's workspace settings.
        </p>
      ) : null}
      {!desktop ? (
        <p className="text-xs text-muted-foreground">
          External tabs do not report navigation here. Paste the current page address before linking
          it.
        </p>
      ) : null}
      {config.error || error ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? config.error}
        </p>
      ) : null}
      {desktop && threadRef && !hidden ? (
        <Dialog open={opened} onOpenChange={setOpened}>
          <DialogPopup className="w-full max-w-5xl">
            <DialogHeader>
              <DialogTitle>Project Browser</DialogTitle>
            </DialogHeader>
            <DialogPanel>
              <div className="h-[65vh] min-h-64">
                {opened ? (
                  <Suspense
                    fallback={<p className="text-sm text-muted-foreground">Loading Browser...</p>}
                  >
                    <PreviewPanel mode="embedded" threadRef={threadRef} visible={opened} />
                  </Suspense>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!page || !canOperate || busy || item === null}
                onClick={async () => {
                  if (!page || item === null) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await linkItem(item, {
                      ref: { type: "url", url: page },
                      title: desktop && status && status._tag !== "Idle" ? status.title : page,
                    });
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "This page could not be linked.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Link this page
              </Button>
            </DialogPanel>
          </DialogPopup>
        </Dialog>
      ) : null}
    </div>
  );
}
