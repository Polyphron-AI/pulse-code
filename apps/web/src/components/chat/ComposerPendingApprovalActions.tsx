import {
  type ApprovalRequestId,
  type ProviderApprovalOption,
  type ProviderApprovalDecision,
} from "@t3tools/contracts";
import { memo } from "react";
import { Button } from "../ui/button";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  options?: ReadonlyArray<ProviderApprovalOption> | undefined;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

const DEFAULT_APPROVAL_OPTIONS = [
  { decision: "cancel", label: "Cancel turn" },
  { decision: "decline", label: "Decline" },
  { decision: "acceptForSession", label: "Always allow this session" },
  { decision: "accept", label: "Approve once" },
] satisfies ReadonlyArray<ProviderApprovalOption>;

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  options = DEFAULT_APPROVAL_OPTIONS,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  return (
    <>
      {options.map((option) => (
        <Button
          key={option.decision}
          size="sm"
          className="h-auto min-h-8 max-w-full whitespace-normal [overflow-wrap:anywhere]"
          variant={
            option.decision === "accept"
              ? "default"
              : option.decision === "decline"
                ? "destructive-outline"
                : option.decision === "cancel"
                  ? "ghost"
                  : "outline"
          }
          disabled={isResponding}
          onClick={() => void onRespondToApproval(requestId, option.decision)}
        >
          {option.label}
        </Button>
      ))}
    </>
  );
});
