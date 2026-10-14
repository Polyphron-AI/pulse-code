import { describe, expect, it } from "vite-plus/test";
import { connectRestChat } from "./RestChatAdapter.ts";

function slack(fetchProfile = true, failProfile = false) {
  const calls: URL[] = [];
  const scopes = `channels:read${fetchProfile ? ",users:read" : ""}`;
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const respond = (value: unknown) =>
      Response.json(value, { headers: { "x-oauth-scopes": scopes } });
    if (url.pathname.endsWith("auth.test"))
      return respond({ ok: true, team: "Team", team_id: "T1", user_id: "U1", user: "Self" });
    if (url.pathname.endsWith("conversations.info"))
      return respond({ ok: true, channel: { id: "C1", name: "marketing" } });
    if (url.pathname.endsWith("conversations.list"))
      return respond({ ok: true, channels: [{ id: "C1", name: "marketing" }] });
    if (url.pathname.endsWith("conversations.members")) {
      expect(url.searchParams.get("channel")).toBe("C1");
      expect(url.searchParams.get("limit")).toBe("50");
      return respond({
        ok: true,
        members: ["U2"],
        response_metadata: { next_cursor: "next-page" },
      });
    }
    if (url.pathname.endsWith("users.info"))
      return respond(
        failProfile
          ? { ok: false, error: "missing_scope" }
          : { ok: true, user: { id: "U2", name: "Alex", is_admin: true, is_bot: false } },
      );
    throw new Error("Unexpected fixture request");
  };
  return { fetcher, calls };
}
function discord(deny = false) {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v10/", "");
    if (path === "users/@me") return Response.json({ id: "1", username: "Bot", bot: true });
    if (path === "channels/200")
      return Response.json({ id: "200", guild_id: "100", name: "private-room", type: 0 });
    if (path === "guilds/100") return Response.json({ id: "100", name: "Team server" });
    if (path === "users/@me/guilds") return Response.json([{ id: "100", name: "Team server" }]);
    if (path.endsWith("/roles"))
      return Response.json([
        { id: "100", name: "@everyone", permissions: "66560" },
        { id: "101", name: "Marketing", permissions: "0" },
      ]);
    if (path.endsWith("/members/1")) return Response.json({ roles: [] });
    if (path.endsWith("/channels"))
      return Response.json([
        { id: "200", name: "private-room", type: 0, permission_overwrites: [] },
      ]);
    if (path.endsWith("/threads/active")) return Response.json({ threads: [] });
    if (path === "guilds/100/members") {
      expect(url.searchParams.get("limit")).toBe("50");
      return deny
        ? Response.json({ secret: "private-token" }, { status: 403 })
        : Response.json([{ user: { id: "2", username: "Alex", bot: false }, roles: ["101"] }]);
    }
    throw new Error("Unexpected fixture request");
  };
  return fetcher;
}
describe("linked conversation membership", () => {
  it("filters Discord task assignees by channel overrides and retains raw pagination", async () => {
    const fixture = discord();
    const adapter = await connectRestChat("discord", "token", async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("channels/200"))
        return Response.json({
          id: "200",
          guild_id: "100",
          name: "Private",
          type: 0,
          permission_overwrites: [
            { id: "100", type: 0, allow: "0", deny: "1024" },
            { id: "101", type: 0, allow: "1024", deny: "0" },
          ],
        });
      if (path.endsWith("guilds/100/members"))
        return Response.json(
          Array.from({ length: 50 }, (_, i) => ({
            user: { id: String(i + 2), username: `Member ${i}`, bot: false },
            roles: i === 0 ? ["101"] : [],
          })),
        );
      return fixture(input, init);
    });
    const page = await adapter.members!("a", "200", undefined, true);
    expect(page.scope).toBe("channel");
    expect(page.members.map((m) => m.id)).toEqual(["2"]);
    expect(page.nextCursor).toBe("51");
    await adapter.close();
  });
  it("does not treat a private Discord thread's whole server as eligible assignees", async () => {
    const fixture = discord();
    const adapter = await connectRestChat("discord", "token", async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("channels/200"))
        return Response.json({
          id: "200",
          guild_id: "100",
          parent_id: "201",
          name: "Private thread",
          type: 12,
        });
      if (path.endsWith("channels/201"))
        return Response.json({ id: "201", guild_id: "100", type: 0, permission_overwrites: [] });
      if (path.endsWith("channels/200/thread-members")) return Response.json([]);
      return fixture(input, init);
    });
    const page = await adapter.members!("a", "200", undefined, true);
    expect(page.scope).toBe("channel");
    expect(page.members).toEqual([]);
    await adapter.close();
  });
  it.each(["slack", "discord"] as const)(
    "checks current %s source access before reading persisted channel members",
    async (provider) => {
      const fixture = provider === "slack" ? slack().fetcher : discord();
      const calls: string[] = [];
      const adapter = await connectRestChat(provider, "token", async (input, init) => {
        const url = new URL(String(input));
        calls.push(url.pathname);
        if (url.pathname.endsWith("conversations.info") || url.pathname.endsWith("channels/200"))
          return Response.json({ private: "secret" }, { status: 403 });
        return fixture(input, init);
      });
      await expect(
        adapter.members!("a", provider === "slack" ? "C1" : "200"),
      ).rejects.toMatchObject({ code: "permission" });
      expect(
        calls.some((path) => path.endsWith("/members") || path.endsWith("conversations.members")),
      ).toBe(false);
      await adapter.close();
    },
  );
  it("bounds Slack profile requests to five concurrent reads and retains native IDs on bad profiles", async () => {
    const fixture = slack();
    let active = 0;
    let maximum = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("conversations.members"))
        return Response.json(
          { ok: true, members: Array.from({ length: 12 }, (_, index) => `U${index + 2}`) },
          { headers: { "x-oauth-scopes": "channels:read,users:read" } },
        );
      if (url.pathname.endsWith("users.info")) {
        active++;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active--;
        return Response.json({ ok: true, user: { id: "UWRONG", name: "Wrong identity" } });
      }
      return fixture.fetcher(input, init);
    };
    const adapter = await connectRestChat("slack", "token", fetcher);
    const page = await adapter.members!("a", "C1");
    expect(maximum).toBe(5);
    expect(page.members).toHaveLength(12);
    expect(page.members[0]).toEqual({ id: "U2", displayName: "U2" });
    expect(page.note).toContain("unavailable");
    await adapter.close();
  });
  it("rejects oversized Slack member pages without inventing pagination", async () => {
    const fixture = slack(false);
    const adapter = await connectRestChat("slack", "token", async (input, init) =>
      String(input).includes("conversations.members")
        ? Response.json({
            ok: true,
            members: Array.from({ length: 51 }, (_, index) => `U${index}`),
          })
        : fixture.fetcher(input, init),
    );
    await expect(adapter.members!("a", "C1")).rejects.toMatchObject({ code: "network" });
    await adapter.close();
  });
  it("reads Slack channel members with workspace roles and pagination", async () => {
    const fixture = slack();
    const adapter = await connectRestChat("slack", "token", fixture.fetcher);
    expect(await adapter.members!("a", "C1")).toMatchObject({
      scope: "channel",
      title: "marketing",
      members: [{ id: "U2", displayName: "Alex", roles: ["Workspace admin"], isBot: false }],
      nextCursor: "next-page",
    });
    await adapter.close();
  });
  it.each([false, true])(
    "marks unavailable Slack profiles without fabricating roles (scope=%s)",
    async (hasScope) => {
      const fixture = slack(hasScope, true);
      const adapter = await connectRestChat("slack", "token", fixture.fetcher);
      const page = await adapter.members!("a", "C1");
      expect(page.members).toEqual([{ id: "U2", displayName: "U2" }]);
      expect(page.note).toContain("unavailable");
      if (!hasScope)
        expect(fixture.calls.some((url) => url.pathname.endsWith("users.info"))).toBe(false);
      await adapter.close();
    },
  );
  it("labels Discord server membership separately from channel access", async () => {
    const adapter = await connectRestChat("discord", "token", discord());
    expect(await adapter.members!("a", "200")).toMatchObject({
      scope: "workspace",
      title: "Team server",
      members: [{ id: "2", displayName: "Alex", roles: ["Marketing"], isBot: false }],
      note: expect.stringContaining("not establish channel"),
    });
    await adapter.close();
  });
  it("explains Discord privileged-intent denial without leaking provider details", async () => {
    const adapter = await connectRestChat("discord", "token", discord(true));
    await expect(adapter.members!("a", "200")).rejects.toMatchObject({
      code: "permission",
      message: expect.stringContaining("Server Members Intent"),
    });
    await adapter.close();
  });
});
