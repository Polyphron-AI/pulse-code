import { randomUUID } from "../../../lib/utils";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  EnvironmentId,
  ProjectId,
  type CalendarOccurrenceSummary,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { displayDay, weekDates, addDays } from "@t3tools/client-runtime/calendar/dates";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEnvironmentQuery } from "../../../state/query";
import { workspaceCalendar } from "../../../state/workspaceCalendar";
import { workspaceLinks } from "../../../state/workspaceLinks";
import { workspaceNotes } from "../../../state/workspaceNotes";
import { useAtomCommand } from "../../../state/use-atom-command";
import { useEnvironmentSettings } from "../../../hooks/useSettings";
import { useConnectedEnvironmentIds } from "../../../state/environments";
import { useMailCapabilities } from "../mail/useMailCapabilities";
import { WorkspaceEngagement } from "../WorkspaceEngagement";
import { WorkspaceProjectResources } from "../WorkspaceResourcesPanel";
import { useWorkspaceHeaderModel } from "../useWorkspaceHeaderModel";
import { useWorkspaceResources } from "../workspaceResourceState";
import { WorkspaceItemMenu } from "../WorkspaceItemActions";
import { useWorkspaceItemOpener } from "../useWorkspaceItemOpener";
import { useWorkspaceCanOperate } from "../useWorkspaceCanOperate";
import { parseWorkspaceSearch } from "../workspaceNavigation";
import {
  createMeetingNote,
  isWorkspaceNote,
  openMeetingNote,
  parseNoteLocation,
  MeetingNoteLinkError,
} from "../meetings/meetingNotes";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { calendarItemRef } from "./calendarItemRef";
import { CalendarAgenda } from "./CalendarAgenda";
type NoteAttempt = {
  requestId: string;
  title: string;
  attempted: boolean;
  saved: WorkspaceLinkEndpoint | null;
  grantProject: boolean;
  projectId: ProjectId | undefined;
};
const CalendarNotesContext = createContext<Map<string, NoteAttempt> | null>(null);
/** Retains creation repair state while /workspace destinations unmount their readers. */
export function CalendarNotesProvider({ children }: { readonly children: ReactNode }) {
  const [attempts] = useState(() => new Map<string, NoteAttempt>());
  return <CalendarNotesContext value={attempts}>{children}</CalendarNotesContext>;
}
export function CalendarSpace({
  space = "calendar",
}: {
  readonly space?: "calendar" | "meetings";
}) {
  const search = parseWorkspaceSearch(useSearch({ strict: false }));
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  return environmentId ? (
    <CalendarBinding key={environmentId} environmentId={environmentId} space={space} />
  ) : (
    <p>Choose an environment to open Calendar.</p>
  );
}
function CalendarBinding({
  environmentId,
  space,
}: {
  environmentId: EnvironmentId;
  space: "calendar" | "meetings";
}) {
  const search = parseWorkspaceSearch(useSearch({ strict: false }));
  const navigate = useNavigate();
  const resources = useWorkspaceResources();
  const timeZone =
    useEnvironmentSettings(environmentId, (s) => s.workspaceDisplayTimeZone) ?? "UTC";
  const [today] = useState(() => displayDay(new Date().toISOString(), timeZone));
  const day = search.day ?? today;
  const range = useMemo(() => {
    const days = weekDates(day);
    return { startOn: days[0]!, endBefore: addDays(days[6]!, 1), timeZone };
  }, [day, timeZone]);
  const query = useEnvironmentQuery(workspaceCalendar.range({ environmentId, input: range }));
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const loadMore = useAtomCommand(workspaceCalendar.loadMore, { reportFailure: false });
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<{
    event: CalendarOccurrenceSummary;
    projectId: ProjectId | undefined;
  } | null>(null);
  const inheritedAttempts = useContext(CalendarNotesContext);
  const [localAttempts] = useState(() => new Map<string, NoteAttempt>());
  const attempts = inheritedAttempts ?? localAttempts;
  const header = useWorkspaceHeaderModel(
    environmentId,
    space === "calendar" ? "Calendar" : "Meetings",
    space === "calendar" ? "Calendar" : "Meetings",
  );
  const open = useWorkspaceItemOpener(environmentId);
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space={space}
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
    >
      {space === "calendar" && search.view === "week" ? (
        <p role="status" className="p-4">
          Week view is unavailable on this version.
        </p>
      ) : null}
      <CalendarAgenda
        day={day}
        timeZone={timeZone}
        space={space}
        events={query.data?.events ?? []}
        dueTasks={query.data?.dueTasks ?? []}
        status={
          !connected || query.data?.sourceStates.some((source) => source.state === "disconnected")
            ? "disconnected"
            : query.data?.unavailableReason
              ? "unavailable"
              : query.isPending && !query.data
                ? "loading"
                : "ready"
        }
        error={error ?? query.error}
        incomplete={Boolean(query.data?.incomplete)}
        dueIncomplete={Boolean(query.data?.dueIncomplete)}
        fetchedAt={query.dataUpdatedAt}
        nextEvents={Boolean(query.data?.nextCursor)}
        nextDue={Boolean(query.data?.nextDueCursor)}
        onSelectDay={(value) => {
          setNotes(null);
          void navigate({
            to: "/workspace",
            search: {
              ...search,
              space,
              view: space === "calendar" ? "agenda" : "upcoming",
              day: value,
            },
          });
        }}
        onSelect={(event) => {
          void navigate({
            to: "/workspace",
            search: {
              ...search,
              space: "calendar",
              view: "agenda",
              day,
              item: JSON.stringify(calendarItemRef(event.id)),
            },
          });
        }}
        onNotes={(event) =>
          setNotes({
            event,
            projectId:
              resources.projectId ?? (search.project ? ProjectId.make(search.project) : undefined),
          })
        }
        onRetry={() => {
          setError(null);
          query.refresh();
        }}
        onLoadMore={(kind) => {
          void loadMore({ environmentId, input: { range, kind } }).then((result) => {
            if (result._tag === "Failure") setError(String(squashAtomCommandFailure(result)));
          });
        }}
        onOpenTask={(task) => open(task.ref)}
        renderMenu={(event) => (
          <WorkspaceItemMenu
            environmentId={environmentId}
            item={{ ref: calendarItemRef(event.id), title: event.title }}
          >
            <span className="sr-only">Event actions</span>
          </WorkspaceItemMenu>
        )}
      />
      {notes ? (
        <MeetingNotes
          key={notes.event.id}
          environmentId={environmentId}
          event={notes.event}
          attempts={attempts}
          projectId={notes.projectId}
          onClose={() =>
            setNotes((current) => (current?.event.id === notes.event.id ? null : current))
          }
        />
      ) : null}
    </WorkspaceEngagement>
  );
}
function MeetingNotes({
  environmentId,
  event,
  projectId,
  onClose,
  attempts,
}: {
  environmentId: EnvironmentId;
  event: CalendarOccurrenceSummary;
  projectId: ProjectId | undefined;
  onClose: () => void;
  attempts: Map<string, NoteAttempt>;
}) {
  const resources = useWorkspaceResources();
  const attemptKey = JSON.stringify([environmentId, event.id]);
  const meeting = useMemo(() => ({ ref: calendarItemRef(event.id), title: event.title }), [event]);
  const links = useEnvironmentQuery(
    workspaceLinks.list({ environmentId, input: { item: meeting.ref } }),
  );
  const canOperate = useWorkspaceCanOperate(environmentId);
  const create = useAtomCommand(workspaceNotes.create, { reportFailure: false });
  const link = useAtomCommand(workspaceLinks.link, { reportFailure: false });
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [attempt] = useState(() => {
    const previous = attempts.get(attemptKey);
    if (previous) return previous;
    const suffix = " \u00b7 Meeting notes";
    const title = event.title.slice(0, 300 - suffix.length).replace(/[\uD800-\uDBFF]$/u, "");
    const next = {
      requestId: randomUUID(),
      title: `${title}${suffix}`,
      attempted: false,
      saved: null,
      grantProject: false,
      projectId,
    };
    attempts.set(attemptKey, next);
    return next;
  });
  const [attempted, setAttempted] = useState(attempt.attempted);
  const [saved, setSavedState] = useState<WorkspaceLinkEndpoint | null>(attempt.saved);
  const setSaved = (note: WorkspaceLinkEndpoint) => {
    attempts.set(attemptKey, { ...(attempts.get(attemptKey) ?? attempt), saved: note });
    if (mounted.current) setSavedState(note);
  };
  const requestId = attempt.requestId;
  const [grantProject, setGrantProject] = useState(attempt.grantProject);
  const opened = useRef(false);
  const candidates =
    links.data?.linked
      .filter((v) => v.status === "confirmed" && isWorkspaceNote(v.item.ref))
      .map((v) => v.item) ?? [];
  const open = (note: WorkspaceLinkEndpoint) => {
    if (!mounted.current) return;
    if (isWorkspaceNote(note.ref)) {
      const result = openMeetingNote(resources, {
        environmentId,
        note: note.ref,
        ...((attempt.projectId ?? resources.projectId)
          ? { projectId: (attempt.projectId ?? resources.projectId)! }
          : {}),
      });
      if (result === "opened") onClose();
      else setError("Choose a resource project, then open this note.");
    }
  };
  useEffect(() => {
    if (!links.error && candidates.length === 1 && !links.data?.truncated && !opened.current) {
      opened.current = true;
      open(candidates[0]!);
    }
  });
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      if (cause instanceof MeetingNoteLinkError) setSaved(cause.note);
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Notes are unavailable. Their links have been kept.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const commands = {
    create: async (input: { requestId: string; title: string; body: string }) => {
      const result = await create({ environmentId, input });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      return result.value;
    },
    link: async (input: Parameters<typeof link>[0]["input"]) => {
      const result = await link({ environmentId, input });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      return result.value;
    },
  };
  return (
    <section
      aria-label="Meeting notes"
      className="m-4 flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h3 className="text-sm font-semibold">Notes &amp; agenda</h3>
      {links.data?.truncated ? (
        <p>
          Some linked notes are not shown. Choose an exact note reference or use Linked context.
        </p>
      ) : null}
      {links.isPending ? <p>Loading linked notes...</p> : null}
      {links.error ? (
        <p role="alert">Notes are unavailable. Their links have been kept. {links.error}</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {candidates.map((note) => (
        <Button
          key={JSON.stringify(note.ref)}
          size="xs"
          variant="outline"
          onClick={() => open(note)}
        >
          {note.title ?? "Open linked note"}
        </Button>
      ))}
      {!links.isPending && !links.error && candidates.length === 0 ? (
        <>
          <p>No linked notes. Create a note or link an existing note by its exact reference.</p>
          {projectId ? (
            <label className="text-xs">
              <input
                type="checkbox"
                disabled={attempted || busy}
                checked={grantProject}
                onChange={(e) => {
                  attempts.set(attemptKey, { ...attempt, grantProject: e.target.checked });
                  setGrantProject(e.target.checked);
                }}
              />{" "}
              Also link this note to the selected project
            </label>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            disabled={!canOperate || busy}
            onClick={() =>
              void run(async () => {
                setAttempted(true);
                attempts.set(attemptKey, {
                  ...(attempts.get(attemptKey) ?? attempt),
                  attempted: true,
                });
                const note = await createMeetingNote(
                  commands,
                  {
                    environmentId,
                    requestId,
                    title: attempt.title,
                    body: "",
                    meeting,
                    ...(grantProject && attempt.projectId ? { projectId: attempt.projectId } : {}),
                  },
                  setSaved,
                );
                open(note);
              })
            }
          >
            {saved ? "Retry linking" : "Create meeting note"}
          </Button>
          <label className="text-xs">
            Note reference
            <Input
              aria-label="Note reference"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <Button
            size="xs"
            variant="outline"
            disabled={!canOperate || busy}
            onClick={() =>
              void run(async () => {
                const ref = parseNoteLocation(address);
                if (!ref) throw new Error("Paste a valid workspace note reference.");
                const note = { ref };
                await commands.link({
                  a: meeting,
                  b: note,
                  viewing: meeting,
                  source: { type: "user" },
                });
                open(note);
              })
            }
          >
            Link existing note
          </Button>
        </>
      ) : null}
      {saved ? (
        <Button size="xs" variant="outline" onClick={() => open(saved)}>
          Open saved note
        </Button>
      ) : null}
      <Button size="xs" variant="ghost" onClick={onClose}>
        Close notes chooser
      </Button>
    </section>
  );
}
