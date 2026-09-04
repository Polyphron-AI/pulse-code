import { afterEach, describe, expect, it } from "@effect/vitest";
import {
  CommandId,
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { onTestFinished, vi } from "vite-plus/test";

const composerDraftFileMocks = vi.hoisted(() => {
  let document = JSON.stringify({ schemaVersion: 1, drafts: {} });
  let readError: Error | null = null;
  let writeError: Error | null = null;
  let releaseRead: (() => void) | null = null;
  let readBarrier = Promise.resolve();

  return {
    blockRead() {
      readBarrier = new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
    },
    releaseRead() {
      releaseRead?.();
      releaseRead = null;
    },
    getDocument() {
      return document;
    },
    setDocument(value: unknown) {
      document = JSON.stringify(value);
    },
    setReadError(error: Error | null) {
      readError = error;
    },
    setWriteError(error: Error | null) {
      writeError = error;
    },
    Directory: class {
      create() {}
    },
    File: class {
      exists = true;
      parentDirectory = null;

      create() {}

      moveSync() {}

      async text() {
        await readBarrier;
        if (readError) throw readError;
        return document;
      }

      write(value: string) {
        if (writeError) {
          throw writeError;
        }
        document = value;
      }
    },
  };
});

const composerAttachmentCleanupMocks = vi.hoisted(() => ({
  remove: vi.fn(async () => undefined),
  releaseUploads: vi.fn(async () => undefined),
}));

const incomingShareStorageMocks = vi.hoisted(() => ({
  load: vi.fn<typeof import("../features/sharing/incoming-share-storage").loadIncomingShareDrafts>(
    async () => [],
  ),
}));

vi.mock("expo-file-system", () => ({
  Directory: composerDraftFileMocks.Directory,
  File: composerDraftFileMocks.File,
  Paths: { document: "/documents" },
}));

vi.mock("../lib/composerImages", () => ({
  removePersistedComposerAttachmentFile: composerAttachmentCleanupMocks.remove,
}));

vi.mock("../lib/attachmentUpload", () => ({
  releasePendingAttachmentUploads: composerAttachmentCleanupMocks.releaseUploads,
}));

vi.mock("../features/sharing/incoming-share-storage", () => ({
  loadIncomingShareDrafts: incomingShareStorageMocks.load,
}));

import type { DraftComposerAttachment } from "../lib/composerImages";
import { appAtomRegistry } from "./atom-registry";
import { threadOutboxManager } from "./thread-outbox";
import {
  appendComposerDraftAttachments,
  clearComposerDraftContentState,
  clearComposerDraftContent,
  ComposerDraftPersistenceError,
  composerDraftsAtom,
  decodePersistedComposerDrafts,
  createNewTaskDraft,
  type ComposerDraft,
  findNewTaskDraftKeys,
  flushComposerDrafts,
  getComposerDraftSnapshot,
  mergeComposerDraftContentState,
  migrateLegacyNewTaskDraft,
  releaseUnusedComposerAttachmentFiles,
  removeComposerDraftsForEnvironment,
  retainComposerAttachmentFileForPreview,
  restoreComposerDraftSnapshotState,
  retargetNewTaskDraft,
  setComposerDraftText,
  undoComposerDraftMerge,
  undoComposerDraftMergeState,
  resetComposerDraftsLoadState,
  waitForComposerDraftsLoaded,
} from "./use-composer-drafts";

const DRAFT: ComposerDraft = {
  text: "hello",
  attachments: [],
};

afterEach(() => {
  resetComposerDraftsLoadState();
  composerDraftFileMocks.setReadError(null);
  composerDraftFileMocks.setDocument({ schemaVersion: 1, drafts: {} });
  vi.useRealTimers();
  appAtomRegistry.set(composerDraftsAtom, {});
  appAtomRegistry.set(threadOutboxManager.queuedMessagesByThreadKeyAtom, {});
  composerAttachmentCleanupMocks.remove.mockClear();
  composerAttachmentCleanupMocks.releaseUploads.mockReset();
  composerAttachmentCleanupMocks.releaseUploads.mockResolvedValue(undefined);
  incomingShareStorageMocks.load.mockReset();
  incomingShareStorageMocks.load.mockResolvedValue([]);
});

describe("mobile composer drafts", () => {
  it("hydrates file-backed image records without rewriting them as inline images", async () => {
    const image = {
      id: "image-reader",
      type: "image",
      name: "photo.png",
      mimeType: "image/png",
      sizeBytes: 3,
      previewUri: "file:///documents/t3-composer-attachments/photo.png",
      fileUri: "file:///documents/t3-composer-attachments/photo.png",
    };
    const document = {
      schemaVersion: 1,
      drafts: { "environment-1:thread-1": { text: "Saved image", attachments: [image] } },
    };
    composerDraftFileMocks.setDocument(document);
    await waitForComposerDraftsLoaded();
    await flushComposerDrafts();
    expect(getComposerDraftSnapshot("environment-1:thread-1").attachments).toEqual([image]);
    expect(JSON.parse(composerDraftFileMocks.getDocument())).toEqual(document);
    expect(() =>
      decodePersistedComposerDrafts({
        schemaVersion: 1,
        drafts: {
          broken: {
            text: "",
            attachments: [{ ...image, fileUri: undefined, dataUrl: undefined }],
          },
        },
      }),
    ).toThrow();
  });

  it.each(["read", "decode"] as const)(
    "preserves saved drafts and attachment files when the draft %s fails",
    async (failure) => {
      vi.useFakeTimers();
      const file = {
        id: "saved-file",
        type: "file" as const,
        name: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 42,
        fileUri: "file:///documents/t3-composer-attachments/report.pdf",
      };
      composerDraftFileMocks.setDocument({
        schemaVersion: failure === "decode" ? 999 : 1,
        drafts: { "environment-1:saved": { text: "Saved draft", attachments: [file] } },
      });
      const original = composerDraftFileMocks.getDocument();
      if (failure === "read") {
        composerDraftFileMocks.setReadError(new Error("storage unavailable"));
      }

      await expect(releaseUnusedComposerAttachmentFiles([file])).rejects.toMatchObject({
        operation: failure,
      });
      setComposerDraftText("environment-1:new", "Keep my new edits too");
      await expect(flushComposerDrafts()).rejects.toMatchObject({ operation: failure });

      expect(composerDraftFileMocks.getDocument()).toBe(original);
      expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();
    },
  );

  it("retries a failed debounced read on final flush without dropping saved drafts or new edits", async () => {
    vi.useFakeTimers();
    composerDraftFileMocks.setDocument({
      schemaVersion: 1,
      drafts: { "environment-1:saved": DRAFT },
    });
    const original = composerDraftFileMocks.getDocument();
    composerDraftFileMocks.setReadError(new Error("storage unavailable"));
    setComposerDraftText("environment-1:new", "New edits");
    await vi.advanceTimersByTimeAsync(200);
    expect(composerDraftFileMocks.getDocument()).toBe(original);

    composerDraftFileMocks.setReadError(null);
    await flushComposerDrafts();

    expect(JSON.parse(composerDraftFileMocks.getDocument()).drafts).toEqual({
      "environment-1:saved": DRAFT,
      "environment-1:new": { text: "New edits", attachments: [] },
    });
  });

  // Hydration is one-shot per module instance and the attachment sweep now
  // triggers it too, so this test must observe it before any sweep test runs.
  it("hydrates generic file attachments from their saved local paths", () => {
    const file = {
      id: "file-1",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/report.pdf",
    };

    expect(
      decodePersistedComposerDrafts({
        schemaVersion: 1,
        drafts: {
          "environment-1:thread-1": { text: "Review this file", attachments: [file] },
        },
      }),
    ).toEqual({
      "environment-1:thread-1": { text: "Review this file", attachments: [file] },
    });
  });

  it("caps appended attachments at the send limit against the live draft", () => {
    const makeAttachment = (id: string) => ({
      id,
      type: "file" as const,
      name: `${id}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: `file:///documents/t3-composer-attachments/${id}.pdf`,
    });
    const existing = Array.from({ length: 7 }, (_, index) => makeAttachment(`held-${index}`));
    appAtomRegistry.set(composerDraftsAtom, {
      "environment-1:thread-cap": { text: "send this", attachments: existing },
    });

    const rejected = appendComposerDraftAttachments("environment-1:thread-cap", [
      makeAttachment("incoming-1"),
      makeAttachment("incoming-2"),
    ]);

    expect(rejected).toBe(1);
    const draft = appAtomRegistry.get(composerDraftsAtom)["environment-1:thread-cap"];
    expect(draft?.attachments).toHaveLength(8);
    expect(draft?.attachments.at(-1)?.id).toBe("incoming-1");

    // Restore paths bypass the cap so a failed send never drops its files.
    const overflowRejected = appendComposerDraftAttachments(
      "environment-1:thread-cap",
      [makeAttachment("restored-1")],
      { allowOverflow: true },
    );
    expect(overflowRejected).toBe(0);
    expect(
      appAtomRegistry.get(composerDraftsAtom)["environment-1:thread-cap"]?.attachments,
    ).toHaveLength(9);
  });

  it("keeps shared attachment files until every draft releases them", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const file = {
      id: "file-1",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/report.pdf",
    };
    appAtomRegistry.set(composerDraftsAtom, {
      source: { text: "First draft", attachments: [file] },
      copied: { text: "Second draft", attachments: [file] },
    });

    await releaseUnusedComposerAttachmentFiles([file]);
    expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();

    appAtomRegistry.set(composerDraftsAtom, {
      copied: { text: "Second draft", attachments: [file] },
    });
    await releaseUnusedComposerAttachmentFiles([file]);
    expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();

    appAtomRegistry.set(composerDraftsAtom, {});
    await releaseUnusedComposerAttachmentFiles([file]);
    expect(composerAttachmentCleanupMocks.remove).toHaveBeenCalledWith(file.fileUri);
  });

  it("keeps a failed-send draft's pending upload for retry", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const file = {
      id: "file-failed-send",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/failed-send.pdf",
      uploadedAttachmentId: "pending-failed-send",
      uploadEnvironmentId: EnvironmentId.make("environment-1"),
    };
    appAtomRegistry.set(composerDraftsAtom, {
      "environment-1:thread-1": { text: "Retry this send", attachments: [file] },
    });

    await releaseUnusedComposerAttachmentFiles([file]);

    expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();
    expect(composerAttachmentCleanupMocks.releaseUploads).not.toHaveBeenCalled();
  });

  it.each(["file", "image"] as const)(
    "keeps a removed %s until both preview and a share copy finish",
    async (type) => {
      const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
      onTestFinished(() => outboxLoad.mockRestore());
      const fileName = "33333333-3333-4333-8333-333333333333-recording.mp4";
      const file = {
        id: "file-preview",
        type,
        previewUri: "file:///preview",
        name: "recording.mp4",
        mimeType: "video/mp4",
        sizeBytes: 42,
        fileUri: `file:///private/var/mobile/Containers/Data/Application/11111111-1111-4111-8111-111111111111/Documents/t3-composer-attachments/${fileName}`,
      };
      const currentFile = {
        ...file,
        fileUri: `file:///var/mobile/Containers/Data/Application/22222222-2222-4222-8222-222222222222/Documents/t3-composer-attachments/${fileName}`,
      };
      const releasePlayback = retainComposerAttachmentFileForPreview(file);
      const releaseShareCopy = retainComposerAttachmentFileForPreview(currentFile);
      onTestFinished(releasePlayback);
      onTestFinished(releaseShareCopy);

      await releaseUnusedComposerAttachmentFiles([currentFile]);
      expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();

      releasePlayback();
      releasePlayback();
      await releaseUnusedComposerAttachmentFiles([file]);
      expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();

      const deleted = Promise.withResolvers<void>();
      composerAttachmentCleanupMocks.remove.mockImplementationOnce(async () => {
        deleted.resolve();
        return undefined;
      });
      releaseShareCopy();
      await deleted.promise;

      expect(composerAttachmentCleanupMocks.remove.mock.calls).toEqual([[currentFile.fileUri]]);
    },
  );

  it("preserves a preview opened while cleanup is checking the incoming inbox", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const file = {
      id: "file-opening-preview",
      type: "file" as const,
      name: "recording.mp4",
      mimeType: "video/mp4",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/recording.mp4",
    };
    const ownershipReadStarted = Promise.withResolvers<void>();
    const ownershipRead = Promise.withResolvers<[]>();
    incomingShareStorageMocks.load.mockImplementationOnce(() => {
      ownershipReadStarted.resolve();
      return ownershipRead.promise;
    });

    const cleanup = releaseUnusedComposerAttachmentFiles([file]);
    await ownershipReadStarted.promise;
    const release = retainComposerAttachmentFileForPreview(file);
    onTestFinished(release);
    ownershipRead.resolve([]);
    await cleanup;
    expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();

    const deleted = Promise.withResolvers<void>();
    composerAttachmentCleanupMocks.remove.mockImplementationOnce(async () => {
      deleted.resolve();
      return undefined;
    });
    release();
    await deleted.promise;
    expect(composerAttachmentCleanupMocks.remove.mock.calls).toEqual([[file.fileUri]]);
  });

  it("removes an unreferenced local file and its pending upload", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const environmentId = EnvironmentId.make("environment-1");
    const file = {
      id: "file-discarded",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/discarded.pdf",
      uploadedAttachmentId: "pending-discarded",
      uploadEnvironmentId: environmentId,
    };

    await releaseUnusedComposerAttachmentFiles([file]);

    expect(composerAttachmentCleanupMocks.remove).toHaveBeenCalledWith(file.fileUri);
    expect(composerAttachmentCleanupMocks.releaseUploads).toHaveBeenCalledWith(environmentId, [
      "pending-discarded",
    ]);
  });

  it("keeps a pending upload referenced through another local file", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const environmentId = EnvironmentId.make("environment-1");
    const discarded = {
      id: "file-discarded-copy",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/discarded-copy.pdf",
      uploadedAttachmentId: "pending-shared",
      uploadEnvironmentId: environmentId,
    };
    const retained = {
      ...discarded,
      id: "file-retained-copy",
      fileUri: "file:///documents/t3-composer-attachments/retained-copy.pdf",
    };
    appAtomRegistry.set(composerDraftsAtom, {
      "environment-1:thread-1": { text: "Keep this copy", attachments: [retained] },
    });

    await releaseUnusedComposerAttachmentFiles([discarded]);

    expect(composerAttachmentCleanupMocks.remove).toHaveBeenCalledWith(discarded.fileUri);
    expect(composerAttachmentCleanupMocks.releaseUploads).not.toHaveBeenCalled();
  });

  it("completes local cleanup when pending upload deletion fails", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => warning.mockRestore());
    composerAttachmentCleanupMocks.releaseUploads.mockRejectedValueOnce(
      new Error("environment disconnected"),
    );
    const file = {
      id: "file-delete-failed",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/delete-failed.pdf",
      uploadedAttachmentId: "pending-delete-failed",
      uploadEnvironmentId: EnvironmentId.make("environment-1"),
    };

    await expect(releaseUnusedComposerAttachmentFiles([file])).resolves.toBeUndefined();

    expect(composerAttachmentCleanupMocks.remove).toHaveBeenCalledWith(file.fileUri);
    expect(warning).toHaveBeenCalledWith(
      "[composer-attachments] could not remove pending upload",
      expect.objectContaining({ attachmentId: "pending-delete-failed" }),
    );
  });

  it("keeps local attachment files while an outbox message still needs them", async () => {
    const file = {
      id: "file-queued",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/report.pdf",
    };
    appAtomRegistry.set(threadOutboxManager.queuedMessagesByThreadKeyAtom, {
      "environment-1:thread-1": [
        {
          environmentId: EnvironmentId.make("environment-1"),
          threadId: ThreadId.make("thread-1"),
          messageId: MessageId.make("message-1"),
          commandId: CommandId.make("command-1"),
          text: "Review the report",
          attachments: [file],
          createdAt: "2026-08-24T12:00:00.000Z",
        },
      ],
    });

    await releaseUnusedComposerAttachmentFiles([file]);

    expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();
  });

  it("loads persisted outbox messages before deciding an attachment file is unused", async () => {
    const file = {
      id: "file-persisted",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/report.pdf",
    };
    const load = vi.spyOn(threadOutboxManager, "load").mockImplementation(async () => {
      appAtomRegistry.set(threadOutboxManager.queuedMessagesByThreadKeyAtom, {
        "environment-1:thread-1": [
          {
            environmentId: EnvironmentId.make("environment-1"),
            threadId: ThreadId.make("thread-1"),
            messageId: MessageId.make("message-persisted"),
            commandId: CommandId.make("command-persisted"),
            text: "Review the report",
            attachments: [file],
            createdAt: "2026-08-24T12:00:00.000Z",
          },
        ],
      });
      return true;
    });

    try {
      await releaseUnusedComposerAttachmentFiles([file]);

      expect(load).toHaveBeenCalledOnce();
      expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });

  it("keeps a file until its incoming share is consumed", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const file = {
      id: "file-incoming",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/incoming.pdf",
    };
    incomingShareStorageMocks.load
      .mockResolvedValueOnce([
        {
          schemaVersion: 1,
          id: "share-1",
          createdAt: "2026-08-28T12:00:00.000Z",
          text: "Review this file",
          attachments: [file],
          warnings: [],
        },
      ])
      .mockResolvedValueOnce([]);

    await releaseUnusedComposerAttachmentFiles([file]);

    expect(incomingShareStorageMocks.load).toHaveBeenLastCalledWith({ strict: true });
    expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();

    await releaseUnusedComposerAttachmentFiles([file]);

    expect(incomingShareStorageMocks.load).toHaveBeenCalledTimes(2);
    expect(composerAttachmentCleanupMocks.remove).toHaveBeenCalledWith(file.fileUri);
  });

  it("does not delete files when incoming share ownership cannot be loaded", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const file = {
      id: "file-incoming-unknown",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/incoming-unknown.pdf",
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    incomingShareStorageMocks.load.mockRejectedValueOnce(new Error("inbox unavailable"));
    onTestFinished(() => warning.mockRestore());

    await releaseUnusedComposerAttachmentFiles([file]);

    expect(incomingShareStorageMocks.load).toHaveBeenCalledWith({ strict: true });
    expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();
  });

  it.each(["draft", "outbox", "inbox"] as const)(
    "preserves relocated files still referenced by a persisted %s",
    async (owner) => {
      const fileName = "33333333-3333-4333-8333-333333333333-report.pdf";
      const oldFile = {
        id: "file-relocated",
        type: "file" as const,
        name: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 42,
        fileUri: `file:///private/var/mobile/Containers/Data/Application/11111111-1111-4111-8111-111111111111/Documents/t3-composer-attachments/${fileName}`,
      };
      const currentFile = {
        ...oldFile,
        fileUri: `file:///var/mobile/Containers/Data/Application/22222222-2222-4222-8222-222222222222/Documents/t3-composer-attachments/${fileName}`,
      };
      const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
      onTestFinished(() => outboxLoad.mockRestore());
      if (owner === "draft") {
        composerDraftFileMocks.setDocument({
          schemaVersion: 1,
          drafts: { "environment-1:thread-1": { text: "Saved draft", attachments: [oldFile] } },
        });
        resetComposerDraftsLoadState();
      } else if (owner === "outbox") {
        outboxLoad.mockImplementation(async () => {
          appAtomRegistry.set(threadOutboxManager.queuedMessagesByThreadKeyAtom, {
            "environment-1:thread-1": [
              {
                environmentId: EnvironmentId.make("environment-1"),
                threadId: ThreadId.make("thread-1"),
                messageId: MessageId.make("message-relocated"),
                commandId: CommandId.make("command-relocated"),
                text: "Queued draft",
                attachments: [oldFile],
                createdAt: "2026-08-28T12:00:00.000Z",
              },
            ],
          });
          return true;
        });
      } else {
        incomingShareStorageMocks.load.mockResolvedValue([
          {
            schemaVersion: 1,
            id: "share-relocated",
            createdAt: "2026-08-28T12:00:00.000Z",
            text: "Incoming file",
            attachments: [oldFile],
            warnings: [],
          },
        ]);
      }

      await releaseUnusedComposerAttachmentFiles([currentFile]);

      expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();

      appAtomRegistry.set(composerDraftsAtom, {});
      appAtomRegistry.set(threadOutboxManager.queuedMessagesByThreadKeyAtom, {});
      outboxLoad.mockResolvedValue(true);
      incomingShareStorageMocks.load.mockResolvedValue([]);
      await releaseUnusedComposerAttachmentFiles([currentFile]);

      expect(composerAttachmentCleanupMocks.remove).toHaveBeenCalledWith(currentFile.fileUri);
    },
  );

  it("does not delete attachment files when the draft removal cannot be saved", async () => {
    const file = {
      id: "file-unsaved",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/report.pdf",
    };
    setComposerDraftText("environment-1:thread-1", "Unsaved draft");
    composerDraftFileMocks.setWriteError(new Error("storage unavailable"));

    try {
      await expect(releaseUnusedComposerAttachmentFiles([file])).rejects.toBeInstanceOf(
        ComposerDraftPersistenceError,
      );
      expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();
    } finally {
      composerDraftFileMocks.setWriteError(null);
    }
  });

  it("hydrates selector state even when the message content is empty", () => {
    const hydrated = Object.entries(
      decodePersistedComposerDrafts({
        schemaVersion: 1,
        drafts: {
          "new-task:environment-1:project-1": {
            text: "",
            attachments: [],
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
              options: [{ id: "reasoningEffort", value: "xhigh" }],
            },
            runtimeMode: "approval-required",
            interactionMode: "plan",
            workspaceSelection: {
              mode: "worktree",
              branch: "main",
              worktreePath: null,
            },
          },
        },
      }),
    );
    expect(hydrated).toHaveLength(1);
    const [key, draft] = hydrated[0]!;
    // Legacy project keys are rewritten to id keys on load.
    expect(key).toMatch(/^new-task:[0-9a-z-]+$/);
    expect(draft).toEqual({
      text: "",
      attachments: [],
      modelSelection: {
        instanceId: "codex",
        model: "gpt-5.4",
        options: [{ id: "reasoningEffort", value: "xhigh" }],
      },
      runtimeMode: "approval-required",
      interactionMode: "plan",
      workspaceSelection: {
        mode: "worktree",
        branch: "main",
        worktreePath: null,
      },
      project: {
        environmentId: "environment-1",
        projectId: "project-1",
        createdAt: expect.any(String),
      },
    });
  });
  it("keeps legacy content-only drafts and rejects invalid selector state", () => {
    expect(
      decodePersistedComposerDrafts({
        schemaVersion: 1,
        drafts: {
          "environment-1:thread-1": DRAFT,
        },
      }),
    ).toEqual({
      "environment-1:thread-1": DRAFT,
    });

    expect(() =>
      decodePersistedComposerDrafts({
        schemaVersion: 1,
        drafts: {
          "environment-1:thread-1": {
            ...DRAFT,
            runtimeMode: "sometimes-safe",
          },
        },
      }),
    ).toThrow();
  });

  it("keeps share-import receipts on otherwise contentless new-task drafts", () => {
    const receiptDraft: ComposerDraft = {
      text: "",
      attachments: [],
      importedShareIds: ["share-1"],
    };
    // The stale-model strip must not touch receipt-bearing drafts, and the
    // empty filter must keep them — or the same share would re-import after
    // restart.
    const stripped = Object.values(
      decodePersistedComposerDrafts({
        schemaVersion: 1,
        drafts: {
          "new-task:environment-1:project-1": {
            ...receiptDraft,
            modelSelection: {
              instanceId: "codex",
              model: "gpt-5.4",
            },
          },
        },
      }),
    );
    expect(stripped).toHaveLength(1);
    expect(stripped[0]).toMatchObject({
      text: "",
      attachments: [],
      importedShareIds: ["share-1"],
      project: { environmentId: "environment-1", projectId: "project-1" },
    });
    expect(stripped[0]?.modelSelection).toEqual({ instanceId: "codex", model: "gpt-5.4" });

    const kept = Object.values(
      decodePersistedComposerDrafts({
        schemaVersion: 1,
        drafts: { "new-task:environment-1:project-1": receiptDraft },
      }),
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject(receiptDraft);
  });

  it("migrates project-keyed new-task drafts to id keys with the project stamped in", () => {
    const now = "2026-09-05T12:00:00.000Z";
    const [key, draft] = migrateLegacyNewTaskDraft(
      "new-task:environment-1:project-1",
      { text: "keep me", attachments: [] },
      now,
    );
    // The new key has no colon after the prefix, so it can never be
    // mistaken for the legacy shape on the next load.
    expect(key).toMatch(/^new-task:[0-9a-z-]+$/);
    expect(draft).toEqual({
      text: "keep me",
      attachments: [],
      project: {
        environmentId: EnvironmentId.make("environment-1"),
        projectId: ProjectId.make("project-1"),
        createdAt: now,
      },
    });

    // Already-migrated, thread, and pending-task keys pass through untouched.
    const stamped: ComposerDraft = {
      text: "x",
      attachments: [],
      project: {
        environmentId: EnvironmentId.make("environment-1"),
        projectId: ProjectId.make("project-1"),
        createdAt: now,
      },
    };
    expect(migrateLegacyNewTaskDraft("new-task:some-id", stamped, now)).toEqual([
      "new-task:some-id",
      stamped,
    ]);
    expect(migrateLegacyNewTaskDraft("environment-1:thread-1", DRAFT, now)).toEqual([
      "environment-1:thread-1",
      DRAFT,
    ]);
    expect(migrateLegacyNewTaskDraft("pending-task:message-1", DRAFT, now)).toEqual([
      "pending-task:message-1",
      DRAFT,
    ]);
  });

  it("keeps a freshly minted new-task draft bound until content arrives, then lists it per project", () => {
    const project = {
      environmentId: EnvironmentId.make("environment-1"),
      projectId: ProjectId.make("project-1"),
    };
    const first = createNewTaskDraft(project);
    const second = createNewTaskDraft(project);
    expect(first).not.toBe(second);
    // Empty stamped drafts stay in memory so the composer has a key to write
    // to, but the persisted document leaves them out.
    expect(appAtomRegistry.get(composerDraftsAtom)[first]?.project).toMatchObject(project);

    setComposerDraftText(first, "first idea");
    setComposerDraftText(second, "second idea");
    expect(findNewTaskDraftKeys(appAtomRegistry.get(composerDraftsAtom), project)).toEqual(
      expect.arrayContaining([first, second]),
    );

    // Clearing content on the way out drops the stamp with it.
    clearComposerDraftContent(first, { clearWorkspaceSelection: true });
    expect(appAtomRegistry.get(composerDraftsAtom)[first]).toBeUndefined();
    expect(getComposerDraftSnapshot(second).text).toBe("second idea");
  });

  it("retargets a new-task draft to another project without losing its text", () => {
    const from = {
      environmentId: EnvironmentId.make("environment-1"),
      projectId: ProjectId.make("project-1"),
    };
    const to = {
      environmentId: EnvironmentId.make("environment-2"),
      projectId: ProjectId.make("project-2"),
    };
    const key = createNewTaskDraft(from);
    setComposerDraftText(key, "moving house");
    appAtomRegistry.set(composerDraftsAtom, {
      ...appAtomRegistry.get(composerDraftsAtom),
      [key]: {
        ...getComposerDraftSnapshot(key),
        runtimeMode: "approval-required",
        workspaceSelection: { mode: "worktree", branch: "feature/a", worktreePath: null },
      },
    });
    const createdAt = getComposerDraftSnapshot(key).project?.createdAt;

    retargetNewTaskDraft(key, to);

    const moved = getComposerDraftSnapshot(key);
    expect(moved.text).toBe("moving house");
    expect(moved.runtimeMode).toBe("approval-required");
    // Branch and worktree belong to the old repo.
    expect(moved.workspaceSelection).toBeUndefined();
    expect(moved.project).toEqual({ ...to, createdAt });
    expect(findNewTaskDraftKeys(appAtomRegistry.get(composerDraftsAtom), from)).toEqual([]);
    expect(findNewTaskDraftKeys(appAtomRegistry.get(composerDraftsAtom), to)).toEqual([key]);
  });

  it("clears sent content without clearing the selected model or workspace", () => {
    const draftKey = "environment-1:thread-1";
    const draft: ComposerDraft = {
      text: "send this",
      attachments: [],
      importedShareIds: ["share-1"],
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
        options: [{ id: "reasoningEffort", value: "xhigh" }],
      },
      workspaceSelection: {
        mode: "worktree",
        branch: "main",
        worktreePath: null,
      },
    };

    expect(clearComposerDraftContentState({ [draftKey]: draft }, draftKey)).toEqual({
      [draftKey]: {
        modelSelection: draft.modelSelection,
        workspaceSelection: draft.workspaceSelection,
        text: "",
        attachments: [],
      },
    });
  });

  it("drops the workspace selection when clearing a sent new-task draft", () => {
    const draftKey = "new-task:environment-1:project-1";
    const draft: ComposerDraft = {
      text: "send this",
      attachments: [],
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
      },
      workspaceSelection: {
        mode: "worktree",
        branch: "main",
        worktreePath: null,
        startFromOrigin: false,
      },
    };

    expect(
      clearComposerDraftContentState({ [draftKey]: draft }, draftKey, {
        clearWorkspaceSelection: true,
      }),
    ).toEqual({
      [draftKey]: {
        modelSelection: draft.modelSelection,
        text: "",
        attachments: [],
      },
    });
  });

  it("reads the latest selector state synchronously for send", () => {
    const draftKey = "environment-1:thread-1";
    const selectedDraft: ComposerDraft = {
      text: "send this",
      attachments: [],
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.4",
        options: [{ id: "reasoningEffort", value: "xhigh" }],
      },
    };
    appAtomRegistry.set(composerDraftsAtom, { [draftKey]: selectedDraft });

    expect(getComposerDraftSnapshot(draftKey)).toEqual(selectedDraft);
  });

  it("drops another environment's upload stamp when a draft moves across machines", () => {
    const uploadedElsewhere: DraftComposerAttachment = {
      id: "image-1",
      type: "file",
      name: "screen.png",
      mimeType: "image/png",
      sizeBytes: 1,
      fileUri: "file:///drafts/screen.png",
      uploadedAttachmentId: "upload-1",
      uploadEnvironmentId: EnvironmentId.make("environment-1"),
    };
    const uploadedOnTarget: DraftComposerAttachment = {
      ...uploadedElsewhere,
      id: "image-2",
      uploadedAttachmentId: "upload-2",
      uploadEnvironmentId: EnvironmentId.make("environment-2"),
    };
    const key = createNewTaskDraft({
      environmentId: EnvironmentId.make("environment-1"),
      projectId: ProjectId.make("project-1"),
    });
    appAtomRegistry.set(composerDraftsAtom, {
      ...appAtomRegistry.get(composerDraftsAtom),
      [key]: {
        ...getComposerDraftSnapshot(key),
        text: "Ship it",
        attachments: [uploadedElsewhere, uploadedOnTarget],
      },
    });

    retargetNewTaskDraft(key, {
      environmentId: EnvironmentId.make("environment-2"),
      projectId: ProjectId.make("project-2"),
    });

    expect(getComposerDraftSnapshot(key).attachments).toEqual([
      {
        id: "image-1",
        type: "file",
        name: "screen.png",
        mimeType: "image/png",
        sizeBytes: 1,
        fileUri: "file:///drafts/screen.png",
      },
      uploadedOnTarget,
    ]);
  });

  it("merges shared content into a project draft without duplicating retries", () => {
    const draftKey = "new-task:environment-1:project-1";
    const sharedAttachment = {
      id: "share-1:image:0",
      type: "image" as const,
      name: "Screenshot.png",
      mimeType: "image/png",
      sizeBytes: 3,
      dataUrl: "data:image/png;base64,YWJj",
      previewUri: "data:image/png;base64,YWJj",
    };
    const existing: Record<string, ComposerDraft> = {
      [draftKey]: { text: "Existing context", attachments: [] },
    };
    const content = {
      text: "Shared note",
      attachments: [sharedAttachment],
      sourceShareId: "share-1",
    };

    const merged = mergeComposerDraftContentState(existing, draftKey, content);
    expect(merged[draftKey]).toMatchObject({
      text: "Existing context\n\nShared note",
      attachments: [sharedAttachment],
      importedShareIds: ["share-1"],
    });
    expect(mergeComposerDraftContentState(merged, draftKey, content)).toBe(merged);

    const edited = {
      ...merged,
      [draftKey]: { ...merged[draftKey]!, text: "User edited the imported context" },
    };
    expect(mergeComposerDraftContentState(edited, draftKey, content)).toBe(edited);
  });

  it("preserves existing images when shared content exceeds the draft attachment limit", () => {
    const draftKey = "new-task:environment-1:project-1";
    const image = (id: string) => ({
      id,
      type: "image" as const,
      name: `${id}.png`,
      mimeType: "image/png",
      sizeBytes: 3,
      dataUrl: "data:image/png;base64,YWJj",
      previewUri: "data:image/png;base64,YWJj",
    });
    const existingImage = image("existing");
    const sharedImages = Array.from({ length: 8 }, (_, index) => image(`shared-${index}`));

    const merged = mergeComposerDraftContentState(
      { [draftKey]: { text: "", attachments: [existingImage] } },
      draftKey,
      { text: "", attachments: sharedImages },
    );

    expect(merged[draftKey]?.attachments).toHaveLength(8);
    expect(merged[draftKey]?.attachments[0]).toEqual(existingImage);
    expect(merged[draftKey]?.attachments.at(-1)?.id).toBe("shared-6");
  });

  it("restores the exact draft captured before an interrupted share import", () => {
    const draftKey = "new-task:environment-1:project-1";
    const beforeImport: ComposerDraft = {
      text: "Existing context",
      attachments: [],
      runtimeMode: "approval-required",
    };
    const imported: ComposerDraft = {
      ...beforeImport,
      text: "Existing context\n\nShared note",
      importedShareIds: ["share-1"],
    };

    expect(
      restoreComposerDraftSnapshotState({ [draftKey]: imported }, draftKey, beforeImport),
    ).toEqual({ [draftKey]: beforeImport });
    expect(
      restoreComposerDraftSnapshotState({ [draftKey]: imported }, draftKey, {
        text: "",
        attachments: [],
      }),
    ).toEqual({});
  });

  it("removes only drafts owned by the selected environment", () => {
    const environmentId = EnvironmentId.make("environment-cloud");
    const retainedEnvironmentId = EnvironmentId.make("environment-local");

    const cloudDraft: ComposerDraft = {
      ...DRAFT,
      project: {
        environmentId,
        projectId: ProjectId.make("project-cloud"),
        createdAt: "2026-09-05T00:00:00.000Z",
      },
    };
    const localDraft: ComposerDraft = {
      ...DRAFT,
      project: {
        environmentId: retainedEnvironmentId,
        projectId: ProjectId.make("project-local"),
        createdAt: "2026-09-05T00:00:00.000Z",
      },
    };

    expect(
      removeComposerDraftsForEnvironment(
        {
          [`${environmentId}:thread-cloud`]: DRAFT,
          "new-task:cloud-draft": cloudDraft,
          [`${retainedEnvironmentId}:thread-local`]: DRAFT,
          "new-task:local-draft": localDraft,
        },
        environmentId,
      ),
    ).toEqual({
      [`${retainedEnvironmentId}:thread-local`]: DRAFT,
      "new-task:local-draft": localDraft,
    });
  });

  it("lands a still-debounced draft write when flushed", async () => {
    const draftKey = "environment-1:thread-1";
    setComposerDraftText(draftKey, "typed right before the restart");

    await flushComposerDrafts();

    expect(JSON.parse(composerDraftFileMocks.getDocument())).toMatchObject({
      drafts: { [draftKey]: { text: "typed right before the restart" } },
    });
  });

  it("propagates a flush write failure instead of resolving as saved", async () => {
    const draftKey = "environment-1:thread-1";
    setComposerDraftText(draftKey, "unsaved");
    composerDraftFileMocks.setWriteError(new Error("storage unavailable"));

    try {
      await expect(flushComposerDrafts()).rejects.toBeInstanceOf(ComposerDraftPersistenceError);
    } finally {
      composerDraftFileMocks.setWriteError(null);
    }
  });

  it("restores the pre-merge snapshot when the draft is untouched since the merge", () => {
    const draftKey = "environment-1:thread-1";
    const snapshot: ComposerDraft = { text: "typed before", attachments: [] };
    const merged: ComposerDraft = {
      text: "typed before\n\nqueued text",
      attachments: [],
      runtimeMode: "approval-required",
    };

    expect(undoComposerDraftMergeState({ [draftKey]: merged }, draftKey, snapshot, merged)).toEqual(
      { [draftKey]: snapshot },
    );
    expect(
      undoComposerDraftMergeState(
        { [draftKey]: merged },
        draftKey,
        { text: "", attachments: [] },
        merged,
      ),
    ).toEqual({});
  });

  it("persists an async merge rollback with the existing per-draft model selection", async () => {
    const draftKey = "environment-1:thread-1";
    const snapshot: ComposerDraft = {
      text: "typed before",
      attachments: [],
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6-sol" },
    };
    const merged: ComposerDraft = {
      ...snapshot,
      text: "typed before\n\nqueued text",
      attachments: [],
    };
    composerDraftFileMocks.setDocument({
      schemaVersion: 1,
      drafts: { [draftKey]: merged },
    });

    resetComposerDraftsLoadState();
    await undoComposerDraftMerge(draftKey, snapshot, merged);

    expect(JSON.parse(composerDraftFileMocks.getDocument())).toEqual({
      schemaVersion: 1,
      drafts: { [draftKey]: snapshot },
    });
  });

  it("returns merge-written settings to the snapshot but keeps user-edited ones", () => {
    const draftKey = "environment-1:thread-1";
    const snapshot: ComposerDraft = {
      text: "typed before",
      attachments: [],
      runtimeMode: "approval-required",
      interactionMode: "default",
    };
    const merged: ComposerDraft = {
      text: "typed before\n\nqueued text",
      attachments: [],
      runtimeMode: "full-access",
      interactionMode: "default",
    };
    // The user edited the text (forcing the partial undo) and also switched
    // interaction mode, but never touched the merge-written runtime mode.
    const edited: ComposerDraft = {
      text: "typed EDITED before\n\nqueued text",
      attachments: [],
      runtimeMode: "full-access",
      interactionMode: "plan",
    };

    expect(undoComposerDraftMergeState({ [draftKey]: edited }, draftKey, snapshot, merged)).toEqual(
      {
        [draftKey]: {
          text: "typed EDITED before",
          attachments: [],
          runtimeMode: "approval-required",
          interactionMode: "plan",
        },
      },
    );
  });

  it("takes out only what the merge inserted when the user edited during it", () => {
    const draftKey = "environment-1:thread-1";
    const keptAttachment = {
      id: "kept",
      type: "file" as const,
      name: "kept.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      fileUri: "file:///documents/t3-composer-attachments/kept.pdf",
    };
    const insertedAttachment = {
      id: "inserted",
      type: "file" as const,
      name: "inserted.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      fileUri: "file:///documents/t3-composer-attachments/inserted.pdf",
    };
    const userAttachment = { ...keptAttachment, id: "user-added" };
    const snapshot: ComposerDraft = { text: "typed before", attachments: [keptAttachment] };
    const merged: ComposerDraft = {
      text: "typed before\n\nqueued text",
      attachments: [keptAttachment, insertedAttachment],
    };
    // The user rewrote the leading text and attached a file mid-recovery.
    const edited: ComposerDraft = {
      text: "typed EDITED before\n\nqueued text",
      attachments: [keptAttachment, insertedAttachment, userAttachment],
    };

    expect(undoComposerDraftMergeState({ [draftKey]: edited }, draftKey, snapshot, merged)).toEqual(
      {
        [draftKey]: {
          text: "typed EDITED before",
          attachments: [keptAttachment, userAttachment],
        },
      },
    );

    // Edits that broke the merged suffix keep their text untouched; only the
    // inserted attachments still come out.
    const rewritten: ComposerDraft = {
      text: "totally rewritten",
      attachments: [insertedAttachment],
    };
    expect(
      undoComposerDraftMergeState({ [draftKey]: rewritten }, draftKey, snapshot, merged),
    ).toEqual({
      [draftKey]: { text: "totally rewritten", attachments: [] },
    });
  });

  it("keeps text appended after a merge when rolling it back", () => {
    const draftKey = "environment-1:thread-1";
    const snapshot: ComposerDraft = { text: "typed before", attachments: [] };
    const content = { text: "queued text", attachments: [] };
    const merged = mergeComposerDraftContentState({ [draftKey]: snapshot }, draftKey, content)[
      draftKey
    ]!;
    const edited: ComposerDraft = {
      ...merged,
      text: `${merged.text}\n\nuser follow-up`,
    };

    const rolledBack = undoComposerDraftMergeState(
      { [draftKey]: edited },
      draftKey,
      snapshot,
      merged,
    );

    expect(rolledBack[draftKey]?.text).toBe("typed before\n\nuser follow-up");
    const retried = mergeComposerDraftContentState(rolledBack, draftKey, content);
    expect(retried[draftKey]?.text.match(/queued text/g)).toHaveLength(1);
  });

  it("spares a file re-owned between the sweep's scan and its deletion", async () => {
    const outboxLoad = vi.spyOn(threadOutboxManager, "load").mockResolvedValue(true);
    onTestFinished(() => outboxLoad.mockRestore());
    const fileFor = (id: string) => ({
      id,
      type: "file" as const,
      name: `${id}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: `file:///documents/t3-composer-attachments/${id}.pdf`,
    });
    const first = fileFor("file-first");
    const reowned = fileFor("file-reowned");
    // A restore re-owns the second file while the first deletion is in
    // flight, after the sweep already decided both were unused.
    composerAttachmentCleanupMocks.remove.mockImplementationOnce(async () => {
      appAtomRegistry.set(composerDraftsAtom, {
        "environment-1:thread-1": { text: "restored", attachments: [reowned] },
      });
    });

    await releaseUnusedComposerAttachmentFiles([first, reowned]);

    expect(composerAttachmentCleanupMocks.remove.mock.calls).toEqual([[first.fileUri]]);
  });

  // Uses a fresh module instance (hydration is one-shot), so it stays last.
  it("hydrates persisted drafts before a cold-start sweep deletes their files", async () => {
    const file = {
      id: "file-cold-start",
      type: "file" as const,
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
      fileUri: "file:///documents/t3-composer-attachments/report.pdf",
    };
    composerDraftFileMocks.setDocument({
      schemaVersion: 1,
      drafts: {
        "environment-1:thread-1": { text: "Persisted draft", attachments: [file] },
      },
    });
    vi.resetModules();
    const fresh = await import("./use-composer-drafts");
    const freshRegistry = (await import("./atom-registry")).appAtomRegistry;

    await fresh.releaseUnusedComposerAttachmentFiles([file]);

    expect(freshRegistry.get(fresh.composerDraftsAtom)).toEqual({
      "environment-1:thread-1": { text: "Persisted draft", attachments: [file] },
    });
    expect(composerAttachmentCleanupMocks.remove).not.toHaveBeenCalled();
  });
});
