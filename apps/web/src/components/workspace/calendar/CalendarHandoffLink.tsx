import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
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
const copyClassName =
  "relative inline-flex h-[23px] cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-input bg-popover px-2 text-2xs font-semibold hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 dark:bg-input/32";

export function CalendarHandoffLink({
  target,
  client: injectedClient,
  onOpen,
  primary = false,
  autoFocus = false,
  menu = false,
}: {
  readonly target: CalendarHandoffTarget;
  readonly client?: CalendarHandoffClient;
  readonly onOpen?: (url: string) => void;
  readonly primary?: boolean;
  readonly autoFocus?: boolean;
  readonly menu?: boolean;
}) {
  const requestingClient = useMemo(() => requestingCalendarClient(), []);
  const client = injectedClient ?? requestingClient;
  const meeting = target.kind === "meeting";
  const value = target.kind === "meeting" ? target.raw : target.day;
  const address = useMemo(
    () =>
      calendarHandoffUrl(
        meeting
          ? { kind: "meeting", ...(value ? { raw: value } : {}) }
          : { kind: "google-calendar", day: value! },
      ),
    [meeting, value],
  );
  const [outcome, setOutcome] = useState<CalendarHandoff | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const action = useRef<HTMLElement | null>(null);
  const actionRef = useCallback(
    (node: HTMLElement | null) => {
      action.current = node;
      if (autoFocus) node?.focus();
    },
    [autoFocus],
  );
  if (!address.url) return <span className="text-3xs text-muted-foreground">{address.error}</span>;
  const { url } = address;
  const recovery = outcome?.state === "fallback" || outcome?.state === "rejected";
  const message =
    outcome?.state === "rejected"
      ? outcome.error
      : outcome?.state === "fallback"
        ? meeting
          ? "If nothing opened, use Open meeting link or copy the address."
          : "If nothing opened, use Open calendar link or copy the address."
        : "";
  const open = (event: MouseEvent<HTMLElement>) => {
    if (client.openExternal) event.preventDefault();
    setCopyStatus("");
    onOpen?.(url);
    void openCalendarHandoff(target, client.openExternal).then(setOutcome);
  };
  const copy = (
    <button
      type="button"
      className={copyClassName}
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
    </button>
  );
  const retry = (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${actionClassName} min-h-6 underline`}
      onClick={open}
    >
      {outcome?.state === "rejected"
        ? "Try again"
        : meeting
          ? "Open meeting link"
          : "Open calendar link"}
    </a>
  );
  const label = meeting ? "Join meeting" : "Open calendar";
  return (
    <>
      {primary ? (
        <Button
          size="xs"
          render={<a ref={actionRef} href={url} target="_blank" rel="noopener noreferrer" />}
          onClick={open}
        >
          {label}
        </Button>
      ) : client.openExternal ? (
        <button ref={actionRef} type="button" className={actionClassName} onClick={open}>
          {label}
        </button>
      ) : (
        <a
          ref={actionRef}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={actionClassName}
          onClick={open}
        >
          {label}
        </a>
      )}
      {menu && !recovery ? copy : null}
      <p
        role="status"
        className={recovery ? "basis-full text-2xs text-muted-foreground" : "sr-only"}
      >
        {message}
      </p>
      {recovery ? (
        <div className="basis-full min-w-0 space-y-2 text-2xs">
          <div className="flex flex-wrap items-center gap-3">
            {outcome.state === "rejected" ? (
              <>
                {copy}
                {retry}
              </>
            ) : (
              <>
                {retry}
                {copy}
              </>
            )}
            <button
              type="button"
              className={`${actionClassName} text-muted-foreground`}
              onClick={() => {
                setOutcome(null);
                setCopyStatus("");
                action.current?.focus();
              }}
            >
              Dismiss
            </button>
          </div>
          <p className="select-text break-all text-3xs text-muted-foreground">{url}</p>
        </div>
      ) : null}
      <p
        role="status"
        className={copyStatus ? "basis-full text-2xs text-muted-foreground" : "sr-only"}
      >
        {copyStatus}
      </p>
    </>
  );
}
