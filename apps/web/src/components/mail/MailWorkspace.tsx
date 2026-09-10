import type {
  EnvironmentId,
  MailAccount,
  MailDraft,
  MailFolder,
  MailMessage,
  MailMessageActionInput,
  MailMessageDetail,
  MailMessageRef,
  MailStatus,
  MailSendReceipt,
} from "@t3tools/contracts";
import { buildMailReply, createMailDraftContent } from "@t3tools/client-runtime/state/mail-compose";
import { useCallback, useEffect, useId, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { OfficeHeader } from "../office/OfficeHeader";
import { mailFolderKind, mailListDate, mailSenderName } from "./mailNavigation";
import {
  ArchiveIcon,
  ChevronLeftIcon,
  FlagIcon,
  FolderIcon,
  InboxIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SendIcon,
  FilePenLineIcon,
  LinkIcon,
  Trash2Icon,
} from "lucide-react";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { mailEnvironment } from "../../state/mail";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { SidebarInset } from "../ui/sidebar";
import { cn, randomUUID } from "../../lib/utils";
import { MailComposer } from "./MailComposer";
import { MailReader } from "./MailReader";
import { MailSetup, mailFailure, mailInputClass } from "./MailSetup";
import { formatMailDate } from "./mailPresentation";

type ComposerValue = { key: string; id?: string; revision: number; content: MailDraft["content"] };

const mailRoute = getRouteApi("/_chat/mail");

export function MailWorkspace() {
  const request = mailRoute.useSearch();
  const showMail = useClientSettings((settings) => settings.mailAlphaEnabled);
  const updateSettings = useUpdateClientSettings();
  const { environments } = useEnvironments();
  const primaryId = usePrimaryEnvironmentId();
  const navigate = mailRoute.useNavigate();
  const [composing, setComposing] = useState(false);
  const candidates = environments.filter(
    (environment) => environment.serverConfig?.environment.capabilities.mail === true,
  );
  const active = request.environment
    ? candidates.find((environment) => environment.environmentId === request.environment)
    : (candidates.find((environment) => environment.environmentId === primaryId) ?? candidates[0]);
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <OfficeHeader active="mail" environmentId={request.environment ?? active?.environmentId}>
        {showMail && candidates.length > 0 && (
          <select
            aria-label="Mail environment"
            className={cn(mailInputClass, "ml-auto max-w-52")}
            disabled={composing}
            value={active?.environmentId ?? ""}
            onChange={(event) => {
              void navigate({ search: { environment: event.target.value } });
            }}
          >
            {!active && <option value="">Choose an available environment</option>}
            {candidates.map((environment) => (
              <option key={environment.environmentId} value={environment.environmentId}>
                {environment.label}
              </option>
            ))}
          </select>
        )}
      </OfficeHeader>
      {!showMail ? (
        <div className="m-auto max-w-md p-6">
          <h2 className="text-xl font-semibold">Your mailbox in Pulse</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Read, organize, and send email with linked context. Mail is an alpha feature, enabled
            separately from your app’s update track.
          </p>
          <Button className="mt-5" onClick={() => updateSettings({ mailAlphaEnabled: true })}>
            Try Mail alpha
          </Button>
        </div>
      ) : active ? (
        <EnvironmentMail
          key={active.environmentId}
          environmentId={active.environmentId}
          onComposing={setComposing}
        />
      ) : (
        <div className="m-auto max-w-md p-6 text-sm">
          <h2 className="font-semibold">This environment does not support Mail yet</h2>
          <p className="mt-2 text-muted-foreground">
            Connect to a Pulse environment with Mail support or update its server.
          </p>
        </div>
      )}
    </SidebarInset>
  );
}

