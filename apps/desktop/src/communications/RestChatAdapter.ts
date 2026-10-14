// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off -- Native Promise REST adapters own fetch cancellation and provider rate-limit deadlines outside Effect.
import * as NodeCrypto from "node:crypto";
import type { ChatConversation, ChatMessage, ChatMember, ChatMembership } from "@t3tools/contracts";
import { ChatError, type ChatAdapter } from "./ChatAdapter.ts";

type Provider = "slack" | "discord";
type Row = Record<string, unknown>;
type Fetcher = typeof fetch;

function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ChatError("network", "The provider returned an invalid response.");
  return value as Row;
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value))
    throw new ChatError("network", "The provider returned an invalid list.");
  return value.map(record);
}

function string(value: unknown, max = 4096): string {
  if (typeof value !== "string" || value.length > max)
    throw new ChatError("network", "The provider returned an invalid field.");
  return value;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : string(value);
}

function id(value: unknown, provider: Provider): string {
  const result = string(value, 128);
  if (!(provider === "discord" ? /^\d{1,22}$/ : /^[A-Z][A-Z0-9]+$/).test(result))
    throw new ChatError("not_found", "Invalid provider conversation or identity.");
  return result;
}

function slackTimestamp(value: unknown): string {
  const result = string(value, 64);
  if (!/^\d+\.\d+$/.test(result) || !Number.isFinite(Number(result)))
    throw new ChatError("network", "Slack returned an invalid message timestamp.");
  return result;
}

function date(value: unknown): string {
  const result = new Date(string(value));
  if (!Number.isFinite(result.getTime()))
    throw new ChatError("network", "The provider returned an invalid message date.");
  return result.toISOString();
}

function retrySeconds(value: unknown): number | undefined {
  const seconds = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(86400, Math.max(1, Math.ceil(seconds)))
    : undefined;
}

class Transport {
  readonly provider: Provider;
  readonly token: string;
  private readonly fetcher: Fetcher;
  scopes: Set<string> | undefined;
  private closed = false;
  private retryUntil = 0;
  private readonly controllers = new Set<AbortController>();

  constructor(provider: Provider, token: string, fetcher: Fetcher) {
    this.provider = provider;
    this.token = token;
    this.fetcher = fetcher;
  }

