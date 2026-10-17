import type { CalendarOccurrenceSummary } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { VideoIcon } from "lucide-react";
import { validatedConferenceUrl } from "@t3tools/shared/calendarLinks";
export interface CalendarEventCardProps {
  readonly event: CalendarOccurrenceSummary;
  readonly onSelect: (event: CalendarOccurrenceSummary) => void;
  readonly onNotes: (event: CalendarOccurrenceSummary, trigger: HTMLButtonElement) => void;
  readonly notesOpen?: boolean;
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
  notesOpen = false,
}: CalendarEventCardProps) {
  const url = event.joinUrl ? validateJoin(event.joinUrl) : undefined;
  const copies = new Map<string, number>();
  const attendees = event.attendees.slice(0, 3).map((person) => {
    const identity = JSON.stringify([person.name, person.initials]);
    const copy = copies.get(identity) ?? 0;
    copies.set(identity, copy + 1);
    return { ...person, key: `${identity}:${copy}` };
  });
  return (
    <article className="min-w-0 rounded-xl border border-border/60 bg-white/[0.015] px-3 py-3">
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
        <div className="mt-[10px] flex -space-x-0.5" role="group" aria-label="Participants">
          {attendees.map((person) => (
            <span
              key={person.key}
              role="img"
              aria-label={person.name}
              className="flex size-[19px] items-center justify-center rounded-full bg-primary/15 text-4xs font-semibold text-primary ring-1 ring-card"
            >
              {person.initials ??
                person.name
                  .split(/\s+/)
                  .map((p) => Array.from(p)[0])
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
          {event.descriptionPreview}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <button
          type="button"
          aria-expanded={notesOpen}
          className="relative inline-flex h-[23px] cursor-pointer shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-input bg-popover px-2 text-2xs font-semibold shadow-xs/5 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 dark:bg-input/32"
          onClick={(e) => onNotes(event, e.currentTarget)}
        >
          Notes &amp; agenda
        </button>
        {url ? (
          <button
            type="button"
            className="relative inline-flex h-[23px] cursor-pointer shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-0 text-2xs font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11"
            onClick={() => onJoin?.(event, url)}
          >
            Join meeting
          </button>
        ) : (
          <span className="text-3xs text-muted-foreground">No meeting link is available.</span>
        )}
      </div>
    </article>
  );
}
