import type { EnvironmentId, MailAccount, MailDraft, MailSendReceipt } from "@t3tools/contracts";
import {
  parseMailRecipients,
  splitMailRecipients,
} from "@t3tools/client-runtime/state/mail-compose";
import { useBlocker } from "@tanstack/react-router";
import { PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mailEnvironment } from "../../state/mail";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { fileAsBase64, formatMailSize } from "./mailPresentation";
import { mailFailure } from "./MailSetup";
import { randomUUID } from "../../lib/utils";
import { appAtomRegistry } from "../../rpc/atomRegistry";

export function MailComposer({
  environmentId,
  account,
  initial,
  attachmentLimit,
  available = true,
  onClose,
  onChanged,
  onSetupSending,
  sendReceipt,
}: {
  environmentId: EnvironmentId;
  account: MailAccount;
  initial: { id?: string; revision: number; content: MailDraft["content"] };
  attachmentLimit: number;
  available?: boolean;
  onClose: () => void;
  onChanged: () => void;
  onSetupSending: (draft: MailDraft) => void;
  sendReceipt?: MailSendReceipt | null;
}) {
  const saveDraft = useAtomCommand(mailEnvironment.saveDraft, { reportFailure: false });
  const sendDraft = useAtomCommand(mailEnvironment.sendDraft, { reportFailure: false });
  const deleteDraft = useAtomCommand(mailEnvironment.deleteDraft, { reportFailure: false });
  const [content, setContent] = useState(initial.content);
  const [to, setTo] = useState(initial.content.to.join(", "));
  const [cc, setCc] = useState(initial.content.cc.join(", "));
  const [bcc, setBcc] = useState(initial.content.bcc.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(Boolean(initial.id));
  const [receipt, setReceipt] = useState<MailSendReceipt | null>(sendReceipt ?? null);
  const [unknownSend, setUnknownSend] = useState(false);
  const operation = useRef<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const identity = useRef({ id: initial.id, revision: initial.revision });
  const halted = useRef(false);
  const chain = useRef<Promise<MailDraft | null>>(Promise.resolve(null));
  const persisted = useRef(initial.id ? JSON.stringify(initial.content) : "");
  const latest = useRef(content);
  // Drafts preserve unfinished recipients. Sending performs strict validation.
  latest.current = {
    ...content,
    to: splitMailRecipients(to),
    cc: splitMailRecipients(cc),
    bcc: splitMailRecipients(bcc),
  };
  const signature = JSON.stringify(latest.current);
  const frozenSend = unknownSend || (receipt !== null && receipt.state !== "failed");
  useEffect(() => {
    if (sendReceipt)
      setReceipt((previous) =>
        !previous || sendReceipt.updatedAt >= previous.updatedAt ? sendReceipt : previous,
      );
  }, [sendReceipt]);

  const persist = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (halted.current) return null;
      const snapshot = latest.current;
      const snapshotKey = JSON.stringify(snapshot);
      if (persisted.current === snapshotKey && identity.current.id)
        return {
          id: identity.current.id,
          revision: identity.current.revision,
          content: snapshot,
          updatedAt: "",
        };
      setSaving(true);
      const result = await saveDraft({
        environmentId,
        input: { ...identity.current, content: snapshot },
      });
      setSaving(false);
      if (result._tag === "Failure") {
        halted.current = true;
        setError(
          `${mailFailure(result)} Your unsaved text remains here. Retry after checking the saved draft on your other device.`,
        );
        return null;
      }
      identity.current = { id: result.value.id, revision: result.value.revision };
      persisted.current = snapshotKey;
      appAtomRegistry.refresh(
        mailEnvironment.getDraft({ environmentId, input: { id: result.value.id } }),
      );
      setSaved(JSON.stringify(latest.current) === snapshotKey);
      onChanged();
      return result.value;
    });
    return chain.current;
  }, [environmentId, onChanged, saveDraft]);

  useBlocker({
    shouldBlockFn: async () => {
      if (busy) {
        setError("Wait for the current mail operation before leaving this draft.");
        return true;
      }
      if (frozenSend) return false;
      if (JSON.stringify(latest.current) === persisted.current) return false;
      return (await persist()) === null;
    },
    enableBeforeUnload: () => !frozenSend && JSON.stringify(latest.current) !== persisted.current,
  });

  useEffect(() => {
    if (persisted.current === signature || halted.current || busy || frozenSend) return;
    setSaved(false);
    const timeout = setTimeout(() => {
      void persist();
    }, 800);
    return () => clearTimeout(timeout);
  }, [signature, persist, busy, frozenSend]);
  const locked =
    !available || busy || unknownSend || (receipt !== null && receipt.state !== "failed");
  return (
    <section aria-label="Compose email" className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <h2 className="text-sm font-semibold">New message</h2>
        <span className="flex-1 text-xs text-muted-foreground" role="status">
          {saving ? "Saving draft…" : saved ? "Draft saved" : "Unsaved changes"}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Save draft and close"
          disabled={busy}
          onClick={async () => {
            if (frozenSend) {
              onClose();
              return;
            }
            setBusy(true);
            const draft = await persist();
            setBusy(false);
            if (draft) onClose();
          }}
        >
          <XIcon />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-xs text-muted-foreground">
          From {account.email}
          {!available && " · Reconnect and enable Mail to edit or send this saved draft."}
        </p>
        <fieldset disabled={locked} className="space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <span className="w-9 shrink-0">To</span>
            <Input
              nativeInput
              aria-label="To"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="person@example.com"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-9 shrink-0">Cc</span>
            <Input
              nativeInput
              aria-label="Cc"
              value={cc}
              onChange={(event) => setCc(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-9 shrink-0">Bcc</span>
            <Input
              nativeInput
              aria-label="Bcc"
              value={bcc}
              onChange={(event) => setBcc(event.target.value)}
            />
          </label>
          <Input
            nativeInput
            aria-label="Subject"
            placeholder="Subject"
            maxLength={998}
            value={content.subject}
            onChange={(event) => setContent({ ...content, subject: event.target.value })}
          />
          <textarea
            aria-label="Message"
            className="min-h-64 w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Write your message"
            value={content.text}
            maxLength={1_000_000}
            onChange={(event) => setContent({ ...content, text: event.target.value })}
          />
          {content.attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs"
            >
              <PaperclipIcon className="size-3" />
              <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${attachment.filename}`}
                onClick={() =>
                  setContent({
                    ...content,
                    attachments: content.attachments.filter((item) => item.id !== attachment.id),
                  })
                }
              >
                <XIcon />
              </Button>
            </div>
          ))}
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primary">
            <PaperclipIcon className="size-4" />
            Attach files
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={async (event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = "";
                const total =
                  content.attachments.reduce(
                    (bytes, attachment) => bytes + attachment.base64.length * 0.75,
                    0,
                  ) + files.reduce((bytes, file) => bytes + file.size, 0);
                if (total > attachmentLimit || files.length + content.attachments.length > 20) {
                  setError(
                    `Attachments must total at most ${formatMailSize(attachmentLimit)} and 20 files.`,
                  );
                  return;
                }
                setBusy(true);
                try {
                  const added = await Promise.all(
                    files.map(async (file) => ({
                      id: randomUUID(),
                      filename: file.name,
                      contentType: file.type || "application/octet-stream",
                      base64: await fileAsBase64(file),
                    })),
                  );
                  setContent((value) => ({
                    ...value,
                    attachments: [...value.attachments, ...added],
                  }));
                } catch {
                  setError("The attachment could not be read. Choose the file again.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </fieldset>
        {error && (
          <div role="alert" className="mt-3 space-y-2 text-sm text-destructive">
            <p>{error}</p>
            {halted.current && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  halted.current = false;
                  setError(null);
                  void persist();
                }}
              >
                Retry saving
              </Button>
            )}
            {halted.current && available && !unknownSend && !receipt && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  identity.current = { id: undefined, revision: 0 };
                  persisted.current = "";
                  halted.current = false;
                  setError(null);
                  void persist();
                }}
              >
                Save my version as a new draft
              </Button>
            )}
          </div>
        )}
        {receipt && (
          <div role="status" className="mt-3 rounded-md border border-border p-3 text-sm">
            <strong>
              {receipt.state === "accepted"
                ? "Accepted by your mail service"
                : receipt.state === "uncertain"
                  ? "Sending outcome unknown"
                  : receipt.state === "partial"
                    ? "Some recipients were not accepted"
                    : receipt.state === "sending"
                      ? "Sending"
                      : "Send failed"}
            </strong>
            <p className="mt-1">{receipt.detail}</p>
            {["uncertain", "partial", "sending"].includes(receipt.state) && (
              <p className="mt-1">Check Outbox and your provider before sending another copy.</p>
            )}
          </div>
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-border p-3">
        {!account.smtp && available && (
          <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
            <span>Sending is not configured for this account.</span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const draft = await persist();
                setBusy(false);
                if (draft) onSetupSending(draft);
              }}
            >
              Save draft and set up sending
            </Button>
          </div>
        )}
        <Button
          disabled={locked || saving || halted.current || !account.smtp}
          onClick={async () => {
            try {
              latest.current = {
                ...latest.current,
                to: parseMailRecipients(to),
                cc: parseMailRecipients(cc),
                bcc: parseMailRecipients(bcc),
              };
              if (!to.trim() && !cc.trim() && !bcc.trim())
                throw new Error("Add at least one recipient.");
            } catch (error) {
              setError(error instanceof Error ? error.message : "Check the recipients.");
              return;
            }
            setBusy(true);
            setError(null);
            const draft = await persist();
            if (draft) {
              if (!operation.current || receipt?.state === "failed")
                operation.current = randomUUID();
              const result = await sendDraft({
                environmentId,
                input: {
                  draftId: draft.id,
                  revision: draft.revision,
                  operationId: operation.current,
                },
              });
              if (result._tag === "Failure") {
                setUnknownSend(true);
                setError(
                  `${mailFailure(result)} The send outcome has not been confirmed. Close this draft and check Outbox before sending another copy.`,
                );
              } else {
                setReceipt(result.value);
                onChanged();
              }
            }
            setBusy(false);
          }}
        >
          <SendIcon />
          {busy ? "Working…" : receipt?.state === "failed" ? "Send again" : "Send"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (frozenSend) {
              onClose();
              return;
            }
            setBusy(true);
            const draft = await persist();
            setBusy(false);
            if (draft) onClose();
          }}
        >
          {frozenSend ? "Close" : "Save and close"}
        </Button>
        {!receipt && !unknownSend && (
          <Button
            variant="ghost"
            disabled={busy || !available}
            onClick={() => setConfirmDiscard(true)}
          >
            Discard
          </Button>
        )}
        {confirmDiscard && (
          <div className="w-full rounded-md border border-border p-3 text-sm">
            <p>Discard this draft and its attachments?</p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  halted.current = true;
                  await chain.current;
                  if (identity.current.id) {
                    const result = await deleteDraft({
                      environmentId,
                      input: { id: identity.current.id, revision: identity.current.revision },
                    });
                    if (result._tag === "Failure") {
                      setError(mailFailure(result));
                      setBusy(false);
                      return;
                    }
                  }
                  onChanged();
                  onClose();
                }}
              >
                Discard draft
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </Button>
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}
