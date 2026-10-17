import { useState } from "react";
import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import { CalendarAgenda } from "../calendar/CalendarAgenda";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";
export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
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
  const initial = session.clock.today();
  function Center() {
    const [day, setDay] = useState<string>(initial);
    return (
      <CalendarAgenda
        day={day}
        timeZone={session.timeZone}
        space={session.recipe.space === "meetings" ? "meetings" : "calendar"}
        events={events}
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
      await Promise.all(pending);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
    },
  };
};
