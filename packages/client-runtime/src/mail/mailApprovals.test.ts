import { EnvironmentId, WS_METHODS, type MailSendApproval } from "@t3tools/contracts";
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
import { respondToMailApproval, visibleMailApprovals } from "./mailApprovals.ts";

const approval = (id: string, status: MailSendApproval["status"]) =>
  ({ id, status }) as MailSendApproval;
const ids = (approvals: ReadonlyArray<MailSendApproval>) =>
  approvals.map((entry) => `${entry.id}:${entry.status}`);

describe("visibleMailApprovals", () => {
  it("lists pending approvals oldest first and hides resolved ones never shown", () => {
    const listed = [
      approval("a3", "pending"),
      approval("a2", "accepted"),
      approval("a1", "pending"),
    ];
    expect(ids(visibleMailApprovals(listed, new Set(), new Map()))).toEqual([
      "a1:pending",
      "a3:pending",
    ]);
  });

  it("shows a send another device started, then keeps its outcome once seen", () => {
    expect(ids(visibleMailApprovals([approval("a1", "submitting")], new Set(), new Map()))).toEqual(
      ["a1:submitting"],
    );
    const seen = new Set(["a1"]);
    expect(ids(visibleMailApprovals([approval("a1", "accepted")], seen, new Map()))).toEqual([
      "a1:accepted",
    ]);
  });

  it("keeps an approval already shown after another client resolves it", () => {
    const seen = new Set(["a1"]);
    expect(ids(visibleMailApprovals([approval("a1", "declined")], seen, new Map()))).toEqual([
      "a1:declined",
    ]);
  });

  it("shows this client's answer until the pushed list catches up", () => {
    const answer = approval("a1", "submitting");
    const answered = new Map([[answer.id, answer]]);
    expect(ids(visibleMailApprovals([approval("a1", "pending")], new Set(), answered))).toEqual([
      "a1:submitting",
    ]);
    expect(ids(visibleMailApprovals([approval("a1", "accepted")], new Set(), answered))).toEqual([
      "a1:accepted",
    ]);
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
