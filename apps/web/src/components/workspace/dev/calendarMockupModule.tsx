import { useState } from "react";
import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import { CalendarAgenda } from "../calendar/CalendarAgenda";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";
export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  const state = session.calendarState;
  const fold = state === "dst-fold";
  const gap = state === "dst-gap";
  const timeZone = session.timeZone;
  let disposed = false;
  const pending = new Set<Promise<void>>();
  const record = (
    kind: Parameters<typeof session.record>[0],
    item?: Parameters<typeof session.record>[1],
    value?: string,
  ) => {
    if (disposed) return;
    const work = session.record(kind, item, value);
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => {});
  };
  const events: readonly CalendarOccurrenceSummary[] = session.seed.events
    .slice(0, 100)
    .map((event) => ({
      id: event.id,
      title: event.title,
      revision: 1,
      status: "confirmed",
      sourceLabel: event.source,
      time: {
        kind: "timed",
        start: event.start,
        end: new Date(Date.parse(event.start) + event.durationMinutes * 60000).toISOString(),
        sourceTimeZone: session.timeZone,
      },
      attendees: event.attendeeIds.slice(0, 20).map((id) => {
        const person = session.seed.people.find((p) => p.id === id)!;
        return { name: person.name, initials: person.initials };
      }),
      attendeesTruncated: false,
      hasDescription: Boolean(event.description),
      ...(event.description ? { descriptionPreview: event.description.slice(0, 160) } : {}),
      joinUrl: event.joinUrl,
    }));
  const foldEvents: readonly CalendarOccurrenceSummary[] = [
    {
      ...events[0]!,
      id: "fixture-fold-first",
      title: "First 01:30",
      time: {
        kind: "timed",
        start: "2026-11-01T05:30:00Z",
        end: "2026-11-01T05:55:00Z",
        sourceTimeZone: timeZone,
      },
    },
    {
      ...events[0]!,
      id: "fixture-fold-second",
      title: "Second 01:30",
      time: {
        kind: "timed",
        start: "2026-11-01T06:30:00Z",
        end: "2026-11-01T06:55:00Z",
        sourceTimeZone: timeZone,
      },
    },
  ];
  const gapEvents: readonly CalendarOccurrenceSummary[] = [
    {
      ...events[0]!,
      id: "fixture-gap-before",
      title: "Before the gap",
      time: {
        kind: "timed",
        start: "2026-03-08T06:30:00Z",
        end: "2026-03-08T06:55:00Z",
        sourceTimeZone: timeZone,
      },
    },
    {
      ...events[0]!,
      id: "fixture-gap-after",
      title: "After the gap",
      time: {
        kind: "timed",
        start: "2026-03-08T07:00:00Z",
        end: "2026-03-08T07:30:00Z",
        sourceTimeZone: timeZone,
      },
    },
  ];
  const allDay: CalendarOccurrenceSummary = {
    ...events[0]!,
    id: "fixture-all-day",
    title: "Launch planning",
    time: { kind: "all-day", startOn: "2026-10-14", endBefore: "2026-10-16" },
  };
  const initial = fold ? "2026-11-01" : gap ? "2026-03-08" : session.clock.today();
  function Center() {
    const [day, setDay] = useState<string>(initial);
    return (
      <CalendarAgenda
        day={day}
        today={session.clock.today()}
        timeZone={timeZone}
        view={session.recipe.view === "week" ? "week" : "agenda"}
        pickerDefaultOpen={state === "picker"}
        space={session.recipe.space === "meetings" ? "meetings" : "calendar"}
        events={
          fold
            ? foldEvents
            : gap
              ? gapEvents
              : state === "week-allday"
                ? [...events, allDay]
                : events
        }
        dueTasks={
          state === "week-allday"
            ? [
                {
                  ref: { type: "task", taskId: "fixture-due" },
                  title: "Prepare launch brief",
                  projectId: session.resourceProjectId,
                  dueOn: "2026-10-15",
                  done: false,
                  revision: 1,
                },
              ]
            : []
        }
        status="ready"
        onSelectDay={(value) => {
          if (disposed) return;
          setDay(value);
          record("navigate", undefined, value);
        }}
        onSelect={(event) =>
          record("navigate", {
            type: "provider-resource",
            provider: "workspace-calendar",
            resourceId: event.id,
          })
        }
        onNotes={(event) => {
          const note = session.seed.events.find((e) => e.id === event.id)!.noteId;
          record("navigate", {
            type: "provider-resource",
            provider: "workspace-note",
            resourceId: note,
          });
        }}
        onJoin={(event, url) =>
          record(
            "join",
            { type: "provider-resource", provider: "workspace-calendar", resourceId: event.id },
            url,
          )
        }
        onSchedule={() => record("schedule", undefined, day)}
        validateJoin={(raw) =>
          session.seed.events.some((e) => e.joinUrl === raw) ? raw : undefined
        }
      />
    );
  }
  return {
    area: "calendar",
    readyRegions: ["center"],
    center: <Center />,
    settled: async () => {
      await Promise.all(pending);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
    },
  };
};
