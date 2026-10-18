import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ServerConfig } from "./server.ts";
import {
  CommunicationConnection,
  CommunicationsError,
  PULSE_COMMUNICATIONS_METHODS,
  PulseCommunicationsRpcs,
  SlackConnectInput,
  SlackDisconnectInput,
  SlackListMessagesInput,
  CommunicationMessagePage,
} from "./pulseCommunications.ts";
import { WS_METHODS, WsRpcGroup } from "./rpc.ts";

const connection = {
  id: "slack_generated_uuid",
  provider: "slack",
  identity: "Asha",
  label: "Review team",
  connected: true,
  generation: 1,
};
const decodeError = Schema.decodeUnknownSync(CommunicationsError);
const encodeError = Schema.encodeSync(CommunicationsError);

describe("server Slack connection contracts", () => {
  it("decodes old capability fixtures and optional Slack support", () => {
    const decode = Schema.decodeUnknownSync(
      Schema.Struct({ pulseCapabilities: ServerConfig.fields.pulseCapabilities }),
    );
    for (const input of [
      {},
      { pulseCapabilities: {} },
      { pulseCapabilities: { telegramRead: true } },
      { pulseCapabilities: { communicationsSlackRead: false } },
      { pulseCapabilities: { communicationsSlackRead: true } },
    ]) {
      expect(decode(input)).toEqual(input);
    }
    expect(() => decode({ pulseCapabilities: { communicationsSlackRead: "yes" } })).toThrow();
  });
  it("keeps only public metadata in connected and disconnected records", () => {
    const decode = Schema.decodeUnknownSync(CommunicationConnection);
    expect(decode({ ...connection, token: "private", scopes: [], workspaceId: "T1" })).toEqual(
      connection,
    );
    const disconnected = { ...connection, connected: false, generation: 2, error: "Disconnected" };
    expect(decode(disconnected)).toEqual(disconnected);
    expect(decode({ ...connection, provider: "discord" }).provider).toBe("discord");
    for (const patch of [
      { generation: -1 },
      { generation: 1.5 },
      { provider: "telegram" },
      { id: "../path" },
      { identity: "" },
    ]) {
      expect(() => decode({ ...connection, ...patch })).toThrow();
    }
  });
  it("bounds token and local identifier inputs", () => {
    const valid = Schema.is(SlackConnectInput);
    expect(valid({ token: "synthetic_slack_token" })).toBe(true);
    for (const token of ["", " ", "a\r\nb", "a".repeat(4097)]) expect(valid({ token })).toBe(false);
    const validDisconnect = Schema.is(SlackDisconnectInput);
    expect(validDisconnect({ connectionId: connection.id })).toBe(true);
    for (const connectionId of ["", "../outside", "a/b", "a".repeat(81)])
      expect(validDisconnect({ connectionId })).toBe(false);
  });
  it.each([
    "invalid-input",
    "access-denied",
    "not-found",
    "unavailable",
    "rate-limit",
    "unsupported",
  ] as const)("round trips safe %s errors without causes or credentials", (kind) => {
    const error = decodeError({
      _tag: "CommunicationsError",
      kind,
      message: "Safe failure",
      retryAfterSeconds: 12,
      cause: { authorization: "Bearer private" },
      token: "private",
    });
    expect(encodeError(error)).toEqual({
      _tag: "CommunicationsError",
      kind,
      message: "Safe failure",
      retryAfterSeconds: 12,
    });
  });
  it("registers exactly the separate Slack lifecycle family with no send method", () => {
    expect(PulseCommunicationsRpcs.map((rpc) => rpc._tag)).toEqual([
      "pulse.communications.slack.connect",
      "pulse.communications.slack.listConnections",
      "pulse.communications.slack.disconnect",
      "pulse.communications.slack.listConversations",
      "pulse.communications.slack.listMessages",
    ]);
    for (const [key, value] of Object.entries(PULSE_COMMUNICATIONS_METHODS)) {
      expect(WS_METHODS[key as keyof typeof PULSE_COMMUNICATIONS_METHODS]).toBe(value);
      expect(WsRpcGroup.requests.has(value)).toBe(true);
    }
  });
});

const decodeSlackMessagesInput = Schema.decodeSync(SlackListMessagesInput);
const isSlackMessagesInput = Schema.is(SlackListMessagesInput);
const decodeMessagePage = Schema.decodeSync(CommunicationMessagePage);
const isMessagePage = Schema.is(CommunicationMessagePage);

it("validates exact Slack identities and bounded wire pages without inventing counts", () => {
  const input = {
    connectionId: connection.id,
    workspaceId: "T123",
    conversationId: "C1",
    replyRootId: "1760343120.000001",
  };
  expect(decodeSlackMessagesInput(input)).toEqual(input);
  for (const patch of [
    { workspaceId: "../bad" },
    { replyRootId: "1e10" },
    { cursor: "x".repeat(6001) },
  ])
    expect(isSlackMessagesInput({ ...input, ...patch })).toBe(false);
  const message = {
    id: input.replyRootId,
    accountId: connection.id,
    connectionId: connection.id,
    workspaceId: "T123",
    conversationId: "C1",
    author: "U1",
    date: "2026-10-13T09:32:00.000Z",
    text: "Hello",
  };
  const page = { messages: [message], observedAt: "2026-10-13T09:32:00.000Z", incomplete: false };
  expect(decodeMessagePage(page)).toEqual(page);
  expect(isMessagePage({ ...page, messages: Array.from({ length: 101 }, () => message) })).toBe(
    false,
  );
  expect(isMessagePage({ ...page, messages: [{ ...message, text: "😀".repeat(9000) }] })).toBe(
    false,
  );
});
