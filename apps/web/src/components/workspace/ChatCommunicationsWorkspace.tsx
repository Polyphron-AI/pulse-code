import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import * as Schema from "effect/Schema";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  parseChatResourceId,
  chatResourceId,
  workspaceItemKey,
  type WorkspaceLinkEndpoint,
  type EnvironmentId,
  type ChatAccount,
  type ChatConversation,
  type ChatMessage,
  type ProjectId,
} from "@t3tools/contracts";
import { BookmarkIcon, RefreshCwIcon, SendIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { randomUUID } from "../../lib/utils";
import { RequestState } from "./office/shared";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import {
  chatEndpoint,
  chatItem,
  chatReferenceKey,
  mergeChatMessages,
  sendAttempt,
  conversationGroups,
  conversationSubtitle,
  legacySlackNotice,
  type ConversationRow,
  type ConversationProject,
  type SavedChatReference,
} from "./communicationsChat";
import { ConversationNavigation } from "./ConversationNavigation";
import { ConversationMessage } from "./ConversationMessage";
import type { ChatSource } from "./CommunicationsWorkspace";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { displayDay, formatDay } from "@t3tools/client-runtime/calendar/dates";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { WorkspaceLinkedContext } from "./WorkspaceLinkedContext";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { endpointTitle } from "./mail/linkedItems";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { parseWorkspaceSearch } from "./workspaceNavigation";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import "./communications.css";

export { ConversationNavigation } from "./ConversationNavigation";

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
          triggerClassName="absolute right-1 top-1 opacity-0 group-hover/chatrow:opacity-100 group-focus-within/chatrow:opacity-100 group-has-[[data-workspace-menu-open=true]]/chatrow:opacity-100 pointer-coarse:opacity-100"
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
  source?: ChatSource | undefined;
  accountError?: string | undefined;
  accountControls?: ReactNode;
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
function ConversationProjectLinks({
  environmentId,
  projectId,
  title,
  onChange,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  title: string;
  onChange: (project: ConversationProject) => void;
}) {
  const links = useEnvironmentQuery(
    workspaceLinks.list({ environmentId, input: { item: { type: "project", projectId } } }),
  );
  useEffect(() => {
    onChange({
      key: projectId,
      label: title,
      conversationKeys: links.error
        ? []
        : (links.data?.linked ?? [])
            .filter((link) => link.status === "confirmed")
            .map((link) => workspaceItemKey(link.item.ref)),
    });
  }, [links.data, links.error, projectId, title, onChange]);
  return null;
}

function ChatWorkspace({
  account,
  environmentId,
  source,
  timeZone,
  writable,
  accountError,
  accountControls,
}: ChatWorkspaceProps & { timeZone: string; writable: boolean }) {
  const { run, busy, error } = useCommunicationsRequest();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const openItem = useWorkspaceItemOpener(environmentId);
  const capability = useMailCapabilities(environmentId ?? undefined);
  const allProjects = useProjects();
  const projects = useMemo(
    () => allProjects.filter((project) => project.environmentId === environmentId),
    [allProjects, environmentId],
  );
  const [projectLinks, setProjectLinks] = useState<ReadonlyMap<string, ConversationProject>>(
    () => new Map(),
  );
  const onProjectLinks = useCallback(
    (project: ConversationProject) =>
      setProjectLinks((current) => {
        const previous = current.get(project.key);
        return previous?.label === project.label &&
          previous.conversationKeys.length === project.conversationKeys.length &&
          previous.conversationKeys.every((key, index) => key === project.conversationKeys[index])
          ? current
          : new Map(current).set(project.key, project);
      }),
    [],
  );
  const [conversations, setConversations] = useState<readonly ChatConversation[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string>();
  const [conversation, setConversation] = useState<ChatConversation>();
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<string>();
  const [selectedMessage, setSelectedMessage] = useState<WorkspaceLinkEndpoint>();
  const [sourceNotice, setSourceNotice] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage>();
  const [thread, setThread] = useState<ChatMessage>();
  const [threadMessages, setThreadMessages] = useState<readonly ChatMessage[]>([]);
  const [threadCursor, setThreadCursor] = useState<string>();
  const [saved, setSaved] = useLocalStorage(
    "pulse:communications:later:chat:v1",
    emptySaved,
    SavedReferences,
  );
  const compact = useMediaQuery("max-md");
  const active = useRef(true);
  const destination = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const threadGeneration = useRef(0);
  const handled = useRef<string | undefined>(undefined);
  const searchInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const historyEnd = useRef<HTMLDivElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const sourceId = source?.resourceId;
  const loadConversations = useCallback(
    async (cursor?: string) => {
      const result = await run({
        operation: "conversations.list",
        accountId: account.id,
        ...(cursor ? { cursor } : {}),
      });
      if (!result || !active.current) return;
      const rows = (result.conversations ?? []).filter(
        (item) =>
          item.accountId === account.id && (account.provider === "slack" || item.kind !== "dm"),
      );
      setConversations((previous) =>
        cursor
          ? [...new Map([...previous, ...rows].map((item) => [item.id, item])).values()]
          : rows,
      );
      setConversationCursor(result.nextCursor);
      setLoaded(true);
    },
    [run, account.id, account.provider],
  );
  useEffect(() => {
    active.current = true;
    void loadConversations();
    return () => {
      active.current = false;
      generation.current++;
      threadGeneration.current++;
    };
  }, [loadConversations]);
  useEffect(() => {
    if (!loaded || handled.current === sourceId) return;
    handled.current = sourceId;
    const current = ++generation.current;
    threadGeneration.current++;
    const resource = sourceId ? parseChatResourceId(sourceId) : undefined;
    destination.current = resource?.conversationId;
    setSelectedMessage(undefined);
    setThread(undefined);
    setReplyTo(undefined);
    setSourceNotice(undefined);
    if (!resource) {
      setConversation(undefined);
      return;
    }
    const selected = conversations.find(
      (item) =>
        item.id === resource.conversationId &&
        item.accountId === resource.connectionId &&
        item.workspaceId === resource.workspaceId,
    );
    if (!selected) {
      handled.current = undefined;
      setConversation(undefined);
      setSourceNotice(
        conversations.some(
          (item) => item.id === resource.conversationId && item.accountId === resource.connectionId,
        )
          ? "This conversation belongs to a different workspace. Open it from its original account."
          : `This conversation is unavailable.${conversationCursor ? " Load more conversations or open it in the source app." : " It may have been removed. Open it in the source app."}`,
      );
      return;
    }
    const reuse =
      conversation?.id === selected.id &&
      (!resource.messageId || messages.some((message) => message.id === resource.messageId));
    setConversation(selected);
    const legacy = legacySlackNotice(account.provider, resource);
    setSourceNotice(legacy);
    const exactEndpoint: WorkspaceLinkEndpoint | undefined =
      resource.messageId && sourceId
        ? { ref: { type: "provider-resource", provider: account.provider, resourceId: sourceId } }
        : undefined;
    setSelectedMessage(exactEndpoint);
    if (
      reuse &&
      !(
        account.provider === "slack" &&
        resource.replyRootId &&
        resource.replyRootId !== resource.messageId
      )
    )
      return;
    if (!reuse) {
      setMessages([]);
      setMessageCursor(undefined);
    }
    void (async () => {
      const history = reuse
        ? { messages, nextCursor: messageCursor }
        : await run({
            operation: "messages.list",
            accountId: account.id,
            conversationId: selected.id,
          });
      if (!active.current || current !== generation.current || !history) return;
      const rows = (history.messages ?? []).filter(
        (message) => message.accountId === account.id && message.conversationId === selected.id,
      );
      if (!reuse) {
        setMessages(mergeChatMessages([], rows));
        setMessageCursor(history.nextCursor);
      }
      let exact = rows.find((message) => message.id === resource.messageId);
      if (
        account.provider === "slack" &&
        resource.messageId &&
        resource.replyRootId &&
        resource.replyRootId !== resource.messageId
      ) {
        const replies = await run({
          operation: "messages.list",
          accountId: account.id,
          conversationId: selected.id,
          threadId: resource.replyRootId,
        });
        if (!active.current || current !== generation.current) return;
        if (!replies) {
          setSourceNotice("Replies are unavailable for this connection. Open the thread in Slack.");
          return;
        }
        const replyRows = (replies.messages ?? []).filter(
          (message) => message.accountId === account.id && message.conversationId === selected.id,
        );
        exact = replyRows.find((message) => message.id === resource.messageId) ?? exact;
        const anchor = replyRows.find((message) => message.id === resource.replyRootId) ?? exact;
        if (anchor) setThread({ ...anchor, threadId: resource.replyRootId });
        setThreadMessages(mergeChatMessages([], replyRows));
        setThreadCursor(replies.nextCursor);
      }
      if (exactEndpoint)
        setSelectedMessage({
          ...exactEndpoint,
          ...(exact ? { title: endpointTitle(`${exact.author}: ${exact.text || "Message"}`) } : {}),
        });
      setSourceNotice(
        legacy ??
          (resource.messageId && !exact
            ? "This message is unavailable. It may have been deleted or be outside the messages loaded here. Its saved link has been kept."
            : undefined),
      );
    })();
  }, [sourceId, loaded, conversations, conversationCursor, run, account.id, account.provider]);
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "k" &&
      searchInput.current &&
      (root.current?.contains(document.activeElement) || document.activeElement === document.body)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (conversation && compact) {
        backToList();
        requestAnimationFrame(() => searchInput.current?.focus());
      } else searchInput.current?.focus();
    }
    if (
      event.key === "Escape" &&
      !event.defaultPrevented &&
      root.current?.contains(document.activeElement) &&
      !root.current.querySelector("[data-conversation-filters]")
    ) {
      if (thread) {
        setThread(undefined);
        threadGeneration.current++;
      } else if (selectedMessage && conversation)
        selectEndpoint(chatEndpoint(account, conversation)!);
    }
  });
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, []);
  function backToList() {
    generation.current++;
    threadGeneration.current++;
    destination.current = undefined;
    setConversation(undefined);
    setThread(undefined);
    setSelectedMessage(undefined);
    const { item: _item, ...rest } = parseWorkspaceSearch(search);
    void navigate({ to: "/workspace", search: { ...rest, space: "communications" } });
  }
  const selectEndpoint = useCallback(
    (endpoint: WorkspaceLinkEndpoint) => {
      if (
        endpoint.ref.type !== "provider-resource" ||
        (endpoint.ref.provider !== "slack" && endpoint.ref.provider !== "discord")
      )
        return;
      const resource = parseChatResourceId(endpoint.ref.resourceId);
      if (!resource) return;
      void navigate({
        to: "/workspace",
        search: {
          ...parseWorkspaceSearch(search),
          space: "communications",
          ...(environmentId ? { environment: environmentId } : {}),
          communicationProvider: endpoint.ref.provider,
          account: resource.connectionId,
          view: "chats",
          item: endpoint.ref.resourceId,
        },
      });
    },
    [navigate, search, environmentId],
  );
  async function loadMessages(selected: ChatConversation, cursor?: string) {
    const current = generation.current;
    const result = await run({
      operation: "messages.list",
      accountId: account.id,
      conversationId: selected.id,
      ...(cursor ? { cursor } : {}),
    });
    if (
      !result ||
      !active.current ||
      current !== generation.current ||
      destination.current !== selected.id
    )
      return;
    setMessages((previous) =>
      mergeChatMessages(
        cursor ? previous : [],
        (result.messages ?? []).filter(
          (message) => message.accountId === account.id && message.conversationId === selected.id,
        ),
      ),
    );
    setMessageCursor(result.nextCursor);
  }
  async function loadThread(message: ChatMessage, cursor?: string) {
    if (!conversation || busy) return;
    const current = ++threadGeneration.current;
    const parent = generation.current;
    const threadId = message.threadId ?? message.id;
    setThread(message);
    if (!cursor) setThreadMessages([]);
    const result = await run({
      operation: "messages.list",
      accountId: account.id,
      conversationId: conversation.id,
      threadId,
      ...(cursor ? { cursor } : {}),
    });
    if (
      !result ||
      !active.current ||
      current !== threadGeneration.current ||
      parent !== generation.current
    )
      return;
    setThreadMessages((previous) =>
      mergeChatMessages(cursor ? previous : [], result.messages ?? []),
    );
    setThreadCursor(result.nextCursor);
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
  const rows = useMemo(
    () =>
      conversations.flatMap((item): ConversationRow[] => {
        const endpoint = chatEndpoint(account, item);
        return endpoint
          ? [{ key: workspaceItemKey(endpoint.ref), title: item.title, kind: item.kind, endpoint }]
          : [];
      }),
    [account, conversations],
  );
  const groups = useMemo(
    () =>
      conversationGroups(
        rows,
        capability.workspaceLinks
          ? projects.flatMap((project) => {
              const links = projectLinks.get(project.id);
              return links ? [links] : [];
            })
          : [],
        account.provider,
      ),
    [rows, capability.workspaceLinks, projects, projectLinks, account.provider],
  );
  const channelEndpoint = conversation ? chatEndpoint(account, conversation) : undefined;
  const selectedEndpoint = selectedMessage ?? channelEndpoint;
  const projectTitle = channelEndpoint
    ? groups.find(
        (group) =>
          group.project &&
          group.rows.some((row) => row.key === workspaceItemKey(channelEndpoint.ref)),
      )?.label
    : undefined;
  const header = useWorkspaceHeaderModel(
    environmentId,
    search.view === "later"
      ? "Later"
      : conversation
        ? `${conversation.kind === "dm" || conversation.title.startsWith("#") ? "" : "# "}${conversation.title}`
        : "Communications",
    "Communications",
    conversationSubtitle(providerNames[account.provider], projectTitle),
  );
  const threadConversation =
    account.provider === "discord"
      ? conversations.find((item) => item.id === thread?.threadId)
      : conversation;
  const messageRows = useMemo(
    () =>
      messages.map((message) => ({
        message,
        ...(conversation ? chatItem(account, conversation, message) : { endpoint: undefined }),
      })),
    [account, conversation, messages],
  );
  const threadRows = useMemo(
    () =>
      threadMessages.map((message) => ({
        message,
        ...(threadConversation ? chatItem(account, threadConversation, message) : {}),
      })),
    [account, threadConversation, threadMessages],
  );
  function acknowledge(message: ChatMessage, inThread = false) {
    if (message.conversationId !== (inThread ? threadConversation?.id : destination.current))
      return;
    if (inThread) setThreadMessages((previous) => mergeChatMessages(previous, [message]));
    else setMessages((previous) => mergeChatMessages(previous, [message]));
    setReplyTo(undefined);
    requestAnimationFrame(() =>
      (inThread ? threadEnd : historyEnd).current?.scrollIntoView({ block: "nearest" }),
    );
  }
  const visibleMessages =
    search.view === "later"
      ? messageRows.filter(({ message, endpoint }) => savedMessage(message, endpoint))
      : messageRows;
  const savedHere = saved.filter(
    (item) =>
      item.provider === account.provider &&
      item.accountId === account.id &&
      (!item.environmentId || item.environmentId === environmentId),
  );
  const savedLoaded = (item: SavedChatReference) =>
    messages.some(
      (message) => message.conversationId === item.conversationId && message.id === item.messageId,
    );
  function renderSaved(entries: readonly SavedChatReference[], label: string) {
    if (!entries.length) return null;
    return (
      <ul aria-label={label} className="space-y-3 p-2 text-xs">
        {entries.map((item) => {
          const channel = conversations.find((row) => row.id === item.conversationId);
          const message = messages.find(
            (row) => row.conversationId === item.conversationId && row.id === item.messageId,
          );
          let resourceId = item.resourceId;
          const channelRef = channel ? chatEndpoint(account, channel)?.ref : undefined;
          if (!resourceId && channelRef?.type === "provider-resource") {
            const resource = parseChatResourceId(channelRef.resourceId);
            if (resource) {
              try {
                resourceId = chatResourceId({ ...resource, messageId: item.messageId });
              } catch {
                // Retain unaddressable legacy records for explicit removal.
              }
            }
          }
          const endpoint: WorkspaceLinkEndpoint | undefined = resourceId
            ? { ref: { type: "provider-resource", provider: account.provider, resourceId } }
            : undefined;
          return (
            <li key={chatReferenceKey(item)} className="space-y-1">
              <p>
                {channel?.title ?? "Conversation unavailable"}:{" "}
                {message?.text || "Saved message (details unavailable)"}
              </p>
              {!message ? (
                <p>This saved message is outside the messages loaded here or was removed.</p>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={!endpoint}
                onClick={() => {
                  if (endpoint) selectEndpoint(endpoint);
                }}
              >
                Open saved message in {channel?.title ?? "original conversation"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!writable}
                onClick={() => {
                  if (writable)
                    setSaved((previous) =>
                      previous.filter(
                        (entry) => chatReferenceKey(entry) !== chatReferenceKey(item),
                      ),
                    );
                }}
              >
                Remove from Later
              </Button>
            </li>
          );
        })}
      </ul>
    );
  }
  const renderNavigationRow = useCallback(
    (row: ConversationRow, button: ReactNode) => (
      <ChatItemRow environmentId={environmentId} endpoint={row.endpoint}>
        {button}
      </ChatItemRow>
    ),
    [environmentId],
  );
  const selectedResource =
    selectedMessage?.ref.type === "provider-resource"
      ? parseChatResourceId(selectedMessage.ref.resourceId)
      : undefined;
  function renderMessage(
    { message, endpoint }: { message: ChatMessage; endpoint?: WorkspaceLinkEndpoint | undefined },
    inThread = false,
  ) {
    const selected =
      selectedResource?.connectionId === message.accountId &&
      selectedResource.conversationId === message.conversationId &&
      selectedResource.messageId === message.id;
    return (
      <ChatItemRow
        key={message.id}
        environmentId={environmentId}
        endpoint={endpoint}
        onSelect={() => setSelectedMessage(endpoint)}
      >
        <ConversationMessage
          message={message}
          timeZone={timeZone}
          selected={selected}
          actions={
            <Button
              size="icon-xs"
              variant={savedMessage(message, endpoint) ? "secondary" : "ghost-muted"}
              aria-label={savedMessage(message, endpoint) ? "Remove from Later" : "Save for Later"}
              aria-pressed={savedMessage(message, endpoint)}
              disabled={!endpoint || !environmentId || !writable}
              onClick={(event) => {
                event.stopPropagation();
                if (endpoint) toggleSaved(message, endpoint);
              }}
            >
              <BookmarkIcon />
            </Button>
          }
          onSelect={() => {
            if (endpoint) {
              setSelectedMessage(endpoint);
              selectEndpoint(endpoint);
            }
          }}
          onReply={
            !inThread && (account.provider === "slack" || message.threadId || conversation?.canSend)
              ? () => {
                  if (account.provider === "slack" || message.threadId) void loadThread(message);
                  else setReplyTo(message);
                }
              : undefined
          }
        />
      </ChatItemRow>
    );
  }
  const listReasons = environmentId
    ? [...new Set(conversations.map((item) => chatItem(account, item).reason).filter(Boolean))]
    : ["Choose an environment to use chat actions."];
  return (
    <div ref={root} className="flex min-h-0 min-w-0 flex-1">
      {capability.workspaceLinks && environmentId
        ? projects.map((project) => (
            <ConversationProjectLinks
              key={project.id}
              environmentId={environmentId}
              projectId={project.id}
              title={project.title}
              onChange={onProjectLinks}
            />
          ))
        : null}
      <WorkspaceEngagement
        environmentId={environmentId}
        space="communications"
        layout="split"
        header={header}
        resources={<WorkspaceProjectResources />}
        selected={conversation !== undefined && search.view !== "later" && search.view !== "unread"}
        onBack={backToList}
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
        list={
          <>
            {accountControls}
            <ConversationNavigation
              groups={search.view === "unread" || search.view === "later" ? [] : groups}
              accountLabels={{ [account.id]: account.label }}
              emptyMessage={search.view === "unread" || search.view === "later" ? null : undefined}
              selectedKey={channelEndpoint ? workspaceItemKey(channelEndpoint.ref) : undefined}
              onSelect={selectEndpoint}
              searchRef={searchInput}
              renderRow={renderNavigationRow}
            >
              <nav aria-label="On-device chat views" className="flex gap-1 p-2">
                {(["home", "later"] as const).map((view) => (
                  <Button
                    key={view}
                    size="sm"
                    variant="ghost"
                    aria-pressed={
                      view === "later" ? search.view === "later" : search.view !== "later"
                    }
                    onClick={() =>
                      void navigate({
                        to: "/workspace",
                        search: {
                          ...parseWorkspaceSearch(search),
                          view: view === "later" ? "later" : "chats",
                        },
                      })
                    }
                  >
                    {view === "later" ? "Later" : "Home"}
                  </Button>
                ))}
              </nav>
              {search.view === "later" ? (
                <>
                  <p className="p-2 text-xs">Saved messages on this device.</p>
                  {renderSaved(
                    savedHere.filter((item) => item.resourceId || savedLoaded(item)),
                    "Saved references on this device",
                  )}
                  {renderSaved(
                    savedHere.filter((item) => !item.resourceId && !savedLoaded(item)),
                    "Unavailable saved references",
                  )}
                </>
              ) : null}
              {search.view === "unread" ? (
                <p role="status" className="p-2 text-xs">
                  Unread conversations are unavailable on this version.
                </p>
              ) : null}
              {accountError ? (
                <div className="w-full">
                  <p role="alert" className="p-2 text-xs">
                    {accountError}
                  </p>
                </div>
              ) : null}
              {sourceNotice && !conversation ? (
                <p role="status" className="p-2 text-xs">
                  {sourceNotice}
                </p>
              ) : null}
              {!loaded ? (
                <p className="p-2 text-xs">
                  {error
                    ? "Conversations could not be loaded. Use Refresh to retry."
                    : "Loading conversations..."}
                </p>
              ) : null}
              {listReasons.map((reason) => (
                <p key={reason} role="status" className="p-2 text-xs">
                  {reason}
                </p>
              ))}
              {(search.view === "unread" || search.view === "later" ? [] : conversations)
                .filter((item) => !chatEndpoint(account, item))
                .map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="p-2 text-left text-xs"
                    onClick={() => {
                      setConversation(item);
                      destination.current = item.id;
                      void loadMessages(item);
                    }}
                  >
                    {item.title}
                  </button>
                ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void loadConversations()}
              >
                Refresh conversations
              </Button>
              {conversationCursor ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void loadConversations(conversationCursor)}
                >
                  Load more conversations
                </Button>
              ) : null}
            </ConversationNavigation>
          </>
        }
      >
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <section aria-label="Chat history" data-communications-history="">
            <div data-communications-center-actions="" data-selected={Boolean(selectedMessage)}>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Refresh conversations and history"
                disabled={busy}
                onClick={() => {
                  void loadConversations();
                  if (conversation) void loadMessages(conversation);
                }}
              >
                <RefreshCwIcon />
              </Button>
              {environmentId && selectedEndpoint ? (
                <WorkspaceItemActions
                  environmentId={environmentId}
                  item={selectedEndpoint}
                  shortcuts
                />
              ) : null}
              {selectedMessage && channelEndpoint ? (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Clear message selection"
                  onClick={() => selectEndpoint(channelEndpoint)}
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
            {sourceNotice && conversation ? (
              <p role="status" className="px-4 py-2 text-xs text-muted-foreground">
                {sourceNotice}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="px-4 py-2 text-xs">
                Refresh failed. Showing previously loaded messages. {error}
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!conversation ? (
                <p className="p-6 text-sm text-muted-foreground">
                  Choose a channel or direct message to load its history.
                </p>
              ) : (
                <>
                  {messageCursor && search.view !== "later" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void loadMessages(conversation, messageCursor)}
                    >
                      Load earlier messages
                    </Button>
                  ) : null}
                  {visibleMessages.map((row, index) => (
                    <div key={row.message.id}>
                      {index === 0 ||
                      displayDay(row.message.date, timeZone) !==
                        displayDay(visibleMessages[index - 1]!.message.date, timeZone) ? (
                        <div data-communications-date="">
                          {formatDay(displayDay(row.message.date, timeZone), {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </div>
                      ) : null}
                      {renderMessage(row)}
                    </div>
                  ))}
                  {!visibleMessages.length && !busy ? (
                    <p className="p-6 text-sm text-muted-foreground">
                      No messages in the loaded history for this view.
                    </p>
                  ) : null}
                  <div ref={historyEnd} />
                </>
              )}
            </div>
            {conversation && search.view !== "later" ? (
              conversation.canSend && writable ? (
                <ChatComposer
                  key={conversation.id}
                  account={account}
                  conversation={conversation}
                  replyTo={replyTo}
                  writable={writable}
                  onCancelReply={() => setReplyTo(undefined)}
                  onAcknowledged={(message) => acknowledge(message)}
                />
              ) : (
                <div data-communications-readonly="">
                  <p>
                    Message {conversation.kind === "dm" ? "" : "#"}
                    {conversation.title}
                  </p>
                  <p>
                    Read-only on this client. Open Pulse desktop to send with a connected desktop
                    account.
                  </p>
                </div>
              )
            ) : null}
          </section>
          {thread && conversation ? (
            <aside
              aria-label="Message thread"
              className="absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-border bg-background xl:static xl:w-80"
            >
              <header className="flex items-center justify-between p-3">
                <h2>Thread</h2>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close thread"
                  onClick={() => {
                    threadGeneration.current++;
                    setThread(undefined);
                  }}
                >
                  <XIcon />
                </Button>
              </header>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void loadThread(thread)}
              >
                Refresh thread
              </Button>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <p className="p-4 text-sm">{thread.text}</p>
                {threadRows
                  .filter((row) => row.message.id !== thread.id)
                  .map((row) => renderMessage(row, true))}
                {threadCursor ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void loadThread(thread, threadCursor)}
                  >
                    Load more replies
                  </Button>
                ) : null}
                <div ref={threadEnd} />
              </div>
              {threadConversation && writable ? (
                <ChatComposer
                  key={`${threadConversation.id}:${thread.id}`}
                  account={account}
                  conversation={threadConversation}
                  replyTo={thread}
                  writable={writable}
                  nativeThread
                  onAcknowledged={(message) => acknowledge(message, true)}
                />
              ) : null}
            </aside>
          ) : null}
        </div>
      </WorkspaceEngagement>
    </div>
  );
}
