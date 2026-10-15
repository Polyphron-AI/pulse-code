import {
  EnvironmentId,
  EventId,
  MAIL_SEND_APPROVAL_ACTIVITY_KIND,
  MAIL_SEND_APPROVAL_RESOLVED_ACTIVITY_KIND,
  WS_METHODS,
  type MailSendApproval,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
} from "../connection/model.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type * as RpcSession from "../rpc/session.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import { derivePendingMailApprovalIds, respondToMailApproval } from "./mailApprovals.ts";

const activity = (kind: string, approvalId: string, at: string): OrchestrationThreadActivity => ({
  id: EventId.make(`${kind}:${approvalId}`),
  tone: "approval",
  kind,
  summary: "Email waiting for approval",
  payload: { approvalId },
  turnId: null,
  createdAt: at,
});

describe("derivePendingMailApprovalIds", () => {
  it("drops an approval resolved on another client at the next activity update", () => {
    const requested = [
      activity(MAIL_SEND_APPROVAL_ACTIVITY_KIND, "a1", "2026-10-03T00:00:00Z"),
      activity(MAIL_SEND_APPROVAL_ACTIVITY_KIND, "a2", "2026-10-03T00:00:01Z"),
    ];
    expect(derivePendingMailApprovalIds(requested)).toEqual(["a1", "a2"]);
    const updated = [
      ...requested,
      activity(MAIL_SEND_APPROVAL_RESOLVED_ACTIVITY_KIND, "a1", "2026-10-03T00:00:02Z"),
    ];
    expect(derivePendingMailApprovalIds(updated)).toEqual(["a2"]);
  });

  it("keeps a resolution final when it arrives before the request", () => {
    expect(
      derivePendingMailApprovalIds([
        activity(MAIL_SEND_APPROVAL_RESOLVED_ACTIVITY_KIND, "a1", "2026-10-03T00:00:00Z"),
        activity(MAIL_SEND_APPROVAL_ACTIVITY_KIND, "a1", "2026-10-03T00:00:01Z"),
      ]),
    ).toEqual([]);
  });
});

describe("respondToMailApproval", () => {
  it.effect("sends the digest of the displayed snapshot", () =>
    Effect.gen(function* () {
      const sent: unknown[] = [];
      const client = {
        [WS_METHODS.pulseMailRespondApproval]: (input: unknown) =>
          Effect.sync(() => {
            sent.push(input);
            return displayed;
          }),
      } as unknown as WsRpcProtocolClient;
      const session: RpcSession.RpcSession = {
        client,
        initialConfig: Effect.never,
        subscribeServerConfig: () => Effect.never as never,
        ready: Effect.void,
        probe: Effect.void,
        closed: Effect.never,
      };
      const env = EnvironmentSupervisor.EnvironmentSupervisor.of({
        target: new PrimaryConnectionTarget({
          environmentId: EnvironmentId.make("environment-1"),
          label: "Test environment",
          httpBaseUrl: "https://environment.example.test",
          wsBaseUrl: "wss://environment.example.test",
        }),
        state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
        session: yield* SubscriptionRef.make(Option.some(session)),
        prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
        connect: Effect.void,
        disconnect: Effect.void,
        retryNow: Effect.void,
      });
      const displayed = { id: "a1", digest: "a".repeat(64) } as MailSendApproval;

      yield* respondToMailApproval(env, { approval: displayed, decision: "approve" });

      expect(sent).toEqual([{ approvalId: "a1", decision: "approve", digest: "a".repeat(64) }]);
    }),
  );
});
