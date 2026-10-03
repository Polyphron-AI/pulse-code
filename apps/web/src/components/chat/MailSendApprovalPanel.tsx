import {
  derivePendingMailApprovalIds,
  fetchMailApproval,
  respondToMailApproval,
} from "@t3tools/client-runtime/mail/approvals";
import { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import {
  createEnvironmentCommand,
  createEnvironmentQueryAtomFamily,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  MailAddress,
  MailApprovalId,
  MailSendApproval,
  OrchestrationThreadActivity,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { Fragment, memo, useMemo, useState } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const mailApproval = createEnvironmentQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:approval",
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
  execute: (approvalId: MailApprovalId) =>
    Effect.flatMap(EnvironmentSupervisor, (env) => fetchMailApproval(env, approvalId)),
});

const respondMailApproval = createEnvironmentCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:respond-approval",
  execute: (input: { approval: MailSendApproval; decision: "approve" | "decline" }) =>
    Effect.flatMap(EnvironmentSupervisor, (env) => respondToMailApproval(env, input)),
});

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

/** Mail sends awaiting approval in a thread, derived from activities plus the server snapshot. */
export const MailSendApprovals = memo(function MailSendApprovals({
  environmentId,
  activities,
}: {
  environmentId: EnvironmentId;
  activities: ReadonlyArray<OrchestrationThreadActivity>;
}) {
  const pendingIds = useMemo(() => derivePendingMailApprovalIds(activities), [activities]);
  // Answers given in this view stay visible so the user sees the server's outcome.
  const [answered, setAnswered] = useState<ReadonlyMap<MailApprovalId, MailSendApproval>>(
    () => new Map(),
  );
  const ids = useMemo(
    () => [...new Set([...pendingIds, ...answered.keys()])],
    [pendingIds, answered],
  );
  if (ids.length === 0) return null;
  return (
    <div className="mb-2 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
      {ids.map((id) => (
        <MailSendApprovalCard
          key={id}
          environmentId={environmentId}
          approvalId={id}
          answer={answered.get(id) ?? null}
          onAnswered={(approval) =>
            setAnswered((current) => new Map(current).set(approval.id, approval))
          }
        />
      ))}
    </div>
  );
});

const MailSendApprovalCard = memo(function MailSendApprovalCard({
  environmentId,
  approvalId,
  answer,
  onAnswered,
}: {
  environmentId: EnvironmentId;
  approvalId: MailApprovalId;
  answer: MailSendApproval | null;
  onAnswered: (approval: MailSendApproval) => void;
}) {
  const query = useEnvironmentQuery(mailApproval({ environmentId, input: approvalId }));
  const respond = useAtomCommand(respondMailApproval, { reportFailure: false });
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approval = answer ?? query.data;

  if (!approval) {
    return (
      <Alert variant={query.error ? "error" : "default"}>
        <AlertDescription>
          {query.error
            ? `Could not load the email approval: ${query.error}`
            : "Loading email approval"}
        </AlertDescription>
      </Alert>
    );
  }

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
      query.refresh();
    }
  };

  const { snapshot } = approval;
  const copy = STATUS_COPY[approval.status];
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
        {approval.status === "pending" ? (
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
