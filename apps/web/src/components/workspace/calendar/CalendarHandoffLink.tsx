import { useState, type MouseEvent } from "react";
import { writeTextToClipboard } from "../../../hooks/useCopyToClipboard";
import { Button } from "../../ui/button";
import {
  calendarHandoffUrl,
  openCalendarHandoff,
  requestingCalendarClient,
  type CalendarHandoff,
  type CalendarHandoffClient,
  type CalendarHandoffTarget,
} from "./calendarHandoff";

const actionClassName =
  "relative inline-flex h-[23px] cursor-pointer shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-transparent px-0 text-2xs font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11";

export function CalendarHandoffLink({
  target,
  client = requestingCalendarClient(),
  onOpen,
}: {
  readonly target: CalendarHandoffTarget;
  readonly client?: CalendarHandoffClient;
  readonly onOpen?: (url: string) => void;
}) {
  const address = calendarHandoffUrl(target);
  const [outcome, setOutcome] = useState<CalendarHandoff | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const meeting = target.kind === "meeting";
  if (!address.url) return <span className="text-3xs text-muted-foreground">{address.error}</span>;
  const { url } = address;
  const current = outcome && "url" in outcome && outcome.url === url ? outcome : null;
  const open = (event: MouseEvent<HTMLElement>) => {
    if (client.openExternal || client.preventNavigation) event.preventDefault();
    setCopyStatus(null);
    onOpen?.(url);
    void openCalendarHandoff(target, client.openExternal).then(setOutcome);
  };
  const label = meeting ? "Join meeting" : "Open calendar";
  return (
    <>
      {client.openExternal ? (
        <button type="button" className={actionClassName} onClick={open}>
          {label}
        </button>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={actionClassName}
          onClick={open}
        >
          {label}
        </a>
      )}
      {current?.state === "fallback" || current?.state === "rejected" ? (
        <div className="basis-full min-w-0 space-y-2 text-xs">
          <p role="status">
            {current.state === "rejected"
              ? current.error
              : meeting
                ? "If nothing opened, use Open meeting link or copy the address."
                : "If nothing opened, use Open calendar link or copy the address."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={open}
            >
              {meeting ? "Open meeting link" : "Open calendar link"}
            </a>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                void (
                  client.copyText
                    ? client.copyText(url)
                    : writeTextToClipboard(url, meeting ? "meeting link" : "calendar link")
                ).then(
                  () => setCopyStatus(meeting ? "Meeting link copied." : "Calendar link copied."),
                  () => setCopyStatus("Could not copy the address. Select and copy it below."),
                );
              }}
            >
              {meeting ? "Copy meeting link" : "Copy calendar link"}
            </Button>
          </div>
          {copyStatus ? <p role="status">{copyStatus}</p> : null}
          <p className="select-text break-all text-muted-foreground">{url}</p>
        </div>
      ) : null}
    </>
  );
}
