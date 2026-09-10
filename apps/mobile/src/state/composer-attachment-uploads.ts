import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import { useEffect, useRef } from "react";

import { prepareTurnAttachments } from "../lib/attachmentUpload";
import { isFileBackedComposerAttachment } from "../lib/composerImages";
import {
  composerAttachmentUploadKey,
  composerDraftEnvironmentId,
  canUploadComposerAttachment,
  createComposerAttachmentUploadQueue,
  type ComposerAttachmentUploadState,
} from "../lib/composerAttachmentUploadQueue";
import { appAtomRegistry } from "./atom-registry";
import { useServerConfigs } from "./entities";
import { flattenQueuedThreadMessages } from "./thread-outbox";
import { useThreadOutboxMessages } from "./use-thread-outbox";
import {
  composerDraftsAtom,
  composerCloudDraftsAtom,
  ensureComposerDraftsLoaded,
  retainComposerAttachmentFileForPreview,
  persistComposerAttachmentUpload,
} from "./use-composer-drafts";
import { useRemoteConnectionStatus } from "./use-remote-environment-registry";

export {
  composerAttachmentUploadBlockReason,
  composerAttachmentsStillUploading,
} from "../lib/composerAttachmentUploadQueue";

export const composerAttachmentUploadsAtom = Atom.make<
  Readonly<Record<string, ComposerAttachmentUploadState>>
>({}).pipe(Atom.keepAlive);
const uploadStateAtom = Atom.family((key: string) =>
  Atom.map(composerAttachmentUploadsAtom, (states) => states[key]),
);
let uploadQueue: ReturnType<typeof createComposerAttachmentUploadQueue> | null = null;

export function useComposerAttachmentUploadState(
  environmentId: EnvironmentId | undefined,
  attachmentId: string,
) {
  return useAtomValue(
    uploadStateAtom(environmentId ? composerAttachmentUploadKey(environmentId, attachmentId) : ""),
  );
}

export function retryComposerAttachmentUpload(environmentId: EnvironmentId, attachmentId: string) {
  uploadQueue?.retry(environmentId, attachmentId);
}

/** Runs outside mounted composers so a transfer can finish after navigation. */
export function useComposerAttachmentUploadWorker() {
  const drafts = useAtomValue(composerDraftsAtom);
  const accountId = useAtomValue(composerCloudDraftsAtom).accountId;
  const queuedMessages = useThreadOutboxMessages();
  const serverConfigs = useServerConfigs();
  const { connectedEnvironments } = useRemoteConnectionStatus();
  const queueRef = useRef<ReturnType<typeof createComposerAttachmentUploadQueue> | null>(null);

  useEffect(() => {
    ensureComposerDraftsLoaded();
    const queue = createComposerAttachmentUploadQueue({
      onChange: (states) => appAtomRegistry.set(composerAttachmentUploadsAtom, states),
      upload: async ({ environmentId, attachment }, signal, onProgress) => {
        const release = isFileBackedComposerAttachment(attachment)
          ? retainComposerAttachmentFileForPreview(attachment)
          : undefined;
        try {
          const result = await prepareTurnAttachments({
            environmentId,
            attachments: [attachment],
            supportsImageUploads: true,
            signal,
            onUploadProgress: (_, progress) => onProgress(progress),
            persistUploadedReferences: async ([uploaded]) =>
              uploaded
                ? persistComposerAttachmentUpload({
                    accountId,
                    environmentId,
                    original: attachment,
                    uploaded,
                    signal,
                  })
                : "abandon",
          });
          return result.status === "ready";
        } finally {
          release?.();
        }
      },
    });
    queueRef.current = queue;
    uploadQueue = queue;
    return () => {
      queue.dispose();
      if (uploadQueue === queue) uploadQueue = null;
      queueRef.current = null;
    };
  }, [accountId]);

  useEffect(() => {
    const queued = flattenQueuedThreadMessages(queuedMessages);
    const connected = new Set(
      connectedEnvironments
        .filter((environment) => environment.connectionState === "connected")
        .map((environment) => environment.environmentId),
    );
    const requests = Object.entries(drafts).flatMap(([key, draft]) => {
      const environmentId = composerDraftEnvironmentId(key, queued, draft);
      if (environmentId === null || !connected.has(environmentId)) return [];
      return draft.attachments
        .filter((attachment) =>
          canUploadComposerAttachment(attachment, serverConfigs.get(environmentId)),
        )
        .map((attachment) => ({ environmentId, attachment }));
    });
    queueRef.current?.sync(requests);
  }, [accountId, connectedEnvironments, drafts, queuedMessages, serverConfigs]);
}