  async request(path: string, query: Record<string, string> = {}, body?: Row): Promise<unknown> {
    if (this.closed) throw new ChatError("network", "This connection is closed.");
    if (Date.now() < this.retryUntil)
      throw new ChatError(
        "rate_limit",
        "The provider asked Pulse to wait before requesting again.",
        Math.ceil((this.retryUntil - Date.now()) / 1000),
      );
    const url = new URL(
      this.provider === "slack"
        ? `https://slack.com/api/${path}`
        : `https://discord.com/api/v10/${path}`,
    );
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.fetcher(url.toString(), {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `${this.provider === "slack" ? "Bearer" : "Bot"} ${this.token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
        redirect: "error",
      });
      const scopeHeader = response.headers.get("x-oauth-scopes");
      if (this.provider === "slack" && scopeHeader !== null)
        this.scopes = new Set(
          scopeHeader
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean),
        );
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (response.status !== 429 && response.status !== 401 && response.status !== 403)
          throw new ChatError("network", "The provider returned an unreadable response.");
      }
      if (response.status === 429) {
        const retry =
          retrySeconds(response.headers.get("Retry-After")) ??
          retrySeconds(
            payload && typeof payload === "object" && "retry_after" in payload
              ? payload.retry_after
              : undefined,
          ) ??
          60;
        this.retryUntil = Date.now() + retry * 1000;
        throw new ChatError(
          "rate_limit",
          "The provider rate limit was reached. Try again after the indicated wait.",
          retry,
        );
      }
      if (response.status === 401)
        throw new ChatError(
          "authentication",
          "The provider rejected this credential. Reconnect the account.",
        );
      if (response.status === 403)
        throw new ChatError(
          "permission",
          "The account lacks permission to access this conversation.",
        );
      if (response.status === 404)
        throw new ChatError(
          "not_found",
          "The conversation or message is unavailable to this account.",
        );
      if (!response.ok)
        throw new ChatError(
          "network",
          "The provider could not complete the request. A send may have reached the provider; check history before retrying.",
        );
      if (this.provider === "slack") {
        const result = record(payload);
        if (result.ok !== true) {
          const error = optionalString(result.error);
          if (
            [
              "invalid_auth",
              "not_authed",
              "token_revoked",
              "token_expired",
              "account_inactive",
            ].includes(error ?? "")
          )
            throw new ChatError(
              "authentication",
              "Slack rejected this credential. Reconnect the account.",
            );
          if (
            [
              "missing_scope",
              "no_permission",
              "not_in_channel",
              "restricted_action",
              "is_archived",
              "access_denied",
            ].includes(error ?? "")
          )
            throw new ChatError(
              "permission",
              "Slack denied this operation. Check the app scopes, channel membership and channel posting permissions.",
            );
          if (error === "channel_not_found" || error === "thread_not_found")
            throw new ChatError(
              "not_found",
              "The Slack conversation or thread is unavailable to this account.",
            );
          if (error === "ratelimited") {
            const retry = retrySeconds(response.headers.get("Retry-After")) ?? 60;
            this.retryUntil = Date.now() + retry * 1000;
            throw new ChatError(
              "rate_limit",
              "Slack asked Pulse to wait before requesting again.",
              retry,
            );
          }
          throw new ChatError(
            "network",
            "Slack could not confirm the operation. Check history before retrying a send.",
          );
        }
      }
      return payload;
    } catch (error) {
      if (error instanceof ChatError) throw error;
      throw new ChatError(
        "network",
        "The provider request failed or timed out. A send may have reached the provider; check history before retrying.",
      );
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
  }
}

class SlackAdapter implements ChatAdapter {
  readonly account;
  private readonly known = new Map<string, ChatConversation>();
  private readonly authors = new Map<string, string>();
  private readonly userId: string;
  private readonly isBot: boolean;
  private readonly transport: Transport;
  private readonly threadRoots = new Map<string, string>();

  constructor(transport: Transport, auth: Row) {
    this.transport = transport;
    this.userId = id(auth.user_id, "slack");
    id(auth.team_id, "slack");
    this.isBot = auth.bot_id !== undefined;
    this.account = {
      provider: "slack" as const,
      label: string(auth.team),
      identity: optionalString(auth.user) || this.userId,
    };
    this.authors.set(this.userId, this.account.identity);
  }

  credentials(): unknown {
    return { token: this.transport.token };
  }
  close(): Promise<void> {
    return this.transport.close();
  }

  private canWrite(channel: Row): boolean {
    const scopes = this.transport.scopes;
    const write =
      scopes?.has("chat:write") || scopes?.has("chat:write:user") || scopes?.has("chat:write:bot");
    return (
      !!write &&
      channel.is_archived !== true &&
      channel.is_read_only !== true &&
      (channel.is_member === true ||
        channel.is_im === true ||
        channel.is_mpim === true ||
        (scopes?.has("chat:write.public") === true && channel.is_private !== true))
    );
  }

  async conversations(accountId: string, cursor?: string) {
    const types = [
      ["channels:read", "public_channel"],
      ["groups:read", "private_channel"],
      ["im:read", "im"],
      ["mpim:read", "mpim"],
    ]
      .filter(([scope]) => !this.transport.scopes || this.transport.scopes.has(scope!))
      .map(([, type]) => type)
      .join(",");
    if (!types)
      throw new ChatError(
        "permission",
        "Slack needs conversation read scopes to list channels and direct messages.",
      );
    const result = record(
      await this.transport.request("conversations.list", {
        types,
        exclude_archived: "true",
        limit: "200",
        ...(cursor ? { cursor } : {}),
      }),
    );
    const conversations = rows(result.channels)
      .slice(0, 500)
      .map((channel): ChatConversation => ({
        id: id(channel.id, "slack"),
        accountId,
        title:
          optionalString(channel.name) || optionalString(channel.user) || id(channel.id, "slack"),
        kind: channel.is_im === true ? "dm" : channel.is_mpim === true ? "group" : "channel",
        workspace: this.account.label,
        canSend: this.canWrite(channel),
      }));
    conversations.forEach((conversation) => this.known.set(conversation.id, conversation));
    const nextCursor = optionalString(record(result.response_metadata ?? {}).next_cursor);
    return { conversations, ...(nextCursor ? { nextCursor } : {}) };
  }

  private conversation(conversationId: string): ChatConversation {
    id(conversationId, "slack");
    const conversation = this.known.get(conversationId);
    if (!conversation)
      throw new ChatError("not_found", "Reload Slack conversations before opening this channel.");
    return conversation;
  }

  async members(
    _accountId: string,
    conversationId: string,
    cursor?: string,
    _channelOnly = false,
  ): Promise<ChatMembership> {
    id(conversationId, "slack");
    const conversation = record(
      record(await this.transport.request("conversations.info", { channel: conversationId }))
        .channel,
    );
    if (id(conversation.id, "slack") !== conversationId)
      throw new ChatError("network", "Slack returned an unexpected conversation identity.");
    const result = record(
      await this.transport.request("conversations.members", {
        channel: conversationId,
        limit: "50",
        ...(cursor ? { cursor } : {}),
      }),
    );
    if (!Array.isArray(result.members) || result.members.length > 50)
      throw new ChatError("network", "Slack returned an invalid member list.");
    const memberIds = result.members.map((value) => id(value, "slack"));
    const members: ChatMember[] = [];
    let profilesUnavailable = !this.transport.scopes?.has("users:read");
    let stopProfiles = profilesUnavailable;
    // Five concurrent profile reads keep channel lists bounded without serial network waits.
    for (let offset = 0; offset < memberIds.length; offset += 5) {
      members.push(
        ...(await Promise.all(
          memberIds.slice(offset, offset + 5).map(async (userId): Promise<ChatMember> => {
            const fallback = { id: userId, displayName: this.authors.get(userId) ?? userId };
            if (stopProfiles) return fallback;
            try {
              const profileResult = record(
                await this.transport.request("users.info", { user: userId }),
              );
              const user = record(profileResult.user);
              if (id(user.id, "slack") !== userId)
                throw new ChatError("network", "Slack returned an unexpected member identity.");
              const profile = record(user.profile ?? {});
              const displayName =
                optionalString(profile.display_name) ||
                optionalString(profile.real_name) ||
                optionalString(user.name) ||
                userId;
              this.authors.set(userId, displayName);
              const roles =
                user.is_primary_owner === true
                  ? ["Workspace primary owner"]
                  : user.is_owner === true
                    ? ["Workspace owner"]
                    : user.is_admin === true
                      ? ["Workspace admin"]
                      : user.is_ultra_restricted === true
                        ? ["Single-channel guest"]
                        : user.is_restricted === true
                          ? ["Multi-channel guest"]
                          : [
                                user.is_owner,
                                user.is_admin,
                                user.is_restricted,
                                user.is_ultra_restricted,
                              ].every((value) => value === false)
                            ? ["Workspace member"]
                            : undefined;
              if (!roles) profilesUnavailable = true;
              return {
                id: userId,
                displayName,
                ...(roles ? { roles } : {}),
                ...(typeof user.is_bot === "boolean" ? { isBot: user.is_bot } : {}),
              };
            } catch (error) {
              if (!(error instanceof ChatError)) throw error;
              profilesUnavailable = true;
              if (["permission", "rate_limit", "authentication"].includes(error.code))
                stopProfiles = true;
              return fallback;
            }
          }),
        )),
      );
    }
    const nextCursor = optionalString(record(result.response_metadata ?? {}).next_cursor);
    return {
      scope: "channel",
      title:
        optionalString(conversation.name) || optionalString(conversation.user) || conversationId,
      members,
      ...(nextCursor ? { nextCursor } : {}),
      note: `Slack channel members. Role labels describe source workspace roles, not Pulse permissions.${profilesUnavailable ? " Some profile or role information is unavailable; users:read access may be required." : ""}`,
    };
  }

  private async author(message: Row): Promise<string> {
    const user = optionalString(message.user);
    if (!user)
      return optionalString(message.username) || optionalString(message.bot_id) || "Slack system";
    if (this.authors.has(user)) return this.authors.get(user)!;
    // User IDs remain useful source identities when users:read was not granted.
    if (!this.transport.scopes?.has("users:read")) return user;
    try {
      const result = record(
        await this.transport.request("users.info", { user: id(user, "slack") }),
      );
      const profileUser = record(result.user);
      const profile = record(profileUser.profile ?? {});
      const author =
        optionalString(profile.display_name) ||
        optionalString(profile.real_name) ||
        optionalString(profileUser.name) ||
        user;
      this.authors.set(user, author);
      return author;
    } catch (error) {
      if (!(error instanceof ChatError)) throw error;
      // Optional display names must not invalidate acknowledged sends or readable messages.
      this.authors.set(user, user);
      return user;
    }
  }

  private async message(
    accountId: string,
    conversationId: string,
    value: Row,
  ): Promise<ChatMessage> {
    const ts = slackTimestamp(value.ts);
    const timestamp = new Date(Number(ts) * 1000);
    if (!Number.isFinite(timestamp.getTime()))
      throw new ChatError("network", "Slack returned an invalid message date.");
    const threadId =
      value.thread_ts === undefined
        ? typeof value.reply_count === "number" && value.reply_count > 0
          ? ts
          : undefined
        : slackTimestamp(value.thread_ts);
    if (threadId) this.threadRoots.set(`${conversationId}:${ts}`, threadId);
    return {
      id: ts,
      accountId,
      conversationId,
      author: await this.author(value),
      date: timestamp.toISOString(),
      text: value.text === undefined ? "" : string(value.text, 200000),
      ...(threadId ? { threadId, ...(threadId !== ts ? { replyToId: threadId } : {}) } : {}),
    };
  }

  async messages(accountId: string, conversationId: string, cursor?: string, threadId?: string) {
    const conversation = this.conversation(conversationId);
    if (threadId && this.isBot && conversation.kind === "channel")
      throw new ChatError(
        "unsupported",
        "Slack requires a user token with channel history scopes to read channel thread replies.",
      );
    const result = record(
      await this.transport.request(threadId ? "conversations.replies" : "conversations.history", {
        channel: conversationId,
        limit: "15",
        ...(cursor ? { cursor } : {}),
        ...(threadId ? { ts: slackTimestamp(threadId) } : {}),
      }),
    );
    const messages: ChatMessage[] = [];
    for (const value of rows(result.messages).slice(0, 100))
      messages.push(await this.message(accountId, conversationId, value));
    messages.sort(
      (left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
    );
    const nextCursor = optionalString(record(result.response_metadata ?? {}).next_cursor);
    return { messages, ...(nextCursor ? { nextCursor } : {}) };
  }

  async send(
    accountId: string,
    conversationId: string,
    text: string,
    nonce: string,
    replyToId?: string,
  ) {
    if (!this.conversation(conversationId).canSend)
      throw new ChatError(
        "permission",
        "This Slack connection cannot post to this conversation. Check chat:write and channel membership.",
      );
    if (!text.trim() || text.length > 4096)
      throw new ChatError("unsupported", "A Slack message must contain 1–4096 characters.");
    const hash = NodeCrypto.createHash("sha256")
      .update(`${accountId}:${conversationId}:${nonce}`)
      .digest("hex");
    const clientMessageId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const result = record(
      await this.transport.request(
        "chat.postMessage",
        {},
        {
          channel: conversationId,
          text,
          client_msg_id: clientMessageId,
          ...(replyToId
            ? {
                thread_ts: slackTimestamp(
                  this.threadRoots.get(`${conversationId}:${replyToId}`) ?? replyToId,
                ),
              }
            : {}),
        },
      ),
    );
    if (result.channel !== conversationId)
      throw new ChatError(
        "network",
        "Slack did not confirm the requested destination. Check history before retrying.",
      );
    const message = record(result.message);
    string(message.text, 200000);
    if (slackTimestamp(result.ts) !== slackTimestamp(message.ts))
      throw new ChatError(
        "network",
        "Slack returned an inconsistent send confirmation. Check history before retrying.",
      );
    return this.message(accountId, conversationId, {
      ...message,
      user: message.user ?? this.userId,
    });
  }
}

const VIEW = 1n << 10n;
const READ = 1n << 16n;
const SEND = 1n << 11n;
const ADMIN = 1n << 3n;
const THREAD_SEND = 1n << 38n;
const MANAGE_THREADS = 1n << 34n;

function bits(value: unknown): bigint {
  const result = string(value, 32);
  if (!/^\d+$/.test(result))
    throw new ChatError("network", "Discord returned invalid permissions.");
  return BigInt(result);
}

function permissions(
  guildId: string,
  memberRoles: Set<string>,
  roles: Row[],
  channel: Row,
  userId: string,
): bigint {
  let result = roles.reduce(
    (sum, role) =>
      role.id === guildId || memberRoles.has(id(role.id, "discord"))
        ? sum | bits(role.permissions)
        : sum,
    0n,
  );
  if ((result & ADMIN) !== 0n) return result | VIEW | READ | SEND | THREAD_SEND | MANAGE_THREADS;
  const overwrites = rows(channel.permission_overwrites ?? []);
  const apply = (selected: Row[]) => {
    let allow = 0n;
    let deny = 0n;
    for (const overwrite of selected) {
      allow |= bits(overwrite.allow);
      deny |= bits(overwrite.deny);
    }
    result = (result & ~deny) | allow;
  };
  apply(overwrites.filter((overwrite) => overwrite.type === 0 && overwrite.id === guildId));
  apply(
    overwrites.filter(
      (overwrite) => overwrite.type === 0 && memberRoles.has(id(overwrite.id, "discord")),
    ),
  );
  apply(overwrites.filter((overwrite) => overwrite.type === 1 && overwrite.id === userId));
  return result;
}

type DiscordPage = { guildAfter?: string; pending: ChatConversation[] };

class DiscordAdapter implements ChatAdapter {
  readonly account;
  private readonly userId: string;
  private readonly known = new Map<string, ChatConversation>();
  private readonly parents = new Map<string, string>();
  private readonly pages = new Map<string, DiscordPage>();
  private readonly transport: Transport;

  constructor(transport: Transport, user: Row) {
    this.transport = transport;
    this.userId = id(user.id, "discord");
    if (user.bot !== true)
      throw new ChatError(
        "unsupported",
        "Discord requires a bot token. Personal account tokens and self-bots are not supported.",
      );
    const identity = optionalString(user.global_name) || string(user.username);
    this.account = { provider: "discord" as const, label: `${identity} (bot)`, identity };
  }

  credentials(): unknown {
    return { token: this.transport.token };
  }
  async close(): Promise<void> {
    this.pages.clear();
    await this.transport.close();
  }

  async conversations(accountId: string, cursor?: string) {
    let page: DiscordPage;
    if (cursor) {
      const stored = this.pages.get(cursor);
      if (!stored)
        throw new ChatError("not_found", "This Discord page expired. Reload conversations.");
      page = stored;
    } else {
      this.pages.clear();
      page = { pending: [] };
    }
    // Load one small guild page at a time; large bot installations remain paginated.
    if (page.pending.length === 0) {
      const guilds = rows(
        await this.transport.request("users/@me/guilds", {
          limit: "5",
          ...(page.guildAfter ? { after: page.guildAfter } : {}),
        }),
      );
      const pending: ChatConversation[] = [];
      for (const guild of guilds) {
        const guildId = id(guild.id, "discord");
        const workspace = string(guild.name);
        const roles = rows(await this.transport.request(`guilds/${guildId}/roles`));
        const member = record(
          await this.transport.request(`guilds/${guildId}/members/${this.userId}`),
        );
        if (!Array.isArray(member.roles))
          throw new ChatError("network", "Discord returned invalid member roles.");
        const memberRoles = new Set(member.roles.map((role) => id(role, "discord")));
        const timedOut =
          member.communication_disabled_until !== undefined &&
          member.communication_disabled_until !== null &&
          Date.parse(string(member.communication_disabled_until)) > Date.now();
        const channels = rows(await this.transport.request(`guilds/${guildId}/channels`));
        let threads: Row[] = [];
        try {
          threads = rows(
            record(await this.transport.request(`guilds/${guildId}/threads/active`)).threads,
          );
        } catch (error) {
          if (!(error instanceof ChatError) || error.code !== "permission") throw error;
        }
        const channelMap = new Map(channels.map((channel) => [id(channel.id, "discord"), channel]));
        for (const channel of [...channels, ...threads]) {
          const channelId = id(channel.id, "discord");
          const isThread = channel.type === 10 || channel.type === 11 || channel.type === 12;
          if (!isThread && channel.type !== 0 && channel.type !== 5) continue;
          const parentId = isThread ? id(channel.parent_id, "discord") : undefined;
          const permissionChannel = parentId ? channelMap.get(parentId) : channel;
          if (!permissionChannel) continue;
          const allowed =
            guild.owner === true
              ? VIEW | READ | SEND | THREAD_SEND | MANAGE_THREADS
              : permissions(guildId, memberRoles, roles, permissionChannel, this.userId);
          if ((allowed & VIEW) === 0n || (allowed & READ) === 0n) continue;
          const metadata = isThread ? record(channel.thread_metadata) : undefined;
          const sendAllowed = (allowed & (isThread ? THREAD_SEND : SEND)) !== 0n;
          const threadWritable =
            !metadata ||
            (metadata.archived !== true &&
              (metadata.locked !== true || (allowed & MANAGE_THREADS) !== 0n));
          pending.push({
            id: channelId,
            accountId,
            title: string(channel.name),
            kind: isThread ? "thread" : "channel",
            workspace,
            canSend:
              sendAllowed &&
              threadWritable &&
              (!timedOut || guild.owner === true || (allowed & ADMIN) !== 0n),
          });
          if (parentId) this.parents.set(channelId, parentId);
        }
      }
      page = {
        pending,
        ...(guilds.length === 5 ? { guildAfter: id(guilds.at(-1)!.id, "discord") } : {}),
      };
    }
    const conversations = page.pending.slice(0, 500);
    const remaining = page.pending.slice(500);
    conversations.forEach((conversation) => this.known.set(conversation.id, conversation));
    if (cursor) this.pages.delete(cursor);
    if (remaining.length || page.guildAfter) {
      const nextCursor = NodeCrypto.randomUUID();
      this.pages.set(nextCursor, {
        pending: remaining,
        ...(page.guildAfter ? { guildAfter: page.guildAfter } : {}),
      });
      return { conversations, nextCursor };
    }
    return { conversations };
  }

  private conversation(conversationId: string): ChatConversation {
    id(conversationId, "discord");
    const conversation = this.known.get(conversationId);
    if (!conversation)
      throw new ChatError("not_found", "Reload Discord conversations before opening this channel.");
    return conversation;
  }

  async members(
    _accountId: string,
    conversationId: string,
    cursor?: string,
    channelOnly = false,
  ): Promise<ChatMembership> {
    id(conversationId, "discord");
    const channel = record(await this.transport.request(`channels/${conversationId}`));
    if (id(channel.id, "discord") !== conversationId)
      throw new ChatError("network", "Discord returned an unexpected channel identity.");
    if (channel.guild_id === undefined)
      throw new ChatError(
        "unsupported",
        "Server membership is available for Discord server channels only.",
      );
    const guildId = id(channel.guild_id, "discord");
    const isThread = channel.type === 10 || channel.type === 11 || channel.type === 12;
    const permissionChannel =
      channelOnly && isThread
        ? record(await this.transport.request(`channels/${id(channel.parent_id, "discord")}`))
        : channel;
    if (
      channelOnly &&
      isThread &&
      (permissionChannel.id !== channel.parent_id || permissionChannel.guild_id !== guildId)
    )
      throw new ChatError("network", "Discord returned an unexpected parent channel.");
    const guild = record(await this.transport.request(`guilds/${guildId}`));
    if (id(guild.id, "discord") !== guildId)
      throw new ChatError("network", "Discord returned an unexpected server identity.");
    let result: Row[];
    try {
      result = rows(
        await this.transport.request(
          channelOnly && isThread
            ? `channels/${conversationId}/thread-members`
            : `guilds/${guildId}/members`,
          {
            limit: "50",
            ...(channelOnly && isThread ? { with_member: "true" } : {}),
            ...(cursor ? { after: id(cursor, "discord") } : {}),
          },
        ),
      );
      if (channelOnly && isThread)
        result = result.map((entry) => {
          const member = record(entry.member);
          if (id(record(member.user).id, "discord") !== id(entry.user_id, "discord"))
            throw new ChatError("network", "Discord returned an unexpected thread member.");
          return member;
        });
    } catch (error) {
      if (error instanceof ChatError && error.code === "permission")
        throw new ChatError(
          "permission",
          "Discord server members are unavailable. Enable Server Members Intent for this bot and check its server access.",
        );
      throw error;
    }
    if (result.length > 50)
      throw new ChatError("network", "Discord returned an invalid member list.");
    const roleRows = rows(await this.transport.request(`guilds/${guildId}/roles`));
    const roleNames = new Map(roleRows.map((role) => [id(role.id, "discord"), string(role.name)]));
    let unavailableRoles = false;
    const members = result
      .map((member): ChatMember | null => {
        const user = record(member.user);
        const userId = id(user.id, "discord");
        if (!Array.isArray(member.roles) || member.roles.length > 250)
          throw new ChatError("network", "Discord returned invalid member roles.");
        const roleIds = member.roles.map((role) => id(role, "discord"));
        if (
          channelOnly &&
          (user.bot === true ||
            (guild.owner_id !== userId &&
              (permissions(guildId, new Set(roleIds), roleRows, permissionChannel, userId) &
                VIEW) ===
                0n))
        )
          return null;
        const roles = roleIds.map((roleId) => roleNames.get(roleId));
        const missing = roles.some((role) => role === undefined);
        if (missing) unavailableRoles = true;
        return {
          id: userId,
          displayName:
            optionalString(member.nick) ||
            optionalString(user.global_name) ||
            string(user.username),
          ...(!missing
            ? { roles: roles.filter((role): role is string => role !== undefined) }
            : {}),
          ...(typeof user.bot === "boolean" ? { isBot: user.bot } : {}),
        };
      })
      .filter((member): member is ChatMember => member !== null);
    const highestId = result.reduce((highest, member) => {
      const memberId = id(record(member.user).id, "discord");
      return BigInt(memberId) > BigInt(highest) ? memberId : highest;
    }, "0");
    return {
      scope: channelOnly ? "channel" : "workspace",
      title: string(channelOnly ? channel.name : guild.name),
      members,
      ...(result.length === 50 ? { nextCursor: highestId } : {}),
      note: channelOnly
        ? "People with current access to this channel; thread results include joined members only. Source access can change after assignment."
        : `Discord server members and assigned server roles. This does not establish channel or thread access; channel overrides still apply.${unavailableRoles ? " Some role information is unavailable." : ""}`,
    };
  }

  private message(accountId: string, conversationId: string, value: Row): ChatMessage {
    const messageId = id(value.id, "discord");
    const author = record(value.author);
    const authorName =
      optionalString(author.global_name) ||
      optionalString(author.username) ||
      id(author.id, "discord");
    const replyToId =
      value.message_reference === undefined
        ? undefined
        : optionalString(record(value.message_reference).message_id);
    const thread = value.thread === undefined ? undefined : id(record(value.thread).id, "discord");
    const threadId =
      thread ||
      (value.has_thread === true
        ? messageId
        : this.known.get(conversationId)?.kind === "thread"
          ? conversationId
          : undefined);
    const content = string(value.content, 200000);
    const attachments = content
      ? []
      : rows(value.attachments ?? []).map((attachment) => string(attachment.filename));
    return {
      id: messageId,
      accountId,
      conversationId,
      author: authorName,
      date: date(value.timestamp),
      text:
        content ||
        (attachments.length
          ? `Attachments: ${attachments.join(", ")}`
          : "No text content is available to this bot."),
      ...(replyToId ? { replyToId: id(replyToId, "discord") } : {}),
      ...(threadId ? { threadId } : {}),
    };
  }

  async messages(accountId: string, conversationId: string, cursor?: string, threadId?: string) {
    this.conversation(conversationId);
    let destination = conversationId;
    if (threadId && threadId !== conversationId) {
      const thread = this.conversation(threadId);
      if (thread.kind !== "thread" || this.parents.get(threadId) !== conversationId)
        throw new ChatError(
          "not_found",
          "This Discord thread is unavailable in the selected channel.",
        );
      destination = threadId;
    }
    const result = rows(
      await this.transport.request(`channels/${destination}/messages`, {
        limit: "50",
        ...(cursor ? { before: id(cursor, "discord") } : {}),
      }),
    );
    const messages = result
      .slice(0, 100)
      .map((message) => {
        if (message.channel_id !== destination)
          throw new ChatError("network", "Discord returned messages from an unexpected channel.");
        return this.message(accountId, destination, message);
      })
      .sort(
        (left, right) =>
          left.date.localeCompare(right.date) || (BigInt(left.id) < BigInt(right.id) ? -1 : 1),
      );
    return {
      messages,
      ...(result.length === 50 ? { nextCursor: id(result.at(-1)!.id, "discord") } : {}),
    };
  }

  async send(
    accountId: string,
    conversationId: string,
    text: string,
    nonce: string,
    replyToId?: string,
  ) {
    if (!this.conversation(conversationId).canSend)
      throw new ChatError(
        "permission",
        "The Discord bot cannot send messages in this channel or thread.",
      );
    if (!text.trim() || text.length > 2000)
      throw new ChatError("unsupported", "Discord messages must contain 1–2000 characters.");
    const result = record(
      await this.transport.request(
        `channels/${conversationId}/messages`,
        {},
        {
          content: text,
          nonce: NodeCrypto.createHash("sha256")
            .update(`${accountId}:${conversationId}:${nonce}`)
            .digest("hex")
            .slice(0, 24),
          enforce_nonce: true,
          allowed_mentions: { parse: [] },
          ...(replyToId
            ? {
                message_reference: {
                  message_id: id(replyToId, "discord"),
                  channel_id: conversationId,
                  fail_if_not_exists: true,
                },
              }
            : {}),
        },
      ),
    );
    if (result.channel_id !== conversationId)
      throw new ChatError(
        "network",
        "Discord did not confirm the requested destination. Check history before retrying.",
      );
    if (record(result.author).id !== this.userId)
      throw new ChatError(
        "network",
        "Discord returned an unexpected send identity. Check history before retrying.",
      );
    return this.message(accountId, conversationId, result);
  }
}

export async function connectRestChat(
  provider: Provider,
  token: string,
  fetcher: Fetcher = fetch,
): Promise<ChatAdapter> {
  if (!token.trim() || token.length > 65536 || /[\r\n]/.test(token))
    throw new ChatError("authentication", "Enter a valid provider token.");
  const transport = new Transport(provider, token.trim(), fetcher);
  try {
    const auth = record(
      await transport.request(
        provider === "slack" ? "auth.test" : "users/@me",
        {},
        provider === "slack" ? {} : undefined,
      ),
    );
    return provider === "slack"
      ? new SlackAdapter(transport, auth)
      : new DiscordAdapter(transport, auth);
  } catch (error) {
    await transport.close();
    throw error;
  }
}

export async function restoreRestChat(
  provider: Provider,
  credentials: unknown,
  fetcher: Fetcher = fetch,
): Promise<ChatAdapter> {
  if (
    !credentials ||
    typeof credentials !== "object" ||
    !("token" in credentials) ||
    typeof credentials.token !== "string"
  )
    throw new ChatError(
      "authentication",
      "Stored credentials are unavailable. Reconnect this account.",
    );
  return connectRestChat(provider, credentials.token, fetcher);
}
