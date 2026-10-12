// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- MTProto adapter maps provider timestamps and request nonces outside Effect.
import * as NodeCrypto from "node:crypto";
import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { Logger, LogLevel } from "teleproto/extensions/Logger";
import { returnBigInt } from "teleproto/Helpers";
import * as Schema from "effect/Schema";
import type { ChatConversation, ChatMessage } from "@t3tools/contracts";
import { ChatError, type ChatAdapter } from "./ChatAdapter.ts";

const Credentials = Schema.Struct({
  apiId: Schema.Int.check(Schema.isGreaterThan(0)),
  apiHash: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)),
  session: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(65536)),
});
const Cursor = Schema.Struct({ date: Schema.Int, id: Schema.Int, peer: Schema.String });
const decodeCredentials = Schema.decodeUnknownSync(Credentials);
const decodeCursor = Schema.decodeUnknownSync(Cursor);
type Credentials = typeof Credentials.Type;

export interface TelegramLogin {
  complete(input: {
    code?: string;
    password?: string;
  }): Promise<{ adapter: ChatAdapter } | { prompt: "password" }>;
  close(): Promise<void>;
}

function rpcName(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "errorMessage" in error &&
    typeof error.errorMessage === "string"
    ? error.errorMessage
    : "";
}
function failure(error: unknown): ChatError {
  if (error instanceof ChatError) return error;
  const name = rpcName(error);
  if (/FLOOD_WAIT|SLOWMODE_WAIT/.test(name)) {
    const seconds =
      typeof error === "object" &&
      error !== null &&
      "seconds" in error &&
      typeof error.seconds === "number"
        ? error.seconds
        : undefined;
    return new ChatError(
      "rate_limit",
      "Telegram asked Pulse to wait before trying again.",
      seconds,
    );
  }
  if (/AUTH|SESSION|PHONE|PASSWORD|API_ID/.test(name))
    return new ChatError(
      "authentication",
      "Telegram sign-in failed or expired. Reconnect the account.",
    );
  if (/FORBIDDEN|BANNED|WRITE|PRIVACY|PREMIUM|PAID/.test(name))
    return new ChatError(
      "permission",
      "Telegram does not allow this account to send to this chat.",
    );
  return new ChatError(
    "network",
    "Telegram could not complete the request. Refresh before trying again.",
  );
}
function createClient(session: string, apiId: number, apiHash: string) {
  let client: TelegramClient<StringSession>;
  try {
    client = new TelegramClient(new StringSession(session), apiId, apiHash, {
      baseLogger: new Logger(LogLevel.NONE),
      requestRetries: 1,
      connectionRetries: 2,
      reconnectRetries: 2,
      floodSleepThreshold: 0,
      timeout: 15,
    });
  } catch {
    throw new ChatError("authentication", "The Telegram connection settings are invalid.");
  }
  client.onError = async () => {};
  return client;
}
function nameOf(entity: unknown) {
  if (entity instanceof Api.User)
    return (
      [entity.firstName, entity.lastName].filter(Boolean).join(" ").slice(0, 4096) ||
      entity.username ||
      `User ${entity.id}`
    );
  if (entity instanceof Api.Chat || entity instanceof Api.Channel)
    return entity.title.slice(0, 4096);
  return undefined;
}
function messageId(value: string) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)
    throw new ChatError("not_found", "The Telegram message reference is invalid.");
  return id;
}

