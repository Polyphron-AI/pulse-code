// @effect-diagnostics preferSchemaOverJson:off -- Exact endpoint keys and serialized wire byte budgets.
import {
  CommunicationConversationPage,
  CommunicationMessagePage,
  CommunicationsError,
  SlackListConversationsInput,
  SlackListMessagesInput,
  SlackConversationId,
  SlackMessageId,
  SlackWorkspaceId,
  CommunicationConnectionId,
  type CommunicationConversation,
  type CommunicationMessage,
} from "@t3tools/contracts";
import {
  Cause,
  Clock,
  Context,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Layer,
  Schema,
  Stream,
} from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import * as Connection from "./SlackConnection.ts";
import * as Store from "./SlackAccountStore.ts";

const NativeCursor = Schema.String.check(Schema.isMaxLength(2048));
const Cursor = Schema.Struct({
  version: Schema.Literal(1),
  provider: Schema.Literal("slack"),
  connectionId: CommunicationConnectionId,
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  workspaceId: SlackWorkspaceId,
  conversationId: Schema.NullOr(SlackConversationId),
  replyRootId: Schema.NullOr(SlackMessageId),
  direction: Schema.Literals(["list", "older", "replies"]),
  native: NativeCursor,
  offset: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
});
const CursorJson = Schema.fromJsonString(Cursor);
const encodeCursor = Schema.encodeSync(CursorJson);
const Channel = Schema.Struct({
  id: SlackConversationId,
  name: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4096))),
  user: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))),
  is_private: Schema.optionalKey(Schema.Boolean),
  is_im: Schema.optionalKey(Schema.Boolean),
  is_mpim: Schema.optionalKey(Schema.Boolean),
  num_members: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});
const Message = Schema.Struct({
  ts: SlackMessageId,
  text: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200000))),
  user: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(160))),
  username: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(160))),
  bot_id: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))),
  thread_ts: Schema.optionalKey(SlackMessageId),
  reply_count: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});
const Metadata = Schema.optionalKey(
  Schema.Struct({ next_cursor: Schema.optionalKey(NativeCursor) }),
);
const Failure = Schema.Struct({
  ok: Schema.Literal(false),
  error: Schema.String.check(Schema.isMaxLength(160)),
});
const Channels = Schema.Union([
  Failure,
  Schema.Struct({
    ok: Schema.Literal(true),
    channels: Schema.Array(Channel).check(Schema.isMaxLength(100)),
    response_metadata: Metadata,
  }),
]);
const Messages = Schema.Union([
  Failure,
  Schema.Struct({
    ok: Schema.Literal(true),
    messages: Schema.Array(Message).check(Schema.isMaxLength(100)),
    response_metadata: Metadata,
    has_more: Schema.optionalKey(Schema.Boolean),
  }),
]);
const fail = (kind: CommunicationsError["kind"], message: string) =>
  new CommunicationsError({ kind, message });
const unavailable = () =>
  fail("unavailable", "Slack returned an unreadable or unavailable response.");
const invalid = () =>
  fail("invalid-input", "Reload this Slack endpoint with its own current cursor.");
const decode = <S extends Schema.Top>(schema: S, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(invalid));
const decodeConversationPage = Schema.decodeEffect(CommunicationConversationPage);
const decodeMessagePage = Schema.decodeEffect(CommunicationMessagePage);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
type Lease = Effect.Success<ReturnType<Connection.SlackConnection["Service"]["authorize"]>>;
type Lane<A> = {
  readonly fingerprint: string;
  readonly result: Deferred.Deferred<A, CommunicationsError>;
};

export class SlackReader extends Context.Service<
  SlackReader,
  {
    readonly listConversations: (
      input: SlackListConversationsInput,
    ) => Effect.Effect<CommunicationConversationPage, CommunicationsError>;
    readonly listMessages: (
      input: SlackListMessagesInput,
    ) => Effect.Effect<CommunicationMessagePage, CommunicationsError>;
  }
>()("t3/communications/SlackReader") {}

