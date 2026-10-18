import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { NonNegativeInt } from "./baseSchemas.ts";

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
] as const;
