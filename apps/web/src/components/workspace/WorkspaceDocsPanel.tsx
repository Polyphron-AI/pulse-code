import { randomUUID } from "../../lib/utils";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { WorkspaceNotesError } from "@t3tools/contracts";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import { useWorkspaceNoteSession } from "./workspaceResourceState";
import {
  workspaceItemKey,
  type EnvironmentId,
  type ProjectId,
  type WorkspaceItemRef,
  type WorkspaceLinkEndpoint,
  type WorkspaceLinkId,
  type WorkspaceLinkView,
} from "@t3tools/contracts";
import { lazy, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useProject, useThreadShells } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { Button } from "../ui/button";
import { DriveReader } from "./DriveFiles";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";
import { WorkspaceDocsReadingView } from "./WorkspaceDocsReadingView";
import { WorkspaceDocContent } from "./WorkspaceDocContent";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { useWorkspaceDocSession, WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { isWorkspaceNote } from "./meetings/meetingNotes";
import { workspaceEndpointTitle } from "./mail/linkedItems";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { linkErrorText, useMailLinks } from "./mail/useMailLinks";
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
};
function isDocument(endpoint: WorkspaceLinkEndpoint): endpoint is DocumentEndpoint {
  return endpoint.ref.type === "file" || isWorkspaceNote(endpoint.ref);
}

