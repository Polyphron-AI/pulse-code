import {
  type EnvironmentId,
  type ProjectId,
  type WorkspaceLinkEndpoint,
  type WorkspaceItemRef,
  type WorkspaceLinkList,
} from "@t3tools/contracts";
import { useState } from "react";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { workspaceTools } from "../../state/workspaceTools";
import { WorkspaceBrowser } from "./WorkspaceBrowser";
import { WorkspaceItemActions } from "./WorkspaceItemActions";
import { DriveFileAccess } from "./DriveFiles";
import { workspaceEndpointTitle } from "./mail/linkedItems";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import type { WorkspaceResourceScope } from "./workspaceResourceState";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { ProjectPickerView } from "./ProjectPickerView";
export { WorkspaceBrowser };
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
