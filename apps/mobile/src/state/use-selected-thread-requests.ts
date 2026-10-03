import { derivePendingRequests } from "@t3tools/client-runtime/pending-requests";
import { useServerConfigs } from "./entities";
import { Alert } from "react-native";
import {
  questionAttachmentDraftKey,
  questionAttachmentDraftPrefix,
  questionAttachmentPreparationAtom,
} from "./question-attachments";
import { composerDraftsAtom, clearComposerDraft } from "./use-composer-drafts";
import {
  composerAttachmentUploadsAtom,
  composerAttachmentUploadBlockReason,
  composerAttachmentsStillUploading,
} from "./composer-attachment-uploads";
import { useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ApprovalRequestId,
  type ProviderApprovalDecision,
  type UserInputQuestion,
} from "@t3tools/contracts";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import * as Effect from "effect/Effect";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import {
  derivePendingMailApprovalIds,
  fetchMailApproval,
  respondToMailApproval,
} from "@t3tools/client-runtime/mail/approvals";
import {
  createEnvironmentCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { MailApprovalId, MailSendApproval } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

import { threadEnvironment } from "../state/threads";
import { scopedRequestKey } from "../lib/scopedEntities";
import {
  buildPendingUserInputAnswers,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "../lib/threadActivity";
import { appAtomRegistry } from "./atom-registry";
import { useSelectedThreadDetail } from "./use-thread-detail";
import { useThreadSelection } from "./use-thread-selection";
import { useAtomCommand } from "./use-atom-command";

const userInputDraftsByRequestKeyAtom = Atom.make<
  Record<string, Record<string, PendingUserInputDraftAnswer>>
>({}).pipe(Atom.keepAlive, Atom.withLabel("mobile:user-input-drafts"));

function setUserInputDraftOption(
  requestKey: string,
  question: UserInputQuestion,
  value: string,
): void {
  const current = appAtomRegistry.get(userInputDraftsByRequestKeyAtom);
  appAtomRegistry.set(userInputDraftsByRequestKeyAtom, {
    ...current,
    [requestKey]: {
      ...current[requestKey],
      [question.id]: togglePendingUserInputOptionSelection(
        question,
        current[requestKey]?.[question.id],
        value,
      ),
    },
  });
}

function setUserInputDraftCustomAnswer(
  requestKey: string,
  question: UserInputQuestion,
  customAnswer: string,
): void {
  const current = appAtomRegistry.get(userInputDraftsByRequestKeyAtom);
  appAtomRegistry.set(userInputDraftsByRequestKeyAtom, {
    ...current,
    [requestKey]: {
      ...current[requestKey],
      [question.id]: setPendingUserInputCustomAnswer(
        question,
        current[requestKey]?.[question.id],
        customAnswer,
      ),
    },
  });
}

export function useSelectedThreadRequests() {
  const respondToApproval = useAtomCommand(
    threadEnvironment.respondToApproval,
    "thread approval response",
  );
  const respondToUserInput = useAtomCommand(
    threadEnvironment.respondToUserInput,
    "thread user input response",
  );
  const dismissUserInput = useAtomCommand(
    threadEnvironment.dismissUserInput,
    "thread user input dismissal",
  );
  const { selectedThread: selectedThreadShell } = useThreadSelection();
  const selectedThread = useSelectedThreadDetail();
  const userInputDraftsByRequestKey = useAtomValue(userInputDraftsByRequestKeyAtom);
  const [respondingApprovalId, setRespondingApprovalId] = useState<ApprovalRequestId | null>(null);
  const userInputResponsesInFlight = useRef(new Set<string>());
  const [respondingUserInputId, setRespondingUserInputId] = useState<ApprovalRequestId | null>(
    null,
  );

  const { approvals: activePendingApprovals, userInputs: activePendingUserInputs } = useMemo(
    () => derivePendingRequests(selectedThread?.activities ?? []),
    [selectedThread?.activities],
  );
  const activePendingApproval = activePendingApprovals[0] ?? null;
  const activePendingUserInput = activePendingUserInputs[0] ?? null;
  const questionServerConfigs = useServerConfigs();
  const attachmentDrafts = useAtomValue(composerDraftsAtom);
  const preparationCounts = useAtomValue(questionAttachmentPreparationAtom);
  const uploadStates = useAtomValue(composerAttachmentUploadsAtom);
  useEffect(() => {
    if (!selectedThreadShell || !selectedThread) return;
    const prefix = questionAttachmentDraftPrefix(
      selectedThreadShell.environmentId,
      selectedThreadShell.id,
    );
    const retained = new Set(
      activePendingUserInputs.flatMap((request) =>
        request.questions.map((question) =>
          questionAttachmentDraftKey(
            selectedThreadShell.environmentId,
            selectedThreadShell.id,
            request.requestId,
            question.id,
          ),
        ),
      ),
    );
    const counts = { ...appAtomRegistry.get(questionAttachmentPreparationAtom) };
    let changed = false;
    for (const key of new Set([...Object.keys(attachmentDrafts), ...Object.keys(counts)])) {
      if (!key.startsWith(prefix) || retained.has(key)) continue;
      if (attachmentDrafts[key]) clearComposerDraft(key);
      if (key in counts) {
        delete counts[key];
        changed = true;
      }
    }
    if (changed) appAtomRegistry.set(questionAttachmentPreparationAtom, counts);
  }, [activePendingUserInputs, attachmentDrafts, selectedThread, selectedThreadShell]);
  const activePendingUserInputDrafts =
    activePendingUserInput && selectedThreadShell
      ? Object.fromEntries(
          activePendingUserInput.questions.map((question) => {
            const key = questionAttachmentDraftKey(
              selectedThreadShell.environmentId,
              selectedThreadShell.id,
              activePendingUserInput.requestId,
              question.id,
            );
            const attachments = attachmentDrafts[key]?.attachments ?? [];
            const uploadInput = {
              environmentId: selectedThreadShell.environmentId,
              attachments,
              serverConfig: questionServerConfigs.get(selectedThreadShell.environmentId) ?? null,
              states: uploadStates,
            };
            return [
              question.id,
              {
                ...userInputDraftsByRequestKey[
                  scopedRequestKey(
                    selectedThreadShell.environmentId,
                    activePendingUserInput.requestId,
                  )
                ]?.[question.id],
                attachmentCount: attachments.length,
                attachmentsBlocked:
                  (attachments.length > 0 &&
                    questionServerConfigs.get(selectedThreadShell.environmentId)?.environment
                      .capabilities.questionAttachments !== true) ||
                  (preparationCounts[key] ?? 0) > 0 ||
                  composerAttachmentsStillUploading(uploadInput) ||
                  composerAttachmentUploadBlockReason({
                    ...uploadInput,
                    connected: true,
                  }) !== null,
              },
            ];
          }),
        )
      : {};
  const activePendingUserInputAnswers = activePendingUserInput
    ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingUserInputDrafts)
    : null;

  const onSelectUserInputOption = useCallback(
    (requestId: ApprovalRequestId, question: UserInputQuestion, value: string) => {
      if (!selectedThreadShell) {
        return;
      }

      const requestKey = scopedRequestKey(selectedThreadShell.environmentId, requestId);
      setUserInputDraftOption(requestKey, question, value);
    },
    [selectedThreadShell],
  );

  const onChangeUserInputCustomAnswer = useCallback(
    (requestId: ApprovalRequestId, questionId: string, customAnswer: string) => {
      const question = activePendingUserInputs
        .find((request) => request.requestId === requestId)
        ?.questions.find((entry) => entry.id === questionId);
      if (!selectedThreadShell || !question) {
        return;
      }

      const requestKey = scopedRequestKey(selectedThreadShell.environmentId, requestId);
      setUserInputDraftCustomAnswer(requestKey, question, customAnswer);
    },
    [activePendingUserInputs, selectedThreadShell],
  );

  const onRespondToApproval = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      if (!selectedThreadShell) {
        return;
      }

      setRespondingApprovalId(requestId);
      const result = await respondToApproval({
        environmentId: selectedThreadShell.environmentId,
        input: {
          threadId: selectedThreadShell.id,
          requestId,
          decision,
        },
      });
      setRespondingApprovalId((current) => (current === requestId ? null : current));
      return result;
    },
    [respondToApproval, selectedThreadShell],
  );

  const onSubmitUserInput = useCallback(async () => {
    if (!selectedThreadShell || !activePendingUserInput || !activePendingUserInputAnswers) {
      return;
    }

    const responseKey = questionAttachmentDraftKey(
      selectedThreadShell.environmentId,
      selectedThreadShell.id,
      activePendingUserInput.requestId,
      "",
    );
    if (userInputResponsesInFlight.current.has(responseKey)) return;
    const attachmentsByQuestionId = new Map<
      string,
      import("@t3tools/contracts").UserInputAttachments[string]
    >();
    for (const question of activePendingUserInput.questions) {
      const key = questionAttachmentDraftKey(
        selectedThreadShell.environmentId,
        selectedThreadShell.id,
        activePendingUserInput.requestId,
        question.id,
      );
      if ((appAtomRegistry.get(questionAttachmentPreparationAtom)[key] ?? 0) > 0) return;
      const attachments = appAtomRegistry.get(composerDraftsAtom)[key]?.attachments ?? [];
      if (attachments.length === 0) continue;
      if (
        attachments.some(
          (attachment) =>
            !attachment.uploadedAttachmentId ||
            attachment.uploadEnvironmentId !== selectedThreadShell.environmentId,
        )
      ) {
        Alert.alert(
          "Attachments are not ready",
          "Wait for uploads to finish, or retry failed uploads.",
        );
        return;
      }
      attachmentsByQuestionId.set(
        question.id,
        attachments.map((attachment) => ({
          type: attachment.type,
          id: attachment.uploadedAttachmentId!,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        })),
      );
    }
    userInputResponsesInFlight.current.add(responseKey);
    setRespondingUserInputId(activePendingUserInput.requestId);
    const result = await respondToUserInput({
      environmentId: selectedThreadShell.environmentId,
      input: {
        threadId: selectedThreadShell.id,
        requestId: activePendingUserInput.requestId,
        answers: activePendingUserInputAnswers,
        ...(attachmentsByQuestionId.size > 0
          ? { attachmentsByQuestionId: Object.fromEntries(attachmentsByQuestionId) }
          : {}),
      },
    });
    userInputResponsesInFlight.current.delete(responseKey);
    setRespondingUserInputId((current) =>
      current === activePendingUserInput.requestId ? null : current,
    );
    return result;
  }, [
    activePendingUserInput,
    activePendingUserInputAnswers,
    respondToUserInput,
    selectedThreadShell,
  ]);

  // Closes an async question without messaging the agent.
  const onDismissUserInput = useCallback(async () => {
    if (!selectedThreadShell || !activePendingUserInput) {
      return;
    }

    setRespondingUserInputId(activePendingUserInput.requestId);
    const result = await dismissUserInput({
      environmentId: selectedThreadShell.environmentId,
      input: {
        threadId: selectedThreadShell.id,
        requestId: activePendingUserInput.requestId,
      },
    });
    setRespondingUserInputId((current) =>
      current === activePendingUserInput.requestId ? null : current,
    );
    return result;
  }, [activePendingUserInput, dismissUserInput, selectedThreadShell]);

  return {
    activePendingApproval,
    activePendingUserInput,
    activePendingUserInputDrafts,
    activePendingUserInputAnswers,
    respondingApprovalId,
    respondingUserInputId,
    onRespondToApproval,
    onSelectUserInputOption,
    onChangeUserInputCustomAnswer,
    onSubmitUserInput,
    onDismissUserInput,
  };
}

