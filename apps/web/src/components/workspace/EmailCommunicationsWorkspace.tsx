import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  type Ref,
  type ReactNode,
} from "react";
import * as Schema from "effect/Schema";
import type { OfficeAccount, OfficeMailThread, OfficeMessage } from "@t3tools/contracts";
import {
  BellIcon,
  BookmarkIcon,
  InboxIcon,
  SearchIcon,
  RefreshCwIcon,
  FolderIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { OfficeSubnav } from "./OfficeSubnav";
import { GlobalFilesPanel } from "./GlobalFilesPanel";
import { OfficeModuleTabs } from "./OfficeModuleTabs";
import { cn } from "../../lib/utils";
import { RequestState, useOfficeRequest } from "./office/shared";
import { communicationTaskDraft, type CommunicationTaskDraft } from "./communicationsSource";
import { mailConversations, mailMessageKey } from "./communicationsMail";

type View = "home" | "activity" | "later";
const views = [
  { id: "home", label: "Inbox", icon: InboxIcon },
  { id: "activity", label: "Unread", icon: BellIcon },
  { id: "later", label: "Later", icon: BookmarkIcon },
] as const;
const ReferenceId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024));
const SavedReference = Schema.Struct({
  provider: ReferenceId,
  accountId: ReferenceId,
  conversationId: ReferenceId,
  id: ReferenceId,
});
const SavedReferences = Schema.Array(SavedReference).check(Schema.isMaxLength(500));
const EMPTY_SAVED: typeof SavedReferences.Type = [];
const providerNames = { google: "Gmail", microsoft: "Microsoft", imap: "IMAP" } as const;

function messageDate(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date || "Date unavailable" : parsed.toLocaleString();
}

export type DraftReplyHandle = { insertLink: (name: string, url: string) => boolean };

