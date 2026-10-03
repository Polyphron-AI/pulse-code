import {
  MAIL_SEND_APPROVAL_ACTIVITY_KIND,
  MAIL_SEND_APPROVAL_RESOLVED_ACTIVITY_KIND,
  MailApprovalId,
  type MailSendApproval,
  type OrchestrationThreadActivity,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { request } from "../rpc/client.ts";

const isApprovalId = Schema.is(MailApprovalId);

/** Approval IDs in a thread that still need a decision, oldest first. A resolution stays final in any order. */
export function derivePendingMailApprovalIds(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): MailApprovalId[] {
  const pending = new Set<MailApprovalId>();
  const closed = new Set<MailApprovalId>();
  for (const activity of activities) {
    const payload = Predicate.isObject(activity.payload) ? activity.payload : undefined;
    if (!payload || !isApprovalId(payload.approvalId)) continue;
    if (activity.kind === MAIL_SEND_APPROVAL_ACTIVITY_KIND) {
      if (!closed.has(payload.approvalId)) pending.add(payload.approvalId);
    } else if (activity.kind === MAIL_SEND_APPROVAL_RESOLVED_ACTIVITY_KIND) {
      closed.add(payload.approvalId);
      pending.delete(payload.approvalId);
    }
  }
  return [...pending];
}

export function fetchMailApproval(
  env: EnvironmentSupervisor["Service"],
  approvalId: MailApprovalId,
) {
  return request(WS_METHODS.pulseMailGetApproval, { approvalId }).pipe(
    Effect.provideService(EnvironmentSupervisor, env),
  );
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