function EnvironmentMail({
  environmentId,
  onComposing,
}: {
  environmentId: EnvironmentId;
  onComposing: (value: boolean) => void;
}) {
  const status = useEnvironmentQuery(mailEnvironment.getStatus({ environmentId, input: {} }));
  const enable = useAtomCommand(mailEnvironment.setEnabled, { reportFailure: false });
  const disconnect = useAtomCommand(mailEnvironment.disconnectAccount, { reportFailure: false });
  const request = mailRoute.useSearch();
  const navigate = mailRoute.useNavigate();
  const [accountId, setAccountId] = useState<string | null>(request.account ?? null);
  const [resumeDraft, setResumeDraft] = useState<string | null>(request.draft ?? null);
  const [setup, setSetup] = useState<"new" | MailAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showAccountActions, setShowAccountActions] = useState(false);
  const accountActionsId = useId();
  const [showRecovery, setShowRecovery] = useState(false);
  const [composing, setComposing] = useState(false);
  const accounts = status.data?.accounts ?? [];
  const account = accountId
    ? accounts.find((item) => item.id === accountId)
    : (accounts.find((item) => item.connected) ?? accounts[0]);
  const setComposerState = useCallback(
    (value: boolean) => {
      setComposing(value);
      onComposing(value);
    },
    [onComposing],
  );
  useEffect(() => () => onComposing(false), [onComposing]);
  const refreshStatus = status.refresh;
  if (!status.data)
    return (
      <div className="p-6 text-sm" role={status.error ? "alert" : "status"}>
        {status.error ?? "Loading Mail…"}
        {status.error && (
          <Button variant="outline" className="ml-2" onClick={status.refresh}>
            Retry
          </Button>
        )}
      </div>
    );
  if (!status.data.enabled && !showRecovery && !composing)
    return (
      <div className="m-auto max-w-md space-y-4 p-6">
        <h2 className="text-xl font-semibold">Enable Mail on this environment</h2>
        <p className="text-sm text-muted-foreground">
          Mail connects to your provider from this environment. An environment administrator can
          enable the alpha. Existing saved drafts and send results remain available while disabled.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await enable({ environmentId, input: { enabled: true } });
            setBusy(false);
            if (result._tag === "Failure") setError(mailFailure(result));
            else refreshStatus();
          }}
        >
          {busy ? "Enabling…" : "Enable Mail alpha"}
        </Button>
        <Button variant="outline" onClick={() => setShowRecovery(true)}>
          View saved drafts and Outbox
        </Button>
      </div>
    );
  if (setup)
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MailSetup
          environmentId={environmentId}
          {...(setup !== "new" ? { account: setup } : {})}
          onCancel={() => setSetup(null)}
          onSaved={() => {
            setSetup(null);
            refreshStatus();
          }}
        />
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {!status.data.enabled && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await enable({ environmentId, input: { enabled: true } });
              setBusy(false);
              if (result._tag === "Failure") setError(mailFailure(result));
              else refreshStatus();
            }}
          >
            Enable Mail alpha
          </Button>
        )}
        <select
          aria-label="Email account"
          className={cn(mailInputClass, "max-w-64")}
          value={account?.id ?? ""}
          disabled={composing}
          onChange={(event) => {
            setAccountId(event.target.value);
            setResumeDraft(null);
            void navigate({
              search: (previous) => ({
                ...previous,
                account: event.target.value,
                draft: undefined,
              }),
              replace: true,
            });
            setConfirmDisconnect(false);
          }}
        >
          {!account && (
            <option value="">{accounts.length ? "Choose an account" : "No accounts"}</option>
          )}
          {accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.email}
              {item.connected ? "" : " (disconnected)"}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto md:hidden"
          aria-label="Account actions"
          aria-expanded={showAccountActions}
          aria-controls={accountActionsId}
          onClick={() => setShowAccountActions(!showAccountActions)}
        >
          <MoreHorizontalIcon />
        </Button>
        <div
          id={accountActionsId}
          className={cn(
            "w-full flex-wrap items-center gap-2 md:contents",
            showAccountActions ? "flex" : "hidden",
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={composing || !status.data.enabled}
            onClick={() => setSetup("new")}
          >
            <PlusIcon />
            Add account
          </Button>
          {account && (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={composing || !status.data.enabled}
              aria-label="Account settings"
              onClick={() => setSetup(account)}
            >
              <SettingsIcon />
            </Button>
          )}
          {account?.connected && (
            <Button
              variant="ghost"
              size="sm"
              disabled={composing || busy}
              className="ml-auto"
              onClick={() => setConfirmDisconnect(!confirmDisconnect)}
            >
              Disconnect
            </Button>
          )}
          {status.data.enabled && (
            <Button
              variant="ghost"
              size="sm"
              disabled={composing || busy}
              onClick={async () => {
                setBusy(true);
                const result = await enable({ environmentId, input: { enabled: false } });
                setBusy(false);
                if (result._tag === "Failure") setError(mailFailure(result));
                else {
                  setShowRecovery(false);
                  refreshStatus();
                }
              }}
            >
              Disable Mail alpha
            </Button>
          )}
        </div>
      </div>
      {confirmDisconnect && account && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 p-3 text-sm">
          <p className="flex-1">
            Disconnect {account.email}? Saved drafts, tags, links, and send history stay available.
          </p>
          <Button
            size="sm"
            variant="destructive-outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await disconnect({ environmentId, input: { accountId: account.id } });
              setBusy(false);
              if (result._tag === "Failure") setError(mailFailure(result));
              else {
                setConfirmDisconnect(false);
                refreshStatus();
              }
            }}
          >
            Disconnect account
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDisconnect(false)}>
            Cancel
          </Button>
        </div>
      )}
      {(error || status.error) && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {error || status.error}
        </p>
      )}
      {account ? (
        <AccountMail
          key={account.id}
          environmentId={environmentId}
          account={account}
          status={status.data}
          onComposing={setComposerState}
          onReconnect={() => setSetup(account)}
          initialDraftId={resumeDraft}
          initialTab={request.tab}
          onDraftClosed={() => {
            setResumeDraft(null);
            void navigate({
              search: (previous) => ({ ...previous, draft: undefined }),
              replace: true,
            });
          }}
          onSetupSending={(draft) => {
            setResumeDraft(draft.id);
            setSetup(account);
          }}
        />
      ) : accountId ? (
        <div className="m-auto max-w-sm space-y-3 p-6" role="alert">
          <h2 className="text-lg font-semibold">This account is unavailable</h2>
          <p className="text-sm text-muted-foreground">
            The linked account is not available in this environment. Choose an account above, or
            return to your available mailboxes.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setAccountId(null);
              setResumeDraft(null);
              void navigate({
                search: (previous) => ({ ...previous, account: undefined, draft: undefined }),
                replace: true,
              });
            }}
          >
            Show available accounts
          </Button>
        </div>
      ) : (
        <div className="m-auto max-w-sm p-6">
          <InboxIcon className="mb-4 size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Connect your first account</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use IMAP for your mailbox and SMTP to send. Your folders and messages stay with your
            mail provider.
          </p>
          <Button className="mt-4" onClick={() => setSetup("new")} disabled={!status.data.enabled}>
            Connect email
          </Button>
        </div>
      )}
    </div>
  );
}

