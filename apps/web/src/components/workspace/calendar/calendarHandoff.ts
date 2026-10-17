import { googleScheduleUrl, validatedConferenceUrl } from "@t3tools/shared/calendarLinks";
import { ensureLocalApi } from "../../../localApi";

export type CalendarHandoffTarget =
  | { readonly kind: "meeting"; readonly raw?: string }
  | { readonly kind: "google-calendar"; readonly day: string };
export type CalendarExternalOpener = (url: string) => Promise<void>;
export interface CalendarHandoffClient {
  readonly openExternal?: CalendarExternalOpener;
  readonly copyText?: (url: string) => Promise<unknown>;
}
export type CalendarHandoff =
  | { readonly state: "unavailable"; readonly error: string }
  | { readonly state: "opened" | "fallback"; readonly url: string }
  | { readonly state: "rejected"; readonly url: string; readonly error: string };

export function requestingCalendarClient(): CalendarHandoffClient {
  return window.desktopBridge
    ? { openExternal: (url) => ensureLocalApi().shell.openExternal(url) }
    : {};
}

export function calendarHandoffUrl(target: CalendarHandoffTarget) {
  if (target.kind === "meeting") {
    const url = target.raw ? validatedConferenceUrl(target.raw) : undefined;
    return url ? { url } : { error: "No meeting link is available." };
  }
  try {
    return { url: googleScheduleUrl(target.day) };
  } catch {
    return { error: "Choose a valid calendar date." };
  }
}

/** Call from the gesture; web navigation belongs to the rendered anchor. */
export async function openCalendarHandoff(
  target: CalendarHandoffTarget,
  openExternal?: CalendarExternalOpener,
): Promise<CalendarHandoff> {
  const address = calendarHandoffUrl(target);
  if (address.url === undefined) return { state: "unavailable", error: address.error };
  const { url } = address;
  if (!openExternal) return { state: "fallback", url };
  try {
    await openExternal(url);
    return { state: "opened", url };
  } catch {
    return {
      state: "rejected",
      url,
      error:
        target.kind === "meeting"
          ? "Unable to open meeting link. Copy the address and open it on this device."
          : "Unable to open Google Calendar. Copy the address and open it on this device.",
    };
  }
}
