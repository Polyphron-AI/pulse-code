import { describe, expect, it, vi } from "vite-plus/test";
import { ChatService } from "./ChatService.ts";
import { ChatError, type ChatAdapter } from "./ChatAdapter.ts";

function setup() {
  let saved: string | null = null;
  let identifier = 0;
  const message = {
    id: "123",
    accountId: "id-1",
    conversationId: "C1",
    author: "Real author",
    date: "2026-10-12T00:00:00Z",
    text: "confirmed",
  };
  const adapter: ChatAdapter = {
    account: { provider: "slack", label: "Team", identity: "Connected user" },
    credentials: () => ({ token: "private-token" }),
    conversations: vi.fn(async () => ({ conversations: [] })),
    messages: vi.fn(async () => ({ messages: [] })),
    send: vi.fn(async () => message),
    close: vi.fn(async () => {}),
  };
  const storage = {
    read: vi.fn(async () => saved),
    write: vi.fn(async (value: string) => {
      saved = value;
    }),
  };
  const factories = {
    connectRestChat: vi.fn(async () => adapter),
    restoreRestChat: vi.fn(async () => adapter),
  };
  const service = new ChatService({
    storage,
    factories,
    id: () => `id-${++identifier}`,
  });
  return {
    service,
    adapter,
    storage,
    factories,
    message,
    saved: () => saved,
  };
}

describe("native communications account ownership", () => {
  it("stores credentials privately and restores accounts without exposing credentials", async () => {
    const s = setup();
    const connected = await s.service.invoke({
      operation: "accounts.connectToken",
      provider: "slack",
      token: "private-token",
    });
    expect(connected).toMatchObject({ ok: true, account: { id: "id-1" } });
    expect(JSON.stringify(connected)).not.toContain("private-token");
    expect(s.saved()).toContain("private-token");
    const restored = new ChatService({ storage: s.storage, factories: s.factories });
    expect(await restored.invoke({ operation: "accounts.list" })).toMatchObject({
      ok: true,
      accounts: [{ id: "id-1" }],
    });
    await restored.invoke({ operation: "messages.list", accountId: "id-1", conversationId: "C1" });
    expect(s.factories.restoreRestChat).toHaveBeenCalledWith("slack", { token: "private-token" });
    await restored.close();
    await s.service.close();
  });
  it("closes a new connection if secure persistence fails", async () => {
    const s = setup();
    s.storage.write.mockRejectedValue(new Error("secret raw detail"));
    expect(
      await s.service.invoke({
        operation: "accounts.connectToken",
        provider: "slack",
        token: "private-token",
      }),
    ).toMatchObject({ ok: false, error: { code: "storage" } });
    expect(s.adapter.close).toHaveBeenCalled();
    expect(await s.service.invoke({ operation: "accounts.list" })).toEqual({
      ok: true,
      accounts: [],
    });
    await s.service.close();
  });
  it("returns only provider-confirmed sends, preserves rate-limit errors and removes disconnected credentials", async () => {
    const s = setup();
    await s.service.invoke({
      operation: "accounts.connectToken",
      provider: "slack",
      token: "private-token",
    });
    const request = {
      operation: "messages.send",
      accountId: "id-1",
      conversationId: "C1",
      text: "requested",
      nonce: "retry-1",
    } as const;
    expect(await s.service.invoke(request)).toEqual({ ok: true, message: s.message });
    vi.mocked(s.adapter.send).mockRejectedValueOnce(new ChatError("rate_limit", "Wait", 60));
    expect(await s.service.invoke(request)).toEqual({
      ok: false,
      error: { code: "rate_limit", message: "Wait", retryAfterSeconds: 60 },
    });
    await s.service.invoke({ operation: "accounts.disconnect", accountId: "id-1" });
    expect(s.saved()).not.toContain("private-token");
    expect(await s.service.invoke(request)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    await s.service.close();
  });
  it("retires personal Telegram login while preserving saved account records and credentials", async () => {
    const record = JSON.stringify({
      version: 1,
      accounts: [
        {
          account: {
            id: "legacy",
            provider: "telegram",
            label: "Saved personal",
            identity: "Personal account",
          },
          credentials: {
            session: "saved-private-session",
            apiId: 123,
            apiHash: "saved-private-hash",
          },
        },
      ],
    });
    const storage = { read: vi.fn(async () => record), write: vi.fn(async (_value: string) => {}) };
    const service = new ChatService({ storage });
    expect(await service.invoke({ operation: "accounts.list" })).toMatchObject({
      ok: true,
      accounts: [{ id: "legacy", provider: "telegram" }],
    });
    for (const request of [
      {
        operation: "accounts.telegram.begin",
        apiId: 123,
        apiHash: "new-hash",
        phone: "+123456789",
      },
      { operation: "accounts.telegram.complete", challengeId: "old", code: "12345" },
      { operation: "messages.list", accountId: "legacy", conversationId: "42" },
      {
        operation: "messages.send",
        accountId: "legacy",
        conversationId: "42",
        text: "blocked",
        nonce: "once",
      },
    ] as const) {
      expect(await service.invoke(request)).toMatchObject({
        ok: false,
        error: { code: "unsupported", message: expect.stringContaining("retired") },
      });
    }
    expect(
      await service.invoke({ operation: "accounts.telegram.cancel", challengeId: "old" }),
    ).toEqual({ ok: true });
    expect(storage.write).not.toHaveBeenCalled();
    expect(await storage.read()).toBe(record);
    await service.close();
  });
  it("refreshes migrated session credentials without losing a confirmed send on storage failure", async () => {
    const s = setup();
    await s.service.invoke({
      operation: "accounts.connectToken",
      provider: "slack",
      token: "private-token",
    });
    s.adapter.credentials = () => ({ token: "migrated-session" });
    await s.service.invoke({ operation: "conversations.list", accountId: "id-1" });
    expect(s.saved()).toContain("migrated-session");
    s.adapter.credentials = () => ({ token: "second-migration" });
    s.storage.write.mockRejectedValue(new Error("storage unavailable"));
    expect(
      await s.service.invoke({
        operation: "messages.send",
        accountId: "id-1",
        conversationId: "C1",
        text: "requested",
        nonce: "send-once",
      }),
    ).toEqual({ ok: true, message: s.message });
    expect(s.adapter.send).toHaveBeenCalledTimes(1);
    await s.service.close();
  });
  it("closes a newly connected adapter when shutdown races with secure storage", async () => {
    const s = setup();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    s.storage.write.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const connecting = s.service.invoke({
      operation: "accounts.connectToken",
      provider: "slack",
      token: "private-token",
    });
    await entered.promise;
    const closing = s.service.close();
    release.resolve();
    expect(await connecting).toMatchObject({ ok: false });
    await closing;
    expect(s.adapter.close).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed input before calling a provider and rejects requests after teardown", async () => {
    const s = setup();
    expect(
      await s.service.invoke({ operation: "accounts.connectToken", provider: "slack", token: "" }),
    ).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    expect(s.factories.connectRestChat).not.toHaveBeenCalled();
    await s.service.close();
    expect(await s.service.invoke({ operation: "accounts.list" })).toMatchObject({
      ok: false,
      error: { code: "closed" },
    });
  });
});
