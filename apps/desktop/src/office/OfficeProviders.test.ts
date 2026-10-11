import { describe, expect, it } from "vite-plus/test";
import { createOfficeProviders, type ProviderContext } from "./OfficeProviders.ts";

function context(provider: "google" | "microsoft" = "google"): ProviderContext {
  return {
    account: {
      id: "account",
      provider,
      email: "person@example.com",
      capabilities: ["mail", "calendar"],
      status: "connected",
      selectedCalendarIds: ["primary"],
    },
    credentials: { oauth: { accessToken: "secret", refreshToken: "refresh", expiresAt: 999_999 } },
    signal: new AbortController().signal,
  };
}

describe("Office read adapters", () => {
  it("paginates Google calendars and events, expands recurrences and omits cancelled events", async () => {
    const urls: URL[] = [];
    const providers = createOfficeProviders(async (input, init) => {
      const url = new URL(String(input));
      urls.push(url);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret");
      if (url.pathname.endsWith("calendarList"))
        return Response.json({ items: [{ id: "primary", summary: "Work" }] });
      return url.searchParams.has("pageToken")
        ? Response.json({
            items: [
              {
                id: "second",
                summary: "Second",
                start: { date: "2026-09-09" },
                end: { date: "2026-09-10" },
              },
              { id: "cancelled", status: "cancelled" },
            ],
          })
        : Response.json({
            items: [
              {
                id: "first",
                summary: "First",
                start: { dateTime: "2026-09-08T10:00:00Z" },
                end: { dateTime: "2026-09-08T11:00:00Z" },
              },
            ],
            nextPageToken: "page2",
          });
    });
    expect(await providers.calendars(context())).toEqual([
      { id: "primary", accountId: "account", name: "Work", selected: true },
    ]);
    const events = await providers.events(
      context(),
      "2026-09-08T00:00:00Z",
      "2026-09-10T00:00:00Z",
    );
    expect(events.map((event) => event.id)).toEqual(["first", "second"]);
    expect(urls[1]?.searchParams.get("singleEvents")).toBe("true");
    expect(urls[2]?.searchParams.get("pageToken")).toBe("page2");
  });

  it("returns Gmail inbox summaries with the next cursor and reads plain text only", async () => {
    const providers = createOfficeProviders(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/messages")) {
        expect(url.searchParams.get("pageToken")).toBe("previous");
        expect(url.searchParams.get("labelIds")).toBe("INBOX");
        return Response.json({ messages: [{ id: "message" }], nextPageToken: "next" });
      }
      return Response.json({
        id: "message",
        snippet: "Preview",
        labelIds: ["UNREAD"],
        payload: {
          headers: [
            { name: "Subject", value: "Subject" },
            { name: "From", value: "sender@example.com" },
          ],
          parts: [
            {
              mimeType: "text/html",
              body: { data: Buffer.from("<script>bad</script>").toString("base64url") },
            },
            {
              mimeType: "text/plain",
              body: { data: Buffer.from("Plain message").toString("base64url") },
            },
          ],
        },
      });
    });
    const page = await providers.messages(context(), "previous", 20);
    expect(page).toMatchObject({
      messages: [{ subject: "Subject", unread: true }],
      nextCursor: "next",
    });
    expect(page.messages[0]).not.toHaveProperty("text");
    const message = await providers.message(context(), "message");
    expect(message.text).toBe("Plain message");
  });

  it("rejects Graph cursors that would disclose tokens to another host", async () => {
    let requests = 0;
    const providers = createOfficeProviders(async () => {
      requests++;
      return Response.json({ value: [] });
    });
    await expect(
      providers.messages(context("microsoft"), "https://attacker.example/collect", 25),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      providers.messages(
        context("microsoft"),
        "https://graph.microsoft.com/v1.0/users/another-user/messages",
        25,
      ),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(requests).toBe(0);
  });

  it("maps Graph text bodies and preserves provider pagination", async () => {
    const requests: RequestInit[] = [];
    const row = {
      id: "message",
      subject: "Hello",
      from: { emailAddress: { address: "sender@example.com" } },
      toRecipients: [{ emailAddress: { address: "person@example.com" } }],
      receivedDateTime: "2026-09-08T00:00:00Z",
      bodyPreview: "Preview",
      isRead: false,
      body: { contentType: "text", content: "Plain body" },
    };
    const providers = createOfficeProviders(async (input, init) => {
      if (init) requests.push(init);
      return String(input).includes("/mailFolders/")
        ? Response.json({
            value: [row],
            "@odata.nextLink":
              "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=1",
          })
        : Response.json(row);
    });
    expect(await providers.messages(context("microsoft"), undefined, 25)).toMatchObject({
      messages: [{ unread: true }],
      nextCursor: expect.stringContaining("$skip=1"),
    });
    expect(await providers.message(context("microsoft"), "message")).toMatchObject({
      text: "Plain body",
    });
    expect(new Headers(requests[1]?.headers).get("Prefer")).toBe(
      'outlook.body-content-type="text"',
    );
  });

  it("does not return provider error bodies containing credentials or mailbox data", async () => {
    const providers = createOfficeProviders(async () =>
      Response.json({ error: "secret-token mailbox-content" }, { status: 401 }),
    );
    await expect(providers.messages(context(), undefined, 25)).rejects.toMatchObject({
      code: "authentication",
    });
    await expect(providers.messages(context(), undefined, 25)).rejects.not.toThrow("secret-token");
  });
});
