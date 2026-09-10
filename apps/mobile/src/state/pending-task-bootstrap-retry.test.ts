import { CommandId, EnvironmentId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { QueuedThreadMessage } from "./thread-outbox-model";

const harness = vi.hoisted(() => ({
  manager: null as unknown as ReturnType<
    typeof import("./thread-outbox-manager").createThreadOutboxManager
  >,
  write: vi.fn<(message: QueuedThreadMessage) => Promise<void>>(async () => {}),
}));
vi.mock("./thread-outbox", async () => {
  const { createThreadOutboxManager } = await import("./thread-outbox-manager");
  const { appAtomRegistry } = await import("./atom-registry");
  harness.manager = createThreadOutboxManager({
    registry: appAtomRegistry,
    storage: { load: async () => [], write: harness.write, remove: async () => {} },
  });
  return {
    threadOutboxManager: harness.manager,
    threadOutboxRevision: (id: MessageId) => harness.manager.revisionOf(id),
    updateThreadOutboxMessage: (message: QueuedThreadMessage, revision: number) =>
      harness.manager.update(message, revision),
  };
});

import { rotateDeletedPendingTaskBootstrap } from "./pending-task-bootstrap-retry";

const environmentId = EnvironmentId.make("retry-environment");
const identity = { threadId: "retry-thread", commandId: "retry-command" };
const task = (): QueuedThreadMessage => ({
  environmentId,
  threadId: ThreadId.make("deleted-thread"),
  commandId: CommandId.make("old-command"),
  messageId: MessageId.make("owned-message"),
  createdAt: "2026-09-10T00:00:00.000Z",
  text: "Keep my draft",
  attachments: [],
  runtimeMode: "approval-required",
  interactionMode: "plan",
  creation: {
    projectId: ProjectId.make("project"),
    workspaceMode: "worktree",
    branch: "main",
    worktreePath: null,
  },
});

beforeEach(async () => {
  await harness.manager.clearEnvironment(environmentId);
  harness.write.mockReset().mockResolvedValue(undefined);
});

describe("pending task bootstrap retry", () => {
  it("persists a fresh thread and command while preserving message ownership and settings", async () => {
    const failed = task();
    await harness.manager.enqueue(failed);
    const next = await rotateDeletedPendingTaskBootstrap(failed, identity);
    expect(next).toEqual({ ...failed, ...identity });
    expect(harness.write).toHaveBeenLastCalledWith(next);
    expect(await harness.manager.confirmQueued(next!)).toBe(true);
  });

  it("retries the CAS against a concurrent edit without overwriting its content", async () => {
    const failed = task();
    await harness.manager.enqueue(failed);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    harness.write.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
    });
    const retry = rotateDeletedPendingTaskBootstrap(failed, identity);
    await started.promise;
    const edited = { ...failed, text: "A newer edit", interactionMode: "default" as const };
    const edit = harness.manager.enqueue(edited);
    release.resolve();
    await edit;
    const next = await retry;
    expect(next).toEqual({ ...edited, ...identity });
    expect(harness.write).toHaveBeenLastCalledWith(next);
  });

  it("does not resurrect removed tasks or rotate an already replaced identity", async () => {
    const failed = task();
    await harness.manager.enqueue(failed);
    await harness.manager.remove(failed);
    expect(await rotateDeletedPendingTaskBootstrap(failed, identity)).toBeNull();
    const replaced = { ...failed, threadId: ThreadId.make("another-thread") };
    await harness.manager.enqueue(replaced);
    harness.write.mockClear();
    expect(await rotateDeletedPendingTaskBootstrap(failed, identity)).toBe(replaced);
    expect(harness.write).not.toHaveBeenCalled();
  });

  it("keeps the existing queue entry if durable storage fails", async () => {
    const failed = task();
    await harness.manager.enqueue(failed);
    harness.write.mockRejectedValueOnce(new Error("Disk unavailable"));
    await expect(rotateDeletedPendingTaskBootstrap(failed, identity)).rejects.toThrow();
    expect(await harness.manager.confirmQueued(failed)).toBe(true);
    expect(await rotateDeletedPendingTaskBootstrap(failed, identity)).toEqual({
      ...failed,
      ...identity,
    });
  });
});
