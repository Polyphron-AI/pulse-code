import {
  workspaceItemKey,
  type EnvironmentId,
  type WorkspaceLinkEndpoint,
  type WorkspaceItemRef,
  type WorkspaceLinkList,
} from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { WorkspaceItemActions } from "./WorkspaceItemActions";
import { DriveFileAccess, DriveSearch } from "./DriveFiles";
import { useMailLinks } from "./mail/useMailLinks";
import { workspaceEndpointTitle } from "./mail/linkedItems";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import type { WorkspaceResourceScope } from "./workspaceResourceState";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
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
  tool?: "files" | "agents";
  scope?: WorkspaceResourceScope;
  selectedItem?: WorkspaceLinkEndpoint | null;
}) {
  const ref = scope ? { type: "project" as const, projectId: scope.projectId } : item.ref;
  const target = selectedItem === undefined ? item : selectedItem;
  const query = useEnvironmentQuery(
    linkedData === undefined ? workspaceLinks.list({ environmentId, input: { item: ref } }) : null,
  );
  const links = linkedData === undefined ? query : { ...query, data: linkedData, error: null };
  const threads = useThreadShells().filter((thread) => thread.environmentId === environmentId);
  const threadTitles = new Map(threads.map((thread) => [thread.id, thread.title]));
  const files = links.data?.linked.filter((view) => view.item.ref.type === "file") ?? [];
  const agents = links.data?.linked.filter((view) => view.item.ref.type === "thread") ?? [];
  return (
    <div className="flex flex-col gap-3">
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
  const { linkItem } = useMailLinks(props.environmentId);
  return capability.workspaceLinks ? (
    <>
      <WorkspaceToolsPanel
        {...props}
        scope={props}
        item={{ ref: { type: "project", projectId: props.projectId } }}
        tool="files"
      />
      {capability.driveRead ? (
        <DriveSearch
          environmentId={props.environmentId}
          onLink={async (endpoint) =>
            linkItem(endpoint, { ref: { type: "project", projectId: props.projectId } })
          }
        />
      ) : null}
    </>
  ) : (
    <p>Project files are not available on this server yet.</p>
  );
}

/** Shared W4 candidate picker. Callers own scoped candidates and confirmation. */
export function WorkspaceLinkPicker({
  candidates,
  filter,
  onFilterChange,
  busy,
  onChoose,
  placeholder,
  empty,
  threadOnly = false,
}: {
  candidates: readonly WorkspaceLinkEndpoint[];
  filter: string;
  onFilterChange: (value: string) => void;
  busy: boolean;
  onChoose: (endpoint: WorkspaceLinkEndpoint) => void;
  placeholder: string;
  empty: string;
  threadOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        aria-label={threadOnly ? "Find a thread" : "Find an item to link"}
        placeholder={placeholder}
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
      />
      <ul className="max-h-60 overflow-y-auto">
        {candidates.map((endpoint) => (
          <li key={workspaceItemKey(endpoint.ref)}>
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start pointer-coarse:min-h-11"
              disabled={busy}
              onClick={() => onChoose(endpoint)}
            >
              <span className="min-w-0 truncate">
                {threadOnly ? endpoint.title : `${endpoint.ref.type}: ${endpoint.title}`}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {candidates.length === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> : null}
    </div>
  );
}
