import { useRef, useState } from "react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type MeetingNote,
  type OfficeEvent,
  type ProjectId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useProjects } from "../../state/entities";
import { useEnvironmentSessionState } from "../../state/session";
import { useEnvironmentQuery } from "../../state/query";
import { meetingNotesSubscription, saveMeetingNote } from "../../state/meetingNotes";
import { mutateTask } from "../../state/tasks";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { fieldClass, RequestState, useOfficeRequest } from "./office/shared";

export function MeetingNotesPanel({
  environmentId,
  event,
  onClose,
}: {
  environmentId: EnvironmentId;
  event: Pick<OfficeEvent, "id" | "accountId" | "title">;
  onClose: () => void;
}) {
  const session = useEnvironmentSessionState(environmentId);
  const canRead =
    !session.hasError &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthOrchestrationReadScope) === true;
  const canWrite =
    canRead && session.data?.scopes?.includes(AuthOrchestrationOperateScope) === true;
  const notes = useEnvironmentQuery(
    canRead
      ? meetingNotesSubscription({
          environmentId,
          input: { accountId: event.accountId, eventId: event.id },
        })
      : null,
  );
  return (
    <aside
      className="h-full w-full overflow-auto border-l bg-background p-4 lg:w-96"
      aria-label="Meeting notes"
    >
      <div className="mb-4 flex justify-between gap-2">
        <h2 className="font-semibold">Meeting notes</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Saved in Pulse, separate from the calendar agenda. Paste transcript excerpts here to review
        action items.
      </p>
      {notes.error ? (
        <p role="alert" className="text-sm">
          {notes.error}
        </p>
      ) : !canRead ? (
        <p className="text-sm">Connect with permission to read meeting notes.</p>
      ) : !notes.isSuccess ? (
        <p className="text-sm">Loading notes…</p>
      ) : (
        <NoteEditor
          key={JSON.stringify([environmentId, event.accountId, event.id])}
          environmentId={environmentId}
          event={event}
          saved={notes.data}
          canWrite={canWrite}
        />
      )}
    </aside>
  );
}
function NoteEditor({
  environmentId,
  event,
  saved,
  canWrite,
}: {
  environmentId: EnvironmentId;
  event: Pick<OfficeEvent, "id" | "accountId" | "title">;
  saved: MeetingNote | null;
  canWrite: boolean;
}) {
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const save = useAtomCommand(saveMeetingNote, { reportFailure: false });
  const createTask = useAtomCommand(mutateTask, { reportFailure: false });
  const office = useOfficeRequest();
  const [title, setTitle] = useState(saved?.title ?? event.title);
  const [text, setText] = useState(saved?.text ?? "");
  const [projectId, setProjectId] = useState<ProjectId | null>(saved?.projectId ?? null);
  const [revision, setRevision] = useState(saved?.revision ?? null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [exportUrl, setExportUrl] = useState("");
  const [suggestions, setSuggestions] = useState<
    { title: string; excerpt: string; dueDate: string; selected: boolean; created: boolean }[]
  >([]);
  const project = projects.find((p) => p.id === projectId);
  const changedElsewhere = (saved?.revision ?? -1) > (revision ?? -1);
  async function saveNotes() {
    if (pending.current || !canWrite) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await save({
        environmentId,
        input: { accountId: event.accountId, eventId: event.id, title, text, projectId, revision },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      setRevision((revision ?? -1) + 1);
      setNotice("Notes saved in Pulse.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notes could not be saved.");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function exportNotes(root = false) {
    const drive = project?.office?.drive;
    if (!drive) return;
    setExportFailed(false);
    setExportUrl("");
    const accounts = await office.run({ operation: "accounts.list" });
    const account = accounts?.accounts?.find((a) => a.id === drive.accountId);
    if (!account) {
      setError("Connect this project's Google account before exporting.");
      return;
    }
    if (!account.capabilities.includes("driveWrite")) {
      const grant = await office.run({
        operation: "accounts.connectOAuth",
        provider: "google",
        accountId: drive.accountId,
        capabilities: ["drive", "driveWrite"],
      });
      if (!grant) return;
    }
    const result = await office.run({
      operation: "drive.exportNote",
      accountId: drive.accountId,
      folderId: root ? "root" : drive.folderId,
      title,
      text,
    });
    if (result?.file) {
      setExportUrl(result.file.webViewLink ?? "");
      setNotice(root ? "Exported text to My Drive." : "Exported text to the project Drive folder.");
    } else if (!root) setExportFailed(true);
  }
  async function createReviewedTasks() {
    if (pending.current || !canWrite) return;
    if (
      revision === null ||
      text !== saved?.text ||
      title !== saved?.title ||
      projectId !== saved?.projectId
    ) {
      if (!(await saveNotes())) return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      for (const [index, suggestion] of suggestions.entries()) {
        if (!suggestion.selected || suggestion.created) continue;
        const result = await createTask({
          environmentId,
          input: {
            operation: "create",
            title: suggestion.title,
            description: `Meeting: ${title}\nSource excerpt:\n${suggestion.excerpt}`.slice(
              0,
              10000,
            ),
            status: "todo",
            columnId: null,
            assignee: null,
            followers: [],
            source: {
              url: `/workspace?${new URLSearchParams({ space: "office", officeView: "meetings", notes: "1", sourceEnvironment: environmentId, sourceAccount: event.accountId, sourceMessage: event.id })}`,
              excerpt: suggestion.excerpt,
            },
            projectId,
            dueDate: suggestion.dueDate || null,
            recurrence: null,
            parentTaskId: null,
            dependencyIds: [],
            tags: ["meeting"],
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        setSuggestions((current) =>
          current.map((item, i) => (i === index ? { ...item, created: true } : item)),
        );
      }
      setNotice("Selected action items created as tasks.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "An action item could not be created. Completed items are marked below.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {changedElsewhere && (
        <div className="space-y-2">
          <p className="text-sm">
            A different saved version is available. Your text has been kept.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setTitle(saved?.title ?? event.title);
              setText(saved?.text ?? "");
              setProjectId(saved?.projectId ?? null);
              setRevision(saved?.revision ?? null);
            }}
          >
            Replace editor with saved notes
          </Button>
        </div>
      )}
      <label className="block space-y-1 text-sm">
        Title
        <input
          className={fieldClass}
          value={title}
          maxLength={4096}
          disabled={!canWrite || busy}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Project
        <select
          className={fieldClass}
          value={projectId ?? ""}
          disabled={!canWrite || busy}
          onChange={(e) => setProjectId((e.target.value || null) as ProjectId | null)}
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        Notes or transcript excerpt
        <textarea
          className={fieldClass}
          rows={12}
          maxLength={100000}
          value={text}
          disabled={!canWrite || busy}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Button disabled={!canWrite || busy || !title.trim()} onClick={() => void saveNotes()}>
        Save notes
      </Button>
      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Drive export</h3>
        <p className="text-xs text-muted-foreground">
          Exports the current text as a new text file. Google may ask you to grant file creation
          access. Sharing stays with Drive.
        </p>
        <RequestState busy={office.busy} error={office.error} />
        <Button
          variant="outline"
          disabled={
            office.busy ||
            busy ||
            !project?.office?.drive ||
            !text.trim() ||
            !window.desktopBridge?.officeInvoke
          }
          onClick={() => void exportNotes()}
        >
          Export text to Drive
        </Button>
        {!project?.office?.drive && (
          <p className="text-xs text-muted-foreground">
            Choose a project with a linked Drive folder to export.
          </p>
        )}
        {exportFailed && (
          <Button variant="outline" disabled={office.busy} onClick={() => void exportNotes(true)}>
            Export to My Drive instead
          </Button>
        )}
        {exportUrl && (
          <a
            className="block text-sm text-primary underline"
            href={exportUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open exported text
          </a>
        )}
      </section>
      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Action items</h3>
        <p className="text-xs text-muted-foreground">
          Split the notes into lines, then select and edit the action items you want to create.
          Tasks use the project selected above. Creating selected tasks saves these notes first,
          then links each task back to them.
        </p>
        <Button
          variant="outline"
          disabled={busy || !canWrite || !text.trim()}
          onClick={() =>
            setSuggestions(
              text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
                .slice(0, 40)
                .map((excerpt) => ({
                  title: excerpt.replace(/^[-*]\s*(?:\[.\]\s*)?/, "").slice(0, 240),
                  excerpt: excerpt.slice(0, 8000),
                  dueDate: "",
                  selected: false,
                  created: false,
                })),
            )
          }
        >
          Review lines as action items
        </Button>
        {suggestions.map((item, index) => (
          <div key={index} className="space-y-2 border-t pt-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={item.selected}
                disabled={busy || item.created}
                onChange={(e) =>
                  setSuggestions((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, selected: e.target.checked } : row,
                    ),
                  )
                }
              />
              {item.created ? "Task created" : "Create this task"}
            </label>
            <label className="block text-xs">
              Task title
              <input
                className={fieldClass}
                value={item.title}
                maxLength={240}
                disabled={busy || item.created}
                onChange={(e) =>
                  setSuggestions((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, title: e.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">
              Source: {item.excerpt}
            </p>
            <label className="block text-xs">
              Due date
              <input
                className={fieldClass}
                type="date"
                value={item.dueDate}
                disabled={busy || item.created}
                onChange={(e) =>
                  setSuggestions((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, dueDate: e.target.value } : row,
                    ),
                  )
                }
              />
            </label>
          </div>
        ))}
        {suggestions.length > 0 && (
          <Button
            disabled={
              busy ||
              !canWrite ||
              !suggestions.some((item) => item.selected && !item.created) ||
              suggestions.some((item) => item.selected && !item.title.trim())
            }
            onClick={() => void createReviewedTasks()}
          >
            Create selected tasks
          </Button>
        )}
      </section>
    </div>
  );
}
