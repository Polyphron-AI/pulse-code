import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { EnvironmentId, type ChatAccount, type ChatResource } from "@t3tools/contracts";
import { EllipsisIcon } from "lucide-react";
import { Button } from "../ui/button";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import { ChatCommunicationsWorkspace } from "./ChatCommunicationsWorkspace";
import { TelegramWorkspace } from "./TelegramWorkspace";
import { ConnectCommunicationsDialog } from "./ConnectCommunicationsDialog";
import "./communications.css";

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
  const capability = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  return search.communicationProvider === "telegram" ? (
    <TelegramWorkspace key={JSON.stringify([capability.environmentId, search.account])} />
  ) : (
    <DesktopCommunicationsWorkspace
      key={capability.environmentId}
      environmentId={capability.environmentId}
      source={source}
    />
  );
}
function DesktopCommunicationsWorkspace({
  source,
  environmentId,
}: {
  source?: ChatSource | undefined;
  environmentId: EnvironmentId | null;
}) {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const primary = usePrimaryEnvironmentId();
  const compact = useMediaQuery("max-md");
  const request = useCommunicationsRequest();
  const available = request.available && environmentId !== null && environmentId === primary;
  const { run, busy, error } = request;
  const [chatAccounts, setChatAccounts] = useState<readonly ChatAccount[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const sourceProvider = source?.provider ?? search.communicationProvider;
  const requestedAccount = source?.resource.connectionId ?? search.account;
  const transport = source?.resource.transport;
  const selectedChat = chatAccounts.find(
    (account) =>
      key(account.provider, account.id) === selectedKey &&
      (!requestedAccount ||
        (account.id === requestedAccount && account.provider === sourceProvider)),
  );
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (!available || transport === "server") return;
    const response = await run({ operation: "accounts.list" });
    if (!mounted.current || current !== generation.current || !response) return;
    const chat = response.accounts ?? [];
    setChatAccounts(chat);
    setSelectedKey((previous) =>
      requestedAccount
        ? chat.some(
            (account) => account.provider === sourceProvider && account.id === requestedAccount,
          )
          ? key(sourceProvider!, requestedAccount)
          : ""
        : chat.some((account) => key(account.provider, account.id) === previous)
          ? previous
          : chat[0]
            ? key(chat[0].provider, chat[0].id)
            : "",
    );
    setLoaded(true);
  }, [available, run, sourceProvider, requestedAccount, transport]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [refresh]);
  const header = useWorkspaceHeaderModel(environmentId, "Communications", "Communications");
  const controls = (
    <details
      data-communications-source-menu=""
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
          event.stopPropagation();
        }
      }}
    >
      <summary role="button" aria-label="Communications accounts and settings">
        <EllipsisIcon />
        Accounts
      </summary>
      <div data-communications-source-controls="">
        <label>
          Connected communications account
          <select
            aria-label="Connected communications account"
            value={selectedKey}
            disabled={busy || !available}
            onChange={(event) => {
              const selected = chatAccounts.find(
                (account) => key(account.provider, account.id) === event.target.value,
              );
              setSelectedKey(event.target.value);
              if (selected && (selected.provider === "slack" || selected.provider === "discord"))
                void navigate({
                  to: "/workspace",
                  search: {
                    space: "communications",
                    ...(environmentId ? { environment: environmentId } : {}),
                    communicationProvider: selected.provider,
                    account: selected.id,
                  },
                });
            }}
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
          size="sm"
          variant="ghost"
          disabled={busy || !available}
          onClick={() => void refresh()}
        >
          Refresh account list
        </Button>
        {selectedChat ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !available}
            onClick={async () => {
              const response = await run({
                operation: "accounts.disconnect",
                accountId: selectedChat.id,
              });
              if (response && mounted.current) {
                setSelectedKey("");
                setChatAccounts((rows) =>
                  rows.filter(
                    (row) => row.id !== selectedChat.id || row.provider !== selectedChat.provider,
                  ),
                );
                void navigate({
                  to: "/workspace",
                  search: {
                    space: "communications",
                    ...(environmentId ? { environment: environmentId } : {}),
                  },
                });
              }
            }}
          >
            Disconnect {selectedChat.label}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={!available}
          onClick={() => setConnectOpen(true)}
        >
          Connect chat
        </Button>
        <p>
          Server Slack and Discord connections are unavailable on this version. Open Pulse desktop
          to use a desktop account.
        </p>
        <Link
          to="/workspace"
          search={{
            space: "communications",
            communicationProvider: "telegram",
            ...(environmentId ? { environment: environmentId } : {}),
          }}
        >
          Telegram bots
        </Link>
        <Link to="/settings/integrations" hash="telegram">
          Manage Telegram in Settings
        </Link>
      </div>
    </details>
  );
  const unavailable = source && legacySourceNotice(source, available, loaded, chatAccounts);
  const setup = (
    <main className="p-6">
      <h2 className="text-lg font-semibold">
        {source ? "Conversation unavailable here" : "Your conversations, together"}
      </h2>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        {unavailable ||
          (!available
            ? "Open Pulse desktop to connect your accounts. Credentials and sessions stay on that computer; this web connection cannot access them."
            : !loaded
              ? "Loading connected accounts..."
              : selectedChat?.provider === "telegram"
                ? "Personal Telegram login has been retired. Connect a server bot in Settings, then pair a chat."
                : "Choose an account from Communications accounts and settings, connect Slack, or add a Discord bot. Connect Telegram bots in Settings.")}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Unread is unavailable on this version. Existing saved references remain on this device.
      </p>
    </main>
  );
  return (
    <div data-communications-workspace="">
      {available &&
      selectedChat &&
      selectedChat.provider !== "telegram" &&
      transport !== "server" ? (
        <ChatCommunicationsWorkspace
          key={JSON.stringify([environmentId, selectedChat.provider, selectedChat.id])}
          account={selectedChat}
          environmentId={environmentId}
          accountError={error}
          accountControls={controls}
          source={
            source?.provider === selectedChat.provider &&
            source.resource.connectionId === selectedChat.id
              ? source
              : undefined
          }
        />
      ) : (
        <WorkspaceEngagement
          environmentId={environmentId}
          space="communications"
          layout="split"
          selected={false}
          list={
            <div data-communications-account-pane="">
              {controls}
              {compact ? setup : null}
            </div>
          }
          header={header}
          resources={<WorkspaceProjectResources />}
        >
          {compact ? null : setup}
        </WorkspaceEngagement>
      )}
      {error && !selectedChat ? (
        <p role="alert" className="absolute bottom-2 left-3 text-xs">
          {error}
        </p>
      ) : null}
      {connectOpen ? (
        <ConnectCommunicationsDialog
          destination={{ kind: "desktop" }}
          onClose={() => setConnectOpen(false)}
          onConnected={(account) => {
            setConnectOpen(false);
            if (!mounted.current) return;
            setChatAccounts((previous) => [
              ...previous.filter(
                (item) => key(item.provider, item.id) !== key(account.provider, account.id),
              ),
              account,
            ]);
            setSelectedKey(key(account.provider, account.id));
            if (account.provider === "slack" || account.provider === "discord")
              void navigate({
                to: "/workspace",
                search: {
                  space: "communications",
                  ...(environmentId ? { environment: environmentId } : {}),
                  communicationProvider: account.provider,
                  account: account.id,
                },
              });
          }}
        />
      ) : null}
    </div>
  );
}
function legacySourceNotice(
  source: ChatSource,
  available: boolean,
  loaded: boolean,
  accounts: readonly ChatAccount[],
) {
  if (source.resource.transport === "server")
    return "This server conversation reader is not available on this client yet.";
  if (!available) return "This conversation is available only on its desktop connection.";
  if (!loaded) return "Loading connected accounts...";
  return accounts.some(
    (account) =>
      account.provider === source.provider && account.id === source.resource.connectionId,
  )
    ? "Choose the original account from Communications accounts and settings to open this conversation."
    : "This conversation's desktop connection is not on this device or was removed.";
}
