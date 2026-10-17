import { useCallback, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import * as Schema from "effect/Schema";
import { parseChatResourceId } from "@t3tools/contracts";
import type {
  WorkspaceLinkEndpoint,
  EnvironmentId,
  ChatAccount,
  ChatConversation,
  ChatMessage,
} from "@t3tools/contracts";
import {
  BookmarkIcon,
  HashIcon,
  HomeIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn, randomUUID } from "../../lib/utils";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { RequestState } from "./office/shared";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import {
  chatEndpoint,
  chatItem,
  chatReferenceKey,
  mergeChatMessages,
  sendAttempt,
} from "./communicationsChat";

import type { ChatSource } from "./CommunicationsWorkspace";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { displayDay, formatDay, formatEventTime } from "@t3tools/client-runtime/calendar/dates";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { WorkspaceLinkedContext } from "./WorkspaceLinkedContext";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { endpointTitle } from "./mail/linkedItems";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";

const SavedReference = Schema.Struct({
  provider: Schema.String,
  accountId: Schema.String,
  conversationId: Schema.String,
  messageId: Schema.String,
  environmentId: Schema.optionalKey(Schema.String),
  resourceId: Schema.optionalKey(Schema.String),
});
const SavedReferences = Schema.Array(SavedReference).check(Schema.isMaxLength(500));
const emptySaved: typeof SavedReferences.Type = [];
const providerNames = { slack: "Slack", discord: "Discord", telegram: "Telegram" };

function ChatUnavailable({ reasons }: { reasons: readonly (string | undefined)[] }) {
  return [...new Set(reasons)]
    .filter((reason) => reason !== undefined)
    .map((reason) => (
      <p key={reason} role="status" className="px-4 py-2 text-xs text-muted-foreground">
        {reason}
      </p>
    ));
}
function ChatItemRow({
  environmentId,
  endpoint,
  children,
  onSelect,
}: {
  environmentId: EnvironmentId | null;
  endpoint?: WorkspaceLinkEndpoint | undefined;
  children: ReactNode;
  onSelect?: (() => void) | undefined;
}) {
  return (
    <div
      className="group/chatrow relative min-w-0"
      onContextMenuCapture={onSelect}
      onKeyDownCapture={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) onSelect?.();
      }}
      onClickCapture={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-workspace-menu-trigger]")
        )
          onSelect?.();
      }}
    >
      {endpoint && environmentId ? (
        <WorkspaceItemMenu
          environmentId={environmentId}
          item={endpoint}
          triggerClassName="absolute right-3 top-1 opacity-0 group-hover/chatrow:opacity-100 group-focus-within/chatrow:opacity-100 group-has-[[data-workspace-menu-open=true]]/chatrow:opacity-100 pointer-coarse:opacity-100"
        >
          {children}
        </WorkspaceItemMenu>
      ) : (
        children
      )}
    </div>
  );
}