function AccountMail({
  environmentId,
  account,
  status,
  onComposing,
  onReconnect,
  initialDraftId,
  initialTab,
  onDraftClosed,
  onSetupSending,
}: {
  environmentId: EnvironmentId;
  account: MailAccount;
  status: MailStatus;
  onComposing: (value: boolean) => void;
  onReconnect: () => void;
  initialDraftId: string | null;
  initialTab?: "drafts" | "outbox" | undefined;
  onDraftClosed: () => void;
  onSetupSending: (draft: MailDraft) => void;
}) {
  const available = account.connected && status.enabled;
  const folders = useEnvironmentQuery(
    available
      ? mailEnvironment.listFolders({ environmentId, input: { accountId: account.id } })
      : null,
  );
  const drafts = useEnvironmentQuery(mailEnvironment.listDrafts({ environmentId, input: {} }));
  const outbox = useEnvironmentQuery(mailEnvironment.listOutbox({ environmentId, input: {} }));
  const [folder, setFolder] = useState("INBOX");
  const [tab, setTab] = useState<"mailbox" | "drafts" | "outbox">(
    initialTab ?? (available ? "mailbox" : "drafts"),
  );
  const [composer, setComposer] = useState<ComposerValue | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(initialDraftId);
  const composerOpen = composer !== null || selectedDraft !== null;
  const [showFolders, setShowFolders] = useState(false);
  const ownDrafts = drafts.data?.filter((draft) => draft.content.accountId === account.id) ?? [];
  const ownOutbox = outbox.data?.filter((receipt) => receipt.accountId === account.id) ?? [];
  const refreshDrafts = drafts.refresh;
  const refreshOutbox = outbox.refresh;
  const refreshWork = useCallback(() => {
    refreshDrafts();
    refreshOutbox();
  }, [refreshDrafts, refreshOutbox]);
  useEffect(() => {
    onComposing(composerOpen);
  }, [composerOpen, onComposing]);
  const openComposer = (content: MailDraft["content"], draft?: MailDraft) =>
    setComposer({
      key: randomUUID(),
      ...(draft ? { id: draft.id } : {}),
      revision: draft?.revision ?? 0,
      content,
    });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!available && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 p-3 text-sm">
          <p className="flex-1">
            {status.enabled
              ? "Reconnect this account to fetch and send mail."
              : "Mail is disabled on this environment. Saved drafts and send history remain available."}
          </p>
          {status.enabled && (
            <Button variant="outline" size="sm" onClick={onReconnect}>
              Reconnect
            </Button>
          )}
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2">
        <Button
          size="sm"
          disabled={!available || composerOpen}
          onClick={() => openComposer(createMailDraftContent(account.id))}
        >
          <PencilIcon />
          New message
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={composerOpen}
          className="md:hidden"
          aria-expanded={showFolders}
          onClick={() => setShowFolders(!showFolders)}
        >
          <FolderIcon />
          Folders
        </Button>
        <Button
          variant={tab === "drafts" ? "secondary" : "ghost"}
          size="sm"
          disabled={composerOpen}
          onClick={() => setTab("drafts")}
        >
          Drafts {ownDrafts.length || ""}
        </Button>
        <Button
          variant={tab === "outbox" ? "secondary" : "ghost"}
          size="sm"
          disabled={composerOpen}
          onClick={() => setTab("outbox")}
        >
          Outbox
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Refresh mailbox"
          onClick={() => {
            folders.refresh();
            refreshWork();
          }}
        >
          <RefreshCwIcon />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Mail folders"
          className={cn(
            "w-full shrink-0 overflow-y-auto border-r border-border bg-muted/20 p-3 md:w-48",
            showFolders ? "block" : "hidden md:block",
            composerOpen && "hidden md:block",
          )}
        >
          {folders.error && (
            <p role="alert" className="px-2 py-3 text-xs text-destructive">
              {folders.error}
              <button className="mt-2 block underline" onClick={folders.refresh}>
                Retry folders
              </button>
            </p>
          )}
          {folders.isPending && !folders.data && (
            <p className="p-2 text-xs text-muted-foreground">Loading folders…</p>
          )}
          {(folders.data ?? [])
            .filter((item) => item.selectable)
            .map((item) => (
              <button
                key={item.path}
                aria-label={item.path}
                aria-current={tab === "mailbox" && folder === item.path ? "page" : undefined}
                disabled={composerOpen}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  tab === "mailbox" && folder === item.path && "bg-accent font-medium",
                )}
                onClick={() => {
                  setFolder(item.path);
                  setTab("mailbox");
                  setShowFolders(false);
                }}
              >
                <MailFolderIcon folder={item} />
                <Tooltip>
                  <TooltipTrigger render={<span className="truncate">{item.name}</span>} />
                  <TooltipPopup>{item.path}</TooltipPopup>
                </Tooltip>
              </button>
            ))}
          {available && (
            <MailFolderManager
              environmentId={environmentId}
              accountId={account.id}
              folders={folders.data ?? []}
              onChanged={folders.refresh}
              disabled={composerOpen}
            />
          )}
        </nav>
        <main className={cn("min-w-0 flex-1", showFolders && !composerOpen && "hidden md:block")}>
          {selectedDraft ? (
            <MailSavedDraftComposer
              key={selectedDraft}
              environmentId={environmentId}
              id={selectedDraft}
              sendReceipt={
                ownOutbox.find(
                  (receipt) => receipt.draftId === selectedDraft && receipt.state !== "failed",
                ) ?? null
              }
              account={account}
              attachmentLimit={status.attachmentLimitBytes}
              available={available}
              onSetupSending={onSetupSending}
              onClose={() => {
                setSelectedDraft(null);
                onDraftClosed();
                refreshWork();
              }}
              onChanged={refreshWork}
            />
          ) : composer ? (
            <MailComposer
              key={composer.key}
              environmentId={environmentId}
              account={account}
              initial={composer}
              attachmentLimit={status.attachmentLimitBytes}
              available={available}
              onSetupSending={onSetupSending}
              onClose={() => {
                setComposer(null);
                refreshWork();
              }}
              onChanged={refreshWork}
            />
          ) : tab === "drafts" ? (
            <div className="h-full overflow-y-auto">
              <div className="border-b border-border p-4">
                <h2 className="text-sm font-semibold">Saved drafts</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drafts are saved in this Pulse environment.
                </p>
              </div>
              {drafts.error && (
                <p role="alert" className="p-4 text-sm text-destructive">
                  {drafts.error}
                </p>
              )}
              {!ownDrafts.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  {drafts.isPending ? "Loading drafts…" : "No saved drafts."}
                </p>
              )}
              {ownDrafts.map((draft) => (
                <button
                  key={draft.id}
                  className="block w-full border-b border-border px-4 py-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSelectedDraft(draft.id)}
                >
                  <p className="truncate text-sm font-medium">
                    {draft.content.subject || "(No subject)"}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    To {draft.content.to.join(", ") || "No recipients"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMailDate(draft.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          ) : tab === "outbox" ? (
            <div className="h-full overflow-y-auto">
              <div className="border-b border-border p-4">
                <h2 className="text-sm font-semibold">Outbox</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Accepted means your mail service accepted the message. Delivery is not confirmed.
                </p>
              </div>
              {outbox.error && (
                <p role="alert" className="p-4 text-sm text-destructive">
                  {outbox.error}
                </p>
              )}
              {!ownOutbox.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  {outbox.isPending ? "Loading send history…" : "No messages sent from Pulse yet."}
                </p>
              )}
              {ownOutbox.map((receipt) => (
                <div
                  key={receipt.operationId}
                  className="space-y-1 border-b border-border p-4 text-sm"
                >
                  <p className="font-medium">
                    {receipt.state === "uncertain"
                      ? "Outcome unknown"
                      : receipt.state === "accepted"
                        ? "Accepted by mail service"
                        : receipt.state === "partial"
                          ? "Partially accepted"
                          : receipt.state === "failed"
                            ? "Failed"
                            : "Sending"}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">{receipt.detail}</p>
                  {receipt.accepted.length > 0 && (
                    <p className="break-words text-xs">Accepted: {receipt.accepted.join(", ")}</p>
                  )}
                  {receipt.rejected.length > 0 && (
                    <p className="break-words text-xs">Rejected: {receipt.rejected.join(", ")}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatMailDate(receipt.updatedAt)}
                  </p>
                  {["uncertain", "sending", "partial"].includes(receipt.state) && (
                    <p className="text-xs">Check your provider before sending another copy.</p>
                  )}
                </div>
              ))}
            </div>
          ) : available ? (
            <MailMessageBrowser
              key={folder}
              environmentId={environmentId}
              account={account}
              folder={folder}
              folders={folders.data ?? []}
              onReply={(detail, mode, attachments) =>
                openComposer({
                  ...buildMailReply(detail, account, mode),
                  ...(attachments ? { attachments } : {}),
                })
              }
            />
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              Reconnect the account to open its folders.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

function MailMessageBrowser({
  environmentId,
  account,
  folder,
  folders,
  onReply,
}: {
  environmentId: EnvironmentId;
  account: MailAccount;
  folder: string;
  folders: readonly MailFolder[];
  onReply: (
    detail: MailMessageDetail,
    mode: "reply" | "replyAll" | "forward",
    attachments?: MailDraft["content"]["attachments"],
  ) => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [pages, setPages] = useState<Array<number | undefined>>([undefined]);
  const [selection, setSelection] = useState<readonly number[]>([]);
  const [opened, setOpened] = useState<MailMessageRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<MailMessageActionInput | null>(null);
  const [destination, setDestination] = useState("");
  const messages = useEnvironmentQuery(
    mailEnvironment.listMessages({
      environmentId,
      input: {
        accountId: account.id,
        folder,
        limit: 50,
        ...(pages.at(-1) ? { beforeUid: pages.at(-1)! } : {}),
        ...(query ? { query } : {}),
        ...(filter === "unread"
          ? { unreadOnly: true }
          : filter === "flagged"
            ? { flaggedOnly: true }
            : {}),
      },
    }),
  );
  const act = useAtomCommand(mailEnvironment.actOnMessages, { reportFailure: false });
  useEffect(() => {
    setSelection([]);
    setOpened(null);
  }, [messages.data?.uidValidity]);
  const items = messages.data?.messages ?? [];
  const checked = items.filter((message) => selection.includes(message.ref.uid));
  const apply = async (
    action: MailMessageActionInput["action"],
    targets: readonly MailMessage[],
    targetFolder?: string,
  ) => {
    if (!targets.length) return;
    setBusy(true);
    setError(null);
    setUndo(null);
    const result = await act({
      environmentId,
      input: {
        refs: targets.map((message) => message.ref),
        action,
        ...(targetFolder ? { destination: targetFolder } : {}),
      },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      setError(mailFailure(result));
      return;
    }
    if (result.value.failed.length)
      setError(result.value.failed.map((failure) => failure.detail).join("; "));
    const flag = action === "read" || action === "unread" ? "\\Seen" : "\\Flagged";
    const expected = action === "unread" || action === "unflag";
    const changed = targets.filter(
      (message) =>
        message.flags.includes(flag) === expected &&
        result.value.completed.some(
          (ref) => ref.uid === message.ref.uid && ref.uidValidity === message.ref.uidValidity,
        ),
    );
    if (["read", "unread", "flag", "unflag"].includes(action) && changed.length)
      setUndo({
        refs: changed.map((message) => message.ref),
        action:
          action === "read"
            ? "unread"
            : action === "unread"
              ? "read"
              : action === "flag"
                ? "unflag"
                : "flag",
      });
    if (["move", "archive", "trash", "restore"].includes(action)) setOpened(null);
    if (
      result.value.moved.length > 0 &&
      result.value.moved.every((move) => move.from.folder === folder)
    ) {
      setUndo({
        refs: result.value.moved.map((move) => move.to),
        action: "move",
        destination: folder,
      });
    }
    setSelection([]);
    messages.refresh();
    for (const message of targets) {
      if (targets.length === 1 || opened?.uid === message.ref.uid)
        appAtomRegistry.refresh(mailEnvironment.readMessage({ environmentId, input: message.ref }));
    }
  };
  return (
    <div className="flex h-full min-h-0">
      <section
        aria-label="Message list"
        className={cn(
          "flex min-h-0 w-full shrink-0 flex-col border-r border-border lg:w-72 xl:w-80 2xl:w-96",
          opened && "hidden lg:flex",
        )}
      >
        <form
          className="flex items-center gap-2 border-b border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
            setPages([undefined]);
            setSelection([]);
          }}
        >
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            nativeInput
            aria-label="Search this mail folder"
            placeholder="Search this folder"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={500}
          />
          <Button size="sm" variant="ghost" type="submit">
            Search
          </Button>
        </form>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              aria-label="Select all messages on this page"
              checked={items.length > 0 && selection.length === items.length}
              disabled={busy}
              onChange={(event) =>
                setSelection(event.target.checked ? items.map((message) => message.ref.uid) : [])
              }
            />
            <Tooltip>
              <TooltipTrigger render={<span className="max-w-24 truncate">{folder}</span>} />
              <TooltipPopup>{folder}</TooltipPopup>
            </Tooltip>
          </label>
          <select
            aria-label="Filter messages"
            className={cn(mailInputClass, "ml-auto max-w-28")}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPages([undefined]);
              setSelection([]);
            }}
          >
            <option value="all">All mail</option>
            <option value="unread">Unread</option>
            <option value="flagged">Flagged</option>
          </select>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Refresh messages"
            onClick={messages.refresh}
          >
            <RefreshCwIcon />
          </Button>
        </div>
        {checked.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-border bg-muted/30 p-2">
            <span className="w-full text-xs text-muted-foreground">{checked.length} selected</span>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void apply("read", checked)}
            >
              Read
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void apply("unread", checked)}
            >
              Unread
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void apply("flag", checked)}
            >
              Flag
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void apply("unflag", checked)}
            >
              Unflag
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void apply("archive", checked)}
            >
              <ArchiveIcon />
              Archive
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void apply("trash", checked)}
            >
              <Trash2Icon />
              Trash
            </Button>
            <select
              aria-label="Move selected messages to folder"
              className={cn(mailInputClass, "max-w-48")}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            >
              <option value="">Move to…</option>
              {folders
                .filter((item) => item.selectable && item.path !== folder)
                .map((item) => (
                  <option key={item.path} value={item.path}>
                    {item.name}
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !destination}
              onClick={() => void apply("move", checked, destination)}
            >
              Move
            </Button>
          </div>
        )}
        {(messages.error || error) && (
          <p role="alert" className="border-b border-border p-3 text-xs text-destructive">
            {messages.error || error}
          </p>
        )}
        {undo && (
          <div role="status" className="flex items-center gap-2 border-b border-border p-2 text-xs">
            <span className="flex-1">Messages updated</span>
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await act({ environmentId, input: undo });
                setBusy(false);
                if (result._tag === "Failure") setError(mailFailure(result));
                else {
                  if (result.value.failed.length)
                    setError(result.value.failed.map((failure) => failure.detail).join("; "));
                  setUndo(null);
                  messages.refresh();
                }
              }}
            >
              Undo
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!items.length && (
            <p className="p-5 text-sm text-muted-foreground" role="status">
              {messages.isPending
                ? "Loading messages…"
                : messages.data?.nextBeforeUid
                  ? "No matching messages in this part of the folder. Choose Older to search more history."
                  : query
                    ? "No messages match this search."
                    : "No messages in this view."}
            </p>
          )}
          {items.map((message) => (
            <div
              key={message.id}
              className={cn(
                "group flex items-start gap-3 border-b border-border/60 px-4 py-4",
                opened?.uid === message.ref.uid ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <input
                type="checkbox"
                aria-label={`Select ${message.subject || "message"}`}
                checked={selection.includes(message.ref.uid)}
                disabled={busy}
                className="mt-1"
                onChange={(event) =>
                  setSelection(
                    event.target.checked
                      ? [...selection, message.ref.uid]
                      : selection.filter((uid) => uid !== message.ref.uid),
                  )
                }
              />
              <button
                className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-current={opened?.uid === message.ref.uid ? "true" : undefined}
                onClick={() => {
                  setOpened(message.ref);
                  if (!message.flags.includes("\\Seen")) void apply("read", [message]);
                }}
              >
                <div className="flex items-start gap-2">
                  <p
                    className={cn(
                      "flex-1 truncate text-sm",
                      !message.flags.includes("\\Seen") && "font-semibold",
                    )}
                  >
                    {mailSenderName(message.from)}
                  </p>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <time
                          dateTime={message.date ?? undefined}
                          aria-label={formatMailDate(message.date)}
                          className="shrink-0 text-xs tabular-nums text-muted-foreground"
                        >
                          {mailListDate(message.date)}
                        </time>
                      }
                    />
                    <TooltipPopup>{formatMailDate(message.date)}</TooltipPopup>
                  </Tooltip>
                  {message.flags.includes("\\Flagged") && (
                    <FlagIcon className="size-3 text-primary" />
                  )}
                </div>
                <p
                  className={cn(
                    "mt-1 truncate text-xs",
                    !message.flags.includes("\\Seen") && "font-medium",
                  )}
                >
                  {message.subject || "(No subject)"}
                </p>
                {message.metadata.links.length > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LinkIcon className="size-3" />
                    {message.metadata.links.length} linked{" "}
                    {message.metadata.links.length === 1 ? "reference" : "references"}
                  </p>
                )}
                {message.metadata.tags.length > 0 && (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {message.metadata.tags.join(", ")}
                  </p>
                )}
              </button>
            </div>
          ))}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-2 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            disabled={pages.length === 1 || messages.isPending}
            onClick={() => {
              setPages(pages.slice(0, -1));
              setSelection([]);
            }}
          >
            <ChevronLeftIcon />
            Newer
          </Button>
          <span>Page {pages.length}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!messages.data?.nextBeforeUid || messages.isPending}
            onClick={() => {
              if (messages.data?.nextBeforeUid) setPages([...pages, messages.data.nextBeforeUid]);
              setSelection([]);
            }}
          >
            Older
          </Button>
        </footer>
      </section>
      <section
        aria-label="Reading pane"
        className={cn("min-w-0 flex-1", !opened && "hidden lg:block")}
      >
        {opened ? (
          <MailReader
            key={`${opened.folder}:${opened.uidValidity}:${opened.uid}`}
            environmentId={environmentId}
            reference={opened}
            onReply={onReply}
            onBack={() => setOpened(null)}
            onChanged={messages.refresh}
            onMessageAction={(action, message) => apply(action, [message])}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <MailIcon className="size-7 text-muted-foreground" />
            <h2 className="text-base font-medium">Select a message</h2>
            <p className="max-w-xs text-sm leading-6 text-muted-foreground">
              Read, reply, and keep useful links alongside your email.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function MailSavedDraftComposer({
  environmentId,
  id,
  account,
  attachmentLimit,
  available,
  onClose,
  onChanged,
  onSetupSending,
  sendReceipt,
}: {
  environmentId: EnvironmentId;
  id: string;
  account: MailAccount;
  attachmentLimit: number;
  available: boolean;
  onClose: () => void;
  onChanged: () => void;
  onSetupSending: (draft: MailDraft) => void;
  sendReceipt: MailSendReceipt | null;
}) {
  const draft = useEnvironmentQuery(mailEnvironment.getDraft({ environmentId, input: { id } }));
  if (draft.data && draft.data.content.accountId !== account.id)
    return (
      <div className="space-y-3 p-5 text-sm" role="alert">
        <p>
          This draft belongs to another account. Open it from Office to use the correct sending
          identity.
        </p>
        <Button variant="outline" onClick={onClose}>
          Back to drafts
        </Button>
      </div>
    );
  return draft.data ? (
    <MailComposer
      environmentId={environmentId}
      account={account}
      initial={draft.data}
      attachmentLimit={attachmentLimit}
      available={available}
      onClose={onClose}
      onChanged={onChanged}
      onSetupSending={onSetupSending}
      sendReceipt={sendReceipt}
    />
  ) : (
    <div className="space-y-3 p-5 text-sm">
      <p role={draft.error ? "alert" : "status"}>{draft.error ?? "Loading saved draft…"}</p>
      {draft.error && (
        <Button variant="outline" onClick={draft.refresh}>
          Retry
        </Button>
      )}
      <Button variant="ghost" onClick={onClose}>
        Back to drafts
      </Button>
    </div>
  );
}

function MailFolderManager({
  environmentId,
  accountId,
  folders,
  onChanged,
  disabled,
}: {
  environmentId: EnvironmentId;
  accountId: string;
  folders: readonly MailFolder[];
  onChanged: () => void;
  disabled: boolean;
}) {
  const create = useAtomCommand(mailEnvironment.createFolder, { reportFailure: false });
  const rename = useAtomCommand(mailEnvironment.renameFolder, { reportFailure: false });
  const remove = useAtomCommand(mailEnvironment.deleteFolder, { reportFailure: false });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mt-3 border-t border-border pt-2">
      <Button size="xs" variant="ghost" disabled={disabled} onClick={() => setOpen(!open)}>
        Manage folders
      </Button>
      {open && (
        <div className="mt-2 space-y-2">
          <select
            aria-label="Folder to manage"
            className={mailInputClass}
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setConfirm(false);
            }}
          >
            <option value="">New folder</option>
            {folders
              .filter((folder) => !folder.specialUse && folder.path !== "INBOX")
              .map((folder) => (
                <option key={folder.path} value={folder.path}>
                  {folder.name}
                </option>
              ))}
          </select>
          <Input
            nativeInput
            aria-label="Folder path"
            placeholder="Folder path"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            variant="outline"
            size="xs"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              const result = selected
                ? await rename({
                    environmentId,
                    input: { accountId, folder: selected, newPath: name.trim() },
                  })
                : await create({ environmentId, input: { accountId, folder: name.trim() } });
              setBusy(false);
              if (result._tag === "Failure") setError(mailFailure(result));
              else {
                setName("");
                setSelected("");
                setError(null);
                onChanged();
              }
            }}
          >
            {selected ? "Rename" : "Create"}
          </Button>
          {selected && (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => setConfirm(true)}>
              Delete folder
            </Button>
          )}
          {confirm && (
            <div className="space-y-2 text-xs">
              <p>Delete “{selected}”? Only empty folders can be deleted.</p>
              <Button
                size="xs"
                variant="destructive-outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const result = await remove({
                    environmentId,
                    input: { accountId, folder: selected },
                  });
                  setBusy(false);
                  if (result._tag === "Failure") setError(mailFailure(result));
                  else {
                    setConfirm(false);
                    setSelected("");
                    onChanged();
                  }
                }}
              >
                Delete empty folder
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MailFolderIcon({ folder }: { folder: MailFolder }) {
  const icons = {
    inbox: InboxIcon,
    sent: SendIcon,
    drafts: FilePenLineIcon,
    trash: Trash2Icon,
    archive: ArchiveIcon,
    folder: FolderIcon,
  };
  const Icon = icons[mailFolderKind(folder.path, folder.specialUse)];
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}