class TelegramAdapter implements ChatAdapter {
  readonly account;
  private closed = false;
  private peers = new Map<string, { peer: Api.TypeInputPeer; canSend: boolean }>();
  private readonly client: TelegramClient<StringSession>;
  private readonly secrets: Credentials;
  private readonly me: Api.User;
  constructor(client: TelegramClient<StringSession>, secrets: Credentials, me: Api.User) {
    this.client = client;
    this.secrets = secrets;
    this.me = me;
    this.account = {
      provider: "telegram" as const,
      label: nameOf(me) ?? `User ${me.id}`,
      identity: me.username ? `@${me.username}` : me.id.toString(),
    };
  }
  credentials(): Credentials {
    return { ...this.secrets, session: this.client.session.save() };
  }
  private checkOpen() {
    if (this.closed) throw new ChatError("authentication", "This Telegram connection is closed.");
  }
  private async writePermission(entity: unknown): Promise<boolean> {
    if (entity instanceof Api.User) {
      if (entity.deleted || entity.restricted) return false;
      const full = await this.client.invoke(new Api.users.GetFullUser({ id: entity }));
      return (
        !full.fullUser.blocked &&
        !full.fullUser.contactRequirePremium &&
        !full.fullUser.sendPaidMessagesStars?.greater(0)
      );
    }
    if (entity instanceof Api.Chat)
      return (
        !entity.left &&
        !entity.deactivated &&
        (!!entity.creator ||
          !!entity.adminRights ||
          (!entity.defaultBannedRights?.sendMessages && !entity.defaultBannedRights?.sendPlain))
      );
    if (entity instanceof Api.Channel) {
      if (entity.left || entity.restricted || entity.sendPaidMessagesStars?.greater(0))
        return false;
      if (entity.broadcast) return !!entity.creator || !!entity.adminRights?.postMessages;
      if (!entity.megagroup) return false;
      if (entity.creator || entity.adminRights) return true;
      return (
        !entity.bannedRights?.viewMessages &&
        !entity.bannedRights?.sendMessages &&
        !entity.bannedRights?.sendPlain &&
        !entity.defaultBannedRights?.sendMessages &&
        !entity.defaultBannedRights?.sendPlain
      );
    }
    return false;
  }
  async conversations(accountId: string, cursor?: string) {
    this.checkOpen();
    try {
      let offset: typeof Cursor.Type | undefined;
      if (cursor) {
        try {
          offset = decodeCursor(JSON.parse(cursor));
        } catch {
          throw new ChatError("not_found", "The Telegram conversation cursor is invalid.");
        }
      }
      const dialogs = await this.client.getDialogs({
        limit: 50,
        ignoreMigrated: true,
        ...(offset
          ? {
              offsetDate: offset.date,
              offsetId: offset.id,
              offsetPeer: returnBigInt(offset.peer),
              ignorePinned: true,
            }
          : {}),
      });
      const conversations: ChatConversation[] = [];
      // Keep permission lookups bounded; unknown permissions remain read-only.
      for (let start = 0; start < dialogs.length; start += 5) {
        const batch = await Promise.all(
          dialogs.slice(start, start + 5).map(async (dialog) => {
            const id = dialog.id?.toString();
            if (!id) return undefined;
            const canSend = await this.writePermission(dialog.entity).catch(() => false);
            this.peers.set(id, { peer: dialog.inputEntity, canSend });
            return {
              id,
              accountId,
              title: (dialog.title || dialog.name || id).slice(0, 4096),
              kind: dialog.isUser
                ? ("dm" as const)
                : dialog.isGroup
                  ? ("group" as const)
                  : ("channel" as const),
              workspace: "Telegram",
              canSend,
            };
          }),
        );
        for (const conversation of batch) if (conversation) conversations.push(conversation);
      }
      const last = dialogs.at(-1);
      const nextCursor =
        dialogs.length === 50 && last?.id && last.message?.id && last.date !== undefined
          ? JSON.stringify({ date: last.date, id: last.message.id, peer: last.id.toString() })
          : undefined;
      return { conversations, ...(nextCursor ? { nextCursor } : {}) };
    } catch (error) {
      throw failure(error);
    }
  }
  private peer(id: string) {
    const entry = this.peers.get(id);
    if (!entry)
      throw new ChatError("not_found", "Refresh Telegram chats before opening this conversation.");
    return entry;
  }
  private async mapMessage(
    accountId: string,
    conversationId: string,
    message: Api.Message,
  ): Promise<ChatMessage> {
    const sender = await message.getSender().catch(() => undefined);
    const author =
      nameOf(sender) ||
      message.postAuthor ||
      (message.senderId ? `Telegram ${message.senderId}` : `Telegram ${conversationId}`);
    return {
      id: String(message.id),
      accountId,
      conversationId,
      author: author.slice(0, 4096),
      date: new Date(message.date * 1000).toISOString(),
      text:
        message.message.slice(0, 200000) ||
        (message.media ? "[Media message — open Telegram to view]" : ""),
      ...(message.replyTo?.replyToMsgId ? { replyToId: String(message.replyTo.replyToMsgId) } : {}),
      ...(message.replyTo?.replyToTopId ? { threadId: String(message.replyTo.replyToTopId) } : {}),
    };
  }
  async messages(accountId: string, conversationId: string, cursor?: string, threadId?: string) {
    this.checkOpen();
    try {
      const messages = await this.client.getMessages(this.peer(conversationId).peer, {
        limit: 50,
        ...(cursor ? { offsetId: messageId(cursor) } : {}),
        ...(threadId ? { replyTo: messageId(threadId) } : {}),
      });
      const mapped = await Promise.all(
        messages
          .filter((message) => message instanceof Api.Message)
          .map((message) => this.mapMessage(accountId, conversationId, message)),
      );
      mapped.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      const oldest = messages.at(-1)?.id;
      return {
        messages: mapped,
        ...(messages.length === 50 && oldest ? { nextCursor: String(oldest) } : {}),
      };
    } catch (error) {
      throw failure(error);
    }
  }
  async send(
    accountId: string,
    conversationId: string,
    text: string,
    nonce: string,
    replyToId?: string,
  ) {
    this.checkOpen();
    try {
      const entry = this.peer(conversationId);
      if (!entry.canSend)
        throw new ChatError(
          "permission",
          "This Telegram chat is read-only for the connected account.",
        );
      const randomId = returnBigInt(
        NodeCrypto.createHash("sha256")
          .update(JSON.stringify([this.me.id.toString(), conversationId, nonce]))
          .digest()
          .readBigInt64LE(),
      );
      const request = new Api.messages.SendMessage({
        peer: entry.peer,
        message: text,
        randomId,
        ...(replyToId
          ? { replyTo: new Api.InputReplyToMessage({ replyToMsgId: messageId(replyToId) }) }
          : {}),
      });
      const result = await this.client.invoke(request);
      const sent: unknown = this.client._getResponseMessage(request, result, entry.peer);
      if (!(sent instanceof Api.Message))
        throw new ChatError(
          "network",
          "Telegram may have accepted the message. Refresh this chat before sending again.",
        );
      return this.mapMessage(accountId, conversationId, sent);
    } catch (error) {
      throw failure(error);
    }
  }
  async close() {
    this.closed = true;
    this.peers.clear();
    await this.client.destroy().catch(() => {});
  }
}

