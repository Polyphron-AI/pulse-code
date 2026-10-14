import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as Schema from "effect/Schema";
import type { ChatAccount, ChatConversation, ChatMessage } from "@t3tools/contracts";
import {
  BookmarkIcon,
  ArrowLeftIcon,
  HashIcon,
  HomeIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { OfficeSubnav } from "./OfficeSubnav";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn, randomUUID } from "../../lib/utils";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { RequestState } from "./office/shared";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import { communicationTaskDraft, type CommunicationTaskDraft } from "./communicationsSource";
import {
  chatReferenceKey,
  chatTextParts,
  mergeChatMessages,
  sendAttempt,
} from "./communicationsChat";

const SavedReference = Schema.Struct({
  provider: Schema.String,
  accountId: Schema.String,
  conversationId: Schema.String,
  messageId: Schema.String,
});
const SavedReferences = Schema.Array(SavedReference).check(Schema.isMaxLength(500));
const emptySaved: typeof SavedReferences.Type = [];
const providerNames = { slack: "Slack", discord: "Discord", telegram: "Telegram" };

function ChatComposer({
  account,
  conversation,
  replyTo,
  onAcknowledged,
  onCancelReply,
  nativeThread = false,
}: {
  account: ChatAccount;
  conversation: ChatConversation;
  replyTo?: ChatMessage | undefined;
  onAcknowledged: (message: ChatMessage) => void;
  onCancelReply?: () => void;
  nativeThread?: boolean;
}) {
  const { run, busy, error } = useCommunicationsRequest();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = useRef<ReturnType<typeof sendAttempt> | undefined>(undefined);
  async function send() {
    if (busy || !text.trim() || !conversation.canSend) return;
    const replyId =
      replyTo && !(nativeThread && account.provider === "discord")
        ? account.provider === "slack"
          ? (replyTo.threadId ?? replyTo.id)
          : replyTo.id
        : undefined;
    const outgoing = sendAttempt(
      text,
      attempt.current,
      randomUUID,
      JSON.stringify([account.id, conversation.id, replyId ?? null]),
    );
    attempt.current = outgoing;
    setNotice("");
    const result = await run({
      operation: "messages.send",
      accountId: account.id,
      conversationId: conversation.id,
      text: outgoing.text,
      nonce: outgoing.nonce,
      ...(replyId ? { replyToId: replyId } : {}),
    });
    if (!result) return;
    if (
      !result.message ||
      result.message.accountId !== account.id ||
      result.message.conversationId !== conversation.id
    ) {
      setNotice("The source did not confirm your message. Your text has been kept. You can retry.");
      return;
    }
    onAcknowledged(result.message);
    setText("");
    attempt.current = undefined;
    setNotice(`Sent through ${providerNames[account.provider]} as ${account.identity}.`);
  }
  if (!conversation.canSend)
    return (
      <p className="shrink-0 border-t border-border p-4 text-xs text-muted-foreground">
        This conversation is read-only for {account.identity}.
      </p>
    );
  return (
    <form
      className="shrink-0 space-y-2 border-t border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {replyTo && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            Replying to {replyTo.author}: {replyTo.text}
          </span>
          {onCancelReply && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Cancel reply"
              disabled={busy}
              onClick={onCancelReply}
            >
              <XIcon />
            </Button>
          )}
        </div>
      )}
      <Textarea
        aria-label="Message text"
        placeholder={`Message ${conversation.title}…`}
        value={text}
        maxLength={account.provider === "discord" ? 2000 : 4096}
        disabled={busy}
        onChange={(event) => {
          setText(event.target.value);
          setNotice("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          To {conversation.title} · {providerNames[account.provider]}
          <br />
          Sending as {account.identity}
        </p>
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          <SendIcon />
          {busy ? "Sending…" : "Send"}
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

interface ChatCommunicationsWorkspaceProps {
  account: ChatAccount;
  projectSidebar?: ReactNode;
  requestedConversationId?: string | undefined;
  requestedMessageId?: string | undefined;
  requestedThreadId?: string | undefined;
  onCreateTask?: ((draft: CommunicationTaskDraft) => void) | undefined;
  onConversationSelected?: (conversation: ChatConversation) => void;
  onConversationsChanged?: (conversations: readonly ChatConversation[]) => void;
  onOpenLink?: (url: string) => void;
}

export function ChatCommunicationsWorkspace(props: ChatCommunicationsWorkspaceProps) {
  return <AccountChatWorkspace key={props.account.id} {...props} />;
}

function AccountChatWorkspace({
  account,
  projectSidebar,
  requestedConversationId,
  requestedMessageId,
  requestedThreadId,
  onCreateTask,
  onConversationSelected,
  onConversationsChanged,
  onOpenLink,
}: ChatCommunicationsWorkspaceProps) {
  const { run, busy, error } = useCommunicationsRequest();
  const [conversations, setConversations] = useState<readonly ChatConversation[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string>();
  const [conversation, setConversation] = useState<ChatConversation>();
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string>();
  const [replyTo, setReplyTo] = useState<ChatMessage>();
  const [thread, setThread] = useState<ChatMessage>();
  const [threadMessages, setThreadMessages] = useState<readonly ChatMessage[]>([]);
  const [threadCursor, setThreadCursor] = useState<string>();
  const [view, setView] = useState<"home" | "dms" | "later">("home");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useLocalStorage(
    "pulse:communications:later:chat:v1",
    emptySaved,
    SavedReferences,
  );
  const destination = useRef<string | undefined>(undefined);
  const threadDestination = useRef<string | undefined>(undefined);
  const active = useRef(true);
  const searchInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const historyEnd = useRef<HTMLDivElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const appliedRequest = useRef<string | undefined>(undefined);
  const sourcePages = useRef({ key: "", cursors: new Set<string>(), threadLoaded: false });
  const sourceElement = useRef<HTMLElement>(null);
  const scrolledSource = useRef("");
  const requestedPages = useRef({ id: requestedConversationId, cursors: new Set<string>() });

  const loadConversations = useCallback(
    async (cursor?: string) => {
      const result = await run({
        operation: "conversations.list",
        accountId: account.id,
        ...(cursor ? { cursor } : {}),
      });
      if (!result || !active.current) return;
      setConversations((previous) =>
        cursor
          ? [
              ...new Map(
                [...previous, ...(result.conversations ?? [])].map((item) => [item.id, item]),
              ).values(),
            ]
          : (result.conversations ?? []),
      );
      setConversationCursor(result.nextCursor);
      setLoaded(true);
    },
    [account.id, run],
  );
  useEffect(() => {
    active.current = true;
    void loadConversations();
    return () => {
      active.current = false;
    };
  }, [loadConversations]);
  useEffect(() => {
    onConversationsChanged?.(conversations);
  }, [conversations, onConversationsChanged]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        (root.current?.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        event.preventDefault();
        event.stopPropagation();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") {
        setThread(undefined);
        threadDestination.current = undefined;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const loadMessages = useCallback(
    async (selected: ChatConversation, cursor?: string) => {
      const result = await run({
        operation: "messages.list",
        accountId: account.id,
        conversationId: selected.id,
        ...(cursor ? { cursor } : {}),
      });
      if (!result || !active.current || destination.current !== selected.id) return;
      setMessages((previous) => mergeChatMessages(cursor ? previous : [], result.messages ?? []));
      setMessageCursor(result.nextCursor);
    },
    [account.id, run],
  );
  const openConversation = useCallback(
    async (selected: ChatConversation) => {
      if (busy) return;
      const changed = destination.current !== selected.id;
      destination.current = selected.id;
      setConversation(selected);
      setReplyTo(undefined);
      setThread(undefined);
      threadDestination.current = undefined;
      if (changed) {
        setMessages([]);
        setMessageCursor(undefined);
      }
      await loadMessages(selected);
    },
    [busy, loadMessages],
  );
  useEffect(() => {
    if (requestedPages.current.id !== requestedConversationId) {
      requestedPages.current = { id: requestedConversationId, cursors: new Set() };
    }
    if (!requestedConversationId) {
      appliedRequest.current = undefined;
      return;
    }
    if (busy || appliedRequest.current === requestedConversationId) return;
    const selected = conversations.find(
      (item) => item.id === requestedConversationId && item.accountId === account.id,
    );
    if (!selected) {
      if (
        conversationCursor &&
        requestedPages.current.cursors.size < 20 &&
        !requestedPages.current.cursors.has(conversationCursor)
      ) {
        requestedPages.current.cursors.add(conversationCursor);
        void loadConversations(conversationCursor);
      }
      return;
    }
    appliedRequest.current = requestedConversationId;
    setView("home");
    void openConversation(selected);
  }, [
    account.id,
    busy,
    conversations,
    conversationCursor,
    requestedConversationId,
    openConversation,
    loadConversations,
  ]);
  useEffect(() => {
    if (
      !requestedMessageId ||
      !conversation ||
      (requestedConversationId && conversation.id !== requestedConversationId) ||
      busy ||
      error
    )
      return;
    const key = JSON.stringify([
      account.id,
      conversation.id,
      requestedMessageId,
      requestedThreadId,
    ]);
    if (sourcePages.current.key !== key)
      sourcePages.current = { key, cursors: new Set(), threadLoaded: false };
    if (requestedThreadId && !sourcePages.current.threadLoaded) {
      sourcePages.current.threadLoaded = true;
      threadDestination.current = requestedThreadId;
      void (async () => {
        const result = await run({
          operation: "messages.list",
          accountId: account.id,
          conversationId: conversation.id,
          threadId: requestedThreadId,
        });
        if (
          !active.current ||
          sourcePages.current.key !== key ||
          destination.current !== conversation.id
        )
          return;
        const rows = result?.messages ?? [];
        const rootMessage =
          rows.find((message) => message.id === requestedThreadId) ??
          rows.find((message) => message.id === requestedMessageId) ??
          rows[0];
        if (rootMessage) setThread(rootMessage);
        setThreadMessages(rows);
        setThreadCursor(result?.nextCursor);
      })();
      return;
    }
    const rows = requestedThreadId ? threadMessages : messages;
    if (rows.some((message) => message.id === requestedMessageId)) {
      if (scrolledSource.current !== key && sourceElement.current) {
        sourceElement.current.scrollIntoView({ block: "center" });
        scrolledSource.current = key;
      }
      return;
    }
    const cursor = requestedThreadId ? threadCursor : messageCursor;
    if (
      !cursor ||
      sourcePages.current.cursors.size >= 10 ||
      sourcePages.current.cursors.has(cursor)
    )
      return;
    sourcePages.current.cursors.add(cursor);
    if (requestedThreadId && thread) void loadThread(thread, cursor);
    else if (!requestedThreadId) void loadMessages(conversation, cursor);
  }, [
    requestedMessageId,
    requestedConversationId,
    requestedThreadId,
    account.id,
    conversation,
    busy,
    error,
    messages,
    threadMessages,
    messageCursor,
    threadCursor,
    thread,
    run,
    loadMessages,
  ]);

  function selectGeneralConversation(selected: ChatConversation) {
    onConversationSelected?.(selected);
    void openConversation(selected);
  }
  async function loadThread(selected: ChatMessage, cursor?: string) {
    if (!conversation) return;
    const threadId = selected.threadId ?? selected.id;
    const result = await run({
      operation: "messages.list",
      accountId: account.id,
      conversationId: conversation.id,
      threadId,
      ...(cursor ? { cursor } : {}),
    });
    if (!result || !active.current || threadDestination.current !== threadId) return;
    setThreadMessages((previous) =>
      mergeChatMessages(cursor ? previous : [], result.messages ?? []),
    );
    setThreadCursor(result.nextCursor);
  }
  async function openThread(message: ChatMessage) {
    const threadId = message.threadId ?? message.id;
    if (threadDestination.current !== threadId) {
      setThreadMessages([]);
      setThreadCursor(undefined);
    }
    threadDestination.current = threadId;
    setThread(message);
    await loadThread(message);
  }
  function reference(message: ChatMessage) {
    return {
      provider: account.provider,
      accountId: account.id,
      conversationId: message.conversationId,
      messageId: message.id,
    };
  }
  function isSaved(message: ChatMessage) {
    const key = chatReferenceKey(reference(message));
    return saved.some((item) => chatReferenceKey(item) === key);
  }
  function toggleSaved(message: ChatMessage) {
    const entry = reference(message);
    const key = chatReferenceKey(entry);
    setSaved((previous) =>
      previous.some((item) => chatReferenceKey(item) === key)
        ? previous.filter((item) => chatReferenceKey(item) !== key)
        : previous.length < 500
          ? [...previous, entry]
          : previous,
    );
  }
  const threadConversation =
    account.provider === "discord"
      ? conversations.find((item) => item.id === thread?.threadId && item.accountId === account.id)
      : conversation;
  function acknowledge(message: ChatMessage, inThread = false) {
    if (
      inThread
        ? message.conversationId !== threadConversation?.id ||
          threadDestination.current !== (thread?.threadId ?? thread?.id)
        : message.conversationId !== destination.current
    )
      return;
    if (inThread) setThreadMessages((previous) => mergeChatMessages(previous, [message]));
    else {
      setMessages((previous) => mergeChatMessages(previous, [message]));
      setReplyTo(undefined);
    }
    requestAnimationFrame(() =>
      (inThread ? threadEnd : historyEnd).current?.scrollIntoView({ block: "nearest" }),
    );
  }
  const visibleConversations = conversations.filter(
    (item) =>
      (view !== "dms" || item.kind === "dm") &&
      [item.title, item.workspace].some((value) =>
        value.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const visibleMessages = messages.filter((message) => view !== "later" || isSaved(message));
  const waitingForRequestedConversation =
    !!requestedConversationId && conversation?.id !== requestedConversationId;
  function renderMessage(message: ChatMessage, inThread = false) {
    return (
      <article
        key={message.id}
        ref={message.id === requestedMessageId ? sourceElement : undefined}
        data-source-message={message.id === requestedMessageId || undefined}
        className={cn(
          "group flex gap-3 border-b border-border/50 px-4 py-3",
          message.id === requestedMessageId && "bg-accent ring-1 ring-inset ring-primary/30",
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">
          {message.author.slice(0, 2).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <strong className="text-sm font-semibold">{message.author || "Unknown author"}</strong>
            <time dateTime={message.date} className="text-3xs text-muted-foreground">
              {new Date(message.date).toLocaleString()}
            </time>
          </div>
          {message.replyToId && (
            <p className="mt-1 text-xs text-muted-foreground">
              Reply to message {message.replyToId}
            </p>
          )}
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.text
              ? chatTextParts(message.text).map(({ text, href }, index) =>
                  href ? (
                    <a
                      key={index}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2"
                      onClick={
                        onOpenLink
                          ? (event) => {
                              event.preventDefault();
                              onOpenLink(href);
                            }
                          : undefined
                      }
                    >
                      {text}
                    </a>
                  ) : (
                    text
                  ),
                )
              : "This message has no text. Open the source app to view its media."}
          </p>
          <div className="mt-2 flex gap-1">
            {onCreateTask && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onCreateTask(
                    communicationTaskDraft({
                      provider: account.provider,
                      accountId: account.id,
                      conversationId: message.conversationId,
                      messageId: message.id,
                      threadId: account.provider === "slack" ? message.threadId : undefined,
                      title: message.text.split("\n")[0] || `Follow up with ${message.author}`,
                      text: message.text,
                    }),
                  )
                }
              >
                Create task
              </Button>
            )}
            <Button
              size="icon-xs"
              variant={isSaved(message) ? "secondary" : "ghost-muted"}
              aria-label={isSaved(message) ? "Remove from Later" : "Save for Later"}
              aria-pressed={isSaved(message)}
              onClick={() => toggleSaved(message)}
            >
              <BookmarkIcon />
            </Button>
            {conversation?.canSend && !inThread && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setThread(undefined);
                  setReplyTo(message);
                }}
              >
                <ReplyIcon />
                Reply
              </Button>
            )}
            {!inThread &&
              (account.provider === "slack" ||
                (account.provider === "discord" && message.threadId)) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void openThread(message)}
                >
                  <MessageCircleIcon />
                  Thread
                </Button>
              )}
          </div>
        </div>
      </article>
    );
  }
  return (
    <div ref={root} className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <OfficeSubnav
        label="Chat views"
        items={[
          { id: "home", label: "Home", icon: HomeIcon },
          { id: "dms", label: "DMs", icon: MessageCircleIcon },
          { id: "later", label: "Later", icon: BookmarkIcon },
        ]}
        value={view}
        onChange={(id) => {
          if (id === "home" || id === "dms" || id === "later") setView(id);
        }}
      />
      <aside
        aria-label="Channels and direct messages"
        className="hidden w-52 shrink-0 flex-col border-r border-border bg-sidebar lg:flex"
      >
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold">{account.label}</h2>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {providerNames[account.provider]} · {account.identity}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <h3 className="px-2 py-2 text-xs font-medium text-muted-foreground">General</h3>
          {visibleConversations.map((item) => (
            <button
              type="button"
              key={item.id}
              disabled={busy}
              aria-current={conversation?.id === item.id ? "page" : undefined}
              className={cn(
                "my-1 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-row-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60",
                conversation?.id === item.id && "bg-sidebar-row-active",
              )}
              onClick={() => selectGeneralConversation(item)}
            >
              {item.kind === "dm" ? (
                <MessageCircleIcon className="mt-0.5 size-4 shrink-0" />
              ) : (
                <HashIcon className="mt-0.5 size-4 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block truncate">{item.title}</span>
                <span className="text-xs text-muted-foreground">{item.workspace || item.kind}</span>
              </span>
            </button>
          ))}
          {loaded && !visibleConversations.length && (
            <p className="p-2 text-xs text-muted-foreground">
              No loaded conversations in this view.
            </p>
          )}
          {conversationCursor && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void loadConversations(conversationCursor)}
            >
              Load more conversations
            </Button>
          )}
          {projectSidebar}
        </div>
        <p className="border-t border-border p-3 text-xs text-muted-foreground">
          {account.provider === "discord"
            ? "Bot-accessible channels only"
            : account.provider === "telegram"
              ? "Personal Telegram account"
              : "Token permissions apply"}
        </p>
      </aside>
      <section
        aria-label="Chat history"
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          thread && !waitingForRequestedConversation && "hidden",
        )}
      >
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">
                {waitingForRequestedConversation
                  ? "Opening project conversation"
                  : view === "later"
                    ? "Later"
                    : (conversation?.title ?? "Choose a conversation")}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {providerNames[account.provider]} · {account.identity}
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Refresh conversations and history"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  await loadConversations();
                  if (conversation) await loadMessages(conversation);
                })()
              }
            >
              <RefreshCwIcon />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={searchInput}
              aria-label="Search loaded conversations"
              placeholder="Search loaded conversations · Ctrl K"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="block lg:hidden">
            <span className="sr-only">Conversation</span>
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
              disabled={busy}
              value={conversation?.id ?? ""}
              onChange={(event) => {
                const selected = conversations.find((item) => item.id === event.target.value);
                if (selected) selectGeneralConversation(selected);
              }}
            >
              <option value="">Choose a conversation</option>
              {visibleConversations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {conversationCursor && (
            <div className="lg:hidden">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void loadConversations(conversationCursor)}
              >
                Load more conversations
              </Button>
            </div>
          )}
          <RequestState busy={busy} error={error} />
          {requestedConversationId &&
            conversation?.id !== requestedConversationId &&
            loaded &&
            !busy && (
              <p role="status" className="text-xs text-muted-foreground">
                {conversationCursor
                  ? "The linked channel is not loaded yet. Load more conversations to continue searching."
                  : "This connection cannot find the linked channel. Check its access or reconnect it in project settings."}
              </p>
            )}
          {projectSidebar && (
            <details className="lg:hidden">
              <summary className="cursor-pointer text-sm">Projects</summary>
              {projectSidebar}
            </details>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!loaded ? (
            <p className="p-6 text-sm text-muted-foreground">
              {error
                ? "Conversations could not be loaded. Use Refresh to retry."
                : "Loading conversations…"}
            </p>
          ) : waitingForRequestedConversation ? (
            <p className="p-6 text-sm text-muted-foreground">
              Looking for the linked channel in this connection’s accessible conversations.
            </p>
          ) : !conversation ? (
            <p className="p-6 text-sm text-muted-foreground">
              Choose a channel or direct message to load its history. Activity notifications and
              reactions are not available through these connections.
            </p>
          ) : (
            <>
              {requestedMessageId &&
                !busy &&
                !(requestedThreadId ? threadMessages : messages).some(
                  (message) => message.id === requestedMessageId,
                ) && (
                  <p role="status" className="border-b p-4 text-sm text-muted-foreground">
                    The linked message is not in the loaded history. Load earlier messages or check
                    access in the source service.
                  </p>
                )}
              {messageCursor && view !== "later" && (
                <div className="p-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void loadMessages(conversation, messageCursor)}
                  >
                    Load earlier messages
                  </Button>
                </div>
              )}
              {view === "later" && (
                <p className="border-b border-border p-4 text-xs text-muted-foreground">
                  Saved messages from the loaded history of this conversation. References stay on
                  this device.
                </p>
              )}
              {visibleMessages.map((message) => renderMessage(message))}
              {!visibleMessages.length && !busy && (
                <p className="p-6 text-sm text-muted-foreground">
                  No messages in the loaded history for this view.
                </p>
              )}
              <div ref={historyEnd} />
            </>
          )}
        </div>
        {conversation && view !== "later" && !waitingForRequestedConversation && (
          <ChatComposer
            key={JSON.stringify([account.id, conversation.id])}
            account={account}
            conversation={conversation}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(undefined)}
            onAcknowledged={(message) => acknowledge(message)}
          />
        )}
      </section>
      {thread && conversation && !waitingForRequestedConversation && (
        <section aria-label="Message thread" className="flex min-w-0 flex-1 flex-col bg-background">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Thread</h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {conversation.title} · {providerNames[account.provider]}
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Refresh thread"
              disabled={busy}
              onClick={() => void loadThread(thread)}
            >
              <RefreshCwIcon />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Back to channel"
              onClick={() => {
                setThread(undefined);
                threadDestination.current = undefined;
              }}
            >
              <ArrowLeftIcon />
              Back to channel
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 pt-3">
              <RequestState busy={busy} error={error} />
            </div>
            {renderMessage(thread, true)}
            {threadCursor && (
              <div className="p-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void loadThread(thread, threadCursor)}
                >
                  Load more replies
                </Button>
              </div>
            )}
            {threadMessages
              .filter((message) => message.id !== thread.id)
              .map((message) => renderMessage(message, true))}
            <div ref={threadEnd} />
          </div>
          {threadConversation ? (
            <ChatComposer
              key={JSON.stringify([
                account.id,
                threadConversation.id,
                thread.threadId ?? thread.id,
              ])}
              account={account}
              conversation={threadConversation}
              replyTo={thread}
              nativeThread
              onAcknowledged={(message) => acknowledge(message, true)}
            />
          ) : (
            <p className="border-t border-border p-4 text-xs text-muted-foreground">
              Load the native Discord thread in the conversation list before sending. Sending
              permission is checked on that thread.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
