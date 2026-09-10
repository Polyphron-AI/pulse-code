import type { OrchestrationThread } from "@t3tools/contracts";

/** Match a compaction receipt to its request so older receipts cannot clear new work. */
export function isThreadContextCompacting(
  input: Pick<OrchestrationThread, "messages" | "activities" | "latestTurn" | "session"> & {
    readonly queuedMessages: ReadonlyArray<{
      readonly messageId: string;
      readonly text: string;
      readonly attachments: ReadonlyArray<unknown>;
    }>;
    readonly dispatchingMessageId: string | null;
  },
): boolean {
  const isCompact = (message: {
    readonly text: string;
    readonly attachments?: ReadonlyArray<unknown>;
  }) => message.text.trim().toLowerCase() === "/compact" && !message.attachments?.length;
  const dispatched = input.queuedMessages.findLast(
    (message) => message.messageId === input.dispatchingMessageId && isCompact(message),
  );
  const message = input.messages.findLast(
    (message) => message.role === "user" && isCompact(message),
  );
  const requestId = dispatched?.messageId ?? message?.id;
  if (!requestId) return false;
  if (
    input.activities.some((activity) => {
      if (activity.kind !== "context-compaction" && activity.kind !== "provider.turn.start.failed")
        return false;
      const payload = activity.payload;
      return (
        payload !== null &&
        typeof payload === "object" &&
        "requestId" in payload &&
        payload.requestId === requestId
      );
    })
  )
    return false;
  if (dispatched) return true;
  if (!message || (input.session?.status !== "starting" && input.session?.status !== "running"))
    return false;
  return (
    message.createdAt > (input.latestTurn?.requestedAt ?? message.createdAt) ||
    (input.latestTurn?.state === "running" && message.createdAt === input.latestTurn.requestedAt)
  );
}
