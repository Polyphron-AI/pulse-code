import { type MailApprovalId, type MailSendApproval, WS_METHODS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { request } from "../rpc/client.ts";
import { createEnvironmentRpcSubscriptionAtomFamily } from "../state/runtime.ts";

/** A thread's send approvals, newest first, pushed again whenever one of them changes. */
export function createThreadMailApprovalsAtomFamily<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:pulse-mail:thread-approvals",
    tag: WS_METHODS.pulseMailSubscribeThreadApprovals,
    idleTtlMs: 60_000,
  });
}

/**
 * What a thread view lists, oldest first. Pending approvals always show; one the view has already
 * shown (`seen`) stays after it resolves, so the user sees the outcome until leaving the thread.
 * This client's own answer stands in for a pushed copy that still says pending.
 */
export function visibleMailApprovals(
  listed: ReadonlyArray<MailSendApproval>,
  seen: ReadonlySet<MailApprovalId>,
  answered: ReadonlyMap<MailApprovalId, MailSendApproval>,
): MailSendApproval[] {
  const visible: MailSendApproval[] = [];
  for (let index = listed.length - 1; index >= 0; index -= 1) {
    const approval = listed[index]!;
    const answer = answered.get(approval.id);
    if (answer !== undefined) {
      visible.push(approval.status === "pending" ? answer : approval);
    } else if (approval.status === "pending" || seen.has(approval.id)) {
      visible.push(approval);
    }
  }
  return visible;
}

/** Sends the digest of the snapshot the user saw, so a changed send is rejected instead of approved. */
export function respondToMailApproval(
  env: EnvironmentSupervisor["Service"],
  input: { readonly approval: MailSendApproval; readonly decision: "approve" | "decline" },
) {
  return request(WS_METHODS.pulseMailRespondApproval, {
    approvalId: input.approval.id,
    decision: input.decision,
    digest: input.approval.digest,
  }).pipe(Effect.provideService(EnvironmentSupervisor, env));
}
