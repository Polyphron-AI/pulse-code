import { useEffect, useMemo, useState } from "react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import {
  OrchestrationSwitchThreadProviderError,
  type EnvironmentId,
  type ModelSelection,
  type OrchestrationSessionStatus,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import { ArrowLeftRightIcon, LoaderCircleIcon, SquareIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "~/components/ui/collapsible";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { toastManager } from "~/components/ui/toast";
import { orchestrationEnvironment } from "~/state/orchestration";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import type { ProviderInstanceEntry } from "~/providerInstances";

import {
  THREAD_HANDOFF_DEFAULT_INSTRUCTION,
  isThreadHandoffSendBlocked,
  resolveThreadHandoffBasisNote,
  resolveThreadHandoffErrorMessage,
  resolveThreadHandoffModelLabel,
} from "./threadHandoff.logic";

const isSwitchThreadProviderError = Schema.is(OrchestrationSwitchThreadProviderError);

/**
 * "Switch to <provider / model>" sheet. Previews the handoff digest the
 * server would send the destination model, lets the user tweak the first
 * instruction, and dispatches `switchThreadProvider` on submit. Rendered by
 * `ChatView` whenever the model picker or a "Switch model" entry point routes
 * a pick here instead of changing the composer draft in place.
 */
export function ThreadHandoffSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: EnvironmentId;
  threadId: ThreadId;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  fromModelSelection: ModelSelection | null;
  toInstanceId: ProviderInstanceId;
  toModel: string;
  sessionStatus: OrchestrationSessionStatus | null;
  onInterrupt: () => void;
  onSwitched: (instruction: string) => void;
}) {
  const { open, toInstanceId, toModel } = props;
  const [instruction, setInstruction] = useState(THREAD_HANDOFF_DEFAULT_INSTRUCTION);
  const [showDigestText, setShowDigestText] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInstruction(THREAD_HANDOFF_DEFAULT_INSTRUCTION);
    setShowDigestText(false);
    setSubmitError(null);
  }, [open, toInstanceId, toModel]);

  const previewTarget = useMemo(
    () =>
      open
        ? {
            environmentId: props.environmentId,
            input: {
              threadId: props.threadId,
              toModelSelection: { instanceId: toInstanceId, model: toModel },
            },
          }
        : null,
    [open, props.environmentId, props.threadId, toInstanceId, toModel],
  );
  const preview = useEnvironmentQuery(
    previewTarget === null ? null : orchestrationEnvironment.threadHandoffPreview(previewTarget),
  );
  const digest = preview.data?.digest ?? null;

  const switchThreadProvider = useAtomCommand(orchestrationEnvironment.switchThreadProvider, {
    reportFailure: false,
  });

  const toLabel = resolveThreadHandoffModelLabel(props.instanceEntries, {
    instanceId: toInstanceId,
    model: toModel,
  });
  const title = toLabel
    ? `Switch to ${toLabel.providerLabel} / ${toLabel.modelLabel}`
    : "Switch model";
  const basisNote = digest
    ? resolveThreadHandoffBasisNote(digest.basis, toLabel?.modelLabel ?? toModel)
    : null;
  const sendBlocked = isThreadHandoffSendBlocked(props.sessionStatus);
  const canSubmit = !pending && !sendBlocked && instruction.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setSubmitError(null);
    const trimmedInstruction = instruction.trim();
    const result = await switchThreadProvider({
      environmentId: props.environmentId,
      input: {
        threadId: props.threadId,
        toModelSelection: { instanceId: toInstanceId, model: toModel },
        nextInstruction: trimmedInstruction,
        ...(digest ? { digest } : {}),
      },
    });
    setPending(false);
    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) return;
      const failure = squashAtomCommandFailure(result);
      const reason = isSwitchThreadProviderError(failure) ? failure.reason : null;
      const rawMessage = failure instanceof Error ? failure.message : "Could not switch models.";
      const message = resolveThreadHandoffErrorMessage(reason, rawMessage);
      setSubmitError(message);
      toastManager.add({ type: "error", title: "Switch failed", description: message });
      return;
    }
    props.onOpenChange(false);
    props.onSwitched(trimmedInstruction);
  };

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : props.onOpenChange}>
      <DialogPopup className="max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRightIcon className="size-4.5 text-muted-foreground" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Starts a new session with this model. It gets a digest of the conversation so far, then
            your next instruction below.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          {preview.isPending ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircleIcon className="size-3.5 animate-spin" />
              Building the handoff digest…
            </div>
          ) : preview.error ? (
            <p className="text-xs text-destructive">{preview.error}</p>
          ) : digest ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{digest.messageCount - digest.omittedCount} messages included</span>
                <span>{digest.omittedCount} older summarized</span>
                <span>{digest.files.length} files</span>
              </div>
              {basisNote ? (
                <p
                  className={
                    basisNote.tone === "warning"
                      ? "flex items-start gap-1.5 text-xs text-warning-foreground"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {basisNote.tone === "warning" ? (
                    <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                  ) : null}
                  {basisNote.text}
                </p>
              ) : null}
              <Collapsible open={showDigestText} onOpenChange={setShowDigestText}>
                <CollapsibleTrigger
                  render={<Button size="xs" variant="ghost-muted" className="px-1.5" />}
                >
                  {showDigestText ? "Hide" : "Show"} what the new model will receive
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/25 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                    {digest.text}
                  </pre>
                </CollapsiblePanel>
              </Collapsible>
            </div>
          ) : null}
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            Next instruction
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.currentTarget.value)}
              disabled={pending}
              className="min-h-20"
            />
          </label>
          {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}
        </DialogPanel>
        <DialogFooter>
          {sendBlocked ? (
            <div className="flex w-full flex-col-reverse items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
              <span className="text-xs text-muted-foreground">Stop the current turn first</span>
              <Button variant="outline" onClick={props.onInterrupt}>
                <SquareIcon className="size-3.5" />
                Stop
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => props.onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button disabled={!canSubmit} onClick={() => void submit()}>
                {pending ? <LoaderCircleIcon className="animate-spin" /> : <ArrowLeftRightIcon />}
                Switch and send
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
