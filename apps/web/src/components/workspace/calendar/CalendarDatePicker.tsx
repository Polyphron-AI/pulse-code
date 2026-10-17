import { useRef, useState } from "react";
import { enGB } from "@daypicker/react/locale/en-GB";
import { Calendar } from "../../ui/calendar";
import {
  calendarDateToLocalPickerDate,
  localPickerDateToCalendarDate,
  formatDayHeading,
} from "@t3tools/client-runtime/calendar/dates";
import { Button } from "../../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../../ui/popover";

export function CalendarDatePicker({
  day,
  today,
  onSelectDay,
  defaultOpen = false,
}: {
  readonly day: string;
  readonly today: string;
  readonly onSelectDay: (day: string) => void;
  readonly defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={trigger}
        aria-label="Choose date"
        render={
          <button
            type="button"
            className="relative cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3"
          />
        }
      >
        {formatDayHeading(day)}
      </PopoverTrigger>
      <PopoverPopup
        padding="none"
        width="auto"
        align="start"
        sideOffset={22}
        variant="opaque"
        finalFocus={trigger}
      >
        <Calendar
          mode="single"
          required
          locale={enGB}
          today={calendarDateToLocalPickerDate(today)}
          weekStartsOn={1}
          autoFocus
          defaultMonth={calendarDateToLocalPickerDate(day)}
          selected={calendarDateToLocalPickerDate(day)}
          classNames={{
            day_button: "cursor-pointer pointer-coarse:min-h-11 pointer-coarse:min-w-11",
            day: "pointer-coarse:size-11",
            weekday: "pointer-coarse:size-11",
            button_next: "cursor-pointer pointer-coarse:min-h-11 pointer-coarse:min-w-11",
            button_previous: "cursor-pointer pointer-coarse:min-h-11 pointer-coarse:min-w-11",
          }}
          onSelect={(date) => {
            onSelectDay(localPickerDateToCalendarDate(date));
            close();
          }}
        />
        <div className="p-2">
          <Button variant="ghost" size="xs" onClick={close}>
            Cancel
          </Button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
