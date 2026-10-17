import { useRef, useState } from "react";
import { CheckIcon, PlusIcon } from "lucide-react";
import { formatDay } from "@t3tools/client-runtime/calendar/dates";
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
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) setSelected(false);
      }}
    >
      <PopoverTrigger
        ref={trigger}
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
      <PopoverPopup
        width="sm"
        variant="opaque"
        align="end"
        className="max-sm:w-[calc(100vw-84px)]"
        sideOffset={8}
        finalFocus={trigger}
      >
        <div className="flex flex-col gap-3">
          <PopoverTitle>Schedule outside Pulse</PopoverTitle>
          <p className="text-xs text-muted-foreground">
            Choose a calendar to open outside Pulse for{" "}
            {formatDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.
            Only this date is sent.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="basis-full">
              <Button
                size="xs"
                variant="outline"
                aria-pressed={selected}
                onClick={() => setSelected(true)}
              >
                {selected ? <CheckIcon aria-hidden="true" /> : null}
                Google Calendar
              </Button>
            </div>
            {selected ? (
              <CalendarHandoffLink
                target={{ kind: "google-calendar", day }}
                primary
                autoFocus
                {...(client ? { client } : {})}
                {...(onOpen ? { onOpen } : {})}
              />
            ) : null}
            <PopoverClose render={<Button size="xs" variant="ghost" />}>Cancel</PopoverClose>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
