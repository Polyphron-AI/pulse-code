import { describe, expect, it } from "vite-plus/test";
import { OfficeService, type OfficeServiceOptions } from "./OfficeService.ts";
import { OfficeError } from "./OfficeErrors.ts";
import type { OfficeProviders } from "./OfficeProviders.ts";

function fixture(overrides: Partial<OfficeServiceOptions> = {}) {
  let persisted: string | null = null;
  let sequence = 0;
  const calls: string[] = [];
  const providers: OfficeProviders = {
    exportNote: async (_context, folderId, name) => ({
      id: "export",
      name,
      parents: [folderId],
      mimeType: "text/plain",
      webViewLink: "https://drive.google.com/file/d/export/view",
    }),
    sendMail: async () => {
      calls.push("mail.send");
    },
    createEvent: async ({ account }, calendarId, event) => ({
      ...event,
      id: "created",
      accountId: account.id,
      calendarId,
    }),
    updateEvent: async ({ account }, calendarId, id, event) => ({
      ...event,
      id,
      accountId: account.id,
      calendarId,
    }),
    deleteEvent: async () => {},
    driveFiles: async () => ({ files: [] }),
    driveFile: async (_context, id) => ({
      id,
      name: "Folder",
      mimeType: "application/vnd.google-apps.folder",
      parents: [],
    }),
    verifyImap: async () => {
      calls.push("imap.verify");
    },
    calendars: async ({ account }) => [
      {
        id: "primary",
        accountId: account.id,
        name: "Work",
        selected: account.selectedCalendarIds.includes("primary"),
      },
    ],
    events: async ({ account }) =>
      account.selectedCalendarIds.map((calendarId) => ({
        id: "meeting",
        accountId: account.id,
        calendarId,
        title: "Meeting",
        start: "2026-09-08T10:00:00Z",
        end: "2026-09-08T11:00:00Z",
      })),
    messages: async ({ credentials }) => {
      calls.push(credentials.oauth?.accessToken ?? "imap.read");
      return { messages: [], nextCursor: "next" };
    },
    message: async ({ account }, id) => ({
      id,
      accountId: account.id,
      subject: "Hello",
      from: "sender@example.com",
      to: account.email,
      date: "",
      preview: "Hello",
      text: "Hello",
      unread: true,
    }),
    thread: async ({ account }, id) => ({
      messages: [
        {
          id,
          accountId: account.id,
          subject: "Thread",
          from: "sender@example.com",
          to: account.email,
          date: "",
          preview: "",
          unread: true,
        },
      ],
      grouping: "provider",
      truncated: false,
    }),
    close: async () => {
      calls.push("close");
    },
  };
  const options: OfficeServiceOptions = {
    storage: {
      read: async () => persisted,
      write: async (value) => {
        persisted = value;
      },
    },
    openExternal: async () => {
      throw new Error("Tests never open browsers");
    },
    oauth: { googleClientId: "public-google", microsoftClientId: "public-microsoft" },
    authorize: async () => ({
      accessToken: "secret-access",
      refreshToken: "secret-refresh",
      expiresAt: 500_000,
      email: "person@example.com",
    }),
    now: () => 100_000,
    id: () => `id-${++sequence}`,
    providers,
    ...overrides,
  };
  return { service: new OfficeService(options), options, providers, calls, saved: () => persisted };
}
const connect = (service: OfficeService) =>
  service.invoke({
    operation: "accounts.connectOAuth",
    provider: "google",
    capabilities: ["mail", "calendar"],
  });