async function authenticated(
  client: TelegramClient<StringSession>,
  secrets: Credentials,
): Promise<ChatAdapter> {
  const me = await client.getMe();
  if (!(me instanceof Api.User) || me.bot)
    throw new ChatError("authentication", "Connect an existing personal Telegram account.");
  return new TelegramAdapter(client, secrets, me);
}
export async function restoreTelegram(credentials: unknown): Promise<ChatAdapter> {
  let secrets: Credentials;
  try {
    secrets = decodeCredentials(credentials);
  } catch {
    throw new ChatError(
      "authentication",
      "The saved Telegram connection is invalid. Reconnect the account.",
    );
  }
  const client = createClient(secrets.session, secrets.apiId, secrets.apiHash);
  try {
    await client.connect();
    if (!(await client.checkAuthorization()))
      throw new ChatError("authentication", "Telegram sign-in expired. Reconnect the account.");
    return await authenticated(client, secrets);
  } catch (error) {
    await client.destroy().catch(() => {});
    throw failure(error);
  }
}
export async function beginTelegram(input: {
  apiId: number;
  apiHash: string;
  phone: string;
}): Promise<TelegramLogin> {
  const client = createClient("", input.apiId, input.apiHash);
  let phoneCodeHash: string;
  try {
    await client.connect();
    const sent = await client.sendCode(input, input.phone);
    if (sent.emailRequired || sent.emailCodeSent)
      throw new ChatError(
        "unsupported",
        "This Telegram sign-in requires email verification. Complete it in Telegram and try again.",
      );
    phoneCodeHash = sent.phoneCodeHash;
  } catch (error) {
    await client.destroy().catch(() => {});
    throw failure(error);
  }
  let closed = false;
  let passwordRequired = false;
  let transferred = false;
  return {
    async complete(answer) {
      if (closed || transferred)
        throw new ChatError("authentication", "This Telegram sign-in is no longer active.");
      try {
        if (passwordRequired) {
          if (!answer.password)
            throw new ChatError(
              "authentication",
              "Enter your Telegram two-step verification password.",
            );
          await client.signInWithPassword(input, {
            password: async () => answer.password!,
            onError: (error) => {
              throw error;
            },
          });
        } else {
          if (!answer.code)
            throw new ChatError("authentication", "Enter the code Telegram sent to your account.");
          const result = await client.invoke(
            new Api.auth.SignIn({
              phoneNumber: input.phone,
              phoneCodeHash,
              phoneCode: answer.code,
            }),
          );
          if (result instanceof Api.auth.AuthorizationSignUpRequired)
            throw new ChatError(
              "unsupported",
              "Connect an existing Telegram account. Pulse does not create accounts.",
            );
        }
        if (closed) throw new ChatError("authentication", "This Telegram sign-in was cancelled.");
        const adapter = await authenticated(client, {
          apiId: input.apiId,
          apiHash: input.apiHash,
          session: client.session.save(),
        });
        if (closed) {
          await adapter.close();
          throw new ChatError("authentication", "This Telegram sign-in was cancelled.");
        }
        transferred = true;
        return { adapter };
      } catch (error) {
        if (!closed && rpcName(error) === "SESSION_PASSWORD_NEEDED") {
          passwordRequired = true;
          return { prompt: "password" };
        }
        closed = true;
        await client.destroy().catch(() => {});
        throw failure(error);
      }
    },
    async close() {
      closed = true;
      if (!transferred) await client.destroy().catch(() => {});
    },
  };
}
