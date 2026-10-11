import { useEffect, useRef, useState } from "react";
import {
  BellIcon,
  BookmarkIcon,
  ChevronDownIcon,
  HashIcon,
  HomeIcon,
  MailIcon,
  MenuIcon,
  MessageCircleIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { SidebarInset } from "../ui/sidebar";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { cn } from "../../lib/utils";
import {
  demoConversations,
  type DemoConversation,
  type DemoMessage,
} from "./communicationsDemoData";

type View = "home" | "activity" | "dms" | "later";
const navigation = [
  { id: "home", name: "Home", icon: HomeIcon },
  { id: "activity", name: "Activity", icon: BellIcon },
  { id: "dms", name: "DMs", icon: MessageCircleIcon },
  { id: "later", name: "Later", icon: BookmarkIcon },
] as const;

function Avatar({ message }: { message: DemoMessage }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-semibold",
        message.color === "green"
          ? "bg-success/15 text-success-foreground"
          : message.color === "brown"
            ? "bg-warning/15 text-warning-foreground"
            : "bg-primary/10 text-primary",
      )}
    >
      {message.initials}
    </span>
  );
}

function Composer({
  conversation,
  thread = false,
  onSend,
}: {
  conversation: DemoConversation;
  thread?: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const send = () => {
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  };
  return (
    <div className="shrink-0 px-4 pb-4">
      <form
        className="rounded-lg border border-input bg-background"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <Textarea
          unstyled
          className="w-full text-sm"
          aria-label={thread ? "Reply in thread" : "Compose sample message"}
          placeholder={
            thread
              ? "Reply in thread…"
              : conversation.type === "email"
                ? "Reply to this email conversation…"
                : `Message ${conversation.type === "dm" ? "" : "#"}${conversation.name}…`
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <div className="min-w-0 text-[10px] leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">
              {conversation.type === "email"
                ? "Reply all · Maya, Nina, Alex"
                : thread
                  ? "Reply in thread"
                  : `To ${conversation.type === "dm" ? "" : "#"}${conversation.name}`}
            </strong>
            <br />
            {conversation.source} · {conversation.account}
          </div>
          <Button type="submit" size="compact" disabled={!draft.trim()}>
            Send demo <SendIcon />
          </Button>
        </div>
      </form>
      <p className="mt-2 text-right text-[10px] text-muted-foreground">
        Sample messages only · Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}

export function CommunicationsWorkspace() {
  const [conversations, setConversations] = useState(() => structuredClone(demoConversations));
  const [currentId, setCurrentId] = useState("launch");
  const [view, setView] = useState<View>("home");
  const [threadId, setThreadId] = useState<string | null>("m1");
  const [saved, setSaved] = useState(() => new Set(["launch:m1"]));
  const [workspace, setWorkspace] = useState("Pulse team");
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const replyEnd = useRef<HTMLDivElement>(null);
  const messageSequence = useRef(0);
  const conversation = conversations.find((item) => item.id === currentId)!;
  const thread = conversation.messages.find((message) => message.id === threadId);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        (root.current?.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setSearchOpen(true);
      }
      if (event.key === "Escape" && !searchOpen) {
        setThreadId(null);
        setChannelsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [searchOpen]);

  const select = (id: string, replyId: string | null = null) => {
    setCurrentId(id);
    setView("home");
    setThreadId(replyId);
    setChannelsOpen(false);
  };
  const toggleSave = (message: DemoMessage) => {
    const key = `${currentId}:${message.id}`;
    setSaved((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const react = (message: DemoMessage) =>
    setConversations((previous) =>
      previous.map((item) =>
        item.id !== currentId
          ? item
          : {
              ...item,
              messages: item.messages.map((existing) =>
                existing.id !== message.id
                  ? existing
                  : {
                      ...existing,
                      reacted: !existing.reacted,
                      reactions: (existing.reactions ?? 0) + (existing.reacted ? -1 : 1),
                    },
              ),
            },
      ),
    );
  const send = (text: string, inThread = false) => {
    const message: DemoMessage = {
      id: `demo-message-${++messageSequence.current}`,
      who: "Quinn Brooks",
      initials: "QB",
      color: "blue",
      text,
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      replies: [],
    };
    setConversations((previous) =>
      previous.map((item) =>
        item.id !== currentId
          ? item
          : {
              ...item,
              messages: inThread
                ? item.messages.map((existing) =>
                    existing.id !== threadId
                      ? existing
                      : { ...existing, replies: [...(existing.replies ?? []), message] },
                  )
                : [...item.messages, message],
            },
      ),
    );
    setStatus(
      `Sample ${inThread ? "reply" : "message"} added. Nothing was sent to ${conversation.source}.`,
    );
    requestAnimationFrame(() =>
      (inThread ? replyEnd : messageEnd).current?.scrollIntoView({ block: "nearest" }),
    );
  };

  const renderMessage = (message: DemoMessage, source = conversation, actions = true) => (
    <article key={message.id} className="group flex gap-3 px-4 py-3 hover:bg-muted/35">
      <Avatar message={message} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <strong className="text-[13px] font-semibold">{message.who}</strong>
          <time className="text-[10px] text-muted-foreground">{message.time}</time>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{message.text}</p>
        {message.attachment && (
          <div className="mt-3 max-w-sm overflow-hidden rounded-lg border border-border">
            <div className="flex items-center gap-4 bg-muted p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-foreground text-2xl text-background">
                ϟ
              </span>
              <div className="text-lg font-semibold leading-tight tracking-tight">
                Your tools.
                <br />
                One workspace.
                <p className="mt-2 text-[9px] font-normal tracking-wider text-muted-foreground">
                  PULSE CODE · LAUNCH KIT
                </p>
              </div>
            </div>
            <div className="p-3 text-[11px]">
              <strong className="font-medium">Pulse launch kit · Final draft</strong>
              <p className="mt-1 text-muted-foreground">Creative preview · sample attachment</p>
            </div>
          </div>
        )}
        {actions && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {source.type !== "email" && (
              <Button
                size="xs"
                variant="outline"
                aria-pressed={!!message.reacted}
                aria-label={message.reacted ? "Remove thumbs up" : "Add thumbs up"}
                className={cn("text-[11px]", message.reacted && "border-primary bg-primary/10")}
                onClick={() => react(message)}
              >
                👍 {message.reactions ?? 0}
              </Button>
            )}
            {source.type !== "email" && (
              <Button
                size="xs"
                variant="ghost"
                className="text-[11px] text-primary"
                onClick={() => setThreadId(message.id)}
              >
                <ReplyIcon />
                {message.replies?.length ? `${message.replies.length} replies` : "Reply"}
              </Button>
            )}
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={
                saved.has(`${source.id}:${message.id}`) ? "Remove from Later" : "Save for Later"
              }
              aria-pressed={saved.has(`${source.id}:${message.id}`)}
              onClick={() => toggleSave(message)}
              className={
                saved.has(`${source.id}:${message.id}`) ? "text-primary" : "text-muted-foreground"
              }
            >
              <BookmarkIcon />
            </Button>
          </div>
        )}
      </div>
    </article>
  );

  const filteredConversations = conversations.filter(
    (item) => workspace === "Pulse team" || ["partners", "approval", "maya"].includes(item.id),
  );
  const searchResults = conversations.filter((item) =>
    [item.name, item.source, item.topic, ...item.messages.map((message) => message.text)].some(
      (text) => text.toLowerCase().includes(query.toLowerCase().trim()),
    ),
  );
  return (
    <SidebarInset className="min-w-0 overflow-hidden" ref={root}>
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 border-b border-border px-4",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        )}
      >
        <span className="hidden text-sm text-muted-foreground sm:inline">
          Office / <span className="text-foreground">Communications</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto min-w-0 text-muted-foreground"
          onClick={() => {
            setQuery("");
            setSearchOpen(true);
          }}
        >
          <SearchIcon />
          <span className="hidden sm:inline">Search conversations</span>
          <kbd className="hidden text-[10px] md:inline">Ctrl K</kbd>
        </Button>
        <span className="hidden text-[10px] text-muted-foreground lg:inline">
          Interactive concept · sample data
        </span>
      </header>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <nav
          aria-label="Communications views"
          className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-border bg-sidebar py-4"
        >
          {navigation.map(({ id, name, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className={cn(
                "h-auto w-12 flex-col gap-1 px-1 py-2 text-[10px]",
                view === id && "bg-sidebar-row-active text-foreground",
              )}
              aria-current={view === id ? "page" : undefined}
              onClick={() => {
                setView(id);
                setThreadId(null);
              }}
            >
              <Icon className="size-4" />
              {name}
            </Button>
          ))}
        </nav>
        <aside
          aria-label="Channels and direct messages"
          className={cn(
            "z-20 flex w-52 shrink-0 flex-col border-r border-border bg-sidebar max-lg:absolute max-lg:inset-y-0 max-lg:left-14 max-lg:shadow-xl",
            !channelsOpen && "max-lg:hidden",
          )}
        >
          <div className="border-b border-border p-4">
            <label className="sr-only" htmlFor="communications-workspace">
              Sample workspace
            </label>
            <div className="relative">
              <select
                id="communications-workspace"
                className="w-full appearance-none bg-transparent pr-5 text-sm font-semibold outline-offset-4"
                value={workspace}
                onChange={(event) => {
                  setWorkspace(event.target.value);
                  select(event.target.value === "Pulse team" ? "launch" : "partners");
                }}
              >
                <option>Pulse team</option>
                <option>Partner studio</option>
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-0 top-0.5 size-4" />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {workspace === "Pulse team" ? "Product & engineering" : "External collaboration"}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {["Launch", "Team", "Direct messages"].map((section) => (
              <section key={section}>
                <h2 className="px-2 pb-2 pt-4 text-[11px] font-medium text-muted-foreground">
                  ⌄ {section}
                </h2>
                {filteredConversations
                  .filter((item) => item.section === section)
                  .map((item) => (
                    <Button
                      key={item.id}
                      variant="ghost"
                      className={cn(
                        "my-0.5 h-8 w-full justify-start gap-2 px-2 text-xs font-normal",
                        currentId === item.id && view === "home" && "bg-sidebar-row-active",
                      )}
                      aria-current={currentId === item.id && view === "home" ? "page" : undefined}
                      onClick={() => select(item.id)}
                    >
                      {item.type === "email" ? (
                        <MailIcon />
                      ) : item.type === "dm" ? (
                        <MessageCircleIcon />
                      ) : (
                        <HashIcon />
                      )}
                      <span className="truncate">{item.name}</span>
                      <span className="ml-auto text-[9px] text-muted-foreground">
                        {item.source === "Discord"
                          ? "DS"
                          : item.source === "Telegram"
                            ? "TG"
                            : "EM"}
                      </span>
                    </Button>
                  ))}
              </section>
            ))}
          </div>
          <p className="border-t border-border p-3 text-[10px] text-muted-foreground">
            Demo services · no accounts connected
          </p>
        </aside>
        <section aria-label="Conversations" className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-4">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Toggle channel sidebar"
              aria-expanded={channelsOpen}
              onClick={() => setChannelsOpen(!channelsOpen)}
            >
              <MenuIcon />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">
                {view === "home"
                  ? `${conversation.type === "channel" ? "# " : ""}${conversation.name}`
                  : navigation.find((item) => item.id === view)?.name}
              </h1>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                {view === "home"
                  ? `${conversation.source} · ${conversation.topic}`
                  : "Across your sample conversations"}
              </p>
            </div>
            {view === "home" && (
              <span className="ml-auto hidden shrink-0 items-center gap-1 text-xs text-muted-foreground xl:flex">
                <UsersIcon className="size-4" />
                {conversation.members}
              </span>
            )}
          </div>
          {view === "home" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="px-5 pb-5 pt-7">
                  <div className="mb-3 grid size-10 place-items-center rounded-xl bg-muted text-xl text-muted-foreground">
                    {conversation.icon}
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">{conversation.intro}</h2>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {conversation.description}
                  </p>
                </div>
                <div className="mx-4 mb-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  Today · sample conversation
                  <span className="h-px flex-1 bg-border" />
                </div>
                {conversation.messages.map((message) => renderMessage(message))}
                <div ref={messageEnd} />
              </div>
              <Composer key={currentId} conversation={conversation} onSend={(text) => send(text)} />
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-5">
              <h2 className="mb-2 text-xl font-semibold">
                {view === "activity" ? "Activity" : view === "dms" ? "Direct messages" : "Later"}
              </h2>
              <p className="mb-6 text-xs text-muted-foreground">
                {view === "activity"
                  ? "Mentions, messages, and followed replies. Thread replies stay grouped."
                  : view === "dms"
                    ? "Your conversations with people across services."
                    : "Messages you saved to come back to."}
              </p>
              {view === "activity" &&
                [
                  {
                    id: "launch",
                    title: "Nina mentioned you in #launch",
                    text: "Can you give the announcement a final read?",
                    thread: null,
                  },
                  {
                    id: "maya",
                    title: "Maya sent you a message",
                    text: "Do you have five minutes to look at the announcement?",
                    thread: null,
                  },
                  {
                    id: "launch",
                    title: "Leo and Nina replied to a followed thread",
                    text: "Launch kit · replies grouped in one conversation",
                    thread: "m1",
                  },
                ].map((item) => (
                  <Button
                    key={item.title}
                    variant="outline"
                    className="mb-3 h-auto w-full justify-start whitespace-normal p-4 text-left"
                    onClick={() => select(item.id, item.thread)}
                  >
                    <div>
                      <strong className="text-xs">{item.title}</strong>
                      <p className="mt-2 text-xs font-normal text-muted-foreground">{item.text}</p>
                    </div>
                  </Button>
                ))}
              {view === "dms" &&
                conversations
                  .filter((item) => item.type === "dm")
                  .map((item) => (
                    <Button
                      key={item.id}
                      variant="outline"
                      className="mb-3 h-auto w-full justify-start whitespace-normal p-4 text-left"
                      onClick={() => select(item.id)}
                    >
                      <div>
                        <strong className="text-xs">
                          {item.name} · {item.source}
                        </strong>
                        <p className="mt-2 text-xs font-normal text-muted-foreground">
                          {item.messages.at(-1)?.text}
                        </p>
                      </div>
                    </Button>
                  ))}
              {view === "later" &&
                (saved.size ? (
                  [...saved].map((key) => {
                    const [id, messageId] = key.split(":");
                    const source = conversations.find((item) => item.id === id)!;
                    const message = source.messages.find((item) => item.id === messageId)!;
                    return (
                      <div key={key} className="mb-3 rounded-lg border border-border">
                        <p className="px-4 pt-3 text-[10px] text-muted-foreground">
                          {source.source} · {source.name}
                        </p>
                        {renderMessage(message, source, false)}
                        <div className="flex gap-2 px-4 pb-3">
                          <Button size="compact" variant="outline" onClick={() => select(id!)}>
                            Open conversation
                          </Button>
                          <Button
                            size="compact"
                            variant="ghost"
                            onClick={() =>
                              setSaved((previous) => {
                                const next = new Set(previous);
                                next.delete(key);
                                return next;
                              })
                            }
                          >
                            Remove from Later
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing saved yet. Bookmark a message to find it here.
                  </p>
                ))}
            </div>
          )}
        </section>
        {view === "home" && thread && (
          <aside
            aria-label="Message thread"
            className="absolute inset-y-0 right-0 z-30 flex w-80 max-w-[calc(100%_-_3.5rem)] flex-col border-l border-border bg-background shadow-xl xl:static xl:shrink-0 xl:shadow-none"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
              <div>
                <h2 className="text-sm font-semibold">Thread</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {conversation.source} · {conversation.name}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close thread"
                onClick={() => setThreadId(null)}
              >
                <XIcon />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {renderMessage(thread, conversation, false)}
              <p className="mx-4 border-t border-border pt-3 text-[10px] text-muted-foreground">
                {thread.replies?.length ?? 0} replies
              </p>
              {thread.replies?.map((reply) => renderMessage(reply, conversation, false))}
              <div ref={replyEnd} />
            </div>
            <Composer
              key={`${currentId}:${threadId}`}
              conversation={conversation}
              thread
              onSend={(text) => send(text, true)}
            />
          </aside>
        )}
      </div>
      <span role="status" className="sr-only">
        {status}
      </span>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogPopup bottomStickOnMobile={false} className="w-full">
          <DialogTitle className="px-5 pt-5 text-base font-semibold">
            Search sample conversations
          </DialogTitle>
          <div className="p-5">
            <Input
              autoFocus
              aria-label="Search conversations and messages"
              placeholder="Search people, channels, or messages…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) {
                  select(searchResults[0].id);
                  setSearchOpen(false);
                }
              }}
            />
            <div className="mt-3 max-h-80 overflow-y-auto">
              {searchResults.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                  onClick={() => {
                    select(item.id);
                    setSearchOpen(false);
                  }}
                >
                  <div>
                    <strong className="text-sm font-medium">{item.name}</strong>
                    <p className="mt-1 text-xs font-normal text-muted-foreground">
                      {item.source} · {item.topic}
                    </p>
                  </div>
                </Button>
              ))}
              {!searchResults.length && (
                <p className="py-4 text-sm text-muted-foreground">No matching conversations.</p>
              )}
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}