describe("OfficeService", () => {
  it("adds Drive without losing existing mail/calendar connections and validates Drive requests", async () => {
    const setup = fixture();
    await connect(setup.service);
    expect(
      await setup.service.invoke({ operation: "drive.list", accountId: "id-1" }),
    ).toMatchObject({ ok: false, error: { code: "unsupported" } });
    const upgraded = await setup.service.invoke({
      operation: "accounts.connectOAuth",
      provider: "google",
      accountId: "id-1",
      capabilities: ["drive"],
    });
    expect(upgraded).toMatchObject({
      ok: true,
      accounts: [{ id: "id-1", capabilities: ["drive", "mail", "calendar"] }],
    });
    expect(await setup.service.invoke({ operation: "drive.list", accountId: "id-1" })).toEqual({
      ok: true,
      files: [],
    });
    expect(
      await setup.service.invoke({ operation: "drive.get", accountId: "id-1", fileId: "selected" }),
    ).toMatchObject({ ok: true, file: { id: "selected" } });
    expect(
      await setup.service.invoke({ operation: "drive.list", accountId: "missing" }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(
      await setup.service.invoke({ operation: "drive.list", accountId: "id-1", limit: 101 }),
    ).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(JSON.stringify(upgraded)).not.toContain("secret-");
    await setup.service.close();
  });
  it("does not widen new-account scopes and preserves connections on mismatched upgrades", async () => {
    let email = "first@example.com";
    const requested: string[][] = [];
    const setup = fixture({
      authorize: async (input) => {
        requested.push([...input.capabilities]);
        return { email, accessToken: "token", refreshToken: "refresh", expiresAt: 900000 };
      },
    });
    await connect(setup.service);
    email = "second@example.com";
    expect(
      await setup.service.invoke({
        operation: "accounts.connectOAuth",
        provider: "google",
        capabilities: ["drive"],
      }),
    ).toMatchObject({ ok: true });
    expect(requested[1]).toEqual(["drive"]);
    expect(
      await setup.service.invoke({
        operation: "accounts.connectOAuth",
        provider: "google",
        accountId: "id-1",
        capabilities: ["drive"],
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    email = "first@example.com";
    expect(
      await setup.service.invoke({
        operation: "accounts.connectOAuth",
        provider: "google",
        capabilities: ["drive"],
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(await setup.service.invoke({ operation: "accounts.list" })).toMatchObject({
      accounts: [
        { id: "id-1", capabilities: ["mail", "calendar"] },
        { id: "id-2", capabilities: ["drive"] },
      ],
    });
    await setup.service.close();
  });
  it("reads threads only through the selected mail account and rejects unknown accounts", async () => {
    const setup = fixture();
    await connect(setup.service);
    expect(
      await setup.service.invoke({
        operation: "mail.thread",
        accountId: "id-1",
        messageId: "selected",
      }),
    ).toMatchObject({
      ok: true,
      thread: {
        messages: [{ id: "selected", accountId: "id-1" }],
        grouping: "provider",
        truncated: false,
      },
    });
    expect(
      await setup.service.invoke({
        operation: "mail.thread",
        accountId: "missing",
        messageId: "selected",
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    await setup.service.close();
  });
  it("persists protected host state across restart without exposing tokens to the renderer", async () => {
    const setup = fixture();
    const result = await connect(setup.service);
    expect(result).toMatchObject({
      ok: true,
      accounts: [{ id: "id-1", email: "person@example.com", capabilities: ["mail", "calendar"] }],
    });
    expect(JSON.stringify(result)).not.toContain("secret-");
    expect(setup.saved()).toContain("secret-refresh"); // Encryption is the injected host storage's responsibility.
    await setup.service.close();
    const restarted = new OfficeService(setup.options);
    expect(await restarted.invoke({ operation: "accounts.list" })).toEqual(result);
    await restarted.close();
  });

  it("reports missing registrations without attempting authorization", async () => {
    let opened = false;
    const { service } = fixture({
      oauth: {},
      authorize: async () => {
        opened = true;
        throw new Error("unexpected");
      },
    });
    expect(await connect(service)).toMatchObject({ ok: false, error: { code: "setup_required" } });
    expect(opened).toBe(false);
    expect(await service.invoke({ operation: "accounts.list" })).toMatchObject({
      configuration: { google: false, microsoft: false, imap: true },
      accounts: [],
    });
  });

  it("rotates a refresh token once before concurrent reads and persists the replacement", async () => {
    let refreshes = 0;
    const setup = fixture({
      authorize: async () => ({
        accessToken: "old",
        refreshToken: "old-refresh",
        expiresAt: 99_000,
        email: "person@example.com",
      }),
      refresh: async (_input, token) => {
        expect(token).toBe("old-refresh");
        refreshes++;
        return { accessToken: "new", refreshToken: "new-refresh", expiresAt: 900_000 };
      },
    });
    await connect(setup.service);
    const results = await Promise.all([
      setup.service.invoke({ operation: "mail.list", accountId: "id-1" }),
      setup.service.invoke({ operation: "mail.list", accountId: "id-1" }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(refreshes).toBe(1);
    expect(setup.calls).toEqual(["new", "new"]);
    expect(setup.saved()).toContain("new-refresh");
    expect(setup.saved()).not.toContain("old-refresh");
  });

  it("keeps local drafts local and deletes their account credentials on disconnect", async () => {
    const setup = fixture();
    await connect(setup.service);
    expect(
      await setup.service.invoke({
        operation: "drafts.save",
        sourceMessageId: "42:7",
        accountId: "id-1",
        to: "recipient@example.com",
        subject: "Local",
        text: "Do not send",
      }),
    ).toMatchObject({
      ok: true,
      drafts: [{ id: "id-2", text: "Do not send", sourceMessageId: "42:7" }],
    });
    const restarted = new OfficeService(setup.options);
    expect(await restarted.invoke({ operation: "drafts.list" })).toMatchObject({
      drafts: [{ id: "id-2", sourceMessageId: "42:7" }],
    });
    expect(setup.calls).toEqual([]);
    await restarted.invoke({ operation: "accounts.disconnect", accountId: "id-1" });
    expect(setup.saved()).not.toContain("secret-refresh");
    expect(await restarted.invoke({ operation: "drafts.list" })).toEqual({ ok: true, drafts: [] });
  });

  it("validates calendar selections and preserves them across restart", async () => {
    const setup = fixture();
    await connect(setup.service);
    expect(
      await setup.service.invoke({
        operation: "calendars.select",
        accountId: "id-1",
        calendarIds: ["missing"],
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    await setup.service.invoke({
      operation: "calendars.select",
      accountId: "id-1",
      calendarIds: ["primary"],
    });
    const restarted = new OfficeService(setup.options);
    expect(
      await restarted.invoke({
        operation: "calendars.events",
        accountId: "id-1",
        timeMin: "2026-09-08",
        timeMax: "2026-09-09",
      }),
    ).toMatchObject({ ok: true, events: [{ calendarId: "primary" }] });
    expect(
      await restarted.invoke({
        operation: "calendars.events",
        accountId: "id-1",
        timeMin: "2027-01-01",
        timeMax: "2026-01-01",
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_request" } });
  });

  it("supports verified TLS IMAP and avoids persisting rejected credentials", async () => {
    const setup = fixture();
    const input = {
      operation: "accounts.connectImap" as const,
      host: "imap.example.com",
      port: 993,
      username: "person@example.com",
      password: "app-password",
      tls: "implicit" as const,
    };
    setup.providers.verifyImap = async () => {
      throw new OfficeError("authentication", "Authentication failed.");
    };
    expect(await setup.service.invoke(input)).toMatchObject({
      ok: false,
      error: { code: "authentication" },
    });
    expect(setup.saved()).toBeNull();
    setup.providers.verifyImap = async () => {};
    expect(await setup.service.invoke(input)).toMatchObject({
      ok: true,
      accounts: [{ provider: "imap", capabilities: ["mail"] }],
    });
  });

  it("does not advance in-memory state after secure storage fails", async () => {
    const setup = fixture({
      storage: {
        read: async () => null,
        write: async () => {
          throw new Error("secret path details");
        },
      },
    });
    expect(await connect(setup.service)).toMatchObject({ ok: false, error: { code: "storage" } });
    expect(await setup.service.invoke({ operation: "accounts.list" })).toMatchObject({
      accounts: [],
    });
  });

  it("preserves unreadable documents instead of overwriting them", async () => {
    let writes = 0;
    const setup = fixture({
      storage: {
        read: async () => '{"version":900}',
        write: async () => {
          writes++;
        },
      },
    });
    expect(await connect(setup.service)).toMatchObject({ ok: false, error: { code: "storage" } });
    expect(writes).toBe(0);
  });

  it("records expired access and hides raw network failures", async () => {
    const setup = fixture();
    await connect(setup.service);
    setup.providers.messages = async () => {
      throw new OfficeError("authentication", "Reconnect this account.");
    };
    expect(await setup.service.invoke({ operation: "mail.list", accountId: "id-1" })).toMatchObject(
      { ok: false },
    );
    expect(await setup.service.invoke({ operation: "accounts.list" })).toMatchObject({
      accounts: [{ status: "expired" }],
    });
    setup.providers.messages = async () => {
      throw new Error("token=secret-refresh");
    };
    expect(
      JSON.stringify(await setup.service.invoke({ operation: "mail.list", accountId: "id-1" })),
    ).not.toContain("secret-refresh");
    expect(await setup.service.invoke({ operation: "accounts.list" })).toMatchObject({
      accounts: [{ status: "offline" }],
    });
  });

  it("aborts pending authorization and drains before closing", async () => {
    let started: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const setup = fixture({
      authorize: async ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new OfficeError("cancelled", "Cancelled.")),
            { once: true },
          );
          started();
        }),
    });
    const pending = connect(setup.service);
    await ready;
    await setup.service.close();
    expect(await pending).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(await setup.service.invoke({ operation: "accounts.list" })).toMatchObject({
      ok: false,
      error: { code: "closed" },
    });
  });
});
it("requires an explicit send upgrade and preserves existing read grants", async () => {
  const setup = fixture();
  await connect(setup.service);
  const request = {
    operation: "mail.send" as const,
    accountId: "id-1",
    message: { to: ["recipient@example.com"], subject: "Proposal", text: "Hello" },
  };
  expect(await setup.service.invoke(request)).toMatchObject({
    ok: false,
    error: { code: "unsupported" },
  });
  expect(
    await setup.service.invoke({
      operation: "accounts.connectOAuth",
      provider: "google",
      accountId: "id-1",
      capabilities: ["mailSend"],
    }),
  ).toMatchObject({ ok: true, accounts: [{ capabilities: ["mailSend", "mail", "calendar"] }] });
  expect(await setup.service.invoke(request)).toMatchObject({ ok: true, sent: true });
  await setup.service.close();
});
it("requires explicit Drive export consent and retains the old read grants", async () => {
  const setup = fixture();
  await connect(setup.service);
  const request = {
    operation: "drive.exportNote" as const,
    accountId: "id-1",
    folderId: "folder",
    title: "Notes",
    text: "Decisions",
  };
  expect(await setup.service.invoke(request)).toMatchObject({
    ok: false,
    error: { code: "unsupported" },
  });
  expect(
    await setup.service.invoke({
      operation: "accounts.connectOAuth",
      provider: "google",
      accountId: "id-1",
      capabilities: ["driveWrite"],
    }),
  ).toMatchObject({ ok: true, accounts: [{ capabilities: ["driveWrite", "mail", "calendar"] }] });
  expect(await setup.service.invoke(request)).toMatchObject({
    ok: true,
    file: { id: "export", parents: ["folder"] },
  });
  await setup.service.close();
});
