import { describe, expect, it } from "vite-plus/test";
import { connectRestChat, restoreRestChat } from "./RestChatAdapter.ts";

const slackAuth = {
  ok: true,
  team: "Real workspace",
  team_id: "T123",
  user_id: "U123",
  user: "Asha",
};
function slackResponse(value: unknown, scopes = "channels:read,channels:history,chat:write") {
  return Response.json(value, { headers: { "x-oauth-scopes": scopes } });
}
const discordAuth = { id: "123", username: "Pulse bot", bot: true };
const basePermissions = ((1n << 10n) | (1n << 16n) | (1n << 11n) | (1n << 38n)).toString();
function discordFixture(overwrites: unknown[] = [], rolePermissions = basePermissions) {
  const requests: { url: URL; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, ...(init ? { init } : {}) });
    expect(url.origin).toBe("https://discord.com");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bot secret");
    const path = url.pathname.replace("/api/v10/", "");
    if (path === "users/@me") return Response.json(discordAuth);
    if (path === "users/@me/guilds") return Response.json([{ id: "100", name: "Real guild" }]);
    if (path.endsWith("/roles"))
      return Response.json([
        { id: "100", permissions: rolePermissions },
        { id: "101", permissions: "0" },
      ]);
    if (path.endsWith("/members/123")) return Response.json({ roles: ["101"] });
    if (path.endsWith("/channels"))
      return Response.json([
        { id: "200", type: 0, name: "engineering", permission_overwrites: overwrites },
        { id: "201", type: 2, name: "voice", permission_overwrites: [] },
      ]);
    if (path.endsWith("/threads/active"))
      return Response.json({
        threads: [
          {
            id: "300",
            type: 11,
            parent_id: "200",
            name: "Actual thread",
            thread_metadata: { archived: false, locked: false },
          },
        ],
      });
    if (path.endsWith("/messages")) {
      const channelId = path.split("/")[1];
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({
          id: "999",
          channel_id: channelId,
          author: discordAuth,
          timestamp: "2026-10-12T00:00:00Z",
          content: body.content,
          message_reference: body.message_reference,
        });
      }
      return Response.json([
        {
          id: "900",
          channel_id: channelId,
          author: { id: "456", username: "real-username", global_name: "Real person" },
          timestamp: "2026-10-11T00:00:00Z",
          content: "Real message",
          has_thread: channelId === "200",
          thread: channelId === "200" ? { id: "300" } : undefined,
        },
      ]);
    }
    throw new Error(`Unhandled fixture ${path}`);
  };
  return { fetcher, requests };
}

