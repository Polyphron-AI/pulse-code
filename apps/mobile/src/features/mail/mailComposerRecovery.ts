import type { MailSendReceipt } from "@t3tools/contracts";

/** A local rejection never overrides a later receipt from another client. */
export function resolveMailSendReceipt(
  draftId: string | undefined,
  local: MailSendReceipt | null,
  outbox: readonly MailSendReceipt[] | null,
) {
  return outbox?.find((item) => item.draftId === draftId && item.state !== "failed") ?? local;
}

export function locksMailDraft(receipt: MailSendReceipt | null) {
  return receipt !== null && receipt.state !== "failed";
}

export function isMailDraftConflict(error: unknown) {
  return (
    typeof error === "object" && error !== null && "reason" in error && error.reason === "conflict"
  );
}
