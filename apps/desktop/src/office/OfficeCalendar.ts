// @effect-diagnostics globalDate:off -- Calendar adapters normalize provider timestamps at the boundary.
import * as NodeCrypto from "node:crypto";
import type { OfficeCalendar, OfficeEvent, OfficeEventInput } from "@t3tools/contracts";
import type { ProviderContext } from "./OfficeProviders.ts";
import { OfficeError, items, object, responseJson, string } from "./OfficeErrors.ts";

const text = (value: unknown, max = 4096) => string(value).slice(0, max);
const id = (value: unknown) => {
  const result = string(value);
  if (!result || result.length > 1024)
    throw new OfficeError("network", "Calendar returned an invalid record.");
  return result;
};
const safeLink = (value: unknown) => {
  try {
    const url = new URL(string(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
};
function mapEvent(
  context: ProviderContext,
  calendarId: string,
  row: Record<string, unknown>,
): OfficeEvent {
  const google = context.account.provider === "google";
  const start = object(row.start);
  const end = object(row.end);
  const date = (value: Record<string, unknown>) =>
    google
      ? text(value.dateTime) || text(value.date)
      : `${text(value.dateTime).replace(/Z$/, "")}Z`;
  const meetingUrl = safeLink(google ? row.hangoutLink : object(row.onlineMeeting).joinUrl);
  return {
    id: id(row.id),
    accountId: context.account.id,
    calendarId,
    title: text(google ? row.summary : row.subject) || "Untitled event",
    start: date(start),
    end: date(end),
    allDay: google ? !!start.date : row.isAllDay === true,
    description: text(google ? row.description : object(row.body).content, 20000),
    location: text(google ? row.location : object(row.location).displayName),
    attendees: items(row.attendees)
      .slice(0, 100)
      .map((a) => text(google ? object(a).email : object(object(a).emailAddress).address)),
    editable: google ? object(row.organizer).self === true : row.isOrganizer === true,
    ...(meetingUrl ? { meetingUrl } : {}),
  };
}
function validate(input: OfficeEventInput) {
  const start = Date.parse(input.start);
  const end = Date.parse(input.end);
  if (
    !input.title.trim() ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 366 * 86400000
  )
    throw new OfficeError(
      "invalid_request",
      "Provide a title and an end after the start, within one year.",
    );
  if (
    input.allDay &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end))
  )
    throw new OfficeError(
      "invalid_request",
      "All-day events need calendar dates, with an exclusive end date.",
    );
  if (input.attendees.some((email) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))
    throw new OfficeError("invalid_request", "Enter valid attendee email addresses.");
}

export function createCalendarProvider(fetcher: typeof globalThis.fetch = globalThis.fetch) {
  async function request(context: ProviderContext, url: string, method = "GET", body?: unknown) {
    if (context.account.provider === "imap")
      throw new OfficeError("unsupported", "Calendars need a Google or Microsoft account.");
    if (!context.credentials.oauth)
      throw new OfficeError("authentication", "Reconnect this calendar account.");
    const parsed = new URL(url);
    const origin =
      context.account.provider === "google"
        ? "https://www.googleapis.com"
        : "https://graph.microsoft.com";
    if (parsed.origin !== origin || parsed.username || parsed.password)
      throw new OfficeError("network", "Calendar returned an invalid page link.");
    const response = await fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${context.credentials.oauth.accessToken}`,
        "Content-Type": "application/json",
        Prefer: 'outlook.timezone="UTC", outlook.body-content-type="text"',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.any([context.signal, AbortSignal.timeout(30000)]),
      redirect: "error",
    });
    if (response.status === 204 && response.ok) return {};
    return responseJson(response);
  }
  const base = (context: ProviderContext, calendarId: string) =>
    context.account.provider === "google"
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
      : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`;
  async function write(
    context: ProviderContext,
    calendarId: string,
    input: OfficeEventInput,
    eventId?: string,
  ) {
    validate(input);
    if (!context.account.capabilities.includes("calendarWrite"))
      throw new OfficeError("authentication", "Enable calendar editing before saving events.");
    const google = context.account.provider === "google";
    const date = (value: string) =>
      input.allDay ? { date: value } : { dateTime: new Date(value).toISOString() };
    const body = google
      ? {
          summary: input.title,
          description: input.description,
          location: input.location,
          start: date(input.start),
          end: date(input.end),
          attendees: input.attendees.map((email) => ({ email })),
          ...(input.createMeeting
            ? {
                conferenceData: {
                  createRequest: {
                    requestId: NodeCrypto.randomUUID(),
                    conferenceSolutionKey: { type: "hangoutsMeet" },
                  },
                },
              }
            : {}),
        }
      : {
          subject: input.title,
          body: { contentType: "text", content: input.description },
          location: { displayName: input.location },
          start: {
            dateTime: new Date(input.start).toISOString().replace(/Z$/, ""),
            timeZone: "UTC",
          },
          end: { dateTime: new Date(input.end).toISOString().replace(/Z$/, ""), timeZone: "UTC" },
          isAllDay: !!input.allDay,
          attendees: input.attendees.map((address) => ({
            emailAddress: { address },
            type: "required",
          })),
          ...(input.createMeeting
            ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" }
            : {}),
        };
    const result = await request(
      context,
      `${base(context, calendarId)}${eventId ? `/${encodeURIComponent(eventId)}` : ""}${google ? "?sendUpdates=all&conferenceDataVersion=1" : ""}`,
      eventId ? "PATCH" : "POST",
      body,
    );
    return mapEvent(context, calendarId, result);
  }
  return {
    async calendars(context: ProviderContext): Promise<OfficeCalendar[]> {
      const google = context.account.provider === "google";
      const calendars: OfficeCalendar[] = [];
      let url = google
        ? "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250"
        : "https://graph.microsoft.com/v1.0/me/calendars?$top=100";
      for (let page = 0; url && page < 20; page++) {
        const result = await request(context, url);
        for (const value of items(google ? result.items : result.value)) {
          const row = object(value);
          const calendarId = id(row.id);
          calendars.push({
            id: calendarId,
            accountId: context.account.id,
            name: text(google ? row.summaryOverride || row.summary : row.name),
            selected:
              context.account.selectedCalendarIds.includes(calendarId) ||
              (context.account.selectedCalendarIds.includes("primary") &&
                (google ? row.primary === true : row.isDefaultCalendar === true)),
            writable: google
              ? ["owner", "writer"].includes(string(row.accessRole))
              : row.canEdit === true,
          });
        }
        url = google
          ? result.nextPageToken
            ? `https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&pageToken=${encodeURIComponent(string(result.nextPageToken))}`
            : ""
          : string(result["@odata.nextLink"]);
      }
      if (url) throw new OfficeError("unsupported", "This account has too many calendars to load.");
      return calendars;
    },
    async events(
      context: ProviderContext,
      timeMin: string,
      timeMax: string,
    ): Promise<OfficeEvent[]> {
      const google = context.account.provider === "google";
      const events: OfficeEvent[] = [];
      for (const selectedId of context.account.selectedCalendarIds) {
        const calendarId =
          selectedId === "primary"
            ? id(
                (
                  await request(
                    context,
                    google
                      ? "https://www.googleapis.com/calendar/v3/calendars/primary"
                      : "https://graph.microsoft.com/v1.0/me/calendar",
                  )
                ).id,
              )
            : selectedId;
        let url = google
          ? `${base(context, calendarId)}?${new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" })}`
          : `https://graph.microsoft.com/v1.0/me/${calendarId === "primary" ? "calendar" : `calendars/${encodeURIComponent(calendarId)}`}/calendarView?${new URLSearchParams({ startDateTime: timeMin, endDateTime: timeMax, $top: "100" })}`;
        const firstUrl = url;
        for (let page = 0; url && page < 20; page++) {
          const result = await request(context, url);
          for (const value of items(google ? result.items : result.value)) {
            const row = object(value);
            if (row.status !== "cancelled" && row.isCancelled !== true)
              events.push(mapEvent(context, calendarId, row));
          }
          url = google
            ? result.nextPageToken
              ? `${firstUrl}&pageToken=${encodeURIComponent(string(result.nextPageToken))}`
              : ""
            : string(result["@odata.nextLink"]);
        }
        if (url || events.length > 5000)
          throw new OfficeError("unsupported", "Choose a smaller calendar date range.");
      }
      return events.sort((a, b) => a.start.localeCompare(b.start));
    },
    createEvent: (context: ProviderContext, calendarId: string, input: OfficeEventInput) =>
      write(context, calendarId, input),
    updateEvent: (
      context: ProviderContext,
      calendarId: string,
      eventId: string,
      input: OfficeEventInput,
    ) => write(context, calendarId, input, eventId),
    async deleteEvent(context: ProviderContext, calendarId: string, eventId: string) {
      if (!context.account.capabilities.includes("calendarWrite"))
        throw new OfficeError("authentication", "Enable calendar editing before deleting events.");
      await request(
        context,
        `${base(context, calendarId)}/${encodeURIComponent(eventId)}${context.account.provider === "google" ? "?sendUpdates=all" : ""}`,
        "DELETE",
      );
    },
  };
}
