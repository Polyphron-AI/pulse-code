import {
  workspaceItemKey,
  type EnvironmentId,
  type ProjectId,
  type WorkspaceItemRef,
  type WorkspaceLinkEndpoint,
  type WorkspaceLinkId,
  type WorkspaceLinkView,
} from "@t3tools/contracts";
import { useContext, useState, type ReactNode } from "react";
import { useProjects, useThreadShells } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { Button } from "../ui/button";
import { DriveReader } from "./DriveFiles";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";
import { WorkspaceDocsReadingView } from "./WorkspaceDocsReadingView";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { isWorkspaceNote } from "./meetings/meetingNotes";
import { workspaceEndpointTitle } from "./mail/linkedItems";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useMailLinks } from "./mail/useMailLinks";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";

export type WorkspaceDocRef =
  | Extract<WorkspaceItemRef, { type: "file" }>
  | (Extract<WorkspaceItemRef, { type: "provider-resource" }> & { provider: "workspace-note" });
export type WorkspaceDocSelection = {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  document: WorkspaceLinkEndpoint & { ref: WorkspaceDocRef };
};
export type WorkspaceDocsPanelProps = {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  selected: WorkspaceDocSelection | null;
  onSelect: (selection: WorkspaceDocSelection | null) => void;
};
type DocumentEndpoint = WorkspaceDocSelection["document"];
type Entrances = {
  readonly projectTitle?: string;
  readonly currentItem?: WorkspaceLinkEndpoint | null;
  readonly renderNative?: (document: DocumentEndpoint) => ReactNode;
};
function isDocument(endpoint: WorkspaceLinkEndpoint): endpoint is DocumentEndpoint {
  return endpoint.ref.type === "file" || isWorkspaceNote(endpoint.ref);
}

/** Adapts the shell's single request into a controlled, project-scoped Docs selection. */
export function WorkspaceDocsResource(
  props: WorkspaceResourceBodyProps & Pick<Entrances, "renderNative">,
) {
  const projectTitle = useProjects().find(
    (project) => project.environmentId === props.environmentId && project.id === props.projectId,
  )?.title;
  const requested = props.request ? { ref: props.request } : props.selectedItem;
  const document = requested && isDocument(requested) ? requested : null;
  const intent = props.request ?? (document ? workspaceItemKey(document.ref) : null);
  const [state, setState] = useState<{
    intent: WorkspaceItemRef | string | null;
    selected: WorkspaceDocSelection | null;
  }>(() => ({
    intent,
    selected: document
      ? { environmentId: props.environmentId, projectId: props.projectId, document }
      : null,
  }));
  if (state.intent !== intent)
    setState({
      intent,
      selected: document
        ? { environmentId: props.environmentId, projectId: props.projectId, document }
        : null,
    });
  return (
    <WorkspaceDocsPanel
      {...props}
      currentItem={props.selectedItem}
      {...(projectTitle ? { projectTitle } : {})}
      selected={state.selected}
      onSelect={(selected) => setState({ intent, selected })}
    />
  );
}

export function WorkspaceDocsPanel(props: WorkspaceDocsPanelProps & Entrances) {
  const connected = useConnectedEnvironmentIds().includes(props.environmentId);
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  const capability = useMailCapabilities(props.environmentId);
  const selected =
    props.selected?.environmentId === props.environmentId &&
    props.selected.projectId === props.projectId
      ? props.selected
      : null;
  if (hidden) return null;
  // Keep the admitted native-note controller and its revision-safe edit session until T3b.
  if (selected && isWorkspaceNote(selected.document.ref) && props.renderNative)
    return (
      <section
        aria-label="Docs resource"
        className="pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
      >
        <Button size="sm" variant="ghost" onClick={() => props.onSelect(null)}>
          Back to documents
        </Button>
        {props.renderNative(selected.document)}
      </section>
    );
  if (!connected)
    return (
      <section aria-label="Docs resource">
        <p className="text-sm text-muted-foreground">
          Connect to this environment to see its documents. Their links have been kept.
        </p>
      </section>
    );
  return (
    <Documents
      key={`${props.environmentId}:${props.projectId}`}
      {...props}
      selected={selected}
      linksAvailable={capability.workspaceLinks}
      discoveryAvailable={capability.workspaceItemContext}
    />
  );
}

