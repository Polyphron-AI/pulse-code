import { describe, expect, it, vi } from "vite-plus/test";
import { createOfficeProviders, type ProviderContext } from "./OfficeProviders.ts";

const mock = vi.hoisted(() => ({
  options: {} as Record<string, unknown>,
  mailboxOptions: {} as Record<string, unknown>,
  closed: 0,
  size: 100,
  sourceReads: 0,
}));
vi.mock("imapflow", () => ({
  ImapFlow: class {
    constructor(options: Record<string, unknown>) {
      mock.options = options;
    }
    on() {}
    async connect() {}
    close() {
      mock.closed++;
    }
    async mailboxOpen(_path: string, options: Record<string, unknown>) {
      mock.mailboxOptions = options;
      return { exists: 1, uidValidity: 42n };
    }
    async fetchAll() {
      return [
        {
          uid: 7,
          envelope: {
            subject: "Test",
            from: [{ address: "sender@example.com" }],
            to: [{ address: "person@example.com" }],
          },
          flags: new Set<string>(),
        },
      ];
    }
    async fetchOne(_uid: string, query: Record<string, unknown>) {
      if (query.source) {
        mock.sourceReads++;
        return {
          source: Buffer.from(
            "From: sender@example.com\r\nTo: person@example.com\r\nSubject: Test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nPlain body",
          ),
          flags: new Set<string>(),
        };
      }
      return { size: mock.size };
    }
  },
}));

function context(): ProviderContext {
  return {
    account: {
      id: "account",
      provider: "imap",
      email: "person@example.com",
      capabilities: ["mail"],
      status: "connected",
      selectedCalendarIds: [],
    },
    credentials: {
      imap: {
        host: "imap.example.com",
        port: 143,
        username: "person@example.com",
        password: "secret",
        tls: "starttls",
      },
    },
    signal: new AbortController().signal,
  };
}

describe("Office IMAP read adapter", () => {
  it("requires STARTTLS with certificate validation and opens INBOX read-only", async () => {
    const providers = createOfficeProviders();
    const page = await providers.messages(context(), undefined, 25);
    expect(mock.options).toMatchObject({
      secure: false,
      doSTARTTLS: true,
      logger: false,
      tls: { rejectUnauthorized: true },
    });
    expect(mock.mailboxOptions).toEqual({ readOnly: true });
    expect(page.messages).toMatchObject([{ id: "42:7", unread: true }]);
    expect(mock.closed).toBeGreaterThan(0);
  });

  it("rejects stale UID validity and oversized messages before fetching source", async () => {
    const providers = createOfficeProviders();
    const before = mock.sourceReads;
    await expect(providers.message(context(), "41:7")).rejects.toMatchObject({ code: "not_found" });
    mock.size = 10_000_001;
    await expect(providers.message(context(), "42:7")).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(mock.sourceReads).toBe(before);
    mock.size = 100;
  });

  it("parses MIME text without enabling HTML rendering or changing read flags", async () => {
    const providers = createOfficeProviders();
    const message = await providers.message(context(), "42:7");
    expect(message).toMatchObject({
      subject: "Test",
      from: "sender@example.com",
      text: "Plain body",
      unread: true,
    });
    expect(mock.mailboxOptions).toEqual({ readOnly: true });
  });
});
