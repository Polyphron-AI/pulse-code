import type { EnvironmentId, WorkspaceNote } from "@t3tools/contracts";
import { WorkspaceNoteCreate } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export interface NoteDraft {
  readonly title: string;
  readonly body: string;
  readonly revision: number;
}
export interface WorkspaceNoteViewProps {
  readonly environmentId: EnvironmentId;
  readonly note: WorkspaceNote | null;
  readonly status: "loading" | "ready" | "unavailable";
  readonly error?: string | null;
  readonly canOperate: boolean;
  readonly pending: boolean;
  readonly draft: NoteDraft | null;
  readonly deleted?: boolean;
  readonly confirming?: "cancel" | "reload" | null;
  readonly onEdit: (draft: NoteDraft) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onReload: () => void;
  readonly onDelete: () => void;
  readonly onRestore: () => void;
  readonly onKeepDraft?: () => void;
}
const isCreate = Schema.is(WorkspaceNoteCreate);
const validDraft = (draft: NoteDraft) =>
  isCreate({ ...draft, requestId: "00000000-0000-0000-0000-000000000000" });
/** Plain text preview shared by the live Docs slot and isolated fixture. */
export function WorkspaceNoteView(props: WorkspaceNoteViewProps) {
  const { note, draft, pending, canOperate } = props;
  const writable = canOperate && !pending;
  return (
    <section aria-label="Workspace note" className="flex min-w-0 flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Note preview. Formatted Docs view is not available yet.
      </p>
      {props.error ? (
        <p role="alert" className="text-sm">
          {props.error}
        </p>
      ) : null}
      {props.status === "loading" ? <p role="status">Loading note...</p> : null}
      {props.status === "unavailable" || props.deleted ? (
        <p>Notes are unavailable. Their links have been kept.</p>
      ) : null}
      {props.deleted ? (
        <div>
          <Button size="sm" variant="outline" disabled={!writable} onClick={props.onRestore}>
            Undo delete
          </Button>
        </div>
      ) : null}
      {draft ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (writable && validDraft(draft)) props.onSave();
          }}
        >
          <label className="text-sm">
            Title
            <Input
              aria-label="Note title"
              value={draft.title}
              disabled={!writable}
              onChange={(event) => props.onEdit({ ...draft, title: event.target.value })}
            />
          </label>
          <label className="text-sm">
            Note text
            <textarea
              aria-label="Note text"
              className="min-h-64 w-full rounded-md border border-input bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              value={draft.body}
              disabled={!writable}
              onChange={(event) => props.onEdit({ ...draft, body: event.target.value })}
            />
          </label>
          {!validDraft(draft) ? (
            <p role="alert">Use a title of 1 to 300 characters and valid text up to 64 KiB.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={!writable || !validDraft(draft)}>
              Save note
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={pending}
              onClick={props.onCancel}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={pending}
              onClick={props.onReload}
            >
              Reload current note
            </Button>
          </div>
        </form>
      ) : note && !props.deleted ? (
        <>
          <h2 className="break-words text-base font-semibold">{note.title}</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.body}</p>
          <div className="flex flex-nowrap gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={!writable || props.status !== "ready"}
              onClick={() =>
                props.onEdit({ title: note.title, body: note.body, revision: note.revision })
              }
            >
              Edit note
            </Button>
            <Button
              size="xs"
              variant="ghost-destructive"
              disabled={!writable || props.status !== "ready"}
              onClick={props.onDelete}
            >
              Delete note
            </Button>
            <Button
              size="xs"
              variant="ghost-muted"
              aria-label="Reload current note"
              disabled={pending}
              onClick={props.onReload}
            >
              Reload
            </Button>
          </div>
        </>
      ) : null}
      {props.confirming ? (
        <div role="alert" className="flex flex-col gap-2 text-sm">
          <p>Discard unsaved changes?</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={props.confirming === "cancel" ? props.onCancel : props.onReload}
            >
              Discard changes
            </Button>
            <Button size="sm" variant="ghost" onClick={props.onKeepDraft}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : null}
      {!canOperate ? (
        <p className="text-xs text-muted-foreground">
          Read-only. Connect with operate access to change this note.
        </p>
      ) : null}
    </section>
  );
}

/** A saved note remains reachable even when either independent link failed. */
export function MeetingNoteRecovery(props: {
  readonly canOperate: boolean;
  readonly pending: boolean;
  readonly onOpen: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <section aria-label="Saved note linking" className="flex flex-col gap-3 text-sm">
      <p role="alert">Note saved. Linking did not finish. Retry linking.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={props.onOpen}>
          Open saved note
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!props.canOperate || props.pending}
          onClick={props.onRetry}
        >
          Retry linking
        </Button>
      </div>
    </section>
  );
}
