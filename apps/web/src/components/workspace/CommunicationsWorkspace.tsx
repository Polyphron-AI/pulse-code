import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ChatAccount, OfficeAccount } from "@t3tools/contracts";
import { PlusIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { cn } from "../../lib/utils";
import { RequestState } from "./office/shared";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import { EmailCommunicationsWorkspace } from "./EmailCommunicationsWorkspace";
import { ChatCommunicationsWorkspace } from "./ChatCommunicationsWorkspace";
import { ConnectCommunicationsDialog } from "./ConnectCommunicationsDialog";

const providerNames = { slack: "Slack", discord: "Discord", telegram: "Telegram" };
export function CommunicationsWorkspace() {
  const { run, available, busy, error } = useCommunicationsRequest();
  const officeInvoke = window.desktopBridge?.officeInvoke;
  const [chatAccounts, setChatAccounts] = useState<readonly ChatAccount[]>([]);
  const [mailAccounts, setMailAccounts] = useState<readonly OfficeAccount[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [mailError, setMailError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const mounted = useRef(true);
  const key = (provider: string, id: string) => JSON.stringify([provider, id]);
  const selectedChat = chatAccounts.find(
    (account) => key(account.provider, account.id) === selectedKey,
  );
  const selectedMail = mailAccounts.find((account) => key("email", account.id) === selectedKey);
  const refresh = useCallback(async () => {
    let chat: readonly ChatAccount[] | undefined;
    let mail: readonly OfficeAccount[] | undefined;
    if (available) {
      const response = await run({ operation: "accounts.list" });
      if (response) chat = response.accounts ?? [];
    }
    if (officeInvoke) {
      setMailBusy(true);
      setMailError(undefined);
      try {
        const response = await officeInvoke({ operation: "accounts.list" });
        if (response.ok)
          mail = (response.accounts ?? []).filter((account) =>
            account.capabilities.includes("mail"),
          );
        else if (mounted.current) setMailError(response.error.message);
      } catch {
        if (mounted.current)
          setMailError("Email accounts could not be loaded. Use Refresh to retry.");
      } finally {
        if (mounted.current) setMailBusy(false);
      }
    }
    if (!mounted.current) return;
    if (chat) setChatAccounts(chat);
    if (mail) setMailAccounts(mail);
    setSelectedKey((previous) => {
      if (!previous)
        return mail?.[0]
          ? JSON.stringify(["email", mail[0].id])
          : chat?.[0]
            ? JSON.stringify([chat[0].provider, chat[0].id])
            : "";
      const [provider] = JSON.parse(previous) as [string, string];
      const latest = provider === "email" ? mail : chat;
      if (
        !latest ||
        latest.some(
          (account) =>
            JSON.stringify(["email" in account ? "email" : account.provider, account.id]) ===
            previous,
        )
      )
        return previous;
      return mail?.[0]
        ? JSON.stringify(["email", mail[0].id])
        : chat?.[0]
          ? JSON.stringify([chat[0].provider, chat[0].id])
          : "";
    });
    setLoaded(true);
  }, [available, officeInvoke, run]);
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
  return (
    <SidebarInset className="min-w-0 overflow-hidden">
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 border-b border-border px-4",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        )}
      >
        <span className="hidden shrink-0 text-sm text-muted-foreground xl:inline">
          Office / <span className="text-foreground">Communications</span>
        </span>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Connected communications account</span>
          <select
            aria-label="Connected communications account"
            value={selectedKey}
            disabled={busy || mailBusy}
            onChange={(event) => setSelectedKey(event.target.value)}
            className="max-w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="">Choose an account</option>
            {mailAccounts.length > 0 && (
              <optgroup label="Email">
                {mailAccounts.map((account) => (
                  <option key={key("email", account.id)} value={key("email", account.id)}>
                    {account.email} · {account.provider}
                  </option>
                ))}
              </optgroup>
            )}
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
          disabled={busy || mailBusy || (!available && !officeInvoke)}
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
          search={{ space: "office" }}
          hash="office-calendar"
          className="shrink-0 text-xs underline underline-offset-4"
        >
          Email accounts
        </Link>
      </header>
      {(error || mailError) && (
        <div className="border-b border-border px-4 py-2">
          <RequestState busy={busy || mailBusy} error={error ?? mailError} />
        </div>
      )}
      {selectedMail ? (
        <EmailCommunicationsWorkspace key={selectedMail.id} requestedAccountId={selectedMail.id} />
      ) : selectedChat ? (
        <ChatCommunicationsWorkspace
          key={JSON.stringify([selectedChat.provider, selectedChat.id])}
          account={selectedChat}
        />
      ) : (
        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="text-xl font-semibold">Your conversations, together</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {!available && !officeInvoke
              ? "Open Pulse desktop to connect your accounts. Credentials and sessions stay on that computer; this web connection cannot access them."
              : !loaded
                ? "Loading connected accounts…"
                : "Choose an account above, connect Slack or Telegram, or add a Discord bot. Connect email from Email accounts."}
          </p>
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Slack uses your token permissions. Telegram connects your personal account and its
            chats. Discord exposes bot-accessible team channels, not a personal inbox. Email
            supports reading and local reply drafts; sending email is not available.
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
    </SidebarInset>
  );
}
