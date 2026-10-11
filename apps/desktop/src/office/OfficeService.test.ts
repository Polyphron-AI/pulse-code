import { describe, expect, it } from "vite-plus/test";
import { OfficeService, type OfficeServiceOptions } from "./OfficeService.ts";
import { OfficeError } from "./OfficeErrors.ts";
import type { OfficeProviders } from "./OfficeProviders.ts";

function fixture(overrides: Partial<OfficeServiceOptions> = {}) {
  let persisted: string | null = null;
  let sequence = 0;
  const calls: string[] = [];
  const providers: OfficeProviders = {
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
        accountId: "id-1",
        to: "recipient@example.com",
        subject: "Local",
        text: "Do not send",
      }),
    ).toMatchObject({ ok: true, drafts: [{ id: "id-2", text: "Do not send" }] });
    const restarted = new OfficeService(setup.options);
    expect(await restarted.invoke({ operation: "drafts.list" })).toMatchObject({
      drafts: [{ id: "id-2" }],
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
