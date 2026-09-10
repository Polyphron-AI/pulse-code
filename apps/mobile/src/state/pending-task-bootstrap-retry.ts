import { CommandId, ThreadId } from "@t3tools/contracts";

import { appAtomRegistry } from "./atom-registry";
import {
  threadOutboxManager,
  threadOutboxRevision,
  updateThreadOutboxMessage,
  type QueuedThreadMessage,
} from "./thread-outbox";

/** Rotate only a confirmed deleted creation, preserving current edits and message ownership. */
export async function rotateDeletedPendingTaskBootstrap(
  failed: QueuedThreadMessage,
  identity: { readonly threadId: string; readonly commandId: string },
): Promise<QueuedThreadMessage | null> {
  while (true) {
    const current = Object.values(
      appAtomRegistry.get(threadOutboxManager.queuedMessagesByThreadKeyAtom),
    )
      .flat()
      .find((message) => message.messageId === failed.messageId);
    if (!current || current.environmentId !== failed.environmentId || !current.creation)
      return null;
    if (current.threadId !== failed.threadId) return current;
    const revision = threadOutboxRevision(current.messageId);
    const next = {
      ...current,
      threadId: ThreadId.make(identity.threadId),
      commandId: CommandId.make(identity.commandId),
    };
    if (await updateThreadOutboxMessage(next, revision)) return next;
    // An accepted edit won the CAS. Read its payload before retrying; a delete
    // or a different identity ends the retry without resurrecting the entry.
  }
}
