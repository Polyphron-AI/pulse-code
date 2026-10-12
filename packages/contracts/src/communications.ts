import * as Schema from "effect/Schema";

const Id = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024));
const Text = Schema.String.check(Schema.isMaxLength(4096));
const Secret = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(65536));
export const ChatProvider = Schema.Literals(["slack", "discord", "telegram"]);
export type ChatProvider = typeof ChatProvider.Type;
export const ChatAccount = Schema.Struct({
  id: Id,
  provider: ChatProvider,
  label: Text,
  identity: Text,
});
export type ChatAccount = typeof ChatAccount.Type;
export const ChatConversation = Schema.Struct({
  id: Id,
  accountId: Id,
  title: Text,
  kind: Schema.Literals(["channel", "group", "dm", "thread"]),
  workspace: Text,
  canSend: Schema.Boolean,
});
export type ChatConversation = typeof ChatConversation.Type;
export const ChatMessage = Schema.Struct({
  id: Id,
  accountId: Id,
  conversationId: Id,
  author: Text,
  date: Text,
  text: Schema.String.check(Schema.isMaxLength(200000)),
  replyToId: Schema.optionalKey(Id),
  threadId: Schema.optionalKey(Id),
});
export type ChatMessage = typeof ChatMessage.Type;
export const ChatChallenge = Schema.Struct({
  id: Id,
  prompt: Schema.Literals(["code", "password"]),
  expiresAt: Text,
});
export type ChatChallenge = typeof ChatChallenge.Type;
const ConversationInput = { accountId: Id, conversationId: Id };
export const ChatRequest = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("accounts.list") }),
  Schema.Struct({
    operation: Schema.Literal("accounts.connectToken"),
    provider: Schema.Literals(["slack", "discord"]),
    token: Secret,
  }),
  Schema.Struct({
    operation: Schema.Literal("accounts.telegram.begin"),
    apiId: Schema.Int.check(Schema.isGreaterThan(0)),
    apiHash: Id,
    phone: Id,
  }),
  Schema.Struct({
    operation: Schema.Literal("accounts.telegram.complete"),
    challengeId: Id,
    code: Schema.optionalKey(Id),
    password: Schema.optionalKey(Secret),
  }),
  Schema.Struct({ operation: Schema.Literal("accounts.telegram.cancel"), challengeId: Id }),
  Schema.Struct({ operation: Schema.Literal("accounts.disconnect"), accountId: Id }),
  Schema.Struct({
    operation: Schema.Literal("conversations.list"),
    accountId: Id,
    cursor: Schema.optionalKey(Id),
  }),
  Schema.Struct({
    operation: Schema.Literal("messages.list"),
    ...ConversationInput,
    cursor: Schema.optionalKey(Id),
    threadId: Schema.optionalKey(Id),
  }),
  Schema.Struct({
    operation: Schema.Literal("messages.send"),
    ...ConversationInput,
    text: Text.check(Schema.isNonEmpty()),
    replyToId: Schema.optionalKey(Id),
    nonce: Id,
  }),
]);
export type ChatRequest = typeof ChatRequest.Type;
export const ChatResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    accounts: Schema.optionalKey(Schema.Array(ChatAccount)),
    account: Schema.optionalKey(ChatAccount),
    conversations: Schema.optionalKey(
      Schema.Array(ChatConversation).check(Schema.isMaxLength(500)),
    ),
    messages: Schema.optionalKey(Schema.Array(ChatMessage).check(Schema.isMaxLength(100))),
    message: Schema.optionalKey(ChatMessage),
    nextCursor: Schema.optionalKey(Id),
    challenge: Schema.optionalKey(ChatChallenge),
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Struct({
      code: Schema.Literals([
        "invalid_request",
        "authentication",
        "permission",
        "network",
        "rate_limit",
        "storage",
        "not_found",
        "closed",
        "unsupported",
      ]),
      message: Text,
      retryAfterSeconds: Schema.optionalKey(Schema.Int),
    }),
  }),
]);
export type ChatResult = typeof ChatResult.Type;
