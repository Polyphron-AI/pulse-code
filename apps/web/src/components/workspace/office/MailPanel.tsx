import { useEffect, useState } from "react";
import type { OfficeAccount, OfficeDraft, OfficeMessage } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { MailIcon } from "lucide-react";
import { fieldClass, RequestState, useOfficeRequest } from "./shared";

export function MailPanel({ accounts }: { accounts: readonly OfficeAccount[] }) {
  const { run, busy, error } = useOfficeRequest();
  const [accountId, setAccountId] = useState("");
  const [messages, setMessages] = useState<readonly OfficeMessage[]>([]);
  const [message, setMessage] = useState<OfficeMessage>();
  const [cursor, setCursor] = useState<string>();
  const [drafts, setDrafts] = useState<readonly OfficeDraft[]>([]);
  const [draftId, setDraftId] = useState<string>();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteId, setDeleteId] = useState<string>();
  const mailAccounts = accounts.filter((account) => account.capabilities.includes("mail"));
  const activeId = mailAccounts.some((account) => account.id === accountId)
    ? accountId
    : mailAccounts[0]?.id;
  async function load(append = false) {
    if (!activeId) return;
    const result = await run({
      operation: "mail.list",
      accountId: activeId,
      limit: 25,
      ...(append && cursor ? { cursor } : {}),
    });
    if (!result) return;
    setMessages((previous) =>
      append ? [...previous, ...(result.messages ?? [])] : (result.messages ?? []),
    );
    setCursor(result.nextCursor);
    const local = await run({ operation: "drafts.list", accountId: activeId });
    if (local?.drafts) setDrafts(local.drafts);
  }
  useEffect(() => {
    setMessages([]);
    setMessage(undefined);
    setDrafts([]);
    setCursor(undefined);
    setEditing(false);
    setSaved(false);
    void load();
  }, [activeId]);
  function edit(draft?: OfficeDraft) {
    setDraftId(draft?.id);
    setTo(draft?.to ?? "");
    setSubject(draft?.subject ?? "");
    setBody(draft?.text ?? "");
    setEditing(true);
    setSaved(false);
  }
  return (
    <Card id="office-email" className="@container gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <MailIcon className="size-4 text-muted-foreground" />
          Email
        </h2>
        <Button variant="outline" disabled={busy || !activeId} onClick={() => void load()}>
          Refresh inbox
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Read your inbox. Drafts stay on this computer and are never sent or synced.
      </p>
      <RequestState busy={busy} error={error} />
      {mailAccounts.length === 0 ? (
        <div className="space-y-2 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Connect an email account to open your inbox.
          </p>
          <a
            href="#office-accounts"
            onClick={() => {
              const details = document.getElementById("office-accounts");
              if (details instanceof HTMLDetailsElement) details.open = true;
            }}
            className="inline-block rounded-md text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Connect an account
          </a>
        </div>
      ) : (
        <>
          <label className="space-y-1 text-sm">
            Mailbox
            <select
              className={fieldClass}
              value={activeId}
              disabled={busy || editing}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {mailAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email} · {account.provider}
                </option>
              ))}
            </select>
          </label>
          <div className="grid min-w-0 gap-4 @2xl:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <h3 className="text-sm font-medium">Inbox</h3>
              {messages.map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  aria-pressed={message?.id === item.id}
                  className="w-full rounded-md border border-border p-3 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 aria-pressed:bg-accent"
                  onClick={() =>
                    void (async () => {
                      if (!activeId) return;
                      const result = await run({
                        operation: "mail.get",
                        accountId: activeId,
                        messageId: item.id,
                      });
                      if (result?.message) setMessage(result.message);
                    })()
                  }
                >
                  <span className="block truncate font-medium">
                    {item.unread ? "Unread · " : ""}
                    {item.subject || "No subject"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{item.from}</span>
                  <span className="mt-1 block truncate text-muted-foreground">{item.preview}</span>
                </button>
              ))}
              {messages.length === 0 && !busy && (
                <p className="text-sm text-muted-foreground">No messages loaded.</p>
              )}
              {cursor && (
                <Button variant="outline" disabled={busy} onClick={() => void load(true)}>
                  Load more messages
                </Button>
              )}
            </div>
            <div className="min-w-0">
              {message ? (
                <article className="space-y-3 break-words">
                  <h3 className="font-medium">{message.subject || "No subject"}</h3>
                  <p className="text-xs text-muted-foreground">
                    From {message.from}
                    <br />
                    To {message.to}
                    <br />
                    {message.date}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">
                    {message.text || "No plain-text message body is available."}
                  </p>
                </article>
              ) : (
                <p className="text-sm text-muted-foreground">Select a message to read it.</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Local drafts</h3>
            <Button variant="outline" disabled={busy || editing} onClick={() => edit()}>
              New draft
            </Button>
          </div>
          {saved && (
            <p role="status" className="text-sm text-muted-foreground">
              Draft saved on this computer.
            </p>
          )}
          {!editing &&
            drafts.map((draft) => (
              <div key={draft.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  {draft.subject || "Untitled draft"} · {draft.to || "No recipient"}
                </span>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => edit(draft)}>
                  Edit
                </Button>
                {deleteId === draft.id ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          const result = await run({ operation: "drafts.delete", id: draft.id });
                          if (result) {
                            setDrafts((previous) =>
                              previous.filter((item) => item.id !== draft.id),
                            );
                            setDeleteId(undefined);
                          }
                        })()
                      }
                    >
                      Confirm delete
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteId(undefined)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setDeleteId(draft.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))}
          {!editing && drafts.length === 0 && !busy && (
            <p className="text-sm text-muted-foreground">No local drafts.</p>
          )}
          {editing && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!activeId) return;
                void (async () => {
                  const result = await run({
                    operation: "drafts.save",
                    accountId: activeId,
                    ...(draftId ? { id: draftId } : {}),
                    to,
                    subject,
                    text: body,
                  });
                  if (result) {
                    setSaved(true);
                    setEditing(false);
                    const local = await run({ operation: "drafts.list", accountId: activeId });
                    if (local?.drafts) setDrafts(local.drafts);
                  }
                })();
              }}
            >
              <label className="block space-y-1 text-sm">
                To
                <input
                  className={fieldClass}
                  maxLength={4096}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
              <label className="block space-y-1 text-sm">
                Subject
                <input
                  className={fieldClass}
                  maxLength={4096}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>
              <label className="block space-y-1 text-sm">
                Message
                <textarea
                  className={fieldClass}
                  rows={8}
                  maxLength={2000000}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  Save local draft
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setEditing(false)}>
                  Discard edits
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
