import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { RegistryContext } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import {
  CommunicationsError,
  chatResourceId,
  parseChatResourceId,
  workspaceItemKey,
  type CommunicationConnection,
  type CommunicationConversation,
  type CommunicationMessage,
  type EnvironmentId,
  type WorkspaceLinkEndpoint,
  type WorkspaceSavedItem,
} from "@t3tools/contracts";
import { mergeSlackMessages } from "@t3tools/client-runtime/state/communications";
import { displayDay, formatDay, formatEventTime } from "@t3tools/client-runtime/calendar/dates";
import { communications } from "../../state/communications";
import { serverEnvironment } from "../../state/server";
import { workspaceSavedItems } from "../../state/workspaceSavedItems";
import { useEnvironment } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { usePreparedConnection } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { WorkspaceLinkedContext } from "./WorkspaceLinkedContext";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import {
  ChatComposer,
  CommunicationFileOpener,
  CommunicationStream,
  ConversationNavigation,
  ConversationProjectLinks,
  type CommunicationRow,
} from "./ChatCommunicationsWorkspace";
import {
  conversationGroups,
  conversationSubtitle,
  legacySlackNotice,
  type ConversationProject,
} from "./communicationsChat";
import { parseWorkspaceSearch } from "./workspaceNavigation";
import { ConnectCommunicationsDialog } from "./ConnectCommunicationsDialog";
import { Button } from "../ui/button";
import { canOpenLinkedItem, endpointTitle } from "./mail/linkedItems";
import type { ChatSource } from "./CommunicationsWorkspace";

const isCommunicationsError = Schema.is(CommunicationsError);
function readFailure(error: unknown) {
  if (isCommunicationsError(error)) {
    switch (error.kind) {
      case "access-denied":
        return "This Slack token does not allow this read. Check its scopes in Slack.";
      case "rate-limit":
        return "Slack has limited requests. Wait before using Refresh again.";
      case "not-found":
        return "This Slack source is unavailable or was removed.";
      case "unsupported":
        return "This server does not support Slack reading.";
      case "invalid-input":
        return "This Slack reference or page has expired. Use Refresh to start again.";
      case "unavailable":
        return "This Slack read is unavailable. Use Refresh to try again.";
    }
  }
  return "The selected environment could not complete this read. Use Refresh to try again.";
}
let nextReaderGeneration = 0;
const readerGenerations = new WeakMap<object, Map<number, number>>();
/** Readers sharing the same authenticated binding share queries, but never stale binding content. */
function readerGeneration(binding: object, connectionGeneration: number) {
  let generations = readerGenerations.get(binding);
  if (!generations) {
    generations = new Map();
    readerGenerations.set(binding, generations);
  }
  let generation = generations.get(connectionGeneration);
  if (generation === undefined) {
    generation = ++nextReaderGeneration;
    generations.set(connectionGeneration, generation);
  }
  return generation;
}
function useReaderSignal() {
  const owner = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    owner.current = controller;
    return () => {
      controller.abort();
      if (owner.current === controller) owner.current = null;
    };
  }, []);
  return useCallback(() => owner.current?.signal ?? AbortSignal.abort(), []);
}
const endpoint = (
  connectionId: string,
  conversation: { workspaceId: string; id: string; title?: string | undefined },
  message?: CommunicationMessage,
): WorkspaceLinkEndpoint => ({
  ...(conversation.title ? { title: conversation.title } : {}),
  ref: {
    type: "provider-resource",
    provider: "slack",
    resourceId: chatResourceId({
      version: 1,
      transport: "server",
      connectionId,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      ...(message
        ? {
            messageId: message.id,
            replyRootId: message.threadId ?? message.replyToId ?? message.id,
          }
        : {}),
    }),
  },
});

