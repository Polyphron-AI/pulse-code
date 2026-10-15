import type { MailAddress, MailSendApproval, MailSendApprovalStatus } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import {
  type MailApprovalEntry,
  useSelectedThreadMailApprovals,
} from "../../state/use-selected-thread-requests";
import { RequestActionButton } from "./RequestActionButton";

const TERMINAL_COPY: Partial<Record<MailSendApprovalStatus, string>> = {
  submitting: "Sending...",
  accepted: "Accepted by the mail server. Delivery is not confirmed.",
  failed: "Sending failed. The email was not sent.",
  outcome_unknown:
    "The outcome is unknown. Check the Sent folder before trying again, so the email is not sent twice.",
  declined: "Declined. The email was not sent.",
  expired: "This approval expired. The email was not sent.",
  invalidated: "The email changed after it was shown, so this approval no longer applies.",
};

function formatAddress(address: MailAddress): string {
  return address.name ? `${address.name} <${address.address}>` : address.address;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Field(props: { readonly label: string; readonly value: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="w-16 font-t3-bold text-xs text-foreground-secondary">{props.label}</Text>
      <Text selectable className="flex-1 font-sans text-xs text-foreground">
        {props.value}
      </Text>
    </View>
  );
}

function CardShell(props: { readonly children: React.ReactNode }) {
  // Opaque like PendingApprovalCard: nothing blurs the feed behind it.
  return (
    <View className="gap-2.5 rounded-[20px] border border-border bg-card-alt p-4">
      <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
        Email approval
      </Text>
      {props.children}
    </View>
  );
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

function ApprovalBody(props: {
  readonly approval: MailSendApproval;
  readonly responding: boolean;
  readonly onRespond: (approval: MailSendApproval, decision: "approve" | "decline") => void;
}) {
  const { approval } = props;
  const { snapshot } = approval;
  const status = useMailApprovalStatus(approval);
  const statusCopy = TERMINAL_COPY[status];
  return (
    <CardShell>
      <Text className="font-t3-bold text-lg text-foreground">
        {snapshot.subject || "(no subject)"}
      </Text>
      <View className="gap-1">
        <Field label="Account" value={snapshot.accountNickname} />
        <Field label="From" value={formatAddress(snapshot.from)} />
        <Field label="To" value={snapshot.to.map(formatAddress).join(", ") || "None"} />
        {snapshot.cc.length > 0 ? (
          <Field label="CC" value={snapshot.cc.map(formatAddress).join(", ")} />
        ) : null}
        {snapshot.bcc.length > 0 ? (
          <Field label="BCC" value={snapshot.bcc.map(formatAddress).join(", ")} />
        ) : null}
      </View>
      <ScrollView className="max-h-56 rounded-xl bg-subtle p-3" nestedScrollEnabled>
        <Text selectable className="font-sans text-sm leading-normal text-foreground">
          {snapshot.text}
        </Text>
      </ScrollView>
      {snapshot.attachments.map((attachment) => (
        <Text
          key={attachment.sha256}
          className="font-sans text-xs leading-normal text-foreground-secondary"
        >
          {attachment.name} - {formatSize(attachment.size)} - sha256{" "}
          {attachment.sha256.slice(0, 12)}
        </Text>
      ))}
      {status === "pending" ? (
        <View className="flex-row flex-wrap gap-2.5">
          <RequestActionButton
            label="Approve once"
            tone="primary"
            disabled={props.responding}
            onPress={() => props.onRespond(approval, "approve")}
          />
          <RequestActionButton
            label="Decline"
            tone="danger"
            disabled={props.responding}
            onPress={() => props.onRespond(approval, "decline")}
          />
        </View>
      ) : statusCopy ? (
        <Text className="font-sans text-sm leading-normal text-foreground-secondary">
          {statusCopy}
          {approval.error ? ` ${approval.error.message}` : ""}
        </Text>
      ) : null}
    </CardShell>
  );
}

function EntryCard(props: {
  readonly entry: MailApprovalEntry;
  readonly responding: boolean;
  readonly onRespond: (approval: MailSendApproval, decision: "approve" | "decline") => void;
  readonly onRetry: () => void;
}) {
  switch (props.entry.kind) {
    case "outdated":
      return (
        <CardShell>
          <Text className="font-sans text-sm leading-normal text-foreground">
            Update the app to approve emails from this thread.
          </Text>
        </CardShell>
      );
    case "error":
      return (
        <CardShell>
          <Text className="font-sans text-sm leading-normal text-foreground-secondary">
            Could not load email approvals.
          </Text>
          <View className="flex-row">
            <RequestActionButton label="Retry" tone="secondary" onPress={props.onRetry} />
          </View>
        </CardShell>
      );
    case "loaded":
      return (
        <ApprovalBody
          approval={props.entry.approval}
          responding={props.responding}
          onRespond={props.onRespond}
        />
      );
  }
}

/** Mail send approvals for the selected thread. Mail never uses provider approval options. */
export function MailSendApprovalCards() {
  const { approvals, respondingId, onRespond, onRetry } = useSelectedThreadMailApprovals();
  if (approvals.length === 0) return null;
  return (
    <View className="shrink-0 gap-3 px-4 pb-3">
      {approvals.map(([id, entry]) => (
        <EntryCard
          key={id}
          entry={entry}
          responding={respondingId === id}
          onRespond={(approval, decision) => void onRespond(approval, decision)}
          onRetry={onRetry}
        />
      ))}
    </View>
  );
}