function ChatComposer({
  account,
  conversation,
  replyTo,
  onAcknowledged,
  onCancelReply,
  nativeThread = false,
  writable,
}: {
  account: ChatAccount;
  conversation: ChatConversation;
  replyTo?: ChatMessage | undefined;
  onAcknowledged: (message: ChatMessage) => void;
  onCancelReply?: () => void;
  nativeThread?: boolean;
  writable: boolean;
}) {
  const { run, busy, error } = useCommunicationsRequest();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const attempt = useRef<ReturnType<typeof sendAttempt> | undefined>(undefined);
  async function send() {
    if (busy || !writable || !text.trim() || !conversation.canSend) return;
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
        <Button type="submit" size="sm" disabled={busy || !writable || !text.trim()}>
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

interface ChatWorkspaceProps {
  account: ChatAccount;
  environmentId: EnvironmentId | null;
  controls?: ReactNode;
  source?: ChatSource | undefined;
}
export function ChatCommunicationsWorkspace(props: ChatWorkspaceProps) {
  return props.environmentId ? (
    <ScopedChatWorkspace {...props} environmentId={props.environmentId} />
  ) : (
    <ChatWorkspace {...props} timeZone="UTC" writable={false} />
  );
}
function ScopedChatWorkspace(props: ChatWorkspaceProps & { environmentId: EnvironmentId }) {
  const timeZone =
    useEnvironmentSettings(props.environmentId, (settings) => settings.workspaceDisplayTimeZone) ??
    "UTC";
  const canOperate = useWorkspaceCanOperate(props.environmentId);
  const connected = useConnectedEnvironmentIds().includes(props.environmentId);
  return <ChatWorkspace {...props} timeZone={timeZone} writable={canOperate && connected} />;
}
function ChatWorkspace({
  account,
  environmentId,
  controls,
  source,
  timeZone,
  writable,
}: ChatWorkspaceProps & { timeZone: string; writable: boolean }) {
  const { run, busy, error } = useCommunicationsRequest();
  const initialResourceId = source?.resourceId;
  const [now] = useState(() => new Date(Date.now()).toISOString());
  const today = displayDay(now, timeZone);
  const openItem = useWorkspaceItemOpener(environmentId);
  const initialOpened = useRef(false);
  const [sourceNotice, setSourceNotice] = useState<string>();
  const [selectedMessage, setSelectedMessage] = useState<WorkspaceLinkEndpoint>();
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

  const loadConversations = useCallback(
    async (cursor?: string) => {
      const initialResource = initialResourceId
        ? parseChatResourceId(initialResourceId)
        : undefined;
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
      if (initialResource && !initialOpened.current) {
        const selected = result.conversations?.find(
          (item) =>
            item.id === initialResource.conversationId &&
            item.accountId === initialResource.connectionId &&
            item.workspaceId === initialResource.workspaceId,
        );
        if (!selected) {
          const wrongWorkspace = result.conversations?.some(
            (item) =>
              item.id === initialResource.conversationId &&
              item.accountId === initialResource.connectionId,
          );
          setSourceNotice(
            wrongWorkspace
              ? "This conversation belongs to a different workspace. Open it from its original account."
              : `This conversation is unavailable.${result.nextCursor ? " Load more conversations or open it in the source app." : " It may have been removed. Open it in the source app."}`,
          );
          return;
        }
        initialOpened.current = true;
        destination.current = selected.id;
        setConversation(selected);
        const initialRef =
          initialResource.messageId && initialResourceId
            ? {
                ref: {
                  type: "provider-resource" as const,
                  provider: account.provider,
                  resourceId: initialResourceId,
                },
              }
            : undefined;
        setSelectedMessage(initialRef);
        const history = await run({
          operation: "messages.list",
          accountId: account.id,
          conversationId: selected.id,
        });
        if (!history || !active.current || destination.current !== selected.id) return;
        setMessages(mergeChatMessages([], history.messages ?? []));
        setMessageCursor(history.nextCursor);
        let exact = history.messages?.find((message) => message.id === initialResource.messageId);
        const replyRoot =
          account.provider === "slack" &&
          initialResource.messageId &&
          initialResource.replyRootId !== initialResource.messageId
            ? initialResource.replyRootId
            : undefined;
        if (replyRoot) {
          threadDestination.current = replyRoot;
          const replies = await run({
            operation: "messages.list",
            accountId: account.id,
            conversationId: selected.id,
            threadId: replyRoot,
          });
          if (
            !active.current ||
            destination.current !== selected.id ||
            threadDestination.current !== replyRoot
          )
            return;
          if (!replies) {
            setSourceNotice(
              "Replies are unavailable for this connection. Open the thread in Slack.",
            );
            return;
          }
          exact =
            replies.messages?.find((message) => message.id === initialResource.messageId) ?? exact;
          const anchor = replies.messages?.find((message) => message.id === replyRoot) ?? exact;
          if (anchor) setThread({ ...anchor, threadId: replyRoot });
          setThreadMessages(mergeChatMessages([], replies.messages ?? []));
          setThreadCursor(replies.nextCursor);
        }
        // Opening a saved link never rewrites its original address.
        if (initialRef)
          setSelectedMessage({
            ...initialRef,
            ...(exact
              ? { title: endpointTitle(`${exact.author}: ${exact.text || "Message"}`) }
              : {}),
          });
        setSourceNotice(
          account.provider === "slack" && initialResource.messageId && !initialResource.replyRootId
            ? "This legacy Slack message has no known reply root. Exact reply reading is unsupported until you reopen the source."
            : initialResource.messageId && !exact
              ? "This message is unavailable. It may have been deleted or be outside the messages loaded here. Its saved link has been kept."
              : undefined,
        );
      }
    },
    [account.id, account.provider, run, initialResourceId],
  );
  useEffect(() => {
    active.current = true;
    void loadConversations();
    return () => {
      active.current = false;
    };
  }, [loadConversations]);
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
        setSelectedMessage(undefined);
        threadDestination.current = undefined;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  async function loadMessages(selected: ChatConversation, cursor?: string) {
    const result = await run({
      operation: "messages.list",
      accountId: account.id,
      conversationId: selected.id,
      ...(cursor ? { cursor } : {}),
    });
    if (!result || !active.current || destination.current !== selected.id) return;
    setMessages((previous) => mergeChatMessages(cursor ? previous : [], result.messages ?? []));
    setMessageCursor(result.nextCursor);
  }
  async function openConversation(selected: ChatConversation) {
    if (busy) return;
    initialOpened.current = true;
    setSelectedMessage(undefined);
    setSourceNotice(undefined);
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
  function reference(message: ChatMessage, endpoint?: WorkspaceLinkEndpoint) {
    return {
      provider: account.provider,
      accountId: message.accountId,
      conversationId: message.conversationId,
      messageId: message.id,
      ...(environmentId ? { environmentId } : {}),
      ...(endpoint?.ref.type === "provider-resource"
        ? { resourceId: endpoint.ref.resourceId }
        : {}),
    };
  }
  const savedKeys = useMemo(() => new Set(saved.map(chatReferenceKey)), [saved]);
  const loadedLegacyKeys = useMemo(
    () =>
      new Set(
        messages.map((message) =>
          chatReferenceKey({
            provider: account.provider,
            accountId: message.accountId,
            conversationId: message.conversationId,
            messageId: message.id,
          }),
        ),
      ),
    [account.provider, messages],
  );
  function savedMessage(message: ChatMessage, endpoint?: WorkspaceLinkEndpoint) {
    return (
      savedKeys.has(chatReferenceKey(reference(message, endpoint))) ||
      savedKeys.has(chatReferenceKey(reference(message)))
    );
  }
  function toggleSaved(message: ChatMessage, endpoint: WorkspaceLinkEndpoint) {
    if (!writable || !environmentId) return;
    const entry = reference(message, endpoint);
    const key = chatReferenceKey(entry);
    const legacyKey = chatReferenceKey(reference(message));
    setSaved((previous) =>
      previous.some((item) => [key, legacyKey].includes(chatReferenceKey(item)))
        ? previous.filter((item) => ![key, legacyKey].includes(chatReferenceKey(item)))
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
  const selectedResource = useMemo(
    () =>
      selectedMessage?.ref.type === "provider-resource"
        ? parseChatResourceId(selectedMessage.ref.resourceId)
        : undefined,
    [selectedMessage],
  );
  const conversationRows = useMemo(
    () => conversations.map((item) => ({ item, ...chatItem(account, item) })),
    [account, conversations],
  );
  const visibleConversationRows = conversationRows.filter(
    ({ item }) =>
      (view !== "dms" || item.kind === "dm") &&
      [item.title, item.workspace].some((value) =>
        value.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const visibleConversations = visibleConversationRows.map(({ item }) => item);
  const messageRows = useMemo(
    () =>
      messages.map((message) => ({
        message,
        ...(conversation
          ? chatItem(account, conversation, message)
          : { reason: "Open this conversation in the source app." }),
      })),
    [account, conversation, messages],
  );
  const threadRows = useMemo(
    () =>
      threadMessages.map((message) => ({
        message,
        ...(threadConversation
          ? chatItem(account, threadConversation, message)
          : { reason: "Open this conversation in the source app." }),
      })),
    [account, threadConversation, threadMessages],
  );
  const visibleMessages = messageRows.filter(
    ({ message, endpoint }) => view !== "later" || savedMessage(message, endpoint),
  );
  const legacySaved = saved.filter(
    (item) =>
      !item.resourceId &&
      item.provider === account.provider &&
      item.accountId === account.id &&
      item.conversationId === conversation?.id &&
      !loadedLegacyKeys.has(chatReferenceKey(item)),
  );
  const listReason = environmentId
    ? conversationRows.map((row) => row.reason)
    : ["Choose an environment to use chat actions."];
  const messageReason = environmentId
    ? messageRows.map((row) => row.reason)
    : ["Choose an environment to use chat actions."];
  function renderMessage(
    { message, endpoint }: { message: ChatMessage; endpoint?: WorkspaceLinkEndpoint | undefined },
    inThread = false,
  ) {
    const day = displayDay(message.date, timeZone);
    const isSaved = savedMessage(message, endpoint);
    const selected =
      selectedResource?.connectionId === message.accountId &&
      selectedResource.conversationId === message.conversationId &&
      selectedResource.messageId === message.id;
    const row = (
      <article
        tabIndex={0}
        aria-current={selected ? "true" : undefined}
        onClick={() => setSelectedMessage(endpoint)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target === event.currentTarget) {
            event.preventDefault();
            setSelectedMessage(endpoint);
          }
        }}
        className={cn(
          "flex min-w-0 flex-1 gap-3 border-b border-border/50 px-4 pr-12 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          selected && "bg-sidebar-row-active",
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">
          {message.author.slice(0, 2).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <strong className="min-w-0 break-words text-sm font-semibold">
              {message.author || "Unknown author"}
            </strong>
            <time dateTime={message.date} className="text-3xs text-muted-foreground">
              {day !== today &&
                `${formatDay(day, { day: "numeric", month: "short", year: "numeric" })}, `}
              {formatEventTime(message.date, timeZone)}
            </time>
          </div>
          {message.replyToId && (
            <p className="mt-1 text-xs text-muted-foreground">
              Reply to message {message.replyToId}
            </p>
          )}
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.text || "This message has no text. Open the source app to view its media."}
          </p>
          <div className="mt-2 flex gap-1">
            <Button
              size="icon-xs"
              variant={isSaved ? "secondary" : "ghost-muted"}
              aria-label={isSaved ? "Remove from Later" : "Save for Later"}
              aria-pressed={isSaved}
              disabled={!endpoint || !environmentId || !writable}
              onClick={() => {
                if (endpoint) toggleSaved(message, endpoint);
              }}
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
    return (
      <ChatItemRow
        key={message.id}
        environmentId={environmentId}
        endpoint={endpoint}
        onSelect={() => setSelectedMessage(endpoint)}
      >
        {row}
      </ChatItemRow>
    );
  }

  const selectedEndpoint =
    selectedMessage ?? (conversation ? chatEndpoint(account, conversation) : undefined);
  const header = useWorkspaceHeaderModel(
    environmentId,
    view === "later" ? "Later" : (conversation?.title ?? "Communications"),
    "Communications",
    `${providerNames[account.provider]} · ${account.identity}`,
  );
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="communications"
      layout="split"
      header={header}
      resources={<WorkspaceProjectResources />}
      {...(environmentId
        ? {
            linkedContext: {
              item: selectedEndpoint ?? null,
              render: (item: WorkspaceLinkEndpoint) => (
                <WorkspaceLinkedContext
                  environmentId={environmentId}
                  item={item}
                  onOpen={openItem}
                />
              ),
            },
          }
        : {})}
      selected={conversation !== undefined}
      onBack={() => {
        destination.current = undefined;
        threadDestination.current = undefined;
        setConversation(undefined);
        setThread(undefined);
        setSelectedMessage(undefined);
      }}
      list={
        <div>
          {controls}
          {sourceNotice && !conversation ? (
            <p role="status" className="p-2 text-xs text-muted-foreground">
              {sourceNotice}
            </p>
          ) : null}
          <nav aria-label="Chat views" className="flex flex-wrap gap-1 p-2">
            {[
              { id: "home", label: "Home", icon: HomeIcon },
              { id: "dms", label: "DMs", icon: MessageCircleIcon },
              { id: "later", label: "Later", icon: BookmarkIcon },
            ].map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                aria-pressed={view === id}
                className="p-1 text-xs"
                onClick={() => {
                  if (id === "home" || id === "dms" || id === "later") setView(id);
                }}
              >
                <Icon className="size-3" />
                {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <ChatUnavailable reasons={listReason} />
            {visibleConversationRows.map(({ item, endpoint }) => {
              const row = (
                <button
                  type="button"
                  key={item.id}
                  disabled={busy}
                  aria-current={conversation?.id === item.id ? "page" : undefined}
                  className={cn(
                    "my-1 flex w-full items-start gap-2 rounded-md px-2 pr-12 py-2 text-left text-sm hover:bg-sidebar-row-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60",
                    conversation?.id === item.id && "bg-sidebar-row-active",
                  )}
                  onClick={() => void openConversation(item)}
                >
                  {item.kind === "dm" ? (
                    <MessageCircleIcon className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <HashIcon className="mt-0.5 size-4 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.workspace || item.kind}
                    </span>
                  </span>
                </button>
              );
              return (
                <ChatItemRow key={item.id} environmentId={environmentId} endpoint={endpoint}>
                  {row}
                </ChatItemRow>
              );
            })}
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
          </div>
          <p className="border-t border-border p-3 text-xs text-muted-foreground">
            {account.provider === "discord"
              ? "Bot-accessible channels only"
              : account.provider === "telegram"
                ? "Personal Telegram account"
                : "Token permissions apply"}
          </p>
        </div>
      }
    >
      <div ref={root} className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <section aria-label="Chat history" className="flex min-w-0 flex-1 flex-col">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-start justify-between gap-3">
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
            <label className="block md:hidden">
              <span className="sr-only">Conversation</span>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                disabled={busy}
                value={conversation?.id ?? ""}
                onChange={(event) => {
                  const selected = conversations.find((item) => item.id === event.target.value);
                  if (selected) void openConversation(selected);
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
              <div className="md:hidden">
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
            {sourceNotice && conversation ? (
              <p role="status" className="text-xs text-muted-foreground">
                {sourceNotice}
              </p>
            ) : null}
            {selectedMessage ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{selectedMessage.title ?? "Selected message"}</span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Clear message selection"
                  onClick={() => setSelectedMessage(undefined)}
                >
                  <XIcon />
                </Button>
              </div>
            ) : null}
            {environmentId && selectedEndpoint ? (
              <WorkspaceItemActions
                environmentId={environmentId}
                item={selectedEndpoint}
                shortcuts
              />
            ) : null}
            <RequestState busy={busy} error={error} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!loaded ? (
              <p className="p-6 text-sm text-muted-foreground">
                {error
                  ? "Conversations could not be loaded. Use Refresh to retry."
                  : "Loading conversations…"}
              </p>
            ) : !conversation ? (
              <p className="p-6 text-sm text-muted-foreground">
                Choose a channel or direct message to load its history. Activity notifications and
                reactions are not available through these connections.
              </p>
            ) : (
              <>
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
                <ChatUnavailable reasons={messageReason} />
                {visibleMessages.map((row) => renderMessage(row))}
                {view === "later" && legacySaved.length > 0 ? (
                  <ul aria-label="Unavailable saved references" className="space-y-3 p-4 text-xs">
                    {legacySaved.map((item) => (
                      <li key={chatReferenceKey(item)} className="space-y-1">
                        <p>{conversation.title}: Saved message (details unavailable)</p>
                        <p className="text-muted-foreground">
                          This saved message is outside the messages loaded here or was removed.
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!writable}
                          onClick={() =>
                            writable &&
                            setSaved((previous) =>
                              previous.filter(
                                (entry) => chatReferenceKey(entry) !== chatReferenceKey(item),
                              ),
                            )
                          }
                        >
                          Remove from Later
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!visibleMessages.length && (view !== "later" || !legacySaved.length) && !busy && (
                  <p className="p-6 text-sm text-muted-foreground">
                    No messages in the loaded history for this view.
                  </p>
                )}
                <div ref={historyEnd} />
              </>
            )}
          </div>
          {conversation && view !== "later" && (
            <ChatComposer
              key={JSON.stringify([account.id, conversation.id])}
              account={account}
              writable={writable}
              conversation={conversation}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(undefined)}
              onAcknowledged={(message) => acknowledge(message)}
            />
          )}
        </section>
        {thread && conversation && (
          <aside
            aria-label="Message thread"
            className="absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl xl:static xl:w-80 xl:shrink-0 xl:shadow-none"
          >
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
                size="icon-sm"
                variant="ghost"
                aria-label="Close thread"
                onClick={() => {
                  setThread(undefined);
                  threadDestination.current = undefined;
                }}
              >
                <XIcon />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-4 pt-3">
                <RequestState busy={busy} error={error} />
              </div>
              <p className="border-b border-border p-4 text-sm">{thread.text}</p>
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
              <ChatUnavailable
                reasons={
                  environmentId
                    ? threadRows.map((row) => row.reason)
                    : ["Choose an environment to use chat actions."]
                }
              />
              {threadRows
                .filter(({ message }) => message.id !== thread.id)
                .map((row) => renderMessage(row, true))}
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
                writable={writable}
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
          </aside>
        )}
      </div>
    </WorkspaceEngagement>
  );
}
