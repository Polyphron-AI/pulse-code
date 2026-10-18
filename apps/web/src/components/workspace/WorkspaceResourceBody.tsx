import { randomUUID } from "../../lib/utils";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { WorkspaceNotesError } from "@t3tools/contracts";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { serverEnvironment } from "../../state/server";
import { useWorkspaceNoteSession, WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { isWorkspaceNote } from "./meetings/meetingNotes";
import type { WorkspaceItemRef, WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { lazy, Suspense, useContext, type ReactNode } from "react";
import type {
  WorkspaceResourceRequest,
  WorkspaceResourceScope,
  WorkspaceResourceTab,
} from "./workspaceResourceState";

export interface WorkspaceResourceBodyProps extends WorkspaceResourceScope {
  readonly selectedItem: WorkspaceLinkEndpoint | null;
  readonly request: WorkspaceResourceRequest | null;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
}
export interface WorkspaceResourceBodySwitchProps extends WorkspaceResourceBodyProps {
  readonly tab: WorkspaceResourceTab;
}
const Files = lazy(() =>
  import("./ProjectDriveExplorer").then((module) => ({ default: module.ProjectDriveExplorer })),
);
const Browser = lazy(() =>
  import("./WorkspaceBrowser").then((module) => ({ default: module.WorkspaceBrowser })),
);
const Agents = lazy(() =>
  import("./WorkspaceAgents").then((module) => ({ default: module.WorkspaceAgents })),
);
const Tasks = lazy(() =>
  import("./ProjectTasksResource").then((module) => ({ default: module.ProjectTasksResource })),
);
const Docs = lazy(() =>
  import("./WorkspaceDocsPanel").then((module) => ({ default: module.WorkspaceDocsResource })),
);

/** The single live resource switch. Later waves replace only their tab's case. */
export function WorkspaceResourceBody(props: WorkspaceResourceBodySwitchProps): ReactNode {
  let body: ReactNode;
  switch (props.tab) {
    case "files":
      body = <Files key={`${props.environmentId}:${props.projectId}`} {...props} />;
      break;
    case "browser":
      body = (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <Browser key={`${props.environmentId}:${props.projectId}`} {...props} />
        </div>
      );
      break;
    case "agents":
      body = <Agents {...props} />;
      break;
    case "tasks":
      body = <Tasks {...props} />;
      break;
    case "docs":
      body = (
        <Docs
          key={`${props.environmentId}:${props.projectId}`}
          {...props}
          renderNative={(document) => (
            <NativeNote
              key={`${props.environmentId}:${JSON.stringify(document.ref)}`}
              {...props}
              request={document.ref}
              selectedItem={document}
            />
          )}
        />
      );
      break;
    case "prs":
      body = (
        <p className="text-sm text-muted-foreground">
          Project pull requests are not available in this view yet.
        </p>
      );
      break;
  }
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading resources...</p>}>
      {body}
    </Suspense>
  );
}

const isNotesError = Schema.is(WorkspaceNotesError);

const NativeNote = lazy(async () => {
  const [{ workspaceNotes }, { WorkspaceNoteView }] = await Promise.all([
    import("../../state/workspaceNotes"),
    import("./meetings/WorkspaceNoteView"),
  ]);
  return {
    default: function NativeNoteBody({
      environmentId,
      request,
      selectedItem,
    }: WorkspaceResourceBodyProps) {
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
        <WorkspaceNoteView
          environmentId={environmentId}
          note={query.error ? null : note}
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