/** An explicit server destination never falls back to a desktop or another environment. */
export function ServerCommunicationsWorkspace({
  environmentId,
  source,
}: {
  environmentId: EnvironmentId | null;
  source?: ChatSource | undefined;
}) {
  const environment = useEnvironment(environmentId);
  const prepared = Option.getOrNull(usePreparedConnection(environmentId));
  const generation = prepared ? readerGeneration(prepared, -1) : 0;
  const config = useEnvironmentQuery(
    environmentId ? serverEnvironment.configProjection({ environmentId, input: {} }) : null,
  );
  const live = !config.error && config.data?.source === "live" ? config.data.config : null;
  const supported = live?.pulseCapabilities?.communicationsSlackRead === true;
  const header = useWorkspaceHeaderModel(environmentId, "Communications", "Communications");
  const search = useSearch({ strict: false });
  const discord = (source?.provider ?? search.communicationProvider) === "discord";
  if (
    !environmentId ||
    !prepared ||
    !supported ||
    environment?.connection?.phase !== "connected" ||
    discord
  ) {
    return (
      <WorkspaceEngagement
        environmentId={environmentId}
        space="communications"
        layout="full"
        header={header}
        resources={<WorkspaceProjectResources />}
      >
        <main className="p-6">
          <h2 className="text-lg font-semibold">Server conversations</h2>
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {!environmentId
              ? "Choose an environment to read Slack."
              : discord
                ? "Server Discord reading is not available. This source has been kept."
                : environment?.connection?.phase !== "connected"
                  ? "The selected environment is unavailable. Reconnect it to read this source."
                  : !prepared
                    ? "Waiting for the selected environment's authenticated connection..."
                    : config.isPending || !live
                      ? "Waiting for the selected environment's capabilities..."
                      : "This server does not support Slack reading."}
          </p>
          <Link
            to="/workspace"
            search={{
              space: "communications",
              communicationSource: "desktop",
              ...(environmentId ? { environment: environmentId } : {}),
            }}
          >
            Desktop accounts
          </Link>
        </main>
      </WorkspaceEngagement>
    );
  }
  return (
    <ServerSlackAccounts
      key={JSON.stringify([environmentId, generation])}
      binding={prepared}
      generation={generation}
      environmentId={environmentId}
      label={environment.label}
      source={source}
      requestedAccount={source?.resource.connectionId ?? search.account}
      linksSupported={live.pulseCapabilities?.workspaceLinks === true}
      savedSupported={live.pulseCapabilities?.workspaceSavedItems === true}
    />
  );
}

