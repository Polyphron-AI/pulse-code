import { useState, type ReactNode } from "react";
import {
  chatResourceId,
  parseChatResourceId,
  workspaceItemKey,
  type ChatMessage,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { PlusIcon, SendIcon } from "lucide-react";
import { ConversationNavigation } from "../ConversationNavigation";
import { ConversationMessage } from "../ConversationMessage";
import { conversationGroups, conversationSubtitle } from "../communicationsChat";
import { WorkspaceEngagement } from "../WorkspaceEngagement";
import type {
  CreateWorkspaceMockupModule,
  WorkspaceMockupSession,
} from "./workspaceMockupFixtures";
import "../communications.css";
import "./communicationsMockupModule.css";

const endpointFor = (id: string): WorkspaceLinkEndpoint => ({
  title: id,
  ref: {
    type: "provider-resource",
    provider: "slack",
    resourceId: chatResourceId({
      version: 1,
      transport: "server",
      connectionId: "fixture-slack",
      workspaceId: "fixture-team",
      conversationId: id,
    }),
  },
});
function FixtureConversation({
  session,
  resources,
}: {
  session: WorkspaceMockupSession;
  resources?: ReactNode;
}) {
  const [selected, setSelected] = useState(session.recipe.selectedKey);
  const [thread, setThread] = useState<string>();
  const [text, setText] = useState("");
  const channels = session.seed.channels;
  const channel = channels.find((item) => item.id === selected);
  const rows = channels.map((item) => ({
    key: workspaceItemKey(endpointFor(item.id).ref),
    title: item.title,
    endpoint: { ...endpointFor(item.id), title: item.title },
    kind: item.group === "direct" ? ("dm" as const) : ("channel" as const),
    knownUnread: item.knownUnread,
  }));
  const projects = session.seed.projects.map((project) => ({
    key: project.id,
    label: project.title,
    conversationKeys: channels
      .filter((item) => item.projectId === project.id)
      .map((item) => workspaceItemKey(endpointFor(item.id).ref)),
  }));
  const groups = conversationGroups(rows, projects, "slack");
  const projectTitle = session.seed.projects.find(
    (project) => project.id === channel?.projectId,
  )?.title;
  const person = session.seed.people.find((item) => item.id === session.seed.ownerDisplayId)!;
  const header = {
    title: channel ? `${channel.group === "direct" ? "" : "# "}${channel.title}` : "Communications",
    subtitle: conversationSubtitle(
      "Slack",
      projectTitle,
      channel?.memberCount !== null && channel?.memberCount !== undefined && channel.memberCountAsOf
        ? {
            value: channel.memberCount,
            complete: channel.memberCountComplete,
            observedAt: channel.memberCountAsOf,
          }
        : undefined,
      session.clock.now().toISOString(),
    ),
    environmentLabel: "SynKEK workspace",
    spaceLabel: "Communications",
    sample: true,
    owner: { name: person.name, initials: person.initials },
  };
  const messages = session.seed.messages.filter(
    (message) => message.channelId === selected && !message.id.startsWith("reply-"),
  );
  return (
    <div data-communications-workspace="">
      <WorkspaceEngagement
        environmentId={session.environmentId}
        space="communications"
        layout="split"
        storage={session.storage}
        header={header}
        resources={resources}
        selected={channel !== undefined}
        onBack={() => setSelected(null)}
        list={
          <ConversationNavigation
            accountLabels={{ "fixture-slack": "SynKEK" }}
            groups={groups}
            selectedKey={selected ? workspaceItemKey(endpointFor(selected).ref) : undefined}
            onSelect={(endpoint) => {
              if (endpoint.ref.type !== "provider-resource") return;
              const target = parseChatResourceId(endpoint.ref.resourceId);
              if (!target) return;
              setSelected(target.conversationId);
              setThread(undefined);
              void session.record("navigate", endpoint.ref, "conversation");
            }}
          />
        }
      >
        <section aria-label="Chat history" data-communications-history="">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {messages.length ? <div data-communications-date="">Tuesday, 13 October</div> : null}
            {messages.map((message) => {
              const author = session.seed.people.find((item) => item.id === message.personId)!;
              const row: ChatMessage = {
                id: message.id,
                accountId: "fixture-slack",
                conversationId: message.channelId,
                author: author.name,
                date: `2026-10-13T${message.displayTime}:00+02:00`,
                text: message.text,
                ...(message.replyIds.length ? { replyCount: message.replyIds.length } : {}),
              };
              const document = session.seed.drive.documents.find(
                (item) => item.id === message.fileId,
              );
              return (
                <ConversationMessage
                  key={message.id}
                  message={row}
                  timeZone={session.timeZone}
                  onReply={() => setThread(message.id)}
                  {...(document
                    ? {
                        document: {
                          title: document.title,
                          subtitle: "Google Docs · SynKEK / Marketing",
                          onOpen: () => {
                            void session.record(
                              "navigate",
                              { type: "file", provider: "google-drive", fileId: document.id },
                              "docs",
                            );
                          },
                        },
                      }
                    : {})}
                />
              );
            })}
            {thread ? (
              <aside aria-label="Message thread" className="p-4 text-xs">
                <button type="button" onClick={() => setThread(undefined)}>
                  Back to chat
                </button>
                {session.seed.messages
                  .filter((message) =>
                    messages.find((row) => row.id === thread)?.replyIds.includes(message.id),
                  )
                  .map((message) => (
                    <p key={message.id}>{message.text}</p>
                  ))}
              </aside>
            ) : null}
          </div>
          <form
            data-communications-demo-composer=""
            onSubmit={(event) => {
              event.preventDefault();
              void session.record("send", selected ? endpointFor(selected).ref : undefined, text);
              setText("");
            }}
          >
            <textarea
              aria-label="Demo message"
              placeholder={`Message ${channel?.group === "direct" ? "" : "#"}${channel?.title ?? "conversation"}`}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div>
              <button
                type="button"
                aria-label="Insert link in demo"
                onClick={() => {
                  void session.record("navigate", undefined, "insert-link");
                }}
              >
                <PlusIcon />
              </button>
              <button type="submit">
                <SendIcon />
                Send demo
              </button>
            </div>
          </form>
        </section>
      </WorkspaceEngagement>
    </div>
  );
}
export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => ({
  area: "communications",
  readyRegions: ["center"],
  incompleteRegions: [
    `${session.id}.communications.stream-acceptance`,
    `${session.id}.communications.composer-acceptance`,
  ],
  center: <FixtureConversation session={session} />,
  renderEngagement: (resources) => <FixtureConversation session={session} resources={resources} />,
  settled: async () => {},
  dispose: () => {},
});
