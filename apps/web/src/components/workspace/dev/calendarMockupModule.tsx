import { useState } from "react";
import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import { CalendarAgenda } from "../calendar/CalendarAgenda";
import { preloadCalendarPicker } from "../calendar/CalendarDatePicker";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";
export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  const state = session.calendarState;
  const pickerReady = state === "picker" ? preloadCalendarPicker() : undefined;
  const fold = state === "dst-fold";
  const timeZone = fold ? "America/New_York" : session.timeZone;
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
  const initial = fold ? "2026-11-01" : session.clock.today();
  function Center() {
    const [day, setDay] = useState<string>(initial);
    return (
      <CalendarAgenda
        day={day}
        timeZone={timeZone}
        view={state && state !== "picker" ? "week" : "agenda"}
        pickerDefaultOpen={state === "picker"}
        space={session.recipe.space === "meetings" ? "meetings" : "calendar"}
        events={fold ? foldEvents : events}
        dueTasks={[]}
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
      await Promise.all([...pending, pickerReady]);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
    },
  };
};