export function DraftReply({
  account,
  message,
  disabled,
  ref,
}: {
  account: OfficeAccount;
  message?: OfficeMessage;
  disabled: boolean;
  ref?: Ref<DraftReplyHandle>;
}) {
  const { run, busy, error } = useOfficeRequest();
  const [text, setText] = useState("");
  const [to, setTo] = useState(
    () =>
      (message?.replyTo || message?.from || "").match(/[^\s<>,;"]+@[^\s<>,;"]+/g)?.join(", ") ?? "",
  );
  const [subject, setSubject] = useState(
    message ? (/^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`) : "",
  );
  const [draftId, setDraftId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendEnabled, setSendEnabled] = useState(account.capabilities.includes("mailSend"));
  const edited = useRef(false);
  const submitting = useRef(false);
  useEffect(() => {
    void (async () => {
      const result = await run({ operation: "drafts.list", accountId: account.id });
      const existing = result?.drafts?.findLast((draft) => draft.sourceMessageId === message?.id);
      if (!existing || edited.current) return;
      setText(existing.text);
      setTo(existing.to);
      setSubject(existing.subject);
      setDraftId(existing.id);
    })();
  }, [run, account.id, message?.id]);
  const locked = busy || disabled || sending;
  function edit() {
    edited.current = true;
    setReview(false);
    setSent(false);
    setNotice("");
  }
  useImperativeHandle(
    ref,
    () => ({
      insertLink(name, url) {
        if (locked) return false;
        edit();
        setText((current) => `${current}${current ? "\n\n" : ""}${name}\n${url}`);
        setNotice("File link added. Google Drive sharing permissions are unchanged.");
        return true;
      },
    }),
    [locked],
  );
  async function save() {
    const result = await run({
      operation: "drafts.save",
      accountId: account.id,
      ...(draftId ? { id: draftId } : {}),
      to,
      subject,
      text,
      ...(message ? { sourceMessageId: message.id } : {}),
    });
    const saved = result?.drafts?.find((draft) => draft.id === draftId) ?? result?.drafts?.at(-1);
    if (!saved) {
      setNotice("The draft could not be confirmed. Your text has been kept.");
      return;
    }
    setDraftId(saved.id);
    setNotice("Draft saved on this computer. It has not been sent.");
    return saved.id;
  }
  async function send() {
    if (submitting.current || locked || sent) return;
    submitting.current = true;
    setSending(true);
    setNotice("");
    try {
      const savedId = await save();
      if (!savedId) return;
      const result = await run({
        operation: "mail.send",
        accountId: account.id,
        message: {
          to: to
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          subject,
          text,
          ...(message ? { sourceMessageId: message.id } : {}),
        },
      });
      if (!result?.sent) {
        setNotice(
          "Sending was not confirmed. Your draft is saved. Check Sent mail before trying again.",
        );
        return;
      }
      setSent(true);
      setReview(false);
      setText("");
      setDraftId(undefined);
      const removed = await run({ operation: "drafts.delete", id: savedId });
      setNotice(
        removed
          ? "Email accepted by the provider for sending."
          : "Email accepted for sending. The local draft could not be removed; do not send it again.",
      );
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }
  async function enableSending() {
    if (account.provider === "imap") return;
    const result = await run({
      operation: "accounts.connectOAuth",
      accountId: account.id,
      provider: account.provider,
      capabilities: ["mail", "mailSend"],
    });
    setSendEnabled(
      Boolean(
        result?.accounts
          ?.find((entry) => entry.id === account.id)
          ?.capabilities.includes("mailSend"),
      ),
    );
  }
  return (
    <form
      className="shrink-0 space-y-3 border-t border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!locked) void save();
      }}
    >
      <p className="text-xs text-muted-foreground">
        {message ? "Reply" : "New email"} ? from {account.email}
      </p>
      <label className="block text-xs">
        To
        <Input
          aria-label="Email recipients"
          placeholder="person@example.com, teammate@example.com"
          value={to}
          disabled={locked}
          onChange={(event) => {
            edit();
            setTo(event.target.value);
          }}
        />
      </label>
      <label className="block text-xs">
        Subject
        <Input
          aria-label="Email subject"
          value={subject}
          disabled={locked || Boolean(message)}
          onChange={(event) => {
            edit();
            setSubject(event.target.value);
          }}
        />
      </label>
      <Textarea
        aria-label="Email reply draft"
        placeholder="Write your email?"
        value={text}
        disabled={locked}
        onChange={(event) => {
          edit();
          setText(event.target.value);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" type="submit" disabled={!text.trim() || locked || sent}>
          Save local draft
        </Button>
        {sendEnabled ? (
          <Button
            size="sm"
            type="button"
            disabled={!to.trim() || !text.trim() || locked || sent}
            onClick={() => setReview(true)}
          >
            Review and send
          </Button>
        ) : account.provider === "imap" ? (
          <p className="text-xs text-muted-foreground">
            Sending is not configured for IMAP accounts.
          </p>
        ) : (
          <Button
            size="sm"
            type="button"
            variant="outline"
            disabled={locked}
            onClick={() => void enableSending()}
          >
            Enable email sending
          </Button>
        )}
      </div>
      {review && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="break-words text-sm">
            Send from {account.email} to {to}?
          </p>
          <p className="text-xs text-muted-foreground">
            Your message and linked files above will be sent by {providerNames[account.provider]}.
          </p>
          <Button size="sm" type="button" disabled={locked || sent} onClick={() => void send()}>
            Send email
          </Button>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={locked}
            onClick={() => setReview(false)}
          >
            Keep editing
          </Button>
        </div>
      )}
      <RequestState busy={locked} error={error} />
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </form>
  );
}

export function EmailCommunicationsWorkspace({
  requestedAccountId,
  requestedMessageId,
  onCreateTask,
  onConfigureProject,
  tasksPanel,
}: {
  requestedAccountId?: string;
  requestedMessageId?: string | undefined;
  onCreateTask?: ((draft: CommunicationTaskDraft) => void) | undefined;
  onConfigureProject?: (project: EnvironmentProject) => void;
  tasksPanel?: ReactNode;
}) {
  const draft = useRef<DraftReplyHandle>(null);
  const sourceEmail = useRef<HTMLElement>(null);
  const [filesOpen, setFilesOpen] = useState(true);
  const [resource, setResource] = useState<"Files" | "Tasks">("Files");
  const available = typeof window.desktopBridge?.officeInvoke === "function";
  const { run, busy, error } = useOfficeRequest();
  const [accounts, setAccounts] = useState<readonly OfficeAccount[]>([]);
  const [accountId, setAccountId] = useState<string | undefined>(requestedAccountId);
  const [messages, setMessages] = useState<readonly OfficeMessage[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<OfficeMessage>();
  const [composing, setComposing] = useState(false);
  const [thread, setThread] = useState<OfficeMailThread>();
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useLocalStorage(
    "pulse:communications:later:email:v2",
    EMPTY_SAVED,
    SavedReferences,
  );
  const mounted = useRef(true);
  const selectedAccount = useRef<string | undefined>(requestedAccountId);
  const account = accounts.find((item) => item.id === accountId);
  const appliedSource = useRef<string | undefined>(undefined);
  const [sourceNotice, setSourceNotice] = useState("");

  const loadInbox = useCallback(
    async (id: string, nextCursor?: string) => {
      const result = await run({
        operation: "mail.list",
        accountId: id,
        ...(nextCursor ? { cursor: nextCursor } : {}),
        limit: 50,
      });
      if (!result || !mounted.current) return;
      setMessages((previous) =>
        nextCursor ? [...previous, ...(result.messages ?? [])] : (result.messages ?? []),
      );
      setCursor(result.nextCursor);
    },
    [run],
  );

  const refresh = useCallback(async () => {
    const result = await run({ operation: "accounts.list" });
    if (!result || !mounted.current) return;
    const mailAccounts = (result.accounts ?? []).filter(
      (item) =>
        item.capabilities.includes("mail") &&
        (!requestedAccountId || item.id === requestedAccountId),
    );
    setAccounts(mailAccounts);
    const chosen =
      mailAccounts.find((item) => item.id === selectedAccount.current) ?? mailAccounts[0];
    if (chosen?.id !== selectedAccount.current) {
      setMessages([]);
      setSelected(undefined);
      setThread(undefined);
    }
    selectedAccount.current = chosen?.id;
    setAccountId(chosen?.id);
    if (chosen) await loadInbox(chosen.id);
    else {
      setMessages([]);
      setSelected(undefined);
      setThread(undefined);
    }
    if (mounted.current) setLoaded(true);
  }, [run, loadInbox, requestedAccountId]);

  useEffect(() => {
    mounted.current = true;
    if (available) void refresh();
    return () => {
      mounted.current = false;
    };
  }, [available, refresh]);

  useEffect(() => {
    if (!requestedMessageId || !account || !loaded || busy) return;
    const key = JSON.stringify([account.id, requestedMessageId]);
    if (appliedSource.current === key) return;
    appliedSource.current = key;
    setSourceNotice("Opening the linked email?");
    setSelected(undefined);
    setThread(undefined);
    setComposing(false);
    void (async () => {
      const result = await run({
        operation: "mail.get",
        accountId: account.id,
        messageId: requestedMessageId,
      });
      if (
        !mounted.current ||
        selectedAccount.current !== account.id ||
        appliedSource.current !== key
      )
        return;
      if (
        !result?.message ||
        result.message.id !== requestedMessageId ||
        result.message.accountId !== account.id
      ) {
        setSourceNotice(
          "The linked email could not be opened. Check that its account is connected on this computer.",
        );
        return;
      }
      setSelected(result.message);
      const full = await run({
        operation: "mail.thread",
        accountId: account.id,
        messageId: requestedMessageId,
      });
      if (
        !mounted.current ||
        selectedAccount.current !== account.id ||
        appliedSource.current !== key
      )
        return;
      setThread(full?.thread);
      setSourceNotice(
        full?.thread
          ? ""
          : "The linked email loaded, but its conversation could not be loaded. Select it again to retry.",
      );
    })();
  }, [requestedMessageId, account, loaded, busy, run]);

  useEffect(() => {
    sourceEmail.current?.scrollIntoView({ block: "center" });
  }, [thread, requestedMessageId]);

  async function chooseAccount(id: string) {
    if (busy) return;
    setComposing(false);
    selectedAccount.current = id;
    setAccountId(id);
    setMessages([]);
    setCursor(undefined);
    setSelected(undefined);
    setThread(undefined);
    setQuery("");
    await loadInbox(id);
  }
  async function openMessage(message: OfficeMessage) {
    if (busy) return;
    setComposing(false);
    setSourceNotice("");
    setSelected(message);
    if (!selected || mailMessageKey(selected) !== mailMessageKey(message)) setThread(undefined);
    const result = await run({
      operation: "mail.thread",
      accountId: message.accountId,
      messageId: message.id,
    });
    if (result?.thread && mounted.current) setThread(result.thread);
  }
  function savedKey(
    message: Pick<OfficeMessage, "accountId" | "id" | "conversationId">,
    provider = account?.provider,
  ) {
    return JSON.stringify([
      provider,
      message.accountId,
      message.conversationId ?? message.id,
      message.id,
    ]);
  }
  function referenceKey(reference: typeof SavedReference.Type) {
    return JSON.stringify([
      reference.provider,
      reference.accountId,
      reference.conversationId,
      reference.id,
    ]);
  }
  function toggleSaved(message: OfficeMessage) {
    const key = savedKey(message);
    setSaved((previous) =>
      previous.some((item) => referenceKey(item) === key)
        ? previous.filter((item) => referenceKey(item) !== key)
        : previous.length < 500
          ? [
              ...previous,
              {
                provider: account?.provider ?? "email",
                accountId: message.accountId,
                conversationId: message.conversationId ?? message.id,
                id: message.id,
              },
            ]
          : previous,
    );
  }
  const rows = mailConversations(
    view === "later"
      ? messages.filter((message) => saved.some((item) => referenceKey(item) === savedKey(message)))
      : messages,
  ).filter(({ message, unread }) => {
    if (view === "activity" && !unread) return false;
    return [message.subject, message.from, message.preview].some((value) =>
      value.toLowerCase().includes(query.toLowerCase()),
    );
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <OfficeSubnav
          label="Communications views"
          items={views}
          value={view}
          onChange={(id) => {
            if (id !== "home" && id !== "activity" && id !== "later") return;
            setComposing(false);
            setView(id);
            setSelected(undefined);
            setThread(undefined);
          }}
        />
        <section
          aria-label="Email conversations"
          className="flex w-80 min-w-0 shrink-0 flex-col border-r border-border max-md:w-full"
        >
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="truncate text-lg font-semibold">
                {error
                  ? "Messages could not be loaded. Use Refresh to retry."
                  : view === "later"
                    ? "Later"
                    : view === "activity"
                      ? "Unread email"
                      : "Inbox"}
              </h1>
              <span className="text-xs text-muted-foreground">
                {account && providerNames[account.provider]}
              </span>
            </div>
            {accounts.length > 0 && (
              <label className="block">
                <span className="sr-only">Email account</span>
                <select
                  aria-label="Email account"
                  disabled={busy}
                  value={accountId}
                  onChange={(event) => void chooseAccount(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.email}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {account && (
              <div className="flex items-center gap-2">
                <SearchIcon className="size-4 text-muted-foreground" />
                <Input
                  aria-label="Search loaded email"
                  placeholder="Search loaded conversations…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!available || busy}
              onClick={() => void refresh()}
            >
              <RefreshCwIcon />
              Refresh email
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFilesOpen((open) => !open)}
              aria-expanded={filesOpen}
            >
              <FolderIcon /> {filesOpen ? "Hide resources" : "Files and tasks"}
            </Button>
            {account && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  setComposing(true);
                  setSelected(undefined);
                  setThread(undefined);
                }}
              >
                New email
              </Button>
            )}
            <RequestState busy={busy} error={error} />
            {sourceNotice && (
              <p role="status" className="text-xs text-muted-foreground">
                {sourceNotice}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!available ? (
              <div className="space-y-2 p-6">
                <h2 className="font-semibold">Connect on Pulse desktop</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  Office accounts are stored on your desktop computer. This web connection cannot
                  access them. No sample conversations are shown.
                </p>
              </div>
            ) : !loaded ? (
              <p role="status" className="p-6 text-sm text-muted-foreground">
                {error
                  ? "Accounts could not be loaded. Use Refresh to retry."
                  : "Loading connected accounts…"}
              </p>
            ) : accounts.length === 0 ? (
              <div className="space-y-2 p-6">
                <h2 className="font-semibold">Connect an account to see conversations</h2>
                <p className="text-sm text-muted-foreground">
                  Use Manage accounts to connect Gmail, Microsoft or an IMAP mailbox.
                </p>
              </div>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {view === "later"
                  ? "No saved conversations in the currently loaded email. Saved references stay on this device."
                  : query
                    ? "No loaded conversations match your search."
                    : "No conversations in this view."}
              </p>
            ) : (
              rows.map(({ message, unread }) => (
                <article
                  key={mailMessageKey(message)}
                  className={cn(
                    "flex items-start gap-2 border-b border-border px-4 py-3",
                    selected &&
                      mailMessageKey(selected) === mailMessageKey(message) &&
                      "bg-muted/40",
                  )}
                >
                  <button
                    type="button"
                    disabled={busy}
                    className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
                    onClick={() => void openMessage(message)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="truncate text-sm font-medium">
                        {unread && (
                          <span
                            aria-label="Unread"
                            className="mr-2 inline-block size-1.5 rounded-full bg-primary"
                          />
                        )}
                        {message.subject || "No subject"}
                      </strong>
                      <time
                        className="shrink-0 text-3xs text-muted-foreground"
                        dateTime={message.date}
                      >
                        {messageDate(message.date)}
                      </time>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{message.from}</p>
                    <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm">
                      {message.preview}
                    </p>
                  </button>
                  <Button
                    size="icon-xs"
                    variant={
                      saved.some((item) => referenceKey(item) === savedKey(message))
                        ? "secondary"
                        : "ghost-muted"
                    }
                    aria-label={
                      saved.some((item) => referenceKey(item) === savedKey(message))
                        ? "Remove from Later"
                        : "Save for Later"
                    }
                    aria-pressed={saved.some((item) => referenceKey(item) === savedKey(message))}
                    onClick={() => toggleSaved(message)}
                  >
                    <BookmarkIcon />
                  </Button>
                </article>
              ))
            )}
            {cursor && accountId && (
              <div className="p-4">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void loadInbox(accountId, cursor)}
                >
                  Load more email
                </Button>
              </div>
            )}
          </div>
        </section>
        {composing && account ? (
          <section
            aria-label="Compose email"
            className="flex min-w-0 flex-1 flex-col bg-background max-md:absolute max-md:inset-0 max-md:z-20"
          >
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-semibold">New email</h2>
              <Button size="sm" variant="ghost" onClick={() => setComposing(false)}>
                Close
              </Button>
            </div>
            <DraftReply
              key={`compose:${account.id}`}
              ref={draft}
              account={account}
              disabled={busy}
            />
          </section>
        ) : selected && account ? (
          <section
            aria-label="Email conversation"
            className="flex min-w-0 flex-1 flex-col bg-background max-md:absolute max-md:inset-0 max-md:z-20"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{selected.subject || "No subject"}</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">{account.email}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelected(undefined);
                  setThread(undefined);
                }}
              >
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {busy && !thread && (
                <p role="status" className="p-4 text-sm text-muted-foreground">
                  Loading conversation…
                </p>
              )}
              {thread?.truncated && (
                <p className="border-b border-border p-4 text-xs text-muted-foreground">
                  Showing the latest 50 messages. Earlier messages are not included.
                </p>
              )}
              {thread?.grouping === "single-message" && (
                <p className="border-b border-border p-4 text-xs text-muted-foreground">
                  This account provides individual messages. Related messages are not grouped by
                  subject.
                </p>
              )}
              {(thread?.messages ?? []).map((message) => (
                <article
                  key={mailMessageKey(message)}
                  ref={message.id === requestedMessageId ? sourceEmail : undefined}
                  data-source-message={message.id === requestedMessageId || undefined}
                  className={cn(
                    "space-y-3 border-b border-border p-4",
                    message.id === requestedMessageId &&
                      "bg-accent ring-1 ring-inset ring-primary/30",
                  )}
                >
                  <div>
                    <strong className="break-words text-sm font-semibold">{message.from}</strong>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      To {message.to}
                    </p>
                    <time className="text-3xs text-muted-foreground" dateTime={message.date}>
                      {messageDate(message.date)}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.text ?? message.preview}
                  </p>
                  {onCreateTask && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onCreateTask(
                          communicationTaskDraft({
                            provider: account.provider,
                            accountId: account.id,
                            conversationId: message.conversationId ?? message.id,
                            messageId: message.id,
                            email: true,
                            title: message.subject || "Follow up on email",
                            text: message.text ?? message.preview,
                          }),
                        );
                        setFilesOpen(true);
                        setResource("Tasks");
                      }}
                    >
                      Create task
                    </Button>
                  )}
                </article>
              ))}
            </div>
            {thread && (
              <DraftReply
                ref={draft}
                key={mailMessageKey(selected)}
                account={account}
                message={thread.messages.find((item) => item.id === selected.id) ?? selected}
                disabled={busy}
              />
            )}
          </section>
        ) : (
          <section
            aria-label="Email reader"
            className="hidden min-w-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground md:flex"
          >
            Select an email to read and draft a reply.
          </section>
        )}
        {filesOpen && (
          <aside
            aria-label="Email resources"
            className="flex w-[460px] shrink-0 flex-col border-l border-border bg-muted/20 max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:shadow-xl max-sm:w-full"
          >
            <div className="flex h-12 shrink-0 items-center border-b px-4">
              <span className="text-sm font-semibold">Workspace resources</span>
              <Button
                className="ml-auto"
                size="sm"
                variant="ghost"
                onClick={() => setFilesOpen(false)}
              >
                Close
              </Button>
            </div>
            <OfficeModuleTabs
              value={resource}
              items={tasksPanel ? ["Files", "Tasks"] : ["Files"]}
              onChange={(name) => setResource(name === "Tasks" ? "Tasks" : "Files")}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {resource === "Tasks" && tasksPanel ? (
                tasksPanel
              ) : (
                <GlobalFilesPanel
                  onConfigureProject={onConfigureProject}
                  canInsert={Boolean((composing || (thread && selected)) && account && !busy)}
                  onInsertLink={(name, url) => draft.current?.insertLink(name, url) ?? false}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
