import type { CalendarDueTask, CalendarOccurrenceSummary } from "@t3tools/contracts";
import { useMemo, type ReactNode } from "react";
import { formatEventTime, formatWeek, displayDay } from "@t3tools/client-runtime/calendar/dates";
import { Button } from "../../ui/button";
import { CalendarEventCard, type CalendarEventCardProps } from "./CalendarEventCard";
import { CalendarDayStrip } from "./CalendarDayStrip";
import { CalendarWeek } from "./CalendarWeek";
import { CalendarDatePicker } from "./CalendarDatePicker";
import { sortCalendarEvents } from "./weekLayout";
import { CalendarSchedule } from "./CalendarSchedule";
export interface CalendarAgendaProps {
  readonly day: string;
  readonly today: string;
  readonly timeZone: string;
  readonly space: "calendar" | "meetings";
  readonly view?: "agenda" | "week";
  readonly pickerDefaultOpen?: boolean;
  readonly events: readonly CalendarOccurrenceSummary[];
  readonly dueTasks: readonly CalendarDueTask[];
  readonly status: "ready" | "loading" | "unavailable" | "disconnected";
  readonly error?: string | null;
  readonly incomplete?: boolean;
  readonly dueIncomplete?: boolean;
  readonly fetchedAt?: number;
  readonly nextEvents?: boolean;
  readonly nextDue?: boolean;
  readonly onSelectDay: (day: string) => void;
  readonly notesEventId?: string | undefined;
  readonly onSelect: CalendarEventCardProps["onSelect"];
  readonly onNotes: CalendarEventCardProps["onNotes"];
  readonly onJoin?: CalendarEventCardProps["onJoin"];
  readonly handoffClient?: CalendarEventCardProps["handoffClient"];
  readonly onSchedule?: (url: string) => void;
  readonly onRetry?: () => void;
  readonly onLoadMore?: (kind: "events" | "dueTasks") => void;
  readonly onOpenTask?: (task: CalendarDueTask) => void;
  readonly renderMenu?: (event: CalendarOccurrenceSummary) => ReactNode;
}
export function CalendarAgenda(props: CalendarAgendaProps) {
  const { day, timeZone } = props;
  const events = useMemo(
    () =>
      sortCalendarEvents(
        props.events.filter((e) =>
          e.time.kind === "all-day"
            ? e.time.startOn <= day && day < e.time.endBefore
            : displayDay(e.time.start, timeZone) <= day &&
              displayDay(new Date(Date.parse(e.time.end) - 1).toISOString(), timeZone) >= day,
        ),
      ),
    [props.events, day, timeZone],
  );
  const due = props.dueTasks.filter((t) => t.dueOn === day);
  const row = (event: CalendarOccurrenceSummary) => (
    <div key={event.id} className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-start gap-x-3">
      <time
        dateTime={event.time.kind === "timed" ? event.time.start : undefined}
        className="pt-2 text-3xs text-muted-foreground"
      >
        {event.time.kind === "timed" ? formatEventTime(event.time.start, timeZone) : "All day"}
      </time>
      <CalendarEventCard
        event={event}
        onSelect={props.onSelect}
        onNotes={props.onNotes}
        notesOpen={props.notesEventId === event.id}
        {...(props.onJoin ? { onJoin: props.onJoin } : {})}
        {...(props.handoffClient ? { handoffClient: props.handoffClient } : {})}
        menu={props.renderMenu?.(event)}
      />
    </div>
  );
  return (
    <section
      aria-label={
        props.space === "calendar"
          ? props.view === "week"
            ? "Calendar week"
            : "Calendar agenda"
          : "Upcoming meetings"
      }
      className="min-w-0 p-4"
    >
      <div className="mb-[17px] flex min-h-[41px] items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-calendar-heading font-semibold">
            <CalendarDatePicker
              day={day}
              today={props.today}
              onSelectDay={props.onSelectDay}
              defaultOpen={props.pickerDefaultOpen ?? false}
            />
          </h2>
          <p className="mt-1 text-3xs leading-4 text-muted-foreground">
            {props.space === "meetings"
              ? "Prepare, meet and follow through."
              : `Your week · ${formatWeek(day)}`}
          </p>
        </div>
        <div className="pt-2">
          <CalendarSchedule
            key={day}
            day={day}
            {...(props.handoffClient ? { client: props.handoffClient } : {})}
            {...(props.onSchedule ? { onOpen: props.onSchedule } : {})}
          />
        </div>
      </div>
      {props.view !== "week" ? (
        <CalendarDayStrip day={day} onSelectDay={props.onSelectDay} />
      ) : null}
      {props.status === "loading" ? <p role="status">Loading calendar...</p> : null}
      {props.status === "unavailable" ? (
        <p role="status">Calendar is unavailable on this server.</p>
      ) : null}
      {props.status === "disconnected" ? (
        <p role="status">
          Calendar is disconnected.
          {props.events.length || props.dueTasks.length ? " Showing the last saved results." : ""}
        </p>
      ) : null}
      {props.error ? (
        <div role="alert">
          <p>{props.error}</p>
          <Button variant="ghost" size="xs" onClick={props.onRetry}>
            Retry calendar
          </Button>
        </div>
      ) : null}
      {props.incomplete || props.dueIncomplete ? (
        <p role="status" className="mb-3 text-xs text-muted-foreground">
          Some calendars could not be refreshed. Showing the last saved results.
          {props.fetchedAt
            ? ` Fetched ${formatEventTime(new Date(props.fetchedAt).toISOString(), timeZone)}.`
            : ""}
        </p>
      ) : null}
      {props.view === "week" ? (
        <CalendarWeek {...props} />
      ) : (
        <div className="flex flex-col gap-4">
          {due.length || events.some((e) => e.time.kind === "all-day") ? (
            <div role="group" aria-label="All day and due tasks" className="flex flex-col gap-4">
              {events.filter((e) => e.time.kind === "all-day").map(row)}
              {due.map((task) => (
                <div key={task.ref.taskId} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3">
                  <span className="text-3xs text-muted-foreground">Due</span>
                  <button
                    type="button"
                    onClick={() => props.onOpenTask?.(task)}
                    className="text-left text-xs underline"
                  >
                    {task.title}
                    {task.done ? " · Completed" : ""}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {events.filter((e) => e.time.kind === "timed").map(row)}
        </div>
      )}
      {props.status === "ready" &&
      !props.error &&
      (props.view === "week"
        ? !props.events.length && !props.dueTasks.length
        : !events.length && !due.length) ? (
        <p>{props.view === "week" ? "No meetings this week." : "No meetings on this day."}</p>
      ) : null}
      <div className="mt-4 flex gap-2">
        {props.nextEvents ? (
          <Button variant="outline" size="xs" onClick={() => props.onLoadMore?.("events")}>
            Load more events
          </Button>
        ) : null}
        {props.nextDue ? (
          <Button variant="outline" size="xs" onClick={() => props.onLoadMore?.("dueTasks")}>
            Load more due tasks
          </Button>
        ) : null}
      </div>
    </section>
  );
}
