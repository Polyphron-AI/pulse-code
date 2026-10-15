import {
  createThreadMailApprovalsAtomFamily,
  respondToMailApproval,
  visibleMailApprovals,
} from "@t3tools/client-runtime/mail/approvals";
import { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import {
  createEnvironmentCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  MailError,
  type EnvironmentId,
  type MailAddress,
  type MailApprovalId,
  type MailSendApproval,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Fragment, memo, useEffect, useMemo, useState } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const threadMailApprovals = createThreadMailApprovalsAtomFamily(connectionAtomRuntime);

const respondMailApproval = createEnvironmentCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:respond-approval",
  execute: (input: { approval: MailSendApproval; decision: "approve" | "decline" }) =>
    Effect.flatMap(EnvironmentSupervisor.EnvironmentSupervisor, (env) =>
      respondToMailApproval(env, input),
    ),
});

const isMailError = Schema.is(MailError);
const NO_APPROVALS: ReadonlyArray<MailSendApproval> = [];

const STATUS_COPY: Record<
  MailSendApproval["status"],
  { title: string; note?: string; variant: "warning" | "info" | "success" | "error" | "default" }
> = {
  pending: { title: "Email waiting for approval", variant: "warning" },
  submitting: { title: "Sending to the server", variant: "info" },
  accepted: { title: "Accepted by the server", variant: "success" },
  failed: { title: "Send failed", variant: "error" },
  outcome_unknown: {
    title: "Outcome unknown",
    note: "The server may have sent this message. Check the Sent folder before retrying.",
    variant: "warning",
  },
  declined: { title: "Declined", variant: "default" },
  expired: { title: "Approval expired", variant: "default" },
  invalidated: {
    title: "Approval invalidated",
    note: "Mail access changed after this send was prepared.",
    variant: "default",
  },
};

function formatAddresses(list: ReadonlyArray<MailAddress>) {
  return list.map((entry) => (entry.name ? `${entry.name} <${entry.address}>` : entry.address));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A pending approval flips to expired at its deadline without waiting for a refetch. */
function useMailApprovalStatus(approval: MailSendApproval) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (approval.status !== "pending") return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(approval.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [approval.status, approval.expiresAt]);
  return expired && approval.status === "pending" ? "expired" : approval.status;
}

/**
 * Mail sends awaiting approval in a thread, pushed by the server. Mount one per thread: what it
 * has shown stays listed after it resolves, until the user leaves the thread.
 */
export const MailSendApprovals = memo(function MailSendApprovals({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const query = useEnvironmentQuery(threadMailApprovals({ environmentId, input: { threadId } }));
  const listed = query.data ?? NO_APPROVALS;
  const [seen, setSeen] = useState<ReadonlySet<MailApprovalId>>(() => new Set());
  // Answers given in this view show at once, before the server pushes the new list.
  const [answered, setAnswered] = useState<ReadonlyMap<MailApprovalId, MailSendApproval>>(
    () => new Map(),
  );
  const approvals = useMemo(
    () => visibleMailApprovals(listed, seen, answered),
    [listed, seen, answered],
  );
  useEffect(() => {
    if (approvals.some((approval) => !seen.has(approval.id))) {
      // oxlint-disable-next-line react/set-state-in-effect -- Remembers what was shown so it stays after resolving.
      setSeen(new Set([...seen, ...approvals.map((approval) => approval.id)]));
    }
  }, [approvals, seen]);
  const failure = isMailError(query.failure) ? query.failure : null;
  if (approvals.length === 0 && failure === null) return null;
  return (
    <div className="mb-2 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
      {failure ? (
        <Alert variant="error">
          <AlertDescription>Could not load email approvals: {failure.message}</AlertDescription>
        </Alert>
      ) : null}
      {approvals.map((approval) => (
        <MailSendApprovalCard
          key={approval.id}
          environmentId={environmentId}
          approval={approval}
          onAnswered={(answer) => setAnswered((current) => new Map(current).set(answer.id, answer))}
        />
      ))}
    </div>
  );
});

const MailSendApprovalCard = memo(function MailSendApprovalCard({
  environmentId,
  approval,
  onAnswered,
}: {
  environmentId: EnvironmentId;
  approval: MailSendApproval;
  onAnswered: (approval: MailSendApproval) => void;
}) {
  const respond = useAtomCommand(respondMailApproval, { reportFailure: false });
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = useMailApprovalStatus(approval);

  const decide = async (decision: "approve" | "decline") => {
    setInFlight(true);
    setError(null);
    const result = await respond({ environmentId, input: { approval, decision } });
    setInFlight(false);
    if (result._tag === "Success") onAnswered(result.value);
    else {
      const failure = squashAtomCommandFailure(result);
      setError(
        failure instanceof Error ? failure.message : "The server could not record this answer.",
      );
    }
  };

  const { snapshot } = approval;
  const copy = STATUS_COPY[status];
  const recipients: Array<[string, ReadonlyArray<MailAddress>]> = [
    ["To", snapshot.to],
    ["CC", snapshot.cc],
    ["BCC", snapshot.bcc],
  ];

  return (
    <Alert variant={copy.variant}>
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt>Account</dt>
          <dd className="min-w-0 break-words">
            {snapshot.accountNickname} ({snapshot.from.address})
          </dd>
          <dt>From</dt>
          <dd className="min-w-0 break-words">{formatAddresses([snapshot.from])}</dd>
          {recipients.map(([label, list]) =>
            list.length > 0 ? (
              <Fragment key={label}>
                <dt>{label}</dt>
                <dd className="min-w-0 break-words">{formatAddresses(list).join(", ")}</dd>
              </Fragment>
            ) : null,
          )}
          <dt>Subject</dt>
          <dd className="min-w-0 break-words">{snapshot.subject}</dd>
        </dl>
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-foreground">
          {snapshot.text}
        </pre>
        {snapshot.attachments.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-0.5 text-xs">
            {snapshot.attachments.map((attachment) => (
              <li key={attachment.sha256} className="flex min-w-0 gap-2">
                <span className="min-w-0 truncate">{attachment.name}</span>
                <span className="shrink-0 tabular-nums">{formatSize(attachment.size)}</span>
                <Badge variant="outline">sha256 {attachment.sha256.slice(0, 12)}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {copy.note ? <p className="mt-2 text-xs">{copy.note}</p> : null}
        {approval.error ? <p className="mt-2 text-xs">{approval.error.message}</p> : null}
        {error ? <p className="mt-2 text-xs">{error}</p> : null}
        {status === "pending" ? (
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={inFlight} onClick={() => void decide("approve")}>
              Approve once
            </Button>
            <Button
              size="sm"
              variant="destructive-outline"
              disabled={inFlight}
              onClick={() => void decide("decline")}
            >
              Decline
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
});
