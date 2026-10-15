import {
  AuthOrchestrationOperateScope,
  EnvironmentId,
  parseTelegramResourceId,
  telegramResourceId,
  type TelegramMessage,
  type WorkspaceItemRef,
} from "@t3tools/contracts";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { COMPACT_WORKSPACE_HEADER_INSET_CLASS } from "../../workspaceTitlebar";
import { telegram } from "../../state/telegram";
import { useEnvironmentQuery } from "../../state/query";
import { SidebarInset } from "../ui/sidebar";
import { Button } from "../ui/button";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { LinkedSection } from "./mail/LinkedSection";
import { MailError, MailNotice } from "./mail/MailNotice";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentSessionState } from "../../state/session";

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
  return (
    <SidebarInset className="min-w-0">
      <header
        className={`flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 border-b border-border px-4 ${COMPACT_WORKSPACE_HEADER_INSET_CLASS}`}
      >
        <span className="min-w-0 flex-1 truncate text-sm">Telegram</span>
        <Link
          to="/settings/integrations"
          hash="telegram"
          className="text-sm underline underline-offset-4"
        >
          Manage bots
        </Link>
        <Link
          to="/workspace"
          search={{ space: "office", officeView: "communications" }}
          className="text-sm underline underline-offset-4"
        >
          Slack and Discord
        </Link>
      </header>
      {!environmentId ? (
        <MailNotice>No environment is connected.</MailNotice>
      ) : !capability.ready ? (
        <MailNotice>Connecting...</MailNotice>
      ) : !capability.telegramRead ? (
        <MailNotice>Telegram bots need a newer server.</MailNotice>
      ) : (
        <TelegramReader environmentId={environmentId} />
      )}
    </SidebarInset>
  );
}
function TelegramReader({ environmentId }: { environmentId: EnvironmentId }) {
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
  const title = requested?.messageId
    ? `Telegram message ${requested.messageId}`
    : (chat?.title ?? "Telegram chat");
  const select = (chatId: string, messageId?: string) => {
    if (!connection) return;
    void navigate({
      to: "/workspace",
      search: {
        space: "office",
        officeView: "communications",
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
  if (connections.data === null)
    return connections.error ? (
      <MailError message={connections.error} onRetry={connections.refresh} />
    ) : (
      <MailNotice>Loading bots...</MailNotice>
    );
  if (!connection)
    return (
      <MailNotice>
        {accountId
          ? "This bot connection is unavailable."
          : "Connect a bot in Settings, then pair a chat."}
      </MailNotice>
    );
  return (
    <WorkspaceEngagement
      space="telegram"
      selected={item !== null}
      list={
        <div>
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
                    space: "office",
                    officeView: "communications",
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
            chats.data.chats.map((row) => (
              <WorkspaceItemMenu
                key={row.chatId}
                environmentId={environmentId}
                item={{ ref: refFor(connection.id, row.chatId), title: row.title }}
              >
                <button
                  type="button"
                  aria-current={row.chatId === requested?.chatId ? "page" : undefined}
                  onClick={() => select(row.chatId)}
                  className="min-w-0 flex-1 border-b border-border p-3 text-left text-sm hover:bg-accent/50 aria-[current=page]:bg-accent"
                >
                  <span className="block truncate font-medium">
                    {row.title}
                    {row.active ? "" : " (removed)"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {!connection.connected || !row.active
                      ? "Unavailable until connected and paired"
                      : (row.preview ?? `Paired by ${row.pairedUserLabel}`)}
                  </span>
                </button>
              </WorkspaceItemMenu>
            ))
          )}
          {chats.data?.truncated ? (
            <p className="p-3 text-xs text-muted-foreground">
              Only the first 100 paired chats are listed.
            </p>
          ) : null}
        </div>
      }
      linked={
        item ? (
          <LinkedSection
            key={search.item}
            environmentId={environmentId}
            item={item}
            title={title}
            onOpen={openItem}
          />
        ) : null
      }
    >
      {!requested || !item ? (
        <MailNotice>Select a paired chat to read messages received by this bot.</MailNotice>
      ) : (
        <div>
          <header className="space-y-3 border-b border-border p-4">
            <h1 className="text-lg font-semibold">{chat?.title ?? title}</h1>
            <p className="text-xs text-muted-foreground">
              Received messages only. Media contents are not downloaded. Chat text cannot issue
              agent commands.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="md:hidden"
              onClick={() =>
                void navigate({
                  to: "/workspace",
                  search: {
                    space: "office",
                    officeView: "communications",
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
              item={{ ref: item, title }}
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
            />
          ) : (
            <TelegramMessages
              key={`${connection.id}/${requested.chatId}`}
              environmentId={environmentId}
              connectionId={connection.id}
              chatId={requested.chatId}
              onSelect={(messageId) => select(requested.chatId, messageId)}
            />
          )}
        </div>
      )}
    </WorkspaceEngagement>
  );
}
function RemoveChat(props: { environmentId: EnvironmentId; connectionId: string; chatId: string }) {
  const session = useEnvironmentSessionState(props.environmentId);
  const canOperate =
    !session.isPending &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthOrchestrationOperateScope) === true;
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
function MessageBody({ message }: { message: TelegramMessage }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {message.sender} / {new Date(message.sentAt).toLocaleString()}
        {message.edited ? " (edited)" : ""}
      </p>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm">{message.text}</pre>
      {message.truncated ? (
        <p className="text-xs text-muted-foreground">This stored message is truncated.</p>
      ) : null}
    </div>
  );
}
function TelegramMessageDetail(props: {
  environmentId: EnvironmentId;
  connectionId: string;
  chatId: string;
  messageId: string;
}) {
  const { environmentId, ...input } = props;
  const result = useEnvironmentQuery(telegram.message({ environmentId, input }));
  if (result.error) return <MailError message={result.error} onRetry={result.refresh} />;
  return result.data === null ? (
    result.error ? (
      <MailError message={result.error} onRetry={result.refresh} />
    ) : (
      <MailNotice>Loading message...</MailNotice>
    )
  ) : (
    <div className="p-4">
      <MessageBody message={result.data} />
    </div>
  );
}
function TelegramMessages(props: {
  environmentId: EnvironmentId;
  connectionId: string;
  chatId: string;
  onSelect: (messageId: string) => void;
}) {
  const [cursors, setCursors] = useState<ReadonlyArray<string | undefined>>([undefined]);
  return (
    <div>
      {cursors.map((cursor, index) => (
        <TelegramPage
          key={cursor ?? "first"}
          {...props}
          cursor={cursor}
          last={index === cursors.length - 1}
          onMore={(next) =>
            setCursors((current) => (current.includes(next) ? current : [...current, next]))
          }
        />
      ))}
    </div>
  );
}
function TelegramPage(props: {
  environmentId: EnvironmentId;
  connectionId: string;
  chatId: string;
  onSelect: (messageId: string) => void;
  cursor: string | undefined;
  last: boolean;
  onMore: (cursor: string) => void;
}) {
  const result = useEnvironmentQuery(
    telegram.messages({
      environmentId: props.environmentId,
      input: {
        connectionId: props.connectionId,
        chatId: props.chatId,
        ...(props.cursor ? { cursor: props.cursor } : {}),
      },
    }),
  );
  if (result.error) return <MailError message={result.error} onRetry={result.refresh} />;
  if (result.data === null)
    return result.error ? (
      <MailError message={result.error} onRetry={result.refresh} />
    ) : (
      <MailNotice>Loading messages...</MailNotice>
    );
  return (
    <div>
      {result.data.messages.length === 0 ? (
        <MailNotice>No messages received yet. Bots cannot load older Telegram history.</MailNotice>
      ) : (
        result.data.messages.map((message) => (
          <div key={message.messageId} className="border-b border-border p-4">
            <WorkspaceItemMenu
              environmentId={props.environmentId}
              item={{
                ref: refFor(props.connectionId, props.chatId, message.messageId),
                title: `${message.sender}: ${message.text.slice(0, 100)}`,
              }}
            >
              <div className="min-w-0 flex-1">
                <MessageBody message={message} />
                <Button size="sm" variant="ghost" onClick={() => props.onSelect(message.messageId)}>
                  Open message
                </Button>
              </div>
            </WorkspaceItemMenu>
          </div>
        ))
      )}
      {props.last && result.data.nextCursor ? (
        <Button
          size="sm"
          variant="ghost"
          className="m-3"
          onClick={() => props.onMore(result.data!.nextCursor!)}
        >
          Older received messages
        </Button>
      ) : null}
    </div>
  );
}