/** Adapts the shell's single request into a controlled, project-scoped Docs selection. */
export function WorkspaceDocsResource(props: WorkspaceResourceBodyProps) {
  const projectTitle = useProject(scopeProjectRef(props.environmentId, props.projectId))?.title;
  const requested = props.request ? { ref: props.request } : props.selectedItem;
  const document = requested && isDocument(requested) ? requested : null;
  const centerDocument =
    props.selectedItem && isDocument(props.selectedItem) ? props.selectedItem : null;
  const centerKey = centerDocument ? workspaceItemKey(centerDocument.ref) : null;
  const [previous, save] = useWorkspaceDocSession(props.environmentId, props.projectId);
  const state = useMemo(() => {
    if (previous?.request === props.request && previous.centerKey === centerKey) return previous;
    const freshRequest = props.request !== null && props.request !== previous?.request;
    const freshCenter =
      props.request === null && centerKey !== null && centerKey !== previous?.centerKey;
    return {
      request: props.request,
      centerKey,
      selected:
        !previous || freshRequest || freshCenter
          ? document
            ? { environmentId: props.environmentId, projectId: props.projectId, document }
            : null
          : previous.selected,
    };
  }, [previous, props.request, props.environmentId, props.projectId, centerKey, document]);
  useEffect(() => save(state), [save, state]);
  return (
    <WorkspaceDocsPanel
      {...props}
      currentItem={props.selectedItem}
      {...(projectTitle ? { projectTitle } : {})}
      selected={state.selected}
      onSelect={(selected) => save({ ...state, selected })}
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
  if (!connected && !(selected && isWorkspaceNote(selected.document.ref)))
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
      linksAvailable={connected && capability.workspaceLinks}
      discoveryAvailable={connected && capability.workspaceItemContext}
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
    (link): link is WorkspaceLinkView & { item: DocumentEndpoint } =>
      link.status === "confirmed" && isDocument(link.item),
  );
  const directKeys = new Set(direct.map((link) => workspaceItemKey(link.item.ref)));
  const discovery = (related.data?.related ?? []).filter(
    (row): row is { item: DocumentEndpoint; via: WorkspaceLinkEndpoint } =>
      isDocument(row.item) && !directKeys.has(workspaceItemKey(row.item.ref)),
  );
  const project: WorkspaceLinkEndpoint = {
    ref: { type: "project", projectId },
    ...(props.projectTitle ? { title: props.projectTitle } : {}),
  };
  const select = (document: DocumentEndpoint) =>
    props.onSelect({ environmentId, projectId, document });
  const incomplete =
    !!links.data?.truncated ||
    !!related.data?.truncated ||
    (props.linksAvailable && props.discoveryAvailable && threads.length > 30);
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
        <p className="mt-1 text-xs text-muted-foreground">
          Document type is checked when opened. Folders and unsupported files open in Google Drive.
        </p>
        <ul className="mt-2 space-y-2">
          {direct.map((link) => (
            <li key={link.id}>
              <DocumentRow
                {...props}
                document={link.item}
                project={project}
                link={link}
                onOpen={() => select(link.item)}
              />
            </li>
          ))}
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
            {discovery.map((row) => (
              <li key={`${workspaceItemKey(row.item.ref)}:${workspaceItemKey(row.via.ref)}`}>
                <DocumentRow
                  {...props}
                  document={row.item}
                  project={project}
                  via={row.via}
                  onOpen={() => select(row.item)}
                />
              </li>
            ))}
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
        {props.document.ref.type !== "file" ? (
          <p className="text-xs text-muted-foreground">Workspace note</p>
        ) : null}
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
  // Only a complete page proves an edge was removed; the edge does not authorize Drive access.
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
      {isWorkspaceNote(document.ref) ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => props.onSelect(null)}>
            Back to documents
          </Button>
          <Suspense fallback={<p role="status">Loading note...</p>}>
            <NativeNote
              environmentId={props.environmentId}
              projectId={props.projectId}
              request={document.ref}
              selectedItem={document}
              onOpen={() => {}}
              caption={`${props.projectTitle ?? "Workspace note"} · Environment access`}
              overflowAction={
                <WorkspaceItemMenu
                  environmentId={props.environmentId}
                  item={document}
                  confirmed={link ? [props.project] : []}
                  triggerClassName="pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
                  actions={<DocumentLinkActions {...props} {...(link ? { link } : {})} />}
                >
                  {null}
                </WorkspaceItemMenu>
              }
            />
          </Suspense>
        </>
      ) : removed || props.linksError ? (
        <>
          <h2 className="break-words text-sm font-semibold">{title}</h2>
          <p role="status" className="text-sm text-muted-foreground">
            {props.linksError ??
              "This document is no longer linked to this project. Link it again to keep reading it here."}
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
          renderContent={(result, text, overflowAction) => {
            const markdown =
              result.file.mimeType.split(";")[0]?.trim().toLowerCase() === "text/markdown";
            return (
              <>
                <WorkspaceDocsReadingView
                  title={result.file.name}
                  caption={
                    link
                      ? `${props.projectTitle ?? "Linked to this project"} · Sharing information unavailable`
                      : "Not linked to this project · Sharing information unavailable"
                  }
                  overflowAction={overflowAction}
                  content={
                    <WorkspaceDocContent
                      content={
                        markdown
                          ? { format: "markdown", text }
                          : { format: "blocks", blocks: [{ type: "paragraph", text }] }
                      }
                    />
                  }
                />
                {!markdown ? (
                  <p className="text-xs text-muted-foreground">
                    Plain text preview. Open in Google Drive for original formatting.
                  </p>
                ) : null}
              </>
            );
          }}
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
      setError(linkErrorText(cause));
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

const isNotesError = Schema.is(WorkspaceNotesError);

const NativeNote = lazy(async () => {
  const [{ workspaceNotes }, { WorkspaceDocsNoteView }] = await Promise.all([
    import("../../state/workspaceNotes"),
    import("./WorkspaceDocsNoteView"),
  ]);
  return {
    default: function NativeNoteBody({
      environmentId,
      request,
      selectedItem,
      caption,
      overflowAction,
    }: WorkspaceResourceBodyProps & { caption: string; overflowAction: ReactNode }) {
      const ref = request ?? selectedItem?.ref;
      const projection = useEnvironmentQuery(
        serverEnvironment.configProjection({ environmentId, input: {} }),
      );
      const config = projection.data?.source === "live" ? projection.data.config : null;
      const connected = useConnectedEnvironmentIds().includes(environmentId);
      const canOperate = useWorkspaceCanOperate(environmentId) && connected;
      const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
      const available = config?.pulseCapabilities?.workspaceNotes === true && connected && !hidden;
      const query = useEnvironmentQuery(
        available && ref && isWorkspaceNote(ref)
          ? workspaceNotes.get({ environmentId, input: { id: ref.resourceId } })
          : null,
      );
      const update = useAtomCommand(workspaceNotes.update, { reportFailure: false });
      const remove = useAtomCommand(workspaceNotes.delete, { reportFailure: false });
      const restore = useAtomCommand(workspaceNotes.restore, { reportFailure: false });
      const [session, patch] = useWorkspaceNoteSession(
        environmentId,
        ref && isWorkspaceNote(ref) ? ref.resourceId : null,
      );
      const { draft, pending, error, deletedRevision, confirming, retry } = session;
      const note = query.data;
      const discard = (action: "cancel" | "reload") => {
        if (
          draft &&
          (draft.title !== note?.title || draft.body !== note?.body) &&
          confirming !== action
        ) {
          patch({ confirming: action });
          return;
        }
        patch({ draft: null, confirming: null, retry: null, error: null });
        if (action === "reload") query.refresh();
      };
      const mutate = async (action: "save" | "delete" | "restore") => {
        if (!canOperate || !available || pending || !ref || !isWorkspaceNote(ref)) return;
        if (
          (action === "save" && !draft) ||
          (action === "delete" && !note) ||
          (action === "restore" && deletedRevision === null)
        )
          return;
        const expectedRevision =
          action === "restore"
            ? deletedRevision!
            : action === "save"
              ? draft!.revision
              : note!.revision;
        const fingerprint = JSON.stringify({
          action,
          id: ref.resourceId,
          expectedRevision,
          ...(action === "save" ? { title: draft!.title, body: draft!.body } : {}),
        });
        const requestId =
          retry?.fingerprint === fingerprint ? retry.requestId : randomUUID().toLowerCase();
        patch({ retry: { fingerprint, requestId }, pending: true, error: null });
        try {
          const input = {
            environmentId,
            input: { id: ref.resourceId, requestId, expectedRevision },
          };
          const result =
            action === "save"
              ? await update({
                  environmentId,
                  input: { ...input.input, title: draft!.title, body: draft!.body },
                })
              : action === "delete"
                ? await remove(input)
                : await restore(input);
          if (result._tag === "Failure") {
            const failure = Cause.squash(result.cause);
            if (action === "restore" && isNotesError(failure) && failure.kind === "conflict") {
              patch({ error: "This note was changed or already restored. Reload it." });
              query.refresh();
            } else
              patch({
                error:
                  failure instanceof Error
                    ? failure.message
                    : "Notes are unavailable. Their links have been kept.",
              });
          } else {
            patch({
              draft: null,
              retry: null,
              deletedRevision: action === "delete" ? expectedRevision + 1 : null,
            });
            query.refresh();
          }
        } catch (cause) {
          patch({
            error:
              cause instanceof Error
                ? cause.message
                : "Notes are unavailable. Their links have been kept.",
          });
        } finally {
          patch({ pending: false });
        }
      };
      if (!ref || !isWorkspaceNote(ref))
        return (
          <p className="p-4 text-sm text-muted-foreground">
            Open a linked workspace note to preview it here.
          </p>
        );
      return (
        <WorkspaceDocsNoteView
          environmentId={environmentId}
          caption={caption}
          overflowAction={overflowAction}
          note={!available || query.error ? null : note}
          status={
            !available || query.error
              ? "unavailable"
              : query.isPending && !note
                ? "loading"
                : "ready"
          }
          error={error ?? query.error}
          canOperate={canOperate && available && (!query.error || deletedRevision !== null)}
          pending={pending}
          draft={draft}
          deleted={deletedRevision !== null && !(note && note.revision > deletedRevision)}
          confirming={confirming}
          onEdit={(draft) => patch({ draft })}
          onSave={() => void mutate("save")}
          onDelete={() => void mutate("delete")}
          onRestore={() => void mutate("restore")}
          onCancel={() => discard("cancel")}
          onReload={() => discard("reload")}
          onKeepDraft={() => patch({ confirming: null })}
        />
      );
    },
  };
});
