import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import {
  EnvironmentId,
  parseChatResourceId,
  type ChatAccount,
  type ChatResource,
} from "@t3tools/contracts";
import { PlusIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { Button } from "../ui/button";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { RequestState } from "./office/shared";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import { ChatCommunicationsWorkspace } from "./ChatCommunicationsWorkspace";
import { TelegramWorkspace } from "./TelegramWorkspace";
import { ConnectCommunicationsDialog } from "./ConnectCommunicationsDialog";

const key = (provider: string, id: string) => JSON.stringify([provider, id]);
const providerNames = {
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram (personal login retired)",
};
export type ChatSource = {
  provider: "slack" | "discord";
  resource: ChatResource;
  resourceId: string;
};
export function CommunicationsWorkspace({ source }: { source?: ChatSource | undefined }) {
  const search = useSearch({ strict: false });
  return search.communicationProvider === "telegram" ? (
    <TelegramWorkspace key={`${search.environment}:${search.account}:${search.item}`} />
  ) : (
    <DesktopCommunicationsWorkspace source={source} />
  );
}
function DesktopCommunicationsWorkspace({ source }: { source?: ChatSource | undefined }) {
  const { run, available, busy, error } = useCommunicationsRequest();
  const [chatAccounts, setChatAccounts] = useState<readonly ChatAccount[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  const selectedChat = chatAccounts.find(
    (account) => key(account.provider, account.id) === selectedKey,
  );
  const sourceId = source?.resourceId;
  const sourceProvider = source?.provider;
  const refresh = useCallback(async () => {
    const resource = sourceId ? parseChatResourceId(sourceId) : undefined;
    let chat: readonly ChatAccount[] | undefined;
    if (available && (!sourceId || resource?.transport === "desktop")) {
      const response = await run({ operation: "accounts.list" });
      if (response) chat = response.accounts ?? [];
    }
    if (!mounted.current) return;
    if (chat) {
      setChatAccounts(chat);
      setSelectedKey((previous) =>
        chat.some((account) => key(account.provider, account.id) === previous)
          ? previous
          : resource && sourceProvider
            ? resource.transport === "desktop" &&
              chat.some(
                (account) =>
                  account.provider === sourceProvider && account.id === resource.connectionId,
              )
              ? key(sourceProvider, resource.connectionId)
              : ""
            : chat?.[0]
              ? key(chat[0].provider, chat[0].id)
              : "",
      );
    }
    setLoaded(true);
  }, [available, run, sourceProvider, sourceId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  async function disconnect() {
    if (!selectedChat || busy) return;
    const response = await run({ operation: "accounts.disconnect", accountId: selectedChat.id });
    if (!response) return;
    await refresh();
  }
  const search = useSearch({ strict: false });
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const header = useWorkspaceHeaderModel(environmentId, "Communications", "Communications");
  const controls = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
      {error && (
        <div className="w-full">
          <RequestState busy={busy} error={error} />
        </div>
      )}
      <label className="min-w-0 flex-1">
        <span className="sr-only">Connected communications account</span>
        <select
          aria-label="Connected communications account"
          value={selectedKey}
          disabled={busy}
          onChange={(event) => setSelectedKey(event.target.value)}
          className="max-w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="">Choose an account</option>
          {chatAccounts.map((account) => (
            <option
              key={key(account.provider, account.id)}
              value={key(account.provider, account.id)}
            >
              {providerNames[account.provider]} · {account.label} · {account.identity}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Refresh account list"
        disabled={busy || !available}
        onClick={() => void refresh()}
      >
        <RefreshCwIcon />
      </Button>
      {selectedChat && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Disconnect ${selectedChat.label}`}
          disabled={busy}
          onClick={() => void disconnect()}
        >
          <UnplugIcon />
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!available}
        onClick={() => setConnectOpen(true)}
      >
        <PlusIcon />
        <span className="hidden sm:inline">Connect chat</span>
      </Button>
      <Link
        to="/workspace"
        search={{
          space: "office",
          officeView: "communications",
          communicationProvider: "telegram",
        }}
        className="shrink-0 text-sm underline underline-offset-4"
      >
        Telegram bots
      </Link>
      <Link to="/settings/email" className="shrink-0 text-xs underline underline-offset-4">
        Email accounts
      </Link>
    </div>
  );
  const content = (
    <>
      {selectedChat?.provider === "telegram" ? (
        <main className="space-y-3 p-6">
          <h1 className="text-lg font-semibold">Personal Telegram login has been retired</h1>
          <p className="text-sm text-muted-foreground">
            Your saved personal account record and credentials have been retained. Connect a server
            bot and pair the chats you want to read.
          </p>
          <Link to="/settings/integrations" hash="telegram" className="text-sm underline">
            Connect Telegram in Settings
          </Link>
        </main>
      ) : selectedChat ? (
        <ChatCommunicationsWorkspace
          key={JSON.stringify([selectedChat.provider, selectedChat.id])}
          account={selectedChat}
          environmentId={environmentId}
          controls={controls}
          source={
            source?.provider === selectedChat.provider &&
            source.resource.connectionId === selectedChat.id
              ? source
              : undefined
          }
        />
      ) : (
        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="text-xl font-semibold">
            {source ? "Conversation unavailable here" : "Your conversations, together"}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {source && !available && source.resource.transport === "desktop"
              ? "This conversation is available only on its desktop connection."
              : source && source.resource.transport === "server"
                ? "This server conversation reader is not available on this client yet."
                : source && loaded
                  ? chatAccounts.some(
                      (account) =>
                        account.provider === source.provider &&
                        account.id === source.resource.connectionId,
                    )
                    ? "Choose the original account above to open this conversation."
                    : "This conversation's desktop connection is not on this device or was removed."
                  : !available
                    ? "Open Pulse desktop to connect your accounts. Credentials and sessions stay on that computer; this web connection cannot access them."
                    : !loaded
                      ? "Loading connected accounts…"
                      : "Choose an account above, connect Slack, or add a Discord bot. Connect Telegram bots in Settings."}
          </p>
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Slack uses your token permissions. Telegram bots read received messages from paired
            chats. Discord exposes bot-accessible team channels, not a personal inbox. Read mail in
            the Mail space.
          </p>
        </main>
      )}
      {connectOpen && (
        <ConnectCommunicationsDialog
          onClose={() => setConnectOpen(false)}
          onConnected={(account) => {
            setChatAccounts((previous) => [
              ...previous.filter((item) => item.id !== account.id),
              account,
            ]);
            setSelectedKey(key(account.provider, account.id));
            setConnectOpen(false);
          }}
        />
      )}
    </>
  );
  return selectedChat && selectedChat.provider !== "telegram" ? (
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