function ServerSlackAccounts({
  environmentId,
  label,
  source,
  requestedAccount,
  linksSupported,
  savedSupported,
  binding,
  generation,
}: {
  binding: object;
  generation: number;
  environmentId: EnvironmentId;
  label: string;
  source?: ChatSource | undefined;
  requestedAccount?: string | undefined;
  linksSupported: boolean;
  savedSupported: boolean;
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const openItem = useWorkspaceItemOpener(environmentId);
  const accounts = useEnvironmentQuery(
    communications.slackConnections({ environmentId, input: {}, generation }),
  );
  const selected = !accounts.error
    ? accounts.data?.find(
        (account) =>
          account.id === requestedAccount && account.provider === "slack" && account.connected,
      )
    : undefined;
  const [connectOpen, setConnectOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef(true);
  const connect = useAtomCommand(communications.connectSlack, {
    reportFailure: false,
    reportDefect: false,
  });
  const disconnect = useAtomCommand(communications.disconnectSlack, {
    reportFailure: false,
    reportDefect: false,
  });
  const canOperate = useWorkspaceCanOperate(environmentId);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const header = useWorkspaceHeaderModel(
    environmentId,
    "Communications",
    "Communications",
    `Slack · ${label}`,
  );
  const choose = (id?: string) => {
    const { account: _account, item: _item, ...rest } = parseWorkspaceSearch(search);
    void navigate({
      to: "/workspace",
      search: {
        ...rest,
        communicationProvider: "slack",
        communicationSource: "server",
        ...(id ? { account: id } : {}),
      },
    });
  };
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
        Accounts
      </summary>
      <div data-communications-source-controls="">
        <p>Server Slack · {label}</p>
        <label>
          Connected communications account
          <select
            aria-label="Connected communications account"
            value={selected?.id ?? ""}
            disabled={pending}
            onChange={(event) => choose(event.target.value || undefined)}
          >
            <option value="">Choose an account</option>
            {accounts.data
              ?.filter((account) => account.provider === "slack")
              .map((account) => (
                <option key={account.id} value={account.id} disabled={!account.connected}>
                  {account.label} · {account.identity}
                  {!account.connected ? " · Disconnected" : ""}
                </option>
              ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="ghost"
          disabled={accounts.isPending || pending}
          onClick={accounts.refresh}
        >
          Refresh account list
        </Button>
        {selected ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || !canOperate}
            onClick={async () => {
              setPending(true);
              setError(undefined);
              const result = await disconnect({
                environmentId,
                input: { connectionId: selected.id },
              });
              if (!active.current) return;
              setPending(false);
              if (AsyncResult.isSuccess(result)) {
                accounts.refresh();
                choose();
              } else setError("The account could not be disconnected. Try again.");
            }}
          >
            Disconnect {selected.label}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={!canOperate || pending}
          onClick={() => setConnectOpen(true)}
        >
          Connect Slack
        </Button>
        <Link
          to="/workspace"
          search={{
            space: "communications",
            environment: environmentId,
            communicationSource: "desktop",
          }}
        >
          Desktop accounts
        </Link>
        <Link
          to="/workspace"
          search={{
            space: "communications",
            environment: environmentId,
            communicationProvider: "telegram",
          }}
        >
          Telegram bots
        </Link>
        <Link to="/settings/integrations" hash="telegram">
          Manage Telegram in Settings
        </Link>
        <Link to="/settings/integrations" hash="communications" search={{ machine: environmentId }}>
          Communications settings
        </Link>
      </div>
    </details>
  );
  const setup = (
    <main className="p-6">
      <h2 className="text-lg font-semibold">Server conversations</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        {accounts.error
          ? readFailure(accounts.failure)
          : accounts.isPending
            ? "Loading connected Slack accounts..."
            : requestedAccount
              ? "This Slack connection is unavailable in the selected environment. Its source has been kept."
              : "Choose a Slack account or connect one in Communications accounts and settings. Credentials stay in the selected environment."}
      </p>
    </main>
  );
  return (
    <div data-communications-workspace="">
      {search.view === "later" && savedSupported ? (
        <WorkspaceEngagement
          environmentId={environmentId}
          space="communications"
          layout="split"
          selected={false}
          header={header}
          list={
            <>
              {controls}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void navigate({
                    to: "/workspace",
                    search: { ...parseWorkspaceSearch(search), view: "chats" },
                  })
                }
              >
                Chats
              </Button>
              <ServerSavedItems
                environmentId={environmentId}
                onOpen={(item) => openItem(item.ref)}
              />
            </>
          }
          resources={<WorkspaceProjectResources />}
        >
          <p className="p-6 text-sm text-muted-foreground">
            Saved references do not grant access to their source.
          </p>
        </WorkspaceEngagement>
      ) : selected ? (
        <ServerSlackReader
          generation={readerGeneration(binding, selected.generation)}
          key={JSON.stringify([selected.id, selected.generation])}
          environmentId={environmentId}
          account={selected}
          source={source}
          controls={controls}
          linksSupported={linksSupported}
          savedSupported={savedSupported}
        />
      ) : (
        <WorkspaceEngagement
          environmentId={environmentId}
          space="communications"
          layout="split"
          selected={false}
          header={header}
          list={
            <>
              {controls}
              <Button
                size="sm"
                variant="ghost"
                disabled={!savedSupported}
                onClick={() =>
                  void navigate({
                    to: "/workspace",
                    search: {
                      ...parseWorkspaceSearch(search),
                      communicationSource: "server",
                      view: "later",
                    },
                  })
                }
              >
                Later
              </Button>
            </>
          }
          resources={<WorkspaceProjectResources />}
        >
          {setup}
        </WorkspaceEngagement>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {connectOpen ? (
        <ConnectCommunicationsDialog
          destination={{
            kind: "server",
            environmentId,
            label,
            connect: async ({ token, provider }) => {
              if (provider !== "slack") throw new Error("Unsupported provider");
              const result = await connect({ environmentId, input: { token } });
              if (!AsyncResult.isSuccess(result)) throw new Error("Slack connection failed");
              return result.value;
            },
          }}
          onClose={() => setConnectOpen(false)}
          onConnected={(account) => {
            setConnectOpen(false);
            accounts.refresh();
            choose(account.id);
          }}
        />
      ) : null}
    </div>
  );
}

function ServerSlackReader({
  environmentId,
  account,
  source,
  controls,
  linksSupported,
  savedSupported,
  generation,
}: {
  generation: number;
  environmentId: EnvironmentId;
  account: CommunicationConnection;
  source?: ChatSource | undefined;
  controls: React.ReactNode;
  linksSupported: boolean;
  savedSupported: boolean;
}) {
  const registry = useContext(RegistryContext);
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const [cursor, setCursor] = useState<string>();
  const [loaded, setLoaded] = useState<readonly CommunicationConversation[]>([]);
  const [projects, setProjects] = useState<ReadonlyMap<string, ConversationProject>>(
    () => new Map(),
  );
  const allProjects = useProjects().filter((project) => project.environmentId === environmentId);
  const readerSignal = useReaderSignal();
  const target = {
    environmentId,
    generation,
    input: { connectionId: account.id, ...(cursor ? { cursor } : {}) },
  };
  const query = useEnvironmentQuery(communications.slackConversations(target));
  const [observedPage, setObservedPage] = useState<typeof query.data>(null);
  if (query.data && observedPage !== query.data) {
    setObservedPage(query.data);
    setLoaded((previous) =>
      cursor
        ? [
            ...new Map(
              [...previous, ...query.data!.conversations].map((row) => [
                JSON.stringify([row.workspaceId, row.id]),
                row,
              ]),
            ).values(),
          ].slice(0, 100)
        : query.data!.conversations,
    );
  }
  const conversations = loaded.filter((row) => row.connectionId === account.id);
  const rows = conversations.map((row) => {
    const item = endpoint(account.id, row);
    return { key: workspaceItemKey(item.ref), title: row.title, endpoint: item, kind: row.kind };
  });
  const confirmedProjects = linksSupported
    ? allProjects.flatMap((project) => {
        const linked = projects.get(project.id);
        return linked ? [linked] : [];
      })
    : [];
  const groups = conversationGroups(rows, confirmedProjects, "slack");
  const updateProject = useCallback(
    (project: ConversationProject) =>
      setProjects((previous) => {
        const current = previous.get(project.key);
        return current?.label === project.label &&
          JSON.stringify(current.conversationKeys) === JSON.stringify(project.conversationKeys)
          ? previous
          : new Map(previous).set(project.key, project);
      }),
    [],
  );
  const selected = source?.resource.connectionId === account.id ? source.resource : undefined;
  const conversation = selected
    ? conversations.find(
        (row) => row.id === selected.conversationId && row.workspaceId === selected.workspaceId,
      )
    : undefined;
  const title = conversation?.title ?? selected?.conversationId;
  const project = conversation
    ? confirmedProjects.find((item) =>
        item.conversationKeys.includes(workspaceItemKey(endpoint(account.id, conversation).ref)),
      )
    : undefined;
  const header = useWorkspaceHeaderModel(
    environmentId,
    title ? `${conversation?.kind === "dm" ? "" : "# "}${title}` : "Communications",
    "Communications",
    conversationSubtitle(
      "Slack",
      project?.label,
      conversation?.memberCount,
      undefined,
      !query.error,
    ),
  );
  const searchInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const openItem = useWorkspaceItemOpener(environmentId);
  const choose = (item: WorkspaceLinkEndpoint) => {
    if (item.ref.type !== "provider-resource") return;
    void navigate({
      to: "/workspace",
      search: {
        ...parseWorkspaceSearch(search),
        environment: environmentId,
        communicationSource: "server",
        communicationProvider: "slack",
        account: account.id,
        item: item.ref.resourceId,
        view: "chats",
      },
    });
  };
  const back = () => {
    const { item: _item, ...rest } = parseWorkspaceSearch(search);
    void navigate({ to: "/workspace", search: { ...rest, communicationSource: "server" } });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        (root.current?.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (selected) {
          back();
          requestAnimationFrame(() => searchInput.current?.focus());
        } else searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const selectedEndpoint = source
    ? {
        ref: {
          type: "provider-resource" as const,
          provider: "slack",
          resourceId: source.resourceId,
        },
      }
    : null;
  return (
    <div ref={root} className="flex min-h-0 min-w-0 flex-1">
      {linksSupported
        ? allProjects.map((project) => (
            <ConversationProjectLinks
              key={project.id}
              environmentId={environmentId}
              projectId={project.id}
              title={project.title}
              onChange={updateProject}
            />
          ))
        : null}
      <WorkspaceEngagement
        environmentId={environmentId}
        space="communications"
        layout="split"
        selected={Boolean(selected) && search.view !== "later"}
        onBack={back}
        header={header}
        resources={<WorkspaceProjectResources selectedItem={selectedEndpoint} />}
        linkedContext={{
          item: selectedEndpoint,
          render: (item) => (
            <WorkspaceLinkedContext environmentId={environmentId} item={item} onOpen={openItem} />
          ),
        }}
        list={
          <>
            {controls}
            <ConversationNavigation
              groups={search.view === "later" || search.view === "unread" ? [] : groups}
              emptyMessage={search.view === "later" || search.view === "unread" ? null : undefined}
              accountLabels={{ [account.id]: account.label }}
              selectedKey={
                conversation ? workspaceItemKey(endpoint(account.id, conversation).ref) : undefined
              }
              onSelect={choose}
              searchRef={searchInput}
              renderRow={(row, button) => (
                <WorkspaceItemMenu environmentId={environmentId} item={row.endpoint}>
                  {button}
                </WorkspaceItemMenu>
              )}
            >
              <nav aria-label="Server chat views" className="flex gap-1 p-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void navigate({
                      to: "/workspace",
                      search: { ...parseWorkspaceSearch(search), view: "chats" },
                    })
                  }
                >
                  Chats
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!savedSupported}
                  onClick={() =>
                    void navigate({
                      to: "/workspace",
                      search: { ...parseWorkspaceSearch(search), view: "later" },
                    })
                  }
                >
                  Later
                </Button>
              </nav>
              {!savedSupported ? (
                <p className="p-2 text-xs">Saved items are unavailable on this server.</p>
              ) : null}
              {search.view === "later" && savedSupported ? (
                <ServerSavedItems
                  environmentId={environmentId}
                  onOpen={(item) => openItem(item.ref)}
                />
              ) : null}
              {search.view === "unread" ? (
                <p role="status" className="p-2 text-xs">
                  Unread conversations are unavailable on this version.
                </p>
              ) : null}
              {query.error ? (
                <p role="alert" className="p-2 text-xs">
                  {readFailure(query.failure)}
                </p>
              ) : null}
              {query.isPending ? (
                <p role="status" className="p-2 text-xs">
                  Loading conversations...
                </p>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={query.isPending}
                onClick={() => {
                  setCursor(undefined);
                  void communications.refreshSlackConversations.run(registry, {
                    environmentId,
                    generation,
                    input: { connectionId: account.id },
                    signal: readerSignal(),
                  });
                }}
              >
                Refresh conversations
              </Button>
              {query.data?.nextCursor && loaded.length < 100 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={query.isPending}
                  onClick={() => setCursor(query.data!.nextCursor)}
                >
                  Load more conversations
                </Button>
              ) : null}
              {loaded.length >= 100 || query.data?.incomplete ? (
                <p className="p-2 text-xs">
                  Showing a bounded set of loaded conversations. Open Slack for more.
                </p>
              ) : null}
            </ConversationNavigation>
          </>
        }
      >
        {selected && search.view !== "later" && search.view !== "unread" ? (
          <ServerSlackConversation
            generation={generation}
            key={JSON.stringify([
              selected.workspaceId,
              selected.conversationId,
              selected.replyRootId,
            ])}
            environmentId={environmentId}
            account={account}
            resource={selected}
            conversation={conversation}
            onOpen={choose}
            savedSupported={savedSupported}
          />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            Choose a channel or direct message to load its history.
          </p>
        )}
      </WorkspaceEngagement>
    </div>
  );
}

function ServerSlackConversation({
  environmentId,
  account,
  resource,
  conversation,
  onOpen,
  savedSupported,
  generation,
}: {
  generation: number;
  environmentId: EnvironmentId;
  account: CommunicationConnection;
  resource: ChatSource["resource"];
  conversation?: CommunicationConversation | undefined;
  onOpen: (endpoint: WorkspaceLinkEndpoint) => void;
  savedSupported: boolean;
}) {
  const registry = useContext(RegistryContext);
  const readerSignal = useReaderSignal();
  const [cursor, setCursor] = useState<string>();
  const [window, setWindow] = useState(() => ({
    messages: [] as readonly CommunicationMessage[],
    incomplete: false,
  }));
  const loaded = window.messages;
  const bounded = window.incomplete;
  const input = {
    connectionId: account.id,
    workspaceId: resource.workspaceId,
    conversationId: resource.conversationId,
    ...(resource.replyRootId ? { replyRootId: resource.replyRootId } : {}),
  };
  const target = { environmentId, generation, input: { ...input, ...(cursor ? { cursor } : {}) } };
  const query = useEnvironmentQuery(communications.slackMessages(target));
  const [observedPage, setObservedPage] = useState<typeof query.data>(null);
  if (query.data && observedPage !== query.data) {
    setObservedPage(query.data);
    setWindow((previous) =>
      mergeSlackMessages(cursor ? previous.messages : [], query.data!.messages),
    );
  }
  const rows: CommunicationRow[] = loaded
    .filter(
      (row) =>
        row.connectionId === account.id &&
        row.workspaceId === resource.workspaceId &&
        row.conversationId === resource.conversationId,
    )
    .map((message) => ({
      message,
      endpoint: endpoint(
        account.id,
        { id: resource.conversationId, workspaceId: resource.workspaceId },
        message,
      ),
      ...(message.textTruncated
        ? { notice: "This message is truncated. Open Slack to read the rest." }
        : {}),
    }));
  const channel = endpoint(account.id, {
    id: resource.conversationId,
    workspaceId: resource.workspaceId,
    title: conversation?.title,
  });
  const selected = resource.messageId
    ? {
        ref: {
          type: "provider-resource" as const,
          provider: "slack",
          resourceId: chatResourceId(resource),
        },
      }
    : channel;
  const timeZone =
    useEnvironmentSettings(environmentId, (settings) => settings.workspaceDisplayTimeZone) ?? "UTC";
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!resource.messageId || !loaded.some((message) => message.id === resource.messageId)) return;
    root.current
      ?.querySelector<HTMLElement>('article[aria-current="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [resource.messageId, loaded]);
  const messageActions = useCallback(
    (row: CommunicationRow) =>
      row.endpoint ? (
        <SaveServerReference environmentId={environmentId} item={row.endpoint} />
      ) : null,
    [environmentId],
  );
  return (
    <section
      ref={root}
      aria-label={resource.replyRootId ? "Provider replies" : "Chat history"}
      data-communications-history=""
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented && resource.messageId) {
          event.stopPropagation();
          onOpen(channel);
        }
      }}
    >
      <div data-communications-center-actions="">
        <Button
          size="sm"
          variant="ghost"
          disabled={query.isPending}
          onClick={() => {
            setCursor(undefined);
            void communications.refreshSlackMessages.run(registry, {
              environmentId,
              generation,
              input,
              signal: readerSignal(),
            });
          }}
        >
          Refresh messages
        </Button>
        {resource.replyRootId ? (
          <Button size="sm" variant="ghost" onClick={() => onOpen(channel)}>
            Back to conversation
          </Button>
        ) : null}
        <WorkspaceItemActions environmentId={environmentId} item={selected} shortcuts />
      </div>
      {query.error ? (
        <p role="alert" className="px-4 py-2 text-xs">
          {loaded.length ? "Refresh failed. Showing previously loaded messages. " : ""}
          {readFailure(query.failure)}
        </p>
      ) : null}
      {query.isPending ? (
        <p role="status" className="px-4 py-2 text-xs">
          Loading messages...
        </p>
      ) : null}
      {legacySlackNotice("slack", resource) ? (
        <p role="status" className="px-4 py-2 text-xs">
          {legacySlackNotice("slack", resource)}
        </p>
      ) : null}
      {resource.messageId &&
      !query.isPending &&
      !query.error &&
      !loaded.some((row) => row.id === resource.messageId) ? (
        <p role="status" className="px-4 py-2 text-xs">
          This message is unavailable in the loaded page. Its exact source has been kept.
        </p>
      ) : null}
      <CommunicationFileOpener environmentId={environmentId} source={selected} onSelect={onOpen}>
        {(onOpenFile) => (
          <CommunicationStream
            environmentId={environmentId}
            rows={rows}
            timeZone={timeZone}
            selectedKey={workspaceItemKey(selected.ref)}
            onSelect={onOpen}
            onOpenReply={conversation?.replyRead && !resource.replyRootId ? onOpen : undefined}
            onOpenFile={onOpenFile}
            actions={savedSupported ? messageActions : undefined}
            busy={query.isPending}
            onLoadOlder={
              !bounded && loaded.length < 100 && query.data?.nextCursor
                ? () => setCursor(query.data!.nextCursor)
                : undefined
            }
          >
            {!query.isPending && !loaded.length && !query.error ? (
              <p className="p-6 text-sm text-muted-foreground">
                No messages in the loaded history.
              </p>
            ) : null}
            {bounded || loaded.length >= 100 || query.data?.incomplete ? (
              <p className="p-3 text-xs">
                Showing a bounded message window. Open Slack for more history.
              </p>
            ) : null}
          </CommunicationStream>
        )}
      </CommunicationFileOpener>
      <ChatComposer
        environmentId={environmentId}
        account={account}
        conversation={{
          id: resource.conversationId,
          accountId: account.id,
          title: conversation?.title ?? resource.conversationId,
          kind: conversation?.kind ?? "channel",
          workspace: resource.workspaceId,
          workspaceId: resource.workspaceId,
          canSend: false,
        }}
        writable={false}
        transport="server"
        onAcknowledged={() => {}}
      />
    </section>
  );
}

function SaveServerReference({
  environmentId,
  item,
}: {
  environmentId: EnvironmentId;
  item: WorkspaceLinkEndpoint;
}) {
  const save = useAtomCommand(workspaceSavedItems.add, {
    reportFailure: false,
    reportDefect: false,
  });
  const writable = useWorkspaceCanOperate(environmentId);
  const [state, setState] = useState("idle");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={!writable || state === "pending"}
        onClick={async (event) => {
          event.stopPropagation();
          setState("pending");
          const result = await save({ environmentId, input: { ref: item.ref } });
          if (active.current) setState(AsyncResult.isSuccess(result) ? "saved" : "failed");
        }}
      >
        {state === "pending" ? "Saving..." : "Save for Later"}
      </Button>
      {state === "saved" ? (
        <p role="status">Saved for Later in this environment.</p>
      ) : state === "failed" ? (
        <p role="alert">This reference could not be saved. Try again.</p>
      ) : null}
    </>
  );
}
/** Stored identities label saved originals without fetching their provider metadata or bodies. */
function savedReferenceLabel(ref: WorkspaceSavedItem["ref"]) {
  const parsed =
    ref.type === "provider-resource" && (ref.provider === "slack" || ref.provider === "discord")
      ? parseChatResourceId(ref.resourceId)
      : undefined;
  if (parsed && ref.type === "provider-resource")
    return [
      ref.provider === "slack" ? "Slack" : "Discord",
      parsed.transport,
      `Account ${parsed.connectionId}`,
      `Workspace ${parsed.workspaceId}`,
      `Conversation ${parsed.conversationId}`,
      ...(parsed.messageId ? [`Message ${parsed.messageId}`] : []),
      ...(parsed.replyRootId ? [`Reply root ${parsed.replyRootId}`] : []),
    ].join(" · ");
  return `${"provider" in ref ? ref.provider : ref.type} · ${endpointTitle(
    ref.type === "provider-resource" ? ref.resourceId : workspaceItemKey(ref),
  )}`;
}
function ServerSavedItems({
  environmentId,
  onOpen,
}: {
  environmentId: EnvironmentId;
  onOpen: (item: WorkspaceLinkEndpoint) => void;
}) {
  const [cursor, setCursor] = useState<string>();
  const [items, setItems] = useState<readonly WorkspaceSavedItem[]>([]);
  const [error, setError] = useState<string>();
  const list = useEnvironmentQuery(
    workspaceSavedItems.list({
      environmentId,
      input: { limit: 100, ...(cursor ? { cursor } : {}) },
    }),
  );
  const remove = useAtomCommand(workspaceSavedItems.remove, {
    reportFailure: false,
    reportDefect: false,
  });
  const writable = useWorkspaceCanOperate(environmentId);
  const timeZone =
    useEnvironmentSettings(environmentId, (settings) => settings.workspaceDisplayTimeZone) ?? "UTC";
  const [observedPage, setObservedPage] = useState<typeof list.data>(null);
  if (list.data && observedPage !== list.data) {
    setObservedPage(list.data);
    setItems(list.data.items);
  }
  return (
    <section aria-label="Saved references in this environment" className="p-2 text-xs">
      <p>Saved references in this environment. Open a source to read it.</p>
      {items.map((item) => {
        const label = savedReferenceLabel(item.ref);
        const parsed =
          item.ref.type === "provider-resource"
            ? parseChatResourceId(item.ref.resourceId)
            : undefined;
        return (
          <article
            key={item.key}
            aria-label={label}
            className="space-y-1 py-2 [overflow-wrap:anywhere]"
          >
            <p>{label}</p>
            <p>
              Saved{" "}
              <time dateTime={item.savedAt}>
                {formatDay(displayDay(item.savedAt, timeZone), {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {" · "}
                {formatEventTime(item.savedAt, timeZone)} {timeZone}
              </time>
            </p>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Open ${parsed?.messageId ? "saved message" : "saved reference"}: ${label}`}
              disabled={!canOpenLinkedItem(item.ref)}
              onClick={() => onOpen({ ref: item.ref })}
            >
              Open {parsed?.messageId ? "saved message" : "saved reference"}
            </Button>
            {!canOpenLinkedItem(item.ref) ? (
              <p>This source is unavailable here. Its reference has been kept.</p>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove from Later: ${label}`}
              disabled={!writable}
              onClick={async () => {
                const result = await remove({ environmentId, input: { key: item.key } });
                if (AsyncResult.isSuccess(result)) {
                  setItems((rows) => rows.filter((row) => row.key !== item.key));
                  list.refresh();
                } else setError("This reference could not be removed. Try again.");
              }}
            >
              Remove from Later
            </Button>
          </article>
        );
      })}
      {list.isPending ? <p role="status">Loading saved references...</p> : null}
      {list.error || error ? (
        <p role="alert">{error ?? "Saved references are unavailable. Use Refresh to try again."}</p>
      ) : null}
      <Button size="sm" variant="ghost" disabled={list.isPending} onClick={list.refresh}>
        Refresh saved references
      </Button>
      {list.data?.nextCursor ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={list.isPending}
          onClick={() => setCursor(list.data!.nextCursor)}
        >
          Next saved references
        </Button>
      ) : null}
      {cursor ? (
        <Button size="sm" variant="ghost" onClick={() => setCursor(undefined)}>
          First saved references
        </Button>
      ) : null}
    </section>
  );
}
