import { lazy, Suspense, useRef, useState, type ComponentProps } from "react";
import {
  calendarDateToLocalPickerDate,
  localPickerDateToCalendarDate,
  formatDayHeading,
} from "@t3tools/client-runtime/calendar/dates";
import { Button } from "../../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../../ui/popover";

const loadCalendarPicker = async () => {
  const [{ Calendar }, { enGB }] = await Promise.all([
    import("../../ui/calendar"),
    import("@daypicker/react/locale"),
  ]);
  return {
    default: (props: ComponentProps<typeof Calendar>) => <Calendar {...props} locale={enGB} />,
  };
};
let pickerPromise: ReturnType<typeof loadCalendarPicker> | undefined;
/** Lets the isolated picker recipe wait for the same on-demand UI bundle. */
export const preloadCalendarPicker = () => (pickerPromise ??= loadCalendarPicker());
const PickerCalendar = lazy(preloadCalendarPicker);

export function CalendarDatePicker({
  day,
  onSelectDay,
  defaultOpen = false,
}: {
  readonly day: string;
  readonly onSelectDay: (day: string) => void;
  readonly defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={trigger}
        aria-label="Choose date"
        render={
          <button
            type="button"
            className="relative cursor-pointer rounded-sm text-calendar-heading font-semibold focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3"
          />
        }
      >
        {formatDayHeading(day)}
      </PopoverTrigger>
      {open ? (
        <PopoverPopup padding="none" width="auto" align="start" finalFocus={trigger}>
          <Suspense
            fallback={
              <p role="status" className="p-2 text-xs">
                Loading date picker...
              </p>
            }
          >
            <PickerCalendar
              mode="single"
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
                if (date) {
                  onSelectDay(localPickerDateToCalendarDate(date));
                  close();
                }
              }}
            />
          </Suspense>
          <div className="p-2">
            <Button variant="ghost" size="xs" onClick={close}>
              Cancel
            </Button>
          </div>
        </PopoverPopup>
      ) : null}
    </Popover>
  );
}
