import { useCallback, useEffect, useRef, useState } from "react";
import * as Schema from "effect/Schema";
import type { OfficeAccount, OfficeMailThread, OfficeMessage } from "@t3tools/contracts";
import {
  BellIcon,
  BookmarkIcon,
  HomeIcon,
  MailIcon,
  MessageCircleIcon,
  SearchIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { cn } from "../../lib/utils";
import { RequestState, useOfficeRequest } from "./office/shared";
import { mailConversations, mailMessageKey } from "./communicationsMail";

type View = "home" | "activity" | "later" | "dms";
const views = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "activity", label: "Activity", icon: BellIcon },
  { id: "dms", label: "DMs", icon: MessageCircleIcon },
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

function DraftReply({
  account,
  message,
  disabled,
}: {
  account: OfficeAccount;
  message: OfficeMessage;
  disabled: boolean;
}) {
  const { run, busy, error } = useOfficeRequest();
  const [text, setText] = useState("");
  const [draftId, setDraftId] = useState<string>();
  const [notice, setNotice] = useState("");
  const edited = useRef(false);
  useEffect(() => {
    void (async () => {
      const result = await run({ operation: "drafts.list", accountId: account.id });
      const existing = result?.drafts?.findLast((draft) => draft.sourceMessageId === message.id);
      if (!existing || edited.current) return;
      setText(existing.text);
      setDraftId(existing.id);
    })();
  }, [run, account.id, message.id]);
  const subject = /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`;
  return (
    <form
      className="shrink-0 space-y-3 border-t border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const result = await run({
            operation: "drafts.save",
            accountId: account.id,
            ...(draftId ? { id: draftId } : {}),
            to: message.from,
            subject,
            text,
            sourceMessageId: message.id,
          });
          if (!result) return;
          const saved =
            result.drafts?.find((draft) => draft.id === draftId) ?? result.drafts?.at(-1);
          if (!saved) {
            setNotice("The draft could not be confirmed. Your text has been kept.");
            return;
          }
          setDraftId(saved.id);
          setNotice("Draft saved on this computer. It has not been sent.");
        })();
      }}
    >
      <p className="text-xs text-muted-foreground">
        Draft reply to {message.from} · from {account.email}
      </p>
      <Textarea
        aria-label="Email reply draft"
        placeholder="Write a local draft…"
        value={text}
        disabled={busy || disabled}
        onChange={(event) => {
          edited.current = true;
          setText(event.target.value);
          setNotice("");
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Email access is read-only. Drafts stay on this computer.
        </p>
        <Button size="sm" type="submit" disabled={!text.trim() || busy || disabled}>
          Save local draft
        </Button>
      </div>
      <RequestState busy={busy} error={error} />
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
}: {
  requestedAccountId?: string;
}) {
  const available = typeof window.desktopBridge?.officeInvoke === "function";
  const { run, busy, error } = useOfficeRequest();
  const [accounts, setAccounts] = useState<readonly OfficeAccount[]>([]);
  const [accountId, setAccountId] = useState<string | undefined>(requestedAccountId);
  const [messages, setMessages] = useState<readonly OfficeMessage[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<OfficeMessage>();
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

  async function chooseAccount(id: string) {
    if (busy) return;
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
    if (view === "dms") return false;
    if (view === "activity" && !unread) return false;
    return [message.subject, message.from, message.preview].some((value) =>
      value.toLowerCase().includes(query.toLowerCase()),
    );
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label="Communications views"
          className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-border bg-sidebar py-4"
        >
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? "page" : undefined}
              className={cn(
                "flex w-12 flex-col items-center gap-1 rounded-md px-1 py-2 text-3xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                view === id && "bg-sidebar-row-active",
              )}
              onClick={() => {
                setView(id);
                setSelected(undefined);
                setThread(undefined);
              }}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <aside
          aria-label="Connected accounts"
          className="hidden w-52 shrink-0 flex-col border-r border-border bg-sidebar lg:flex"
        >
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Connected accounts</h2>
            <p className="mt-1 text-xs text-muted-foreground">Conversations from your services</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {accounts.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                aria-current={item.id === accountId ? "page" : undefined}
                className={cn(
                  "my-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-row-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60",
                  item.id === accountId && "bg-sidebar-row-active",
                )}
                onClick={() => void chooseAccount(item.id)}
              >
                <MailIcon className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{item.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {providerNames[item.provider]}
                  </span>
                </span>
              </button>
            ))}
            {loaded && accounts.length === 0 && (
              <p className="p-2 text-sm text-muted-foreground">No email accounts connected.</p>
            )}
          </div>
          <p className="border-t border-border p-3 text-xs text-muted-foreground">
            Email · connected accounts only
          </p>
        </aside>
        <section aria-label="Email conversations" className="flex min-w-0 flex-1 flex-col">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="truncate text-lg font-semibold">
                {error
                  ? "Messages could not be loaded. Use Refresh to retry."
                  : view === "later"
                    ? "Later"
                    : view === "activity"
                      ? "Unread email"
                      : view === "dms"
                        ? "Direct messages"
                        : (account?.email ?? "Communications")}
              </h1>
              <span className="text-xs text-muted-foreground">
                {account && providerNames[account.provider]}
              </span>
            </div>
            {accounts.length > 0 && (
              <label className="block lg:hidden">
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
            <RequestState busy={busy} error={error} />
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
            ) : view === "dms" ? (
              <p className="p-6 text-sm text-muted-foreground">
                No direct-message service is connected. Your email remains available in Home.
              </p>
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
            {cursor && accountId && view !== "dms" && (
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
        {selected && account && (
          <aside
            aria-label="Email conversation"
            className="absolute inset-y-0 right-0 z-30 flex w-full max-w-xl flex-col border-l border-border bg-background shadow-xl lg:static lg:w-96 lg:shrink-0 lg:shadow-none"
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
                  className="space-y-3 border-b border-border p-4"
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
                </article>
              ))}
            </div>
            {thread && (
              <DraftReply
                key={mailMessageKey(selected)}
                account={account}
                message={selected}
                disabled={busy}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
