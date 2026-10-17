import { randomUUID } from "../../../lib/utils";
import {
  createContext,
  useContext,
  useId,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
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
import { useProjects } from "../../../state/entities";
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
import { Checkbox } from "../../ui/checkbox";
import { Label } from "../../ui/label";
import { calendarItemRef } from "./calendarItemRef";
import { CalendarAgenda } from "./CalendarAgenda";
type NoteAttempt = {
  requestId: string;
  title: string;
  linkFailed: boolean;
  saved: WorkspaceLinkEndpoint | null;
  grantProject: boolean;
  projectId: ProjectId | undefined;
};
const CalendarNotesContext = createContext<Map<string, NoteAttempt> | null>(null);
/** Retains creation repair state while /workspace destinations unmount their readers. */
export function CalendarNotesProvider({ children }: { readonly children: ReactNode }) {
  // Repair records are intentionally non-reactive and exist only after a create dispatch.
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
  const [now] = useState(() => new Date().toISOString());
  const today = useMemo(() => displayDay(now, timeZone), [now, timeZone]);
  const day = search.day ?? today;
  const range = useMemo(() => {
    const days = weekDates(day);
    return { startOn: days[0]!, endBefore: addDays(days[6]!, 1), timeZone };
  }, [day, timeZone]);
  const query = useEnvironmentQuery(workspaceCalendar.range({ environmentId, input: range }));
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const loadMore = useAtomCommand(workspaceCalendar.loadMore, { reportFailure: false });
  const [loadError, setLoadError] = useState<{
    range: string;
    fetchedAt: number;
    message: string;
  } | null>(null);
  const rangeKey = JSON.stringify(range);
  const error =
    loadError?.range === rangeKey && loadError.fetchedAt === query.dataUpdatedAt
      ? loadError.message
      : null;
  if (loadError && error === null) setLoadError(null);
  const [notes, setNotes] = useState<CalendarOccurrenceSummary | null>(null);
  const notesTrigger = useRef<HTMLButtonElement | null>(null);
  const attempts = useContext(CalendarNotesContext);
  if (!attempts) throw new Error("CalendarSpace requires CalendarNotesProvider.");
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
      <CalendarAgenda
        day={day}
        timeZone={timeZone}
        space={space}
        view={space === "calendar" && search.view === "week" ? "week" : "agenda"}
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
              view: space === "calendar" ? (search.view ?? "agenda") : "upcoming",
              day: value,
            },
          });
        }}
        onSelect={(event) => {
          void navigate({
            to: "/workspace",
            search: {
              ...search,
              space,
              view: space === "calendar" ? (search.view ?? "agenda") : "upcoming",
              day,
              item: JSON.stringify(calendarItemRef(event.id)),
            },
          });
        }}
        onNotes={(event, trigger) => {
          notesTrigger.current = trigger;
          setNotes(event);
        }}
        notesEventId={notes?.id}
        onRetry={() => {
          setLoadError(null);
          query.refresh();
        }}
        onLoadMore={(kind) => {
          void loadMore({ environmentId, input: { range, kind } }).then((result) => {
            if (result._tag === "Failure") {
              const cause = squashAtomCommandFailure(result);
              setLoadError({
                range: rangeKey,
                fetchedAt: query.dataUpdatedAt,
                message:
                  cause instanceof Error
                    ? cause.message
                    : "Calendar could not load more results. Retry calendar.",
              });
            } else setLoadError(null);
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
      {query.data?.unavailableReason ? (
        <div className="px-4 pb-4">
          <Link to="/workspace" search={{ space: "office" }} className="text-sm underline">
            Open local Office tools
          </Link>
        </div>
      ) : null}
      {notes ? (
        <MeetingNotes
          key={notes.id}
          environmentId={environmentId}
          event={notes}
          attempts={attempts}
          connected={connected}
          projectId={
            resources.projectId ?? (search.project ? ProjectId.make(search.project) : undefined)
          }
          onClose={() => {
            setNotes((current) => (current?.id === notes.id ? null : current));
            notesTrigger.current?.focus();
          }}
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
  connected,
}: {
  environmentId: EnvironmentId;
  event: CalendarOccurrenceSummary;
  projectId: ProjectId | undefined;
  onClose: () => void;
  attempts: Map<string, NoteAttempt>;
  connected: boolean;
}) {
  const resources = useWorkspaceResources();
  const attemptKey = JSON.stringify([environmentId, event.id]);
  const meeting = useMemo(() => ({ ref: calendarItemRef(event.id), title: event.title }), [event]);
  const links = useEnvironmentQuery(
    workspaceLinks.list({ environmentId, input: { item: meeting.ref } }),
  );
  const canOperate = useWorkspaceCanOperate(environmentId);
  const writable = connected && canOperate;
  const projects = useProjects();
  const create = useAtomCommand(workspaceNotes.create, { reportFailure: false });
  const link = useAtomCommand(workspaceLinks.link, { reportFailure: false });
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const checkboxId = useId();
  const currentContext = useRef({ resources, projectId });
  useEffect(() => {
    currentContext.current = { resources, projectId };
  }, [resources, projectId]);
  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);
  const [attempt, setAttempt] = useState(() => attempts.get(attemptKey));
  const saveAttempt = (next: NoteAttempt) => {
    attempts.set(attemptKey, next);
    if (mounted.current) setAttempt(next);
  };
  const saved = attempt?.saved;
  const [grantProject, setGrantProject] = useState(attempt?.grantProject ?? false);
  const linkProjectId = attempt ? attempt.projectId : projectId;
  const projectLabel =
    attempt && linkProjectId !== projectId
      ? `Also link this note to ${projects.find((project) => project.environmentId === environmentId && project.id === linkProjectId)?.title ?? linkProjectId}`
      : "Also link this note to the selected project";
  const opened = useRef(false);
  const candidates =
    links.data?.linked
      .filter((v) => v.status === "confirmed" && isWorkspaceNote(v.item.ref))
      .map((v) => v.item) ?? [];
  const open = (note: WorkspaceLinkEndpoint) => {
    if (!mounted.current) return;
    if (isWorkspaceNote(note.ref)) {
      const context = currentContext.current;
      const destination = context.resources.projectId ?? context.projectId;
      const result = openMeetingNote(context.resources, {
        environmentId,
        note: note.ref,
        ...(destination ? { projectId: destination } : {}),
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
  }, [links.error, links.data?.truncated, candidates, open]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      const current = attempts.get(attemptKey);
      if (cause instanceof MeetingNoteLinkError && current)
        saveAttempt({ ...current, saved: cause.note, linkFailed: true });
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
      <h3 ref={heading} tabIndex={-1} className="text-sm font-semibold">
        Notes &amp; agenda
      </h3>
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
          {linkProjectId ? (
            <Label htmlFor={checkboxId}>
              <Checkbox
                id={checkboxId}
                disabled={Boolean(attempt) || busy}
                checked={grantProject}
                onCheckedChange={setGrantProject}
              />
              {projectLabel}
            </Label>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            disabled={!writable || busy}
            onClick={() =>
              void run(async () => {
                if (!writable) return;
                const suffix = " · Meeting notes";
                const next = attempt ?? {
                  requestId: randomUUID(),
                  title: `${event.title.slice(0, 300 - suffix.length).replace(/[\uD800-\uDBFF]$/u, "")}${suffix}`,
                  saved: null,
                  linkFailed: false,
                  grantProject,
                  projectId,
                };
                saveAttempt(next);
                const note = await createMeetingNote(
                  commands,
                  {
                    environmentId,
                    requestId: next.requestId,
                    title: next.title,
                    body: "",
                    meeting,
                    ...(next.grantProject && next.projectId ? { projectId: next.projectId } : {}),
                  },
                  (note) => saveAttempt({ ...next, saved: note }),
                );
                attempts.delete(attemptKey);
                if (mounted.current) {
                  setAttempt(undefined);
                  setGrantProject(false);
                }
                open(note);
              })
            }
          >
            {attempt?.linkFailed ? "Retry linking" : "Create meeting note"}
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
            disabled={!writable || busy}
            onClick={() =>
              void run(async () => {
                if (!writable) return;
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
