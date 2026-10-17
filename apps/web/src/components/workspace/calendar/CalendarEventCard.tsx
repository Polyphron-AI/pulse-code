import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { VideoIcon } from "lucide-react";
import { validatedConferenceUrl } from "@t3tools/shared/calendarLinks";
import { Button } from "../../ui/button";
export interface CalendarEventCardProps {
  readonly event: CalendarOccurrenceSummary;
  readonly onSelect: (event: CalendarOccurrenceSummary) => void;
  readonly onNotes: (event: CalendarOccurrenceSummary) => void;
  readonly onJoin?: (event: CalendarOccurrenceSummary, url: string) => void;
  readonly validateJoin?: (url: string) => string | undefined;
  readonly menu?: ReactNode;
}
export function CalendarEventCard({
  event,
  onSelect,
  onNotes,
  onJoin,
  validateJoin = validatedConferenceUrl,
  menu,
}: CalendarEventCardProps) {
  const url = event.joinUrl ? validateJoin(event.joinUrl) : undefined;
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card px-3 py-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onSelect(event)}
          className="min-w-0 flex-1 text-left text-xs leading-5 font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {event.title}
        </button>
        {url ? (
          <VideoIcon aria-hidden="true" className="mt-1 size-3 shrink-0 text-primary" />
        ) : null}
        {menu}
      </div>
      <p className="mt-1 text-3xs leading-4 text-muted-foreground">
        {event.time.kind === "timed"
          ? `${Math.round((Date.parse(event.time.end) - Date.parse(event.time.start)) / 60000)} minutes · `
          : "All day · "}
        {event.sourceLabel}
      </p>
      {event.attendees.length ? (
        <div className="mt-[10px] flex -space-x-1" aria-label="Participants">
          {event.attendees.slice(0, 3).map((person) => (
            <span
              key={person.name}
              role="img"
              aria-label={person.name}
              className="flex size-[19px] items-center justify-center rounded-full bg-primary/20 text-4xs font-medium text-primary"
            >
              {person.initials ??
                person.name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
            </span>
          ))}
          {!event.attendeesTruncated && event.attendees.length > 3 ? (
            <span className="text-3xs text-muted-foreground">+{event.attendees.length - 3}</span>
          ) : null}
        </div>
      ) : null}
      {event.descriptionPreview ? (
        <p className="mt-[13px] text-3xs leading-4.25 text-muted-foreground">
          {event.descriptionPreview.slice(0, 160)}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <Button variant="outline" size="xs" onClick={() => onNotes(event)}>
          Notes &amp; agenda
        </Button>
        {url ? (
          <Button variant="link" size="xs" onClick={() => onJoin?.(event, url)}>
            Join meeting
          </Button>
        ) : (
          <span className="text-3xs text-muted-foreground">No meeting link is available.</span>
        )}
      </div>
    </article>
  );
}