const make = Effect.gen(function* () {
  const connections = yield* Connection.SlackConnection;
  const store = yield* Store.SlackAccountStore;
  const http = yield* HttpClient.HttpClient;
  const deadlines = new Map<string, number>();
  const conversationLanes = new Map<string, Lane<CommunicationConversationPage>>();
  const messageLanes = new Map<string, Lane<CommunicationMessagePage>>();
  // Only bounded conversation metadata is retained. Message bodies and tokens never enter a cache.
  const kinds = new Map<string, { kind: CommunicationConversation["kind"]; scope: string }>();
  const rateLimit = Effect.fnUntraced(function* (key: string, header?: string) {
    const seconds = header && /^\d{1,6}$/.test(header) ? Math.max(1, Number(header)) : 60;
    deadlines.set(key, (yield* Clock.currentTimeMillis) + seconds * 1000);
    return new CommunicationsError({
      kind: "rate-limit",
      message: "Slack asked Pulse to wait before another explicit read.",
      retryAfterSeconds: seconds,
    });
  });
  const singleFlight = <A>(
    lanes: Map<string, Lane<A>>,
    key: string,
    fingerprint: string,
    lease: Lease,
    work: Effect.Effect<A, CommunicationsError>,
  ) =>
    Effect.gen(function* () {
      const active = lanes.get(key);
      if (active) {
        if (active.fingerprint !== fingerprint)
          return yield* fail(
            "unavailable",
            "A read is already pending for this Slack endpoint. Try again after it completes.",
          );
        const result = yield* Deferred.await(active.result).pipe(Effect.raceFirst(lease.cancelled));
        yield* lease.check;
        return result;
      }
      const lane = { fingerprint, result: yield* Deferred.make<A, CommunicationsError>() };
      lanes.set(key, lane);
      return yield* work.pipe(
        Effect.raceFirst(lease.cancelled),
        Effect.tap(() => lease.check),
        Effect.onExit((exit) =>
          Deferred.done(
            lane.result,
            Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
              ? Exit.fail(fail("unavailable", "This Slack read was cancelled."))
              : exit,
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (lanes.get(key) === lane) lanes.delete(key);
          }),
        ),
      );
    });
  const request = <S extends Schema.Top & { readonly DecodingServices: never }>(
    lease: Lease,
    connectionId: string,
    method: "conversations.list" | "conversations.history" | "conversations.replies",
    params: Record<string, string>,
    schema: S,
  ) =>
    Effect.gen(function* () {
      const rateKey = JSON.stringify([connectionId, lease.generation, lease.workspaceId, method]);
      const now = yield* Clock.currentTimeMillis;
      const deadline = deadlines.get(rateKey) ?? 0;
      if (now < deadline)
        return yield* new CommunicationsError({
          kind: "rate-limit",
          message: "Wait before explicitly reading Slack again.",
          retryAfterSeconds: Math.ceil((deadline - now) / 1000),
        });
      deadlines.delete(rateKey);
      const response = yield* http
        .execute(
          HttpClientRequest.get(`https://slack.com/api/${method}`).pipe(
            HttpClientRequest.setUrlParams(params),
            HttpClientRequest.bearerToken(lease.token),
          ),
        )
        .pipe(Effect.mapError(unavailable));
      if (response.status === 429)
        return yield* yield* rateLimit(rateKey, response.headers["retry-after"]);
      if (response.status === 401 || response.status === 403)
        return yield* fail(
          "access-denied",
          "Slack denied this read. Check the reader's current permissions.",
        );
      if (response.status === 404)
        return yield* fail("not-found", "This Slack conversation or message is unavailable.");
      if (response.status !== 200) return yield* unavailable();
      const body = yield* response.stream.pipe(
        Stream.runFoldEffect(
          () => new Uint8Array(0),
          (current, chunk) => {
            if (current.length + chunk.length > 1_000_000) return Effect.fail(unavailable());
            const next = new Uint8Array(current.length + chunk.length);
            next.set(current);
            next.set(chunk, current.length);
            return Effect.succeed(next);
          },
        ),
        Effect.mapError(unavailable),
      );
      const text = yield* Effect.try({
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(body),
        catch: unavailable,
      });
      return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text).pipe(
        Effect.mapError(unavailable),
      );
    }).pipe(
      Effect.raceFirst(lease.cancelled),
      Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
      Effect.timeoutOrElse({ duration: "15 seconds", orElse: () => Effect.fail(unavailable()) }),
    );
  const providerFailure = Effect.fnUntraced(function* (
    error: string,
    connectionId: string,
    lease: Lease,
    method: string,
  ) {
    if (error === "ratelimited")
      return yield* yield* rateLimit(
        JSON.stringify([connectionId, lease.generation, lease.workspaceId, method]),
      );
    if (["channel_not_found", "message_not_found", "thread_not_found"].includes(error))
      return yield* fail("not-found", "This Slack conversation or message is unavailable.");
    if (
      [
        "invalid_auth",
        "not_authed",
        "token_revoked",
        "token_expired",
        "account_inactive",
        "missing_scope",
        "no_permission",
        "access_denied",
        "not_in_channel",
        "is_archived",
      ].includes(error)
    )
      return yield* fail(
        "access-denied",
        "Slack denied this read. Check the reader's current permissions.",
      );
    return yield* unavailable();
  });
  const cursorFor = Effect.fnUntraced(function* (
    raw: string | undefined,
    binding: Omit<typeof Cursor.Type, "native" | "offset">,
  ) {
    if (!raw) return { ...binding, native: "", offset: 0 };
    const cursor = yield* decode(CursorJson, raw);
    if (
      Object.entries(binding).some(([key, value]) => cursor[key as keyof typeof cursor] !== value)
    )
      return yield* invalid();
    return cursor;
  });
  const listConversations = Effect.fn("SlackReader.listConversations")(function* (
    raw: SlackListConversationsInput,
  ) {
    const input = yield* decode(SlackListConversationsInput, raw);
    const account = yield* store.get(input.connectionId);
    if (!account) return yield* fail("not-found", "This Slack connection is unavailable.");
    const lease = yield* connections.authorize({
      connectionId: input.connectionId,
      workspaceId: account.workspaceId,
    });
    const binding = {
      version: 1 as const,
      provider: "slack" as const,
      connectionId: input.connectionId,
      generation: lease.generation,
      workspaceId: lease.workspaceId,
      conversationId: null,
      replyRootId: null,
      direction: "list" as const,
    };
    const cursor = yield* cursorFor(input.cursor, binding);
    const types = [
      ["channels", "public_channel"],
      ["groups", "private_channel"],
      ["im", "im"],
      ["mpim", "mpim"],
    ]
      .filter(([scope]) => lease.scopes.includes(`${scope}:read`))
      .map(([, type]) => type)
      .join(",");
    if (!types)
      return yield* fail("access-denied", "Slack conversation read permissions are unavailable.");
    return yield* singleFlight(
      conversationLanes,
      JSON.stringify(binding),
      input.cursor ?? "",
      lease,
      Effect.gen(function* () {
        const result = yield* request(
          lease,
          input.connectionId,
          "conversations.list",
          {
            types,
            exclude_archived: "true",
            limit: "100",
            ...(cursor.native ? { cursor: cursor.native } : {}),
          },
          Channels,
        );
        if (!result.ok)
          return yield* providerFailure(
            result.error,
            input.connectionId,
            lease,
            "conversations.list",
          );
        if (cursor.offset >= result.channels.length && cursor.offset !== 0) return yield* invalid();
        const observedAt = DateTime.formatIso(yield* DateTime.now);
        const conversations: CommunicationConversation[] = [];
        let nextCursor = result.response_metadata?.next_cursor
          ? encodeCursor({ ...binding, native: result.response_metadata.next_cursor, offset: 0 })
          : undefined;
        for (let index = cursor.offset; index < result.channels.length; index++) {
          const channel = result.channels[index]!;
          const kind = channel.is_im ? "dm" : channel.is_mpim ? "group" : "channel";
          const scope = channel.is_im
            ? "im"
            : channel.is_mpim
              ? "mpim"
              : channel.is_private || channel.id.startsWith("G")
                ? "groups"
                : "channels";
          if (!lease.scopes.includes(`${scope}:read`)) continue;
          const conversation: CommunicationConversation = {
            id: channel.id,
            connectionId: input.connectionId,
            workspaceId: lease.workspaceId,
            title: channel.name || channel.user || channel.id,
            kind,
            replyRead:
              lease.scopes.includes(`${scope}:history`) && (!lease.isBot || kind !== "channel"),
            ...(channel.num_members === undefined
              ? {}
              : { memberCount: { value: channel.num_members, complete: true, observedAt } }),
          };
          if (
            bytes({
              conversations: [...conversations, conversation],
              nextCursor,
              observedAt,
              incomplete: !!nextCursor,
            }) > 25000
          ) {
            nextCursor = encodeCursor({ ...cursor, offset: index });
            break;
          }
          conversations.push(conversation);
          kinds.set(JSON.stringify([input.connectionId, lease.generation, channel.id]), {
            kind,
            scope,
          });
          if (kinds.size > 1000) kinds.delete(kinds.keys().next().value!);
        }
        return yield* decodeConversationPage({
          conversations,
          ...(nextCursor ? { nextCursor } : {}),
          observedAt,
          incomplete: !!nextCursor,
        }).pipe(Effect.mapError(unavailable));
      }),
    );
  });
  const listMessages = Effect.fn("SlackReader.listMessages")(function* (
    raw: SlackListMessagesInput,
  ) {
    const input = yield* decode(SlackListMessagesInput, raw);
    const lease = yield* connections.authorize(input);
    const binding = {
      version: 1 as const,
      provider: "slack" as const,
      connectionId: input.connectionId,
      generation: lease.generation,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      replyRootId: input.replyRootId ?? null,
      direction: input.replyRootId ? ("replies" as const) : ("older" as const),
    };
    const cursor = yield* cursorFor(input.cursor, binding);
    const known = kinds.get(
      JSON.stringify([input.connectionId, lease.generation, input.conversationId]),
    );
    const scope =
      known?.scope ??
      (input.conversationId.startsWith("D")
        ? "im"
        : input.conversationId.startsWith("G")
          ? "groups"
          : "channels");
    if (
      (!known && input.conversationId.startsWith("G")) ||
      !lease.scopes.includes(`${scope}:read`) ||
      !lease.scopes.includes(`${scope}:history`)
    )
      return yield* fail(
        "access-denied",
        "This Slack reader has no history permission for this conversation type.",
      );
    if (
      input.replyRootId &&
      lease.isBot &&
      (known?.kind ?? (scope === "im" ? "dm" : "channel")) === "channel"
    )
      return yield* fail(
        "unsupported",
        "Slack channel replies require a user reader with channel history permission.",
      );
    return yield* singleFlight(
      messageLanes,
      JSON.stringify(binding),
      input.cursor ?? "",
      lease,
      Effect.gen(function* () {
        const method = input.replyRootId ? "conversations.replies" : "conversations.history";
        const result = yield* request(
          lease,
          input.connectionId,
          method,
          {
            channel: input.conversationId,
            limit: "15",
            ...(cursor.native ? { cursor: cursor.native } : {}),
            ...(input.replyRootId ? { ts: input.replyRootId } : {}),
          },
          Messages,
        );
        if (!result.ok)
          return yield* providerFailure(result.error, input.connectionId, lease, method);
        if (cursor.offset >= result.messages.length && cursor.offset !== 0) return yield* invalid();
        const native = result.response_metadata?.next_cursor;
        if (result.has_more && !native) return yield* unavailable();
        const observedAt = DateTime.formatIso(yield* DateTime.now);
        const messages: CommunicationMessage[] = [];
        let nextCursor = native ? encodeCursor({ ...binding, native, offset: 0 }) : undefined;
        let incomplete = !!nextCursor;
        for (let index = cursor.offset; index < result.messages.length; index++) {
          const row = result.messages[index]!;
          const root = row.thread_ts ?? (row.reply_count ? row.ts : undefined);
          const [seconds, fraction] = row.ts.split(".");
          const date = DateTime.formatIso(
            DateTime.makeUnsafe(Number(seconds) * 1000 + Number(fraction!.slice(0, 3))),
          );
          let message: CommunicationMessage = {
            id: row.ts,
            accountId: input.connectionId,
            connectionId: input.connectionId,
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            author: row.user || row.username || row.bot_id || "Slack system",
            date,
            text: row.text ?? "",
            ...(root ? { threadId: root, ...(root === row.ts ? {} : { replyToId: root }) } : {}),
            ...(row.reply_count === undefined ? {} : { replyCount: row.reply_count }),
          };
          if (
            bytes({ messages: [...messages, message], nextCursor, observedAt, incomplete }) > 25000
          ) {
            if (messages.length) {
              nextCursor = encodeCursor({ ...cursor, offset: index });
              incomplete = true;
              break;
            }
            let text = "";
            let size = 0;
            for (const char of message.text) {
              const length = bytes(char) - 2;
              if (size + length > 18000) break;
              text += char;
              size += length;
            }
            message = { ...message, text, textTruncated: true };
            incomplete = true;
          }
          messages.push(message);
        }
        const uniqueMessages = [
          ...new Map(messages.map((message) => [message.id, message])).values(),
        ];
        uniqueMessages.sort((a, b) => {
          const [as, af] = a.id.split(".");
          const [bs, bf] = b.id.split(".");
          return Number(as) - Number(bs) || af!.localeCompare(bf!);
        });
        return yield* decodeMessagePage({
          messages: uniqueMessages,
          ...(nextCursor ? { nextCursor } : {}),
          observedAt,
          incomplete,
        }).pipe(Effect.mapError(unavailable));
      }),
    );
  });
  return SlackReader.of({ listConversations, listMessages });
});

export const layer = Layer.effect(SlackReader, make);