function Documents(
  props: WorkspaceDocsPanelProps &
    Entrances & { linksAvailable: boolean; discoveryAvailable: boolean },
) {
  const { environmentId, projectId } = props;
  const threads = useThreadShells().filter(
    (thread) => thread.environmentId === environmentId && thread.projectId === projectId,
  );
  const links = useEnvironmentQuery(
    props.linksAvailable
      ? workspaceLinks.list({ environmentId, input: { item: { type: "project", projectId } } })
      : null,
  );
  const related = useEnvironmentQuery(
    props.linksAvailable && props.discoveryAvailable
      ? workspaceLinks.projectHub({
          environmentId,
          input: { projectId, threadIds: threads.slice(0, 30).map((thread) => thread.id) },
        })
      : null,
  );
  const direct = (links.data?.linked ?? []).filter(
    (link) => link.status === "confirmed" && isDocument(link.item),
  );
  const directKeys = new Set(direct.map((link) => workspaceItemKey(link.item.ref)));
  const discovery = (related.data?.related ?? []).filter(
    (row) => isDocument(row.item) && !directKeys.has(workspaceItemKey(row.item.ref)),
  );
  const project: WorkspaceLinkEndpoint = {
    ref: { type: "project", projectId },
    ...(props.projectTitle ? { title: props.projectTitle } : {}),
  };
  const select = (document: DocumentEndpoint) =>
    props.onSelect({ environmentId, projectId, document });
  const incomplete = !!links.data?.truncated || !!related.data?.truncated || threads.length > 30;
  const refresh = () => {
    links.refresh();
    related.refresh();
  };
  if (props.selected)
    return (
      <SelectedDocument
        key={workspaceItemKey(props.selected.document.ref)}
        {...props}
        document={props.selected.document}
        project={project}
        direct={direct}
        linksLoaded={!!links.data && !links.error}
        linksComplete={!!links.data && !links.data.truncated}
        linksError={links.error}
        refresh={refresh}
      />
    );
  return (
    <section
      aria-label="Docs resource"
      className="min-w-0 space-y-4 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Documents</h2>
        <Button size="sm" variant="ghost" onClick={refresh}>
          Refresh
        </Button>
      </div>
      {!props.linksAvailable ? (
        <p className="text-sm text-muted-foreground">Workspace documents need a newer server.</p>
      ) : null}
      {links.error || related.error ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{links.error ?? related.error}</p>
          <Button size="sm" variant="outline" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : null}
      {props.linksAvailable && !links.data && !links.error ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading documents...
        </p>
      ) : null}
      <section aria-label="Linked to project">
        <h3 className="text-xs font-medium">Linked to project</h3>
        <ul className="mt-2 space-y-2">
          {direct.map((link) =>
            isDocument(link.item) ? (
              <li key={link.id}>
                <DocumentRow
                  {...props}
                  document={link.item}
                  project={project}
                  link={link}
                  onOpen={() => select(link.item as DocumentEndpoint)}
                />
              </li>
            ) : null,
          )}
        </ul>
      </section>
      {links.data && direct.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents linked</p>
      ) : null}
      {discovery.length ? (
        <section aria-label="Related through linked items">
          <h3 className="text-xs font-medium">Related through linked items</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown for discovery. These documents are not project context until you link them
            directly.
          </p>
          <ul className="mt-2 space-y-2">
            {discovery.map((row) =>
              isDocument(row.item) ? (
                <li key={`${workspaceItemKey(row.item.ref)}:${workspaceItemKey(row.via.ref)}`}>
                  <DocumentRow
                    {...props}
                    document={row.item}
                    project={project}
                    via={row.via}
                    onOpen={() => select(row.item as DocumentEndpoint)}
                  />
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}
      {incomplete ? (
        <p className="text-xs text-muted-foreground">
          Showing loaded links. This bounded document list may be incomplete.
        </p>
      ) : null}
    </section>
  );
}

function DocumentRow(
  props: WorkspaceDocsPanelProps &
    Entrances & {
      document: DocumentEndpoint;
      project: WorkspaceLinkEndpoint;
      link?: WorkspaceLinkView;
      via?: WorkspaceLinkEndpoint;
      onOpen: () => void;
    },
) {
  const confirmed = props.link ? [props.project] : [];
  return (
    <WorkspaceItemMenu
      environmentId={props.environmentId}
      item={props.document}
      confirmed={confirmed}
      triggerClassName="pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
      provenance={props.via ? <p>Via {workspaceEndpointTitle(props.via)}</p> : undefined}
      actions={<DocumentLinkActions {...props} />}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="w-full break-words rounded-sm py-2 text-left text-sm pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-ring"
          onClick={props.onOpen}
        >
          {workspaceEndpointTitle(props.document)}
        </button>
        <p className="text-xs text-muted-foreground">
          {props.via ? `Via ${workspaceEndpointTitle(props.via)}` : "Confirmed project link"}
        </p>
        <p className="text-xs text-muted-foreground">
          {props.document.ref.type === "file"
            ? "Document type is checked when opened. Folders and unsupported files open in Google Drive."
            : "Workspace note"}
        </p>
      </div>
    </WorkspaceItemMenu>
  );
}

function SelectedDocument(
  props: WorkspaceDocsPanelProps &
    Entrances & {
      document: DocumentEndpoint;
      project: WorkspaceLinkEndpoint;
      direct: readonly WorkspaceLinkView[];
      linksLoaded: boolean;
      linksComplete: boolean;
      linksError: string | null;
      refresh: () => void;
    },
) {
  const { document } = props;
  const link = props.direct.find(
    (value) => workspaceItemKey(value.item.ref) === workspaceItemKey(document.ref),
  );
  const [originalLink, setOriginalLink] = useState<WorkspaceLinkId | null | undefined>(undefined);
  if (originalLink === undefined && props.linksLoaded) setOriginalLink(link?.id ?? null);
  const removed = originalLink && props.linksComplete && !link;
  const actions = (
    <>
      <Button size="sm" variant="ghost" onClick={() => props.onSelect(null)}>
        Back to documents
      </Button>
      <DocumentLinkActions {...props} {...(link ? { link } : {})} />
    </>
  );
  const title = link?.item.title ?? document.title ?? workspaceEndpointTitle(document);
  return (
    <section
      aria-label="Docs resource"
      className="min-w-0 space-y-3 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
    >
      {removed || props.linksError ? (
        <>
          <h2 className="break-words text-sm font-semibold">{title}</h2>
          <p role="status" className="text-sm text-muted-foreground">
            {props.linksError ??
              "This document is no longer linked to this project. This document is unavailable. Its link has been kept."}
          </p>
          {actions}
          <Button size="sm" variant="outline" onClick={props.refresh}>
            Retry
          </Button>
        </>
      ) : document.ref.type === "file" && document.ref.provider === "google-drive" ? (
        <DriveReader
          environmentId={props.environmentId}
          fileId={document.ref.fileId}
          actions={actions}
          confirmed={link ? [props.project] : []}
          renderContent={(result, text) => (
            <WorkspaceDocsReadingView
              title={result.file.name}
              caption={`${props.projectTitle ?? "Project"} · Sharing information unavailable`}
              content={
                <p className="whitespace-pre-wrap break-words text-3xs leading-5 text-muted-foreground">
                  {text}
                </p>
              }
            />
          )}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            This document is unavailable. Its link has been kept.
          </p>
          {actions}
        </>
      )}
    </section>
  );
}

function DocumentLinkActions(
  props: Pick<WorkspaceDocsPanelProps, "environmentId"> &
    Entrances & {
      document: DocumentEndpoint;
      project: WorkspaceLinkEndpoint;
      link?: WorkspaceLinkView;
    },
) {
  const { linkItem, unlink } = useMailLinks(props.environmentId);
  const canOperate = useWorkspaceCanOperate(props.environmentId);
  const connected = useConnectedEnvironmentIds().includes(props.environmentId);
  const capability = useMailCapabilities(props.environmentId);
  const writable = capability.workspaceLinks && canOperate && connected;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Menu actions use the captured document and environment, even if selection changes.
  const run = async (action: () => Promise<void>) => {
    if (!writable || busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document link could not be changed.");
    } finally {
      setBusy(false);
    }
  };
  const current =
    props.currentItem &&
    workspaceItemKey(props.currentItem.ref) !== workspaceItemKey(props.document.ref) &&
    workspaceItemKey(props.currentItem.ref) !== workspaceItemKey(props.project.ref)
      ? props.currentItem
      : null;
  return (
    <div className="flex flex-col gap-2 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11">
      <Button
        size="sm"
        variant="ghost"
        disabled={!writable || busy}
        onClick={() =>
          void run(() =>
            props.link ? unlink(props.link.id) : linkItem(props.document, props.project),
          )
        }
      >
        {props.link ? "Unlink from project" : "Link to project"}
      </Button>
      {current ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!writable || busy}
          onClick={() => void run(() => linkItem(props.document, current))}
        >
          Link to current item
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