const mailApprovalCommands = {
  fetch: createEnvironmentCommand(connectionAtomRuntime, {
    label: "mobile:mail-approval:fetch",
    execute: (approvalId: MailApprovalId) =>
      EnvironmentSupervisor.pipe(Effect.flatMap((env) => fetchMailApproval(env, approvalId))),
  }),
  respond: createEnvironmentCommand(connectionAtomRuntime, {
    label: "mobile:mail-approval:respond",
    execute: (input: { approval: MailSendApproval; decision: "approve" | "decline" }) =>
      EnvironmentSupervisor.pipe(Effect.flatMap((env) => respondToMailApproval(env, input))),
  }),
};

export type MailApprovalEntry =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly approval: MailSendApproval }
  /** The server sent a snapshot this app version cannot decode (A15). */
  | { readonly kind: "outdated" }
  | { readonly kind: "error" };

/** True when a failure came from decoding the server's reply rather than from the connection. */
function isDecodeFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && Predicate.isObject(current); depth += 1) {
    if (Schema.isSchemaError(current) || ("_tag" in current && current._tag === "SchemaError")) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

/**
 * Mail send approvals for the selected thread. An approval stays listed after it leaves the
 * pending set, refetched once, so the user sees its terminal state until they leave the thread.
 */
export function useSelectedThreadMailApprovals() {
  const fetchApproval = useAtomCommand(mailApprovalCommands.fetch, {
    label: "mail approval fetch",
    reportFailure: false,
  });
  const respond = useAtomCommand(mailApprovalCommands.respond, "mail approval response");
  const { selectedThread: selectedThreadShell } = useThreadSelection();
  const selectedThread = useSelectedThreadDetail();
  const environmentId = selectedThreadShell?.environmentId ?? null;
  const threadKey = selectedThreadShell
    ? `${selectedThreadShell.environmentId}:${selectedThreadShell.id}`
    : null;
  const pendingIds = useMemo(
    () => derivePendingMailApprovalIds(selectedThread?.activities ?? []),
    [selectedThread?.activities],
  );
  const [entries, setEntries] = useState<{
    readonly threadKey: string | null;
    readonly byId: ReadonlyMap<MailApprovalId, MailApprovalEntry>;
  }>({ threadKey: null, byId: new Map() });
  const [respondingId, setRespondingId] = useState<MailApprovalId | null>(null);
  const fetchedAsPending = useRef(new Map<MailApprovalId, boolean>());
  const fetchedThreadKey = useRef<string | null>(null);

  const load = useCallback(
    async (approvalId: MailApprovalId) => {
      if (environmentId === null) return;
      const key = threadKey;
      const result = await fetchApproval({ environmentId, input: approvalId });
      const entry: MailApprovalEntry = AsyncResult.isSuccess(result)
        ? { kind: "loaded", approval: result.value }
        : isDecodeFailure(squashAtomCommandFailure(result))
          ? { kind: "outdated" }
          : { kind: "error" };
      setEntries((current) => ({
        threadKey: key,
        byId: new Map(current.threadKey === key ? current.byId : []).set(approvalId, entry),
      }));
    },
    [environmentId, fetchApproval, threadKey],
  );

  useEffect(() => {
    if (fetchedThreadKey.current !== threadKey) {
      fetchedThreadKey.current = threadKey;
      fetchedAsPending.current = new Map();
    }
    const pending = new Set(pendingIds);
    for (const id of pending) {
      if (fetchedAsPending.current.get(id) === true) continue;
      fetchedAsPending.current.set(id, true);
      void load(id);
    }
    // Resolved elsewhere or by us: refetch once to show the terminal state.
    for (const [id, wasPending] of fetchedAsPending.current) {
      if (!wasPending || pending.has(id)) continue;
      fetchedAsPending.current.set(id, false);
      void load(id);
    }
  }, [load, pendingIds, threadKey]);

  const onRespond = useCallback(
    async (approval: MailSendApproval, decision: "approve" | "decline") => {
      if (environmentId === null) return;
      const key = threadKey;
      setRespondingId(approval.id);
      const result = await respond({ environmentId, input: { approval, decision } });
      setRespondingId((current) => (current === approval.id ? null : current));
      if (AsyncResult.isSuccess(result)) {
        setEntries((current) =>
          current.threadKey === key
            ? {
                threadKey: key,
                byId: new Map(current.byId).set(approval.id, {
                  kind: "loaded",
                  approval: result.value,
                }),
              }
            : current,
        );
      } else {
        // A digest mismatch or expiry changed the approval; show the server's current view.
        void load(approval.id);
      }
    },
    [environmentId, load, respond, threadKey],
  );

  const byId = entries.threadKey === threadKey ? entries.byId : new Map();
  const approvals: Array<readonly [MailApprovalId, MailApprovalEntry]> = [...byId];
  for (const id of pendingIds) {
    if (!byId.has(id)) approvals.push([id, { kind: "loading" }]);
  }
  return { approvals, respondingId, onRespond, onRetry: load };
}
