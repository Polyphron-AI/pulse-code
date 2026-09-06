import {
  type EnvironmentId,
  type ExecutionEnvironmentDescriptor,
  WS_METHODS,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import type { EnvironmentUnaryRpcTag } from "../rpc/client.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

export interface MailEnvironmentTarget<Input> {
  readonly environmentId: EnvironmentId;
  readonly input: Input;
}

export const supportsMail = (descriptor: ExecutionEnvironmentDescriptor) =>
  descriptor.capabilities.mail === true;

/** Every query and command uses the authenticated connection of its owning environment. */
export function createMailEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial",
    key: (target: { readonly environmentId: EnvironmentId }) => target.environmentId,
  } as const;
  const query = <Tag extends Extract<EnvironmentUnaryRpcTag, `mail.${string}`>>(
    tag: Tag,
    refreshIntervalMs?: number,
  ) =>
    createEnvironmentRpcQueryAtomFamily(runtime, {
      label: `environment-data:${tag}`,
      tag,
      staleTimeMs: 15_000,
      idleTtlMs: 60_000,
      ...(refreshIntervalMs === undefined ? {} : { refreshIntervalMs }),
    });
  const command = <Tag extends Extract<EnvironmentUnaryRpcTag, `mail.${string}`>>(tag: Tag) =>
    createEnvironmentRpcCommand(runtime, {
      label: `environment-data:${tag}`,
      tag,
      scheduler,
      concurrency,
    });

  return {
    getPeopleContext: query(WS_METHODS.mailGetPeopleContext, 30_000),
    reviewPerson: command(WS_METHODS.mailReviewPerson),
    savePeopleWork: command(WS_METHODS.mailSavePeopleWork),
    reviewConnection: command(WS_METHODS.mailReviewConnection),
    getStatus: query(WS_METHODS.mailGetStatus, 30_000),
    listFolders: query(WS_METHODS.mailListFolders),
    listMessages: query(WS_METHODS.mailListMessages, 60_000),
    readMessage: query(WS_METHODS.mailReadMessage),
    listDrafts: query(WS_METHODS.mailListDrafts, 30_000),
    getDraft: query(WS_METHODS.mailGetDraft),
    listOutbox: query(WS_METHODS.mailListOutbox, 30_000),
    setEnabled: command(WS_METHODS.mailSetEnabled),
    saveAccount: command(WS_METHODS.mailSaveAccount),
    disconnectAccount: command(WS_METHODS.mailDisconnectAccount),
    createFolder: command(WS_METHODS.mailCreateFolder),
    renameFolder: command(WS_METHODS.mailRenameFolder),
    deleteFolder: command(WS_METHODS.mailDeleteFolder),
    actOnMessages: command(WS_METHODS.mailActOnMessages),
    saveMetadata: command(WS_METHODS.mailSaveMetadata),
    saveDraft: command(WS_METHODS.mailSaveDraft),
    deleteDraft: command(WS_METHODS.mailDeleteDraft),
    sendDraft: command(WS_METHODS.mailSendDraft),
    downloadAttachment: command(WS_METHODS.mailDownloadAttachment),
    downloadOriginal: command(WS_METHODS.mailDownloadOriginal),
  };
}
