import { expect, it, vi } from "vite-plus/test";
import { createCalendarProvider } from "./OfficeCalendar.ts";
import type { ProviderContext } from "./OfficeProviders.ts";
import type { OfficeEventInput } from "@t3tools/contracts";
const context: ProviderContext = {
  account: {
    id: "google",
    provider: "google",
    email: "test@example.com",
    capabilities: ["calendar", "calendarWrite"],
    status: "connected",
    selectedCalendarIds: ["primary"],
  },
  credentials: {
    oauth: { accessToken: "fixture", refreshToken: "refresh", expiresAt: 9999999999999 },
  },
  signal: new AbortController().signal,
};
const input: OfficeEventInput = {
  title: "Planning",
  start: "2026-10-13T09:00:00Z",
  end: "2026-10-13T10:00:00Z",
  attendees: ["guest@example.com"],
  description: "Agenda",
  location: "Office",
  createMeeting: true,
};
it("creates Google events with invites and a provider conference request", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "event",
        summary: "Planning",
        start: { dateTime: input.start },
        end: { dateTime: input.end },
        organizer: { self: true },
      }),
    ),
  );
  const event = await createCalendarProvider(fetcher).createEvent(context, "primary", input);
  expect(event.id).toBe("event");
  expect(fetcher.mock.calls[0]?.[0]).toContain("sendUpdates=all&conferenceDataVersion=1");
  const init = fetcher.mock.calls[0]?.[1];
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toMatchObject({
    attendees: [{ email: "guest@example.com" }],
    conferenceData: { createRequest: { conferenceSolutionKey: { type: "hangoutsMeet" } } },
  });
});
it("rejects invalid ranges and attendees before contacting a provider", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const provider = createCalendarProvider(fetcher);
  await expect(
    provider.createEvent(context, "primary", { ...input, end: input.start }),
  ).rejects.toThrow("end after");
  await expect(
    provider.createEvent(context, "primary", { ...input, attendees: ["invalid"] }),
  ).rejects.toThrow("email addresses");
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses PATCH and preserves existing conference data unless explicitly creating a link", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "event",
        start: { dateTime: input.start },
        end: { dateTime: input.end },
      }),
    ),
  );
  await createCalendarProvider(fetcher).updateEvent(context, "primary", "event", {
    ...input,
    createMeeting: false,
  });
  expect(fetcher.mock.calls[0]?.[1]?.method).toBe("PATCH");
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).not.toHaveProperty("conferenceData");
});
it("creates Outlook events with Teams and blocks untrusted pagination links", async () => {
  const ms = { ...context, account: { ...context.account, provider: "microsoft" as const } };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "event",
          start: { dateTime: "2026-10-13T09:00:00" },
          end: { dateTime: "2026-10-13T10:00:00" },
          onlineMeeting: { joinUrl: "https://teams.microsoft.com/test" },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ value: [], "@odata.nextLink": "https://attacker.example/steal" }),
      ),
    );
  const provider = createCalendarProvider(fetcher);
  const event = await provider.createEvent(ms, "calendar", input);
  expect(event.meetingUrl).toBe("https://teams.microsoft.com/test");
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
  });
  await expect(provider.calendars(ms)).rejects.toThrow("invalid page link");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("deletes with notifications and requires explicit write capability", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
  await createCalendarProvider(fetcher).deleteEvent(context, "primary", "event");
  expect(fetcher.mock.calls[0]?.[0]).toContain("sendUpdates=all");
  expect(fetcher.mock.calls[0]?.[1]?.method).toBe("DELETE");
  await expect(
    createCalendarProvider(fetcher).createEvent(
      { ...context, account: { ...context.account, capabilities: ["calendar"] } },
      "primary",
      input,
    ),
  ).rejects.toThrow("Enable calendar editing");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
