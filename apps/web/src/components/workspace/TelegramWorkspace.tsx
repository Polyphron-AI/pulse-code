import {
  EnvironmentId,
  parseTelegramResourceId,
  telegramResourceId,
  type TelegramMessage,
  type WorkspaceItemRef,
  type WorkspaceLinkEndpoint,
  workspaceItemKey,
} from "@t3tools/contracts";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { ConversationNavigation } from "./ConversationNavigation";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import {
  CommunicationStream,
  CommunicationFileOpener,
  type CommunicationRow,
} from "./ChatCommunicationsWorkspace";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { telegram } from "../../state/telegram";
import { useEnvironmentQuery } from "../../state/query";
import { Button } from "../ui/button";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { WorkspaceLinkedContext } from "./WorkspaceLinkedContext";
import { MailError, MailNotice } from "./mail/MailNotice";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { useAtomCommand } from "../../state/use-atom-command";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";

const refFor = (connectionId: string, chatId: string, messageId?: string): WorkspaceItemRef => ({
  type: "provider-resource",
  provider: "telegram",
  resourceId: telegramResourceId({ connectionId, chatId, ...(messageId ? { messageId } : {}) }),
});

export function TelegramWorkspace() {
  const search = useSearch({ strict: false });
  const capability = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const environmentId = capability.environmentId;
  const header = useWorkspaceHeaderModel(environmentId, "Telegram", "Communications");
  const controls = (
    <div className="flex flex-wrap gap-3 border-b border-border p-2">
      <Link to="/settings/integrations" hash="telegram" className="text-sm underline">
        Manage bots
      </Link>
      <Link
        to="/workspace"
        search={{
          space: "communications",
          ...(environmentId ? { environment: environmentId } : {}),
        }}
        className="text-sm underline"
      >
        Slack and Discord
      </Link>
    </div>
  );
  const content = !environmentId ? (
    <MailNotice>No environment is connected.</MailNotice>
  ) : !capability.ready ? (
    <MailNotice>Connecting...</MailNotice>
  ) : !capability.telegramRead ? (
    <MailNotice>Telegram bots need a newer server.</MailNotice>
  ) : (
    <TelegramReader environmentId={environmentId} controls={controls} />
  );
  return environmentId && capability.ready && capability.telegramRead ? (
    content
  ) : (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="communications"
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
    >
      {controls}
      {content}
    </WorkspaceEngagement>
  );
}
function TelegramReader({
  environmentId,
  controls,
}: {
  environmentId: EnvironmentId;
  controls: ReactNode;
}) {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const openItem = useWorkspaceItemOpener(environmentId);
  const connections = useEnvironmentQuery(telegram.connections({ environmentId, input: {} }));
  const requested = search.item ? parseTelegramResourceId(search.item) : undefined;
  const accountId = requested?.connectionId ?? search.account;
  const connection = accountId
    ? connections.data?.find((row) => row.id === accountId)
    : (connections.data?.find((row) => row.connected) ?? connections.data?.[0]);
  const chats = useEnvironmentQuery(
    connection ? telegram.chats({ environmentId, input: { connectionId: connection.id } }) : null,
  );
  const chat = requested
    ? chats.data?.chats.find((row) => row.chatId === requested.chatId)
    : undefined;
  const item =
    requested && connection ? refFor(connection.id, requested.chatId, requested.messageId) : null;
  const [anchor, setAnchor] = useState<{ scope: string; endpoint: WorkspaceLinkEndpoint } | null>(
    null,
  );
  const anchorScope = `${environmentId}/${connection?.id}/${requested?.chatId}/${requested?.messageId ?? ""}`;
  const selectedEndpoint =
    anchor?.scope === anchorScope
      ? anchor.endpoint
      : item
        ? {
            ref: item,
            title: requested?.messageId
              ? `Telegram message ${requested.messageId}`
              : (chat?.title ?? "Telegram chat"),
          }
        : null;
  const selectAnchor = (endpoint: WorkspaceLinkEndpoint) =>
    setAnchor({ scope: anchorScope, endpoint });
  const title = requested?.messageId
    ? `Telegram message ${requested.messageId}`
    : (chat?.title ?? "Telegram chat");
  const select = (chatId: string, messageId?: string) => {
    if (!connection) return;
    void navigate({
      to: "/workspace",
      search: {
        space: "communications",
        communicationProvider: "telegram",
        environment: environmentId,
        account: connection.id,
        item: telegramResourceId({
          connectionId: connection.id,
          chatId,
          ...(messageId ? { messageId } : {}),
        }),
      },
    });
  };
  const header = useWorkspaceHeaderModel(
    environmentId,
    chat?.title ?? "Telegram",
    "Communications",
    connection ? `Telegram · @${connection.username}` : undefined,
  );
  const fallback = (children: ReactNode) => (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="communications"
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
    >
      {controls}
      {children}
    </WorkspaceEngagement>
  );
  if (connections.data === null)
    return fallback(
      connections.error ? (
        <MailError message={connections.error} onRetry={connections.refresh} />
      ) : (
        <MailNotice>Loading bots...</MailNotice>
      ),
    );
  if (!connection)
    return fallback(
      <MailNotice>
        {accountId
          ? "This bot connection is unavailable."
          : "Connect a bot in Settings, then pair a chat."}
      </MailNotice>,
    );
  return (
    <WorkspaceEngagement
      space="communications"
      environmentId={environmentId}
      layout="split"
      header={header}
      onBack={() =>
        void navigate({
          to: "/workspace",
          search: {
            space: "communications",
            communicationProvider: "telegram",
            environment: environmentId,
            account: connection.id,
          },
        })
      }
      selected={item !== null}
      list={
        <div>
          {controls}
          <label className="flex flex-col gap-1 border-b border-border p-2 text-xs text-muted-foreground">
            Bot
            <select
              aria-label="Telegram bot"
              className="rounded-md border border-input bg-background p-2 text-sm text-foreground"
              value={connection.id}
              onChange={(event) =>
                void navigate({
                  to: "/workspace",
                  search: {
                    space: "communications",
                    communicationProvider: "telegram",
                    environment: environmentId,
                    account: event.target.value,
                  },
                })
              }
            >
              {connections.data.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title} (@{row.username}){row.connected ? "" : " - disconnected"}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="ghost"
            className="m-2"
            onClick={() => {
              connections.refresh();
              chats.refresh();
            }}
          >
            Refresh chats
          </Button>
          {!connection.connected ? (
            <p className="p-3 text-sm text-muted-foreground">
              This bot is disconnected. Its stored messages and links are retained; reconnect in
              Settings to read them.
            </p>
          ) : null}
          {connection.error ? <MailError message={connection.error} /> : null}
          {chats.error ? <MailError message={chats.error} onRetry={chats.refresh} /> : null}
          {chats.data === null ? (
            <MailNotice>Loading chats...</MailNotice>
          ) : chats.data.chats.length === 0 ? (
            <MailNotice>No paired chats. Start pairing in Settings.</MailNotice>
          ) : (
            <ConversationNavigation
              accountLabels={{ [connection.id]: `${connection.title} (@${connection.username})` }}
              groups={[
                {
                  label: "General",
                  rows: chats.data.chats.map((row) => {
                    const endpoint = { ref: refFor(connection.id, row.chatId), title: row.title };
                    return {
                      key: workspaceItemKey(endpoint.ref),
                      title: row.active ? row.title : `${row.title} (removed)`,
                      endpoint,
                      kind: "channel" as const,
                    };
                  }),
                },
              ]}
              selectedKey={
                requested ? workspaceItemKey(refFor(connection.id, requested.chatId)) : undefined
              }
              onSelect={(endpoint) => {
                if (endpoint.ref.type === "provider-resource") {
                  const target = parseTelegramResourceId(endpoint.ref.resourceId);
                  if (target) select(target.chatId);
                }
              }}
              renderRow={(row, button) => (
                <WorkspaceItemMenu environmentId={environmentId} item={row.endpoint}>
                  {button}
                </WorkspaceItemMenu>
              )}
            />
          )}
          {chats.data?.truncated ? (
            <p className="p-3 text-xs text-muted-foreground">
              Only the first 100 paired chats are listed.
            </p>
          ) : null}
        </div>
      }
      resources={<WorkspaceProjectResources selectedItem={selectedEndpoint} />}
      linkedContext={{
        item: selectedEndpoint,
        render: (target) => (
          <WorkspaceLinkedContext environmentId={environmentId} item={target} onOpen={openItem} />
        ),
      }}
    >
      {!requested || !item ? (
        <MailNotice>Select a paired chat to read messages received by this bot.</MailNotice>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="space-y-3 border-b border-border p-4">
            <p className="text-xs text-muted-foreground">
              Media contents are not downloaded. Chat text cannot issue agent commands.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="md:hidden"
              onClick={() =>
                void navigate({
                  to: "/workspace",
                  search: {
                    space: "communications",
                    communicationProvider: "telegram",
                    environment: environmentId,
                    account: connection.id,
                  },
                })
              }
            >
              Back to chats
            </Button>
            {requested.messageId ? (
              <Button size="sm" variant="ghost" onClick={() => select(requested.chatId)}>
                Back to chat
              </Button>
            ) : null}
            <WorkspaceItemActions
              shortcuts
              environmentId={environmentId}
              item={selectedEndpoint ?? { ref: item, title }}
            />
            {chat?.active ? (
              <RemoveChat
                environmentId={environmentId}
                connectionId={connection.id}
                chatId={requested.chatId}
              />
            ) : null}
          </header>
          {!connection.connected || chat?.active === false ? (
            <MailNotice>
              This chat is unavailable. Its saved content and workspace links are retained.
            </MailNotice>
          ) : requested.messageId ? (
            <TelegramMessageDetail
              environmentId={environmentId}
              connectionId={connection.id}
              chatId={requested.chatId}
              messageId={requested.messageId}
              onAnchor={selectAnchor}
            />
          ) : (
            <TelegramMessages
              key={`${connection.id}/${requested.chatId}`}
              environmentId={environmentId}
              connectionId={connection.id}
              chatId={requested.chatId}
              onSelect={(messageId) => select(requested.chatId, messageId)}
              onAnchor={selectAnchor}
            />
          )}
          <div data-communications-readonly="">
            <p>Message {title}</p>
            <p>Received messages only. Telegram bot replies are not enabled.</p>
          </div>
        </div>
      )}
    </WorkspaceEngagement>
  );
}
function RemoveChat(props: { environmentId: EnvironmentId; connectionId: string; chatId: string }) {
  const canOperate = useWorkspaceCanOperate(props.environmentId);
  const remove = useAtomCommand(telegram.removeChat, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || !canOperate}
        onClick={async () => {
          setBusy(true);
          const { environmentId, ...input } = props;
          const result = await remove({ environmentId, input });
          setBusy(false);
          setError(result._tag === "Failure");
        }}
      >
        Remove paired chat
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not remove this chat. Try again.
        </p>
      ) : null}
    </div>
  );
}
function telegramRow(message: TelegramMessage): CommunicationRow {
  return {
    message: {
      id: message.messageId,
      accountId: message.connectionId,
      conversationId: message.chatId,
      author: message.sender,
      date: new Date(message.sentAt).toISOString(),
      text: message.text,
    },
    endpoint: {
      ref: refFor(message.connectionId, message.chatId, message.messageId),
      title: `${message.sender}: ${message.text.slice(0, 100)}`,
    },
    ...(message.truncated || message.edited
      ? {
          notice: [
            message.edited ? "Edited message." : "",
            message.truncated ? "This stored message is truncated." : "",
          ]
            .filter(Boolean)
            .join(" "),
        }
      : {}),
    replyUnavailable: "Telegram bot replies are not enabled.",
  };
}
function TelegramMessageDetail(props: {
  environmentId: EnvironmentId;
  connectionId: string;
  chatId: string;
  messageId: string;
  onAnchor: (endpoint: WorkspaceLinkEndpoint) => void;
}) {
  const { environmentId, onAnchor, ...input } = props;
  const timeZone =
    useEnvironmentSettings(environmentId, (settings) => settings.workspaceDisplayTimeZone) ?? "UTC";
  const result = useEnvironmentQuery(telegram.message({ environmentId, input }));
  if (result.error) return <MailError message={result.error} onRetry={result.refresh} />;
  return result.data === null ? (
    result.error ? (
      <MailError message={result.error} onRetry={result.refresh} />
    ) : (
      <MailNotice>Loading message...</MailNotice>
    )
  ) : (
    <CommunicationFileOpener environmentId={environmentId} source={undefined} onSelect={onAnchor}>
      {(onOpenFile) => (
        <CommunicationStream
          environmentId={environmentId}
          rows={[telegramRow(result.data!)]}
          timeZone={timeZone}
          onOpenFile={onOpenFile}
        />
      )}
    </CommunicationFileOpener>
  );
}
type TelegramPageData = {
  readonly messages: readonly TelegramMessage[];
  readonly nextCursor?: string;
};
function TelegramMessages(props: {
  environmentId: EnvironmentId;
  connectionId: string;
  chatId: string;
  onSelect: (messageId: string) => void;
  onAnchor: (endpoint: WorkspaceLinkEndpoint) => void;
}) {
  const timeZone =
    useEnvironmentSettings(props.environmentId, (settings) => settings.workspaceDisplayTimeZone) ??
    "UTC";
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [pages, setPages] = useState<ReadonlyMap<string | undefined, TelegramPageData>>(
    () => new Map(),
  );
  const onPage = useCallback((cursor: string | undefined, data: TelegramPageData) => {
    setPages((previous) => {
      const bounded = { ...data, messages: data.messages.slice(0, 100) };
      if (JSON.stringify(previous.get(cursor)) === JSON.stringify(bounded)) return previous;
      return new Map(previous).set(cursor, bounded);
    });
  }, []);
  const latest = pages.get(cursors.at(-1));
  const rows = useMemo(() => {
    const messages = new Map<string, TelegramMessage>();
    // Newer stored pages take precedence across overlapping pages.
    for (const page of [...pages.values()].toReversed())
      for (const message of page.messages) {
        if (message.connectionId === props.connectionId && message.chatId === props.chatId)
          messages.set(message.messageId, message);
      }
    return [...messages.values()]
      .sort((a, b) => a.sentAt - b.sentAt || Number(a.messageId) - Number(b.messageId))
      .map(telegramRow);
  }, [pages, props.connectionId, props.chatId]);
  const next = latest?.nextCursor;
  const more = !latest
    ? cursors.at(-1)
    : next && cursors.length < 10 && !cursors.includes(next)
      ? next
      : undefined;
  return (
    <>
      {cursors.map((cursor) => (
        <TelegramPage key={cursor ?? "first"} {...props} cursor={cursor} onPage={onPage} />
      ))}
      <CommunicationFileOpener
        environmentId={props.environmentId}
        source={undefined}
        onSelect={props.onAnchor}
      >
        {(onOpenFile) => (
          <CommunicationStream
            environmentId={props.environmentId}
            rows={rows}
            timeZone={timeZone}
            onOpenFile={onOpenFile}
            onSelect={(endpoint) => {
              if (endpoint.ref.type === "provider-resource") {
                const resource = parseTelegramResourceId(endpoint.ref.resourceId);
                if (resource?.messageId) props.onSelect(resource.messageId);
              }
            }}
            busy={!latest}
            onLoadOlder={more ? () => setCursors((current) => [...current, more]) : undefined}
          >
            {pages.size > 0 && !rows.length ? (
              <MailNotice>
                No messages received yet. Bots cannot load older Telegram history.
              </MailNotice>
            ) : null}
            {cursors.length >= 10 ? (
              <MailNotice>
                Showing up to 1,000 stored received messages. Bots cannot import older Telegram
                history.
              </MailNotice>
            ) : null}
          </CommunicationStream>
        )}
      </CommunicationFileOpener>
    </>
  );
}
function TelegramPage(props: {
  environmentId: EnvironmentId;
  connectionId: string;
  chatId: string;
  cursor: string | undefined;
  onPage: (cursor: string | undefined, data: TelegramPageData) => void;
}) {
  const { environmentId, connectionId, chatId, cursor, onPage } = props;
  const result = useEnvironmentQuery(
    telegram.messages({
      environmentId,
      input: { connectionId, chatId, ...(cursor ? { cursor } : {}) },
    }),
  );
  useEffect(() => {
    if (result.data && !result.error) onPage(cursor, result.data);
  }, [result.data, result.error, cursor, onPage]);
  if (result.error) return <MailError message={result.error} onRetry={result.refresh} />;
  return result.data === null ? <MailNotice>Loading received messages...</MailNotice> : null;
}