describe("REST chat adapters", () => {
  it("verifies Slack identity and never reflects a rejected credential", async () => {
    await expect(
      connectRestChat("slack", "secret-token", async () =>
        Response.json({ ok: false, error: "invalid_auth", detail: "secret-token" }),
      ),
    ).rejects.toMatchObject({ code: "authentication" });
    const adapter = await connectRestChat("slack", "secret-token", async (_url, init) => {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer secret-token");
      return Response.json({
        ok: true,
        team: "Actual workspace",
        team_id: "T123",
        user_id: "U123",
        user: "actual-person",
      });
    });
    expect(adapter.account).toEqual({
      provider: "slack",
      label: "Actual workspace",
      identity: "actual-person",
    });
    expect(JSON.stringify(adapter.account)).not.toContain("secret-token");
    await adapter.close();
  });

  it("refuses Discord user tokens rather than creating a self-bot", async () => {
    await expect(
      connectRestChat("discord", "secret", async () =>
        Response.json({ id: "123", username: "human", bot: false }),
      ),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("validates stored credentials", async () => {
    await expect(restoreRestChat("slack", { token: 123 })).rejects.toMatchObject({
      code: "authentication",
    });
  });

  it("preserves Slack channel IDs, native cursors, real dates and thread routing", async () => {
    const requests: URL[] = [];
    const adapter = await connectRestChat("slack", "secret", async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("auth.test")) return slackResponse(slackAuth);
      if (url.pathname.endsWith("conversations.list"))
        return slackResponse({
          ok: true,
          channels: [{ id: "C123", name: "actual-channel", is_member: true }],
          response_metadata: { next_cursor: "native-next" },
        });
      expect(url.pathname).toBe("/api/conversations.replies");
      expect(url.searchParams.get("channel")).toBe("C123");
      expect(url.searchParams.get("ts")).toBe("1720000000.000001");
      expect(url.searchParams.get("cursor")).toBe("message-next");
      return slackResponse({
        ok: true,
        messages: [
          {
            ts: "1720000010.000002",
            thread_ts: "1720000000.000001",
            user: "U456",
            text: "Actual reply",
          },
          {
            ts: "1720000000.000001",
            thread_ts: "1720000000.000001",
            user: "U123",
            text: "Actual parent",
            reply_count: 2,
          },
        ],
        response_metadata: { next_cursor: "older-replies" },
      });
    });
    const channels = await adapter.conversations("account", "channel-next");
    expect(channels).toMatchObject({
      conversations: [{ id: "C123", title: "actual-channel", workspaceId: "T123", canSend: true }],
      nextCursor: "native-next",
    });
    expect(requests[1]?.searchParams.get("cursor")).toBe("channel-next");
    const history = await adapter.messages("account", "C123", "message-next", "1720000000.000001");
    expect(history.nextCursor).toBe("older-replies");
    expect(history.messages[0]).toMatchObject({
      id: "1720000000.000001",
      author: "Asha",
      text: "Actual parent",
      replyCount: 2,
      date: "2024-07-03T09:46:40.000Z",
    });
    expect(history.messages[1]).toMatchObject({
      author: "U456",
      replyToId: "1720000000.000001",
      threadId: "1720000000.000001",
    });
    await adapter.close();
  });

  it("confirms Slack sends from the provider ACK and gives retries a stable client message ID", async () => {
    const bodies: Record<string, unknown>[] = [];
    const adapter = await connectRestChat("slack", "secret", async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("auth.test")) return slackResponse(slackAuth);
      if (url.pathname.endsWith("conversations.list"))
        return slackResponse({
          ok: true,
          channels: [{ id: "C123", name: "actual", is_member: true }],
        });
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return slackResponse({
        ok: true,
        channel: "C123",
        ts: "1720000010.000002",
        message: {
          ts: "1720000010.000002",
          user: "U123",
          text: "Provider confirmed text",
          thread_ts: body.thread_ts,
        },
      });
    });
    await adapter.conversations("account");
    const sent = await adapter.send("account", "C123", "User text", "draft-1", "1720000000.000001");
    await adapter.send("account", "C123", "User text", "draft-1", "1720000000.000001");
    expect(sent).toMatchObject({
      id: "1720000010.000002",
      text: "Provider confirmed text",
      replyToId: "1720000000.000001",
    });
    expect(bodies[0]).toMatchObject({
      channel: "C123",
      text: "User text",
      thread_ts: "1720000000.000001",
    });
    expect(bodies[0]?.client_msg_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(bodies[1]?.client_msg_id).toBe(bodies[0]?.client_msg_id);
    await adapter.close();
  });

  it("blocks Slack sends without chat scope and never invents a successful send", async () => {
    let posts = 0;
    const adapter = await connectRestChat("slack", "secret", async (input, init) => {
      if (init?.method === "POST" && String(input).includes("chat.postMessage")) posts++;
      return String(input).includes("auth.test")
        ? slackResponse(slackAuth, "channels:read")
        : slackResponse(
            { ok: true, channels: [{ id: "C123", name: "readonly", is_member: true }] },
            "channels:read",
          );
    });
    expect((await adapter.conversations("account")).conversations[0]?.canSend).toBe(false);
    await expect(adapter.send("account", "C123", "Draft", "nonce")).rejects.toMatchObject({
      code: "permission",
    });
    expect(posts).toBe(0);
    await adapter.close();
  });

  it("honors rate limits without retrying a POST or reflecting provider error bodies", async () => {
    let calls = 0;
    const adapter = await connectRestChat("slack", "secret", async (input) => {
      calls++;
      if (String(input).includes("auth.test")) return slackResponse(slackAuth);
      if (String(input).includes("conversations.list"))
        return slackResponse({
          ok: true,
          channels: [{ id: "C123", name: "actual", is_member: true }],
        });
      return Response.json({ detail: "secret", retry_after: 12.5 }, { status: 429 });
    });
    await adapter.conversations("account");
    await expect(adapter.send("account", "C123", "Draft", "nonce")).rejects.toMatchObject({
      code: "rate_limit",
      retryAfterSeconds: 13,
    });
    await expect(adapter.send("account", "C123", "Draft", "nonce")).rejects.toMatchObject({
      code: "rate_limit",
    });
    expect(calls).toBe(3);
    await adapter.close();
  });

  it("maps Discord bot channels, active threads and real message authors", async () => {
    const fixture = discordFixture();
    const adapter = await connectRestChat("discord", "secret", fixture.fetcher);
    expect(adapter.account).toEqual({
      provider: "discord",
      label: "Pulse bot (bot)",
      identity: "Pulse bot",
    });
    expect((await adapter.conversations("account")).conversations).toEqual([
      {
        id: "200",
        accountId: "account",
        title: "engineering",
        workspace: "Real guild",
        workspaceId: "100",
        kind: "channel",
        canSend: true,
      },
      {
        id: "300",
        accountId: "account",
        title: "Actual thread",
        workspace: "Real guild",
        workspaceId: "100",
        kind: "thread",
        canSend: true,
      },
    ]);
    expect((await adapter.messages("account", "200")).messages[0]).toMatchObject({
      id: "900",
      author: "Real person",
      text: "Real message",
      threadId: "300",
      conversationId: "200",
    });
    expect(
      (await adapter.messages("account", "200", undefined, "300")).messages[0]?.conversationId,
    ).toBe("300");
    await expect(adapter.messages("account", "../../users/@me")).rejects.toMatchObject({
      code: "not_found",
    });
    await adapter.close();
  });

  it("applies Discord everyone, aggregate role and member overwrite precedence", async () => {
    const fixture = discordFixture([
      { id: "100", type: 0, allow: "0", deny: (1n << 11n).toString() },
      { id: "101", type: 0, allow: (1n << 11n).toString(), deny: "0" },
      { id: "123", type: 1, allow: "0", deny: ((1n << 11n) | (1n << 38n)).toString() },
    ]);
    const adapter = await connectRestChat("discord", "secret", fixture.fetcher);
    expect(
      (await adapter.conversations("account")).conversations.map((channel) => channel.canSend),
    ).toEqual([false, false]);
    await expect(adapter.send("account", "200", "Draft", "nonce")).rejects.toMatchObject({
      code: "permission",
    });
    expect(fixture.requests.filter((request) => request.init?.method === "POST")).toHaveLength(0);
    await adapter.close();
  });

  it("omits Discord channels without view/history permission and allows administrators", async () => {
    const hidden = discordFixture([
      { id: "100", type: 0, allow: "0", deny: (1n << 16n).toString() },
    ]);
    const hiddenAdapter = await connectRestChat("discord", "secret", hidden.fetcher);
    expect((await hiddenAdapter.conversations("account")).conversations).toEqual([]);
    await hiddenAdapter.close();
    const admin = discordFixture([{ id: "100", type: 0, allow: "0", deny: basePermissions }], "8");
    const adminAdapter = await connectRestChat("discord", "secret", admin.fetcher);
    expect(
      (await adminAdapter.conversations("account")).conversations.map((channel) => channel.canSend),
    ).toEqual([true, true]);
    await adminAdapter.close();
  });

  it("routes Discord replies and only returns the acknowledged message with stable bounded nonce", async () => {
    const fixture = discordFixture();
    const adapter = await connectRestChat("discord", "secret", fixture.fetcher);
    await adapter.conversations("account");
    expect(await adapter.send("account", "200", "Reply text", "draft-1", "900")).toMatchObject({
      id: "999",
      text: "Reply text",
      replyToId: "900",
      author: "Pulse bot",
    });
    await adapter.send("account", "200", "Reply text", "draft-1", "900");
    const sends = fixture.requests
      .filter((request) => request.init?.method === "POST")
      .map((request) => JSON.parse(String(request.init?.body)) as Record<string, unknown>);
    expect(sends[0]).toMatchObject({
      enforce_nonce: true,
      allowed_mentions: { parse: [] },
      message_reference: { message_id: "900", channel_id: "200", fail_if_not_exists: true },
    });
    expect(String(sends[0]?.nonce)).toHaveLength(24);
    expect(sends[1]?.nonce).toBe(sends[0]?.nonce);
    await adapter.close();
  });

  it("redacts transport exceptions and stops further requests when closed", async () => {
    let calls = 0;
    const adapter = await connectRestChat("slack", "secret-token", async () => {
      if (calls++ === 0) return slackResponse(slackAuth);
      throw new Error("Request contained secret-token");
    });
    try {
      await adapter.conversations("account");
    } catch (error) {
      expect(String(error)).not.toContain("secret-token");
      expect(error).toMatchObject({ code: "network" });
    }
    await adapter.close();
    await expect(adapter.conversations("account")).rejects.toMatchObject({ code: "network" });
    expect(calls).toBe(2);
  });

  it("rejects unconfirmed Slack sends without automatic retries", async () => {
    let sends = 0;
    const adapter = await connectRestChat("slack", "secret", async (input) => {
      if (String(input).includes("auth.test")) return slackResponse(slackAuth);
      if (String(input).includes("conversations.list"))
        return slackResponse({
          ok: true,
          channels: [{ id: "C123", name: "actual", is_member: true }],
        });
      sends++;
      return slackResponse({
        ok: true,
        channel: "C999",
        ts: "1720000000.000001",
        message: { ts: "1720000000.000001", text: "Wrong destination" },
      });
    });
    await adapter.conversations("account");
    await expect(adapter.send("account", "C123", "Draft", "nonce")).rejects.toMatchObject({
      code: "network",
    });
    expect(sends).toBe(1);
    await adapter.close();
  });

  it("keeps Discord conversation pages within 500 without dropping overflow threads", async () => {
    const fixture = discordFixture();
    let channelCalls = 0;
    const adapter = await connectRestChat("discord", "secret", async (input, init) => {
      if (String(input).endsWith("/guilds/100/channels")) {
        channelCalls++;
        return Response.json(
          Array.from({ length: 500 }, (_, index) => ({
            id: String(500 + index),
            name: `real-${index}`,
            type: 0,
            permission_overwrites: [],
          })),
        );
      }
      if (String(input).endsWith("/threads/active"))
        return Response.json({
          threads: [
            {
              id: "300",
              type: 11,
              parent_id: "500",
              name: "overflow thread",
              thread_metadata: { archived: false, locked: false },
            },
          ],
        });
      return fixture.fetcher(input, init);
    });
    const first = await adapter.conversations("account");
    expect(first.conversations).toHaveLength(500);
    expect(first.nextCursor).toBeDefined();
    const second = await adapter.conversations("account", first.nextCursor);
    expect(second.conversations).toEqual([
      {
        id: "300",
        accountId: "account",
        title: "overflow thread",
        kind: "thread",
        workspace: "Real guild",
        workspaceId: "100",
        canSend: true,
      },
    ]);
    expect(second.nextCursor).toBeUndefined();
    expect(channelCalls).toBe(1);
    await expect(adapter.conversations("account", first.nextCursor)).rejects.toMatchObject({
      code: "not_found",
    });
    await adapter.close();
  });

  it("uses Discord before cursors and keeps message IDs in chronological order", async () => {
    const fixture = discordFixture();
    const adapter = await connectRestChat("discord", "secret", async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/channels/200/messages")) {
        expect(url.searchParams.get("before")).toBe("999");
        expect(url.searchParams.get("limit")).toBe("50");
        return Response.json(
          Array.from({ length: 50 }, (_, index) => ({
            id: String(900 - index),
            channel_id: "200",
            author: { id: "456", username: "Real author" },
            timestamp: "2026-10-11T00:00:00Z",
            content: `Message ${900 - index}`,
          })),
        );
      }
      return fixture.fetcher(input, init);
    });
    await adapter.conversations("account");
    const page = await adapter.messages("account", "200", "999");
    expect(page.messages).toHaveLength(50);
    expect(page.messages[0]?.id).toBe("851");
    expect(page.messages.at(-1)?.id).toBe("900");
    expect(page.nextCursor).toBe("851");
    await adapter.close();
  });

  it("aborts an in-flight request on disconnect", async () => {
    const adapter = await connectRestChat("slack", "secret", async (input, init) => {
      if (String(input).includes("auth.test")) return slackResponse(slackAuth);
      expect(init?.signal).toBeDefined();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });
    });
    const pending = adapter.conversations("account");
    await adapter.close();
    await expect(pending).rejects.toMatchObject({ code: "network" });
  });

  it("preserves a Slack send ACK when optional author hydration fails", async () => {
    const scopes = "channels:read,chat:write,users:read";
    const adapter = await connectRestChat("slack", "secret", async (input) => {
      if (String(input).includes("auth.test")) return slackResponse(slackAuth, scopes);
      if (String(input).includes("conversations.list"))
        return slackResponse(
          { ok: true, channels: [{ id: "C123", name: "actual", is_member: true }] },
          scopes,
        );
      if (String(input).includes("users.info"))
        return Response.json({ retry_after: 60 }, { status: 429 });
      return slackResponse(
        {
          ok: true,
          channel: "C123",
          ts: "1720000000.000001",
          message: { ts: "1720000000.000001", user: "U456", text: "Confirmed by Slack" },
        },
        scopes,
      );
    });
    await adapter.conversations("account");
    expect(await adapter.send("account", "C123", "Draft", "nonce")).toMatchObject({
      id: "1720000000.000001",
      author: "U456",
      text: "Confirmed by Slack",
    });
    await adapter.close();
  });

  it("identifies real Discord attachments when a message has no text", async () => {
    const fixture = discordFixture();
    const adapter = await connectRestChat("discord", "secret", async (input, init) => {
      if (new URL(String(input)).pathname.endsWith("/channels/200/messages"))
        return Response.json([
          {
            id: "900",
            channel_id: "200",
            author: { id: "456", username: "Real author" },
            timestamp: "2026-10-11T00:00:00Z",
            content: "",
            attachments: [{ filename: "actual-report.pdf" }],
          },
        ]);
      return fixture.fetcher(input, init);
    });
    await adapter.conversations("account");
    expect((await adapter.messages("account", "200")).messages[0]?.text).toBe(
      "Attachments: actual-report.pdf",
    );
    await adapter.close();
  });
});

it.each([0, 3, -1, 1.5, "2", null, undefined])(
  "retains only a source-supplied nonnegative integer reply count: %j",
  async (replyCount) => {
    const adapter = await connectRestChat("slack", "secret", async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("auth.test")) return slackResponse(slackAuth);
      if (url.pathname.endsWith("conversations.list"))
        return slackResponse({ ok: true, channels: [{ id: "C123", name: "general" }] });
      return slackResponse({
        ok: true,
        messages: [
          { ts: "1760343120.000001", user: "U123", text: "Hello", reply_count: replyCount },
        ],
      });
    });
    try {
      await adapter.conversations("account");
      const message = (await adapter.messages("account", "C123")).messages[0]!;
      expect(message.id).toBe("1760343120.000001");
      if (typeof replyCount === "number" && Number.isInteger(replyCount) && replyCount >= 0)
        expect(message.replyCount).toBe(replyCount);
      else expect(message).not.toHaveProperty("replyCount");
    } finally {
      await adapter.close();
    }
  },
);
