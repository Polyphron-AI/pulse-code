import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "../../ui/button";
import {
  Popover,
  PopoverClose,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "../../ui/popover";
import { CalendarHandoffLink } from "./CalendarHandoffLink";
import type { CalendarHandoffClient } from "./calendarHandoff";

export function CalendarSchedule({
  day,
  client,
  onOpen,
}: {
  readonly day: string;
  readonly client?: CalendarHandoffClient;
  readonly onOpen?: (url: string) => void;
}) {
  const [selected, setSelected] = useState(false);
  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setSelected(false);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="relative inline-flex h-6 w-[76px] cursor-pointer shrink-0 items-center justify-center gap-1 rounded-md bg-primary text-2xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11"
          />
        }
      >
        <PlusIcon aria-hidden="true" className="size-[13px]" />
        Schedule
      </PopoverTrigger>
      <PopoverPopup width="sm" variant="opaque" align="end">
        <div className="flex flex-col gap-3">
          <PopoverTitle>Schedule outside Pulse</PopoverTitle>
          <p className="text-xs text-muted-foreground">
            Open Google Calendar outside Pulse to schedule on {day}. Only this date is sent.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {selected ? (
              <>
                <span className="basis-full text-xs font-semibold">Google Calendar</span>
                <CalendarHandoffLink
                  target={{ kind: "google-calendar", day }}
                  {...(client ? { client } : {})}
                  {...(onOpen ? { onOpen } : {})}
                />
              </>
            ) : (
              <Button size="xs" variant="outline" onClick={() => setSelected(true)}>
                Google Calendar
              </Button>
            )}
            <PopoverClose render={<Button size="xs" variant="ghost" />}>Cancel</PopoverClose>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
