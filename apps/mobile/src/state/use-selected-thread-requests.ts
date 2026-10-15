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
import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type ProviderApprovalDecision, type RuntimeRequestId } from "@t3tools/contracts";
import {
  type PendingThreadRequests,
  type ThreadUserInputQuestion,
} from "@t3tools/client-runtime/state/thread-requests";
import { Atom } from "effect/unstable/reactivity";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import {
  createThreadMailApprovalsAtomFamily,
  respondToMailApproval,
  visibleMailApprovals,
} from "@t3tools/client-runtime/mail/approvals";
import {
  createEnvironmentCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { MailError, type MailApprovalId, type MailSendApproval } from "@t3tools/contracts";

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
import { useSelectedThreadPendingRequests } from "./use-thread-detail";
import { useThreadSelection } from "./use-thread-selection";
import { useAtomCommand } from "./use-atom-command";

const EMPTY_PENDING_REQUESTS: PendingThreadRequests = { approvals: [], userInputs: [] };

const userInputDraftsByRequestKeyAtom = Atom.make<
  Record<string, Record<string, PendingUserInputDraftAnswer>>
>({}).pipe(Atom.keepAlive, Atom.withLabel("mobile:user-input-drafts"));

function setUserInputDraftOption(
  requestKey: string,
  question: ThreadUserInputQuestion,
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
  question: ThreadUserInputQuestion,
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
  const pendingRequests = useSelectedThreadPendingRequests();
  const userInputDraftsByRequestKey = useAtomValue(userInputDraftsByRequestKeyAtom);
  const userInputResponsesInFlight = useRef(new Set<string>());
  const [respondingApprovalId, setRespondingApprovalId] = useState<RuntimeRequestId | null>(null);
  const [respondingUserInputId, setRespondingUserInputId] = useState<RuntimeRequestId | null>(null);

  const activePendingApprovals = pendingRequests?.approvals ?? EMPTY_PENDING_REQUESTS.approvals;
  const activePendingApproval = activePendingApprovals[0] ?? null;
  const activePendingUserInputs = pendingRequests?.userInputs ?? EMPTY_PENDING_REQUESTS.userInputs;
  const activePendingUserInput = activePendingUserInputs[0] ?? null;
  const questionServerConfigs = useServerConfigs();
  const attachmentDrafts = useAtomValue(composerDraftsAtom);
  const preparationCounts = useAtomValue(questionAttachmentPreparationAtom);
  const uploadStates = useAtomValue(composerAttachmentUploadsAtom);
  useEffect(() => {
    if (!selectedThreadShell || !pendingRequests) return;
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
  }, [activePendingUserInputs, attachmentDrafts, pendingRequests, selectedThreadShell]);
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
    (requestId: RuntimeRequestId, question: ThreadUserInputQuestion, value: string) => {
      if (!selectedThreadShell) {
        return;
      }

      const requestKey = scopedRequestKey(selectedThreadShell.environmentId, requestId);
      setUserInputDraftOption(requestKey, question, value);
    },
    [selectedThreadShell],
  );

  const onChangeUserInputCustomAnswer = useCallback(
    (requestId: RuntimeRequestId, questionId: string, customAnswer: string) => {
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
    async (requestId: RuntimeRequestId, decision: ProviderApprovalDecision) => {
      if (!selectedThreadShell) {
        return;
      }
      if (
        activePendingApprovals.find((approval) => approval.requestId === requestId)
          ?.responseCapability !== "live"
      ) {
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
    [activePendingApprovals, respondToApproval, selectedThreadShell],
  );

  const onSubmitUserInput = useCallback(async () => {
    if (
      !selectedThreadShell ||
      !activePendingUserInput ||
      activePendingUserInput.responseCapability === "not_resumable" ||
      !activePendingUserInputAnswers
    ) {
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

const respondMailApproval = createEnvironmentCommand(connectionAtomRuntime, {
  label: "mobile:mail-approval:respond",
  execute: (input: { approval: MailSendApproval; decision: "approve" | "decline" }) =>
    EnvironmentSupervisor.EnvironmentSupervisor.pipe(
      Effect.flatMap((env) => respondToMailApproval(env, input)),
    ),
});

const threadMailApprovals = createThreadMailApprovalsAtomFamily(connectionAtomRuntime);

const NO_THREAD_MAIL_APPROVALS = Atom.make(AsyncResult.initial<never, never>(false)).pipe(
  Atom.withLabel("mobile:mail-approvals:none"),
);
const NO_APPROVALS: ReadonlyArray<MailSendApproval> = [];
const NOT_SEEN: ReadonlySet<MailApprovalId> = new Set();
const NOT_ANSWERED: ReadonlyMap<MailApprovalId, MailSendApproval> = new Map();
const isMailError = Schema.is(MailError);

export type MailApprovalEntry =
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
 * Mail send approvals for the selected thread, pushed by servers that advertise mail. An approval
 * stays listed after it leaves the pending set, so the user sees its terminal state until they
 * leave the thread.
 */
export function useSelectedThreadMailApprovals() {
  const respond = useAtomCommand(respondMailApproval, "mail approval response");
  const { selectedThread } = useThreadSelection();
  const serverConfigs = useServerConfigs();
  const environmentId = selectedThread?.environmentId ?? null;
  const threadKey = selectedThread ? `${selectedThread.environmentId}:${selectedThread.id}` : null;
  const hasMail =
    selectedThread !== null &&
    serverConfigs.get(selectedThread.environmentId)?.pulseCapabilities?.mailManagement === true;
  const atom = hasMail
    ? threadMailApprovals({
        environmentId: selectedThread.environmentId,
        input: { threadId: selectedThread.id },
      })
    : NO_THREAD_MAIL_APPROVALS;
  const result = useAtomValue(atom);
  const onRetry = useAtomRefresh(atom);
  const listed = Option.getOrElse(AsyncResult.value(result), () => NO_APPROVALS);
  const [local, setLocal] = useState<{
    readonly threadKey: string | null;
    readonly seen: ReadonlySet<MailApprovalId>;
    readonly answered: ReadonlyMap<MailApprovalId, MailSendApproval>;
  }>({ threadKey: null, seen: NOT_SEEN, answered: NOT_ANSWERED });
  const [respondingId, setRespondingId] = useState<MailApprovalId | null>(null);
  const seen = local.threadKey === threadKey ? local.seen : NOT_SEEN;
  const answered = local.threadKey === threadKey ? local.answered : NOT_ANSWERED;
  const visible = useMemo(
    () => visibleMailApprovals(listed, seen, answered),
    [listed, seen, answered],
  );

  // Opening another thread starts over, so returning to this one does not bring back its
  // resolved approvals.
  useEffect(() => {
    if (local.threadKey !== threadKey || visible.some((approval) => !seen.has(approval.id))) {
      // oxlint-disable-next-line react/set-state-in-effect -- Remembers what was shown so it stays after resolving.
      setLocal({
        threadKey,
        seen: new Set([...seen, ...visible.map((approval) => approval.id)]),
        answered,
      });
    }
  }, [answered, local.threadKey, seen, threadKey, visible]);

  const onRespond = useCallback(
    async (approval: MailSendApproval, decision: "approve" | "decline") => {
      if (environmentId === null) return;
      const key = threadKey;
      setRespondingId(approval.id);
      const result = await respond({ environmentId, input: { approval, decision } });
      setRespondingId((current) => (current === approval.id ? null : current));
      // A failed answer needs no refetch: any change it made on the server is pushed.
      if (!AsyncResult.isSuccess(result)) return;
      setLocal((current) =>
        current.threadKey === key
          ? { ...current, answered: new Map(current.answered).set(approval.id, result.value) }
          : current,
      );
    },
    [environmentId, respond, threadKey],
  );

  const approvals: Array<readonly [string, MailApprovalEntry]> = visible.map((approval) => [
    approval.id,
    { kind: "loaded", approval },
  ]);
  if (result._tag === "Failure") {
    if (isDecodeFailure(squashAtomCommandFailure(result))) {
      approvals.push(["outdated", { kind: "outdated" }]);
    } else if (Option.exists(Cause.findErrorOption(result.cause), isMailError)) {
      approvals.push(["error", { kind: "error" }]);
    }
  }
  return { approvals, respondingId, onRespond, onRetry };
}
