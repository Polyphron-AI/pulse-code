import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { IsoDateTime, NonNegativeInt } from "./baseSchemas.ts";
import { ChatMessage } from "./communications.ts";

export const CommunicationConnectionId = Schema.String.check(
  Schema.isPattern(/^[a-zA-Z0-9_-]{1,80}$/),
);
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160));

export const CommunicationConnection = Schema.Struct({
  id: CommunicationConnectionId,
  provider: Schema.Literals(["slack", "discord"]),
  identity: Label,
  label: Label,
  connected: Schema.Boolean,
  generation: NonNegativeInt,
  error: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(300))),
});
export type CommunicationConnection = typeof CommunicationConnection.Type;

export const SlackConnectInput = Schema.Struct({
  token: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(4096),
    Schema.isPattern(/^[!-~]+$/),
  ),
});
export type SlackConnectInput = typeof SlackConnectInput.Type;
export const SlackDisconnectInput = Schema.Struct({ connectionId: CommunicationConnectionId });
export type SlackDisconnectInput = typeof SlackDisconnectInput.Type;

export const SlackWorkspaceId = Schema.String.check(Schema.isPattern(/^T[A-Z0-9]{1,79}$/));
export const SlackConversationId = Schema.String.check(Schema.isPattern(/^[CGD][A-Z0-9]{1,79}$/));
export const SlackMessageId = Schema.String.check(Schema.isPattern(/^\d{1,12}\.\d{6}$/));
const Cursor = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(6000));
export const SlackListConversationsInput = Schema.Struct({
  connectionId: CommunicationConnectionId,
  cursor: Schema.optionalKey(Cursor),
});
export type SlackListConversationsInput = typeof SlackListConversationsInput.Type;
export const SlackListMessagesInput = Schema.Struct({
  connectionId: CommunicationConnectionId,
  workspaceId: SlackWorkspaceId,
  conversationId: SlackConversationId,
  replyRootId: Schema.optionalKey(SlackMessageId),
  cursor: Schema.optionalKey(Cursor),
});
export type SlackListMessagesInput = typeof SlackListMessagesInput.Type;
export const CommunicationConversation = Schema.Struct({
  id: SlackConversationId,
  connectionId: CommunicationConnectionId,
  workspaceId: SlackWorkspaceId,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
  kind: Schema.Literals(["channel", "group", "dm"]),
  replyRead: Schema.Boolean,
  memberCount: Schema.optionalKey(
    Schema.Struct({ value: NonNegativeInt, complete: Schema.Boolean, observedAt: IsoDateTime }),
  ),
});
export type CommunicationConversation = typeof CommunicationConversation.Type;
export const CommunicationMessage = Schema.Struct({
  ...ChatMessage.fields,
  id: SlackMessageId,
  connectionId: CommunicationConnectionId,
  workspaceId: SlackWorkspaceId,
  conversationId: SlackConversationId,
  textTruncated: Schema.optionalKey(Schema.Boolean),
});
export type CommunicationMessage = typeof CommunicationMessage.Type;
// Count the wire representation on native clients without Buffer or TextEncoder.
const boundedPage = Schema.makeFilter((page: unknown) => {
  let bytes = 0;
  for (const char of JSON.stringify(page)) {
    const code = char.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > 32000) return false;
  }
  return true;
});
const Page = {
  nextCursor: Schema.optionalKey(Cursor),
  observedAt: IsoDateTime,
  incomplete: Schema.Boolean,
};
export const CommunicationConversationPage = Schema.Struct({
  conversations: Schema.Array(CommunicationConversation).check(Schema.isMaxLength(100)),
  ...Page,
}).check(boundedPage);
export type CommunicationConversationPage = typeof CommunicationConversationPage.Type;
export const CommunicationMessagePage = Schema.Struct({
  messages: Schema.Array(CommunicationMessage).check(Schema.isMaxLength(100)),
  ...Page,
}).check(boundedPage);
export type CommunicationMessagePage = typeof CommunicationMessagePage.Type;

export class CommunicationsError extends Schema.TaggedError<CommunicationsError>()(
  "CommunicationsError",
  {
    kind: Schema.Literals([
      "invalid-input",
      "access-denied",
      "not-found",
      "unavailable",
      "rate-limit",
      "unsupported",
    ]),
    message: Schema.String,
    retryAfterSeconds: Schema.optionalKey(NonNegativeInt),
  },
) {}

export const PULSE_COMMUNICATIONS_METHODS = {
  slackConnect: "pulse.communications.slack.connect",
  slackListConnections: "pulse.communications.slack.listConnections",
  slackDisconnect: "pulse.communications.slack.disconnect",
  slackListConversations: "pulse.communications.slack.listConversations",
  slackListMessages: "pulse.communications.slack.listMessages",
} as const;
const Error = Schema.Union([CommunicationsError, EnvironmentAuthorizationError]);
export const PulseCommunicationsRpcs = [
  Rpc.make(PULSE_COMMUNICATIONS_METHODS.slackConnect, {
    payload: SlackConnectInput,
    success: CommunicationConnection,
    error: Error,
  }),
  Rpc.make(PULSE_COMMUNICATIONS_METHODS.slackListConnections, {
    payload: Schema.Struct({}),
    success: Schema.Array(CommunicationConnection),
    error: Error,
  }),
  Rpc.make(PULSE_COMMUNICATIONS_METHODS.slackDisconnect, {
    payload: SlackDisconnectInput,
    success: Schema.Void,
    error: Error,
  }),
  Rpc.make(PULSE_COMMUNICATIONS_METHODS.slackListConversations, {
    payload: SlackListConversationsInput,
    success: CommunicationConversationPage,
    error: Error,
  }),
  Rpc.make(PULSE_COMMUNICATIONS_METHODS.slackListMessages, {
    payload: SlackListMessagesInput,
    success: CommunicationMessagePage,
    error: Error,
  }),
] as const;
