import { describe, expect, it } from "vite-plus/test";
import type { MailSendReceipt } from "@t3tools/contracts";
import {
  isMailDraftConflict,
  locksMailDraft,
  resolveMailSendReceipt,
} from "./mailComposerRecovery";

const receipt = (state: MailSendReceipt["state"], draftId = "draft-1"): MailSendReceipt => ({
  operationId: state,
  draftId,
  accountId: "account-1",
  state,
  messageId: "message-1",
  accepted: [],
  rejected: [],
  detail: state,
  updatedAt: "2026-09-06T00:00:00Z",
});

describe("native mail composer recovery", () => {
  it("allows editing after a definitive rejection but locks any possible acceptance", () => {
    expect(locksMailDraft(receipt("failed"))).toBe(false);
    for (const state of ["accepted", "partial", "sending", "uncertain"] as const)
      expect(locksMailDraft(receipt(state))).toBe(true);
  });
  it("does not let a local failed receipt hide acceptance on another client", () => {
    const accepted = receipt("accepted");
    expect(resolveMailSendReceipt("draft-1", receipt("failed"), [accepted])).toBe(accepted);
    expect(locksMailDraft(resolveMailSendReceipt("draft-1", receipt("failed"), [accepted]))).toBe(
      true,
    );
  });
  it("ignores send receipts belonging to other drafts", () => {
    const failed = receipt("failed");
    expect(resolveMailSendReceipt("draft-1", failed, [receipt("accepted", "other")])).toBe(failed);
  });
  it("offers copy recovery only for draft conflicts, not arbitrary errors", () => {
    expect(isMailDraftConflict({ reason: "conflict", detail: "New revision" })).toBe(true);
    expect(isMailDraftConflict({ reason: "connection" })).toBe(false);
    expect(isMailDraftConflict(null)).toBe(false);
  });
});
