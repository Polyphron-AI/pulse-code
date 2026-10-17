import { useState } from "react";
import { Button } from "../../ui/button";
import { MeetingRecordingsView } from "../meetings/MeetingRecordingsView";
import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import { CalendarAgenda } from "../calendar/CalendarAgenda";
import { WorkspaceItemMenuView } from "../WorkspaceItemMenuView";
import { CalendarHandoffLink } from "../calendar/CalendarHandoffLink";
import { validatedConferenceUrl } from "@t3tools/shared/calendarLinks";
import type { CalendarHandoffClient } from "../calendar/calendarHandoff";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";
export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  const state = session.calendarState;
  const fold = state === "dst-fold";
  const gap = state === "dst-gap";
  const untimed = state === "week-allday" || state === "week-overflow";
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
      ...((state === "no-url" && event.id === "event-handoff") || state === "no-url-menu"
        ? {}
        : { joinUrl: event.joinUrl }),
    }));
  const foldEvents: readonly CalendarOccurrenceSummary[] = [
    {
      ...events[0]!,
      id: "fixture-fold-first",
      title: "Ops sync",
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
      title: "Ops sync",
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
  const handoffClient: CalendarHandoffClient = {
    copyText: async () => {},
    ...(state === "desktop-reject"
      ? {
          openExternal: async () => {
            throw new Error("Fixture rejected external opening.");
          },
        }
      : {}),
  };
  function EventMenu({ event }: { readonly event: CalendarOccurrenceSummary }) {
    const [open, setOpen] = useState(false);
    const url = event.joinUrl ? validatedConferenceUrl(event.joinUrl) : undefined;
    const available = Boolean(url) || state === "no-url-menu";
    return (
      <WorkspaceItemMenuView
        available={available}
        open={open}
        onOpenChange={(value) => setOpen(value && available)}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(available);
        }}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            setOpen(available);
          }
        }}
        actions={
          open && url ? (
            <div className="flex flex-wrap items-center gap-3">
              <CalendarHandoffLink
                target={{ kind: "meeting", raw: url }}
                client={handoffClient}
                menu
                onOpen={(address) =>
                  record(
                    "join",
                    {
                      type: "provider-resource",
                      provider: "workspace-calendar",
                      resourceId: event.id,
                    },
                    address,
                  )
                }
              />
            </div>
          ) : open && state === "no-url-menu" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => record("open-thread")}
              >
                Start thread
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => record("link")}>
                Add to project
              </Button>
            </div>
          ) : null
        }
      >
        <span className="sr-only">Event actions</span>
      </WorkspaceItemMenuView>
    );
  }
  function Center() {
    const [day, setDay] = useState<string>(initial);
    if (state === "recordings") return <MeetingRecordingsView />;
    return (
      <div
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest('a[target="_blank"]')) event.preventDefault();
        }}
      >
        <CalendarAgenda
          day={day}
          today={session.clock.today()}
          timeZone={timeZone}
          view={session.recipe.view === "week" ? "week" : "agenda"}
          pickerDefaultOpen={state === "picker"}
          space={session.recipe.space === "meetings" ? "meetings" : "calendar"}
          events={
            state === "empty" || state === "loading" || state === "unavailable"
              ? []
              : fold
                ? foldEvents
                : gap
                  ? gapEvents
                  : untimed
                    ? [...events, allDay]
                    : events
          }
          dueTasks={
            untimed
              ? Array.from({ length: state === "week-overflow" ? 12 : 1 }, (_, index) => ({
                  ref: {
                    type: "task" as const,
                    taskId: index === 0 ? "fixture-due" : `fixture-due-${index}`,
                  },
                  title: index === 0 ? "Prepare launch brief" : `Launch follow-up ${index}`,
                  projectId: session.resourceProjectId,
                  dueOn: "2026-10-15",
                  done: false,
                  revision: 1,
                }))
              : []
          }
          status={
            state === "loading" || state === "disconnected" || state === "unavailable"
              ? state
              : "ready"
          }
          incomplete={state === "partial"}
          error={state === "error" ? "Fixture calendar read failed." : null}
          fetchedAt={session.clock.now().getTime()}
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
          onSchedule={(url) => record("schedule", undefined, url)}
          handoffClient={handoffClient}
          renderMenu={(event) =>
            (event.joinUrl && validatedConferenceUrl(event.joinUrl)) || state === "no-url-menu" ? (
              <EventMenu event={event} />
            ) : null
          }
        />
      </div>
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
