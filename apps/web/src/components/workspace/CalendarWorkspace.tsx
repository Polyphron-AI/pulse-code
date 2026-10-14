import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  OfficeAccount,
  OfficeCalendar,
  OfficeEvent,
  OfficeEventInput,
  EnvironmentId,
} from "@t3tools/contracts";
import { CalendarDaysIcon, PlusIcon, VideoIcon } from "lucide-react";
import { OfficeSubnav } from "./OfficeSubnav";
import { SidebarInset } from "../ui/sidebar";
import { Button } from "../ui/button";
import { fieldClass, RequestState, useOfficeRequest } from "./office/shared";
import { TalkPanel } from "./office/TalkPanel";
import { MeetingNotesPanel } from "./MeetingNotesPanel";
import { usePrimaryEnvironmentId } from "../../state/environments";

const localDateTime = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function EventEditor({
  calendars,
  accounts,
  event,
  onSaved,
  onClose,
}: {
  calendars: readonly OfficeCalendar[];
  accounts: readonly OfficeAccount[];
  event?: OfficeEvent | undefined;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { run, busy, error } = useOfficeRequest();
  const writable = calendars.filter(
    (calendar) =>
      calendar.writable &&
      accounts
        .find((account) => account.id === calendar.accountId)
        ?.capabilities.includes("calendarWrite"),
  );
  const [calendarKey, setCalendarKey] = useState(
    event
      ? JSON.stringify([event.accountId, event.calendarId])
      : writable[0]
        ? JSON.stringify([writable[0].accountId, writable[0].id])
        : "",
  );
  const [title, setTitle] = useState(event?.title ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [start, setStart] = useState(() =>
    event
      ? event.allDay
        ? event.start.slice(0, 10)
        : localDateTime(event.start)
      : localDateTime(new Date().toISOString()),
  );
  const [end, setEnd] = useState(() =>
    event
      ? event.allDay
        ? event.end.slice(0, 10)
        : localDateTime(event.end)
      : localDateTime(new Date(Date.now() + 3600000).toISOString()),
  );
  const [description, setDescription] = useState(event?.description ?? "");
  const [attendees, setAttendees] = useState(event?.attendees?.join(", ") ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [createMeeting, setCreateMeeting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState("");
  async function save() {
    if (!calendarKey || busy) return;
    if (
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start)
    ) {
      setNotice("Choose an end after the start.");
      return;
    }
    const [accountId, calendarId] = JSON.parse(calendarKey) as [string, string];
    const input: OfficeEventInput = {
      title,
      start: allDay ? start : new Date(start).toISOString(),
      end: allDay ? end : new Date(end).toISOString(),
      allDay,
      description,
      location,
      attendees: attendees
        .split(/[,;\n]/)
        .map((email) => email.trim())
        .filter(Boolean),
      createMeeting,
    };
    const result = await run(
      event
        ? { operation: "calendars.update", accountId, calendarId, eventId: event.id, event: input }
        : { operation: "calendars.create", accountId, calendarId, event: input },
    );
    if (result) onSaved();
  }
  return (
    <aside
      className="w-full shrink-0 overflow-y-auto border-l bg-background p-5 lg:w-96"
      aria-label="Calendar event editor"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{event ? "Edit event" : "New event"}</h2>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
      <RequestState busy={busy} error={error} />
      {notice && (
        <p role="alert" className="mb-3 text-sm">
          {notice}
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="block space-y-1 text-sm">
          Calendar
          <select
            className={fieldClass}
            required
            disabled={!!event || busy}
            value={calendarKey}
            onChange={(e) => setCalendarKey(e.target.value)}
          >
            <option value="">Choose a writable calendar</option>
            {writable.map((calendar) => (
              <option
                key={JSON.stringify([calendar.accountId, calendar.id])}
                value={JSON.stringify([calendar.accountId, calendar.id])}
              >
                {calendar.name} ·{" "}
                {accounts.find((account) => account.id === calendar.accountId)?.email}
              </option>
            ))}
          </select>
        </label>
        {!writable.length && (
          <p className="text-sm text-muted-foreground">
            Enable editing for an account and select a calendar you can change.
          </p>
        )}
        <label className="block space-y-1 text-sm">
          Title
          <input
            required
            maxLength={4096}
            className={fieldClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => {
              const next = e.target.checked;
              setAllDay(next);
              setStart(next ? start.slice(0, 10) : `${start}T09:00`);
              setEnd(next ? end.slice(0, 10) : `${end}T10:00`);
            }}
          />
          All day
        </label>
        <label className="block space-y-1 text-sm">
          Start
          <input
            required
            type={allDay ? "date" : "datetime-local"}
            className={fieldClass}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          {allDay ? "Ends before" : "End"}
          <input
            required
            type={allDay ? "date" : "datetime-local"}
            className={fieldClass}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Agenda
          <textarea
            maxLength={20000}
            rows={5}
            className={fieldClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Attendees
          <input
            className={fieldClass}
            placeholder="Email addresses, separated by commas"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Location
          <input
            maxLength={4096}
            className={fieldClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        {!event?.meetingUrl && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={createMeeting}
              onChange={(e) => setCreateMeeting(e.target.checked)}
            />
            Request a Google Meet or Microsoft Teams link
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Saving sends invitations and updates through your calendar account. Meeting links depend
          on your Google or Microsoft plan and calendar settings. Recurring events edit this
          occurrence.
        </p>
        <Button type="submit" disabled={busy || !calendarKey}>
          {event ? "Save and notify attendees" : "Create and invite"}
        </Button>
      </form>
      {event && (
        <div className="mt-6 border-t pt-4">
          {confirmDelete ? (
            <>
              <p className="mb-2 text-sm">Delete this event and notify attendees?</p>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    const result = await run({
                      operation: "calendars.delete",
                      accountId: event.accountId,
                      calendarId: event.calendarId,
                      eventId: event.id,
                    });
                    if (result) onSaved();
                  })()
                }
              >
                Confirm delete
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Keep event
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete event
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}

export function CalendarWorkspace({
  meetings = false,
  tasksPanel,
  requestedNote,
}: {
  meetings?: boolean;
  tasksPanel?: ReactNode;
  requestedNote?:
    | { accountId: string; eventId: string; environmentId?: EnvironmentId | undefined }
    | undefined;
}) {
  const { run, busy, error } = useOfficeRequest({ queue: true });
  const [accounts, setAccounts] = useState<readonly OfficeAccount[]>([]);
  const [calendars, setCalendars] = useState<readonly OfficeCalendar[]>([]);
  const [events, setEvents] = useState<readonly OfficeEvent[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<"upcoming" | "recordings">("upcoming");
  const [editor, setEditor] = useState<OfficeEvent | "new">();
  const [tasksOpen, setTasksOpen] = useState(false);
  const [notesEvent, setNotesEvent] = useState<
    Pick<OfficeEvent, "id" | "accountId" | "title"> & { environmentId?: EnvironmentId | undefined }
  >();
  useEffect(() => {
    if (!requestedNote) return;
    setEditor(undefined);
    setNotesEvent({
      accountId: requestedNote.accountId,
      id: requestedNote.eventId,
      title: "Meeting notes",
      environmentId: requestedNote.environmentId,
    });
  }, [requestedNote?.accountId, requestedNote?.eventId, requestedNote?.environmentId]);
  const environmentId = usePrimaryEnvironmentId();
  const notesEnvironmentId = notesEvent?.environmentId ?? environmentId;
  const available = !!window.desktopBridge?.officeInvoke;
  const refresh = useCallback(async () => {
    const response = await run({ operation: "accounts.list" });
    if (!response?.accounts) return;
    setAccounts(response.accounts);
    const nextCalendars: OfficeCalendar[] = [];
    const nextEvents: OfficeEvent[] = [];
    for (const account of response.accounts.filter((a) => a.capabilities.includes("calendar"))) {
      const list = await run({ operation: "calendars.list", accountId: account.id });
      if (!list) return;
      nextCalendars.push(...(list.calendars ?? []));
      const agenda = await run({
        operation: "calendars.events",
        accountId: account.id,
        timeMin: new Date(`${date}T00:00:00`).toISOString(),
        timeMax: new Date(new Date(`${date}T00:00:00`).getTime() + 7 * 86400000).toISOString(),
      });
      if (!agenda) return;
      nextEvents.push(...(agenda.events ?? []));
    }
    setCalendars(nextCalendars);
    setEvents(nextEvents.sort((a, b) => a.start.localeCompare(b.start)));
  }, [run, date]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function connect(provider: "google" | "microsoft", accountId?: string) {
    const result = await run({
      operation: "accounts.connectOAuth",
      provider,
      capabilities: ["calendar", "calendarWrite"],
      ...(accountId ? { accountId } : {}),
    });
    if (result) await refresh();
  }
  return (
    <SidebarInset className="min-w-0 overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <OfficeSubnav
          label={meetings ? "Meeting views" : "Calendar views"}
          items={
            meetings
              ? [
                  { id: "upcoming", label: "Upcoming", icon: CalendarDaysIcon },
                  { id: "recordings", label: "Recordings", icon: VideoIcon },
                ]
              : [{ id: "upcoming", label: "Agenda", icon: CalendarDaysIcon }]
          }
          value={tab}
          onChange={(id) => {
            if (id === "upcoming" || id === "recordings") setTab(id);
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center justify-between border-b px-5">
            <span className="text-sm text-muted-foreground">
              Office / <span className="text-foreground">{meetings ? "Meetings" : "Calendar"}</span>
            </span>
            {tasksPanel && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditor(undefined);
                  setNotesEvent(undefined);
                  setTasksOpen((open) => !open);
                }}
              >
                Tasks
              </Button>
            )}
            <Button size="sm" disabled={!available} onClick={() => setEditor("new")}>
              <PlusIcon />
              {meetings ? "Schedule meeting" : "New event"}
            </Button>
          </header>
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <main className="min-w-0 flex-1 overflow-y-auto p-5">
              {meetings && tab === "recordings" ? (
                <TalkPanel />
              ) : (
                <>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h1 className="flex items-center gap-2 text-xl font-semibold">
                      <CalendarDaysIcon className="size-5" />
                      {meetings ? "Upcoming meetings" : "Your calendar"}
                    </h1>
                    <Button
                      variant="outline"
                      disabled={busy || !available}
                      onClick={() => void refresh()}
                    >
                      Refresh
                    </Button>
                  </div>
                  <label className="mb-5 block max-w-xs space-y-1 text-sm">
                    Week starting
                    <input
                      type="date"
                      className={fieldClass}
                      value={date}
                      onChange={(e) => {
                        if (e.target.value) setDate(e.target.value);
                      }}
                    />
                  </label>
                  <RequestState busy={busy} error={error} />
                  {!available && (
                    <p className="my-5 text-sm text-muted-foreground">
                      Open Pulse desktop to connect calendars and schedule meetings. Accounts stay
                      on that computer.
                    </p>
                  )}
                  <details className="my-5 border-y py-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Calendars & accounts
                    </summary>
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={busy || !available}
                          onClick={() => void connect("google")}
                        >
                          Connect Google Calendar
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || !available}
                          onClick={() => void connect("microsoft")}
                        >
                          Connect Outlook Calendar
                        </Button>
                      </div>
                      {accounts
                        .filter(
                          (a) => a.provider !== "imap" && !a.capabilities.includes("calendarWrite"),
                        )
                        .map((account) => (
                          <div
                            key={account.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span>{account.email}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void connect(account.provider as "google" | "microsoft", account.id)
                              }
                            >
                              Enable calendar editing
                            </Button>
                          </div>
                        ))}
                      {calendars.map((calendar) => (
                        <label
                          key={JSON.stringify([calendar.accountId, calendar.id])}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={calendar.selected}
                            disabled={busy}
                            onChange={(e) => {
                              const selected = e.target.checked;
                              void (async () => {
                                const result = await run({
                                  operation: "calendars.select",
                                  accountId: calendar.accountId,
                                  calendarIds: calendars
                                    .filter(
                                      (c) =>
                                        c.accountId === calendar.accountId &&
                                        (c.id === calendar.id ? selected : c.selected),
                                    )
                                    .map((c) => c.id),
                                });
                                if (result) await refresh();
                              })();
                            }}
                          />
                          {calendar.name}
                          <span className="text-xs text-muted-foreground">
                            {accounts.find((a) => a.id === calendar.accountId)?.email}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                  {events.map((event) => (
                    <article
                      key={JSON.stringify([event.accountId, event.calendarId, event.id])}
                      className="space-y-2 border-b py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="font-medium">{event.title}</h2>
                          <p className="text-sm text-muted-foreground">
                            {event.allDay
                              ? `${event.start.slice(0, 10)} · All day`
                              : new Date(event.start).toLocaleString()}{" "}
                            · {accounts.find((a) => a.id === event.accountId)?.email}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!environmentId}
                          onClick={() => {
                            setEditor(undefined);
                            setNotesEvent(event);
                          }}
                        >
                          Notes
                        </Button>
                        {event.editable && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !accounts
                                .find((a) => a.id === event.accountId)
                                ?.capabilities.includes("calendarWrite")
                            }
                            onClick={() => setEditor(event)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                      {event.location && (
                        <p className="text-sm text-muted-foreground">{event.location}</p>
                      )}
                      {event.description && (
                        <details>
                          <summary className="cursor-pointer text-sm">Agenda & attendees</summary>
                          <p className="mt-2 whitespace-pre-wrap text-sm">{event.description}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {event.attendees?.join(", ")}
                          </p>
                        </details>
                      )}
                      {event.meetingUrl && (
                        <a
                          className="inline-block text-sm font-medium text-primary underline underline-offset-4"
                          href={event.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Join meeting
                        </a>
                      )}
                    </article>
                  ))}
                  {!busy && !events.length && (
                    <p className="py-10 text-sm text-muted-foreground">
                      No events in this week. Select calendars or create an event to get started.
                    </p>
                  )}
                </>
              )}
            </main>
            {!editor && !notesEvent && tasksPanel && tasksOpen && (
              <aside
                className="absolute inset-y-0 right-0 z-10 flex w-[min(440px,100%)] min-h-0 flex-col border-l bg-background xl:static xl:w-[440px] xl:shrink-0"
                aria-label="Meeting tasks"
              >
                <Button
                  className="m-2 self-end"
                  size="sm"
                  variant="ghost"
                  onClick={() => setTasksOpen(false)}
                >
                  Close tasks
                </Button>
                <div className="min-h-0 flex-1">{tasksPanel}</div>
              </aside>
            )}
            {!editor && notesEvent && notesEnvironmentId && (
              <div className="absolute inset-0 z-10 bg-background lg:static lg:w-96">
                <MeetingNotesPanel
                  key={JSON.stringify([notesEvent.accountId, notesEvent.id])}
                  environmentId={notesEnvironmentId}
                  event={notesEvent}
                  onClose={() => setNotesEvent(undefined)}
                />
              </div>
            )}
            {editor && (
              <div className="absolute inset-0 z-10 flex bg-background lg:static lg:w-96">
                <EventEditor
                  key={editor === "new" ? "new" : editor.id}
                  calendars={calendars}
                  accounts={accounts}
                  event={editor === "new" ? undefined : editor}
                  onClose={() => setEditor(undefined)}
                  onSaved={() => {
                    setEditor(undefined);
                    void refresh();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
