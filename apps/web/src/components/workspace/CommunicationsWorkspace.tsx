import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type {
  ChatAccount,
  ChatConversation,
  OfficeAccount,
  OfficeDriveFile,
  ProjectOffice,
} from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  LinkIcon,
  HomeIcon,
  HashIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  UnplugIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { cn, newProjectId, randomUUID } from "../../lib/utils";
import { RequestState } from "./office/shared";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import { EmailCommunicationsWorkspace } from "./EmailCommunicationsWorkspace";
import { ChatCommunicationsWorkspace } from "./ChatCommunicationsWorkspace";
import { ConnectCommunicationsDialog } from "./ConnectCommunicationsDialog";
import { useProjects, useServerConfigs } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { ProjectWorkspaceTools, type ProjectTool } from "./ProjectWorkspaceTools";
import { driveResourceId } from "./ProjectDrivePanel";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { projectFolderPath } from "./projectWorkspace";
import { OfficeSubnav } from "./OfficeSubnav";
import { ProjectsOverview } from "./ProjectsOverview";
import { TasksPanel, type TasksPanelProps } from "./TasksPanel";
import type { CommunicationTaskDraft } from "./communicationsSource";

const providerNames = { slack: "Slack", discord: "Discord", telegram: "Telegram" };
const projectKey = (project: EnvironmentProject) =>
  JSON.stringify([project.environmentId, project.id]);
export function CommunicationsWorkspace({
  openProjects = false,
  requestedProjectKey,
  requestedSource,
}: {
  openProjects?: boolean;
  requestedProjectKey?: string | undefined;
  requestedSource?:
    | {
        provider?: string | undefined;
        accountId: string;
        conversationId?: string | undefined;
        messageId?: string | undefined;
        threadId?: string | undefined;
      }
    | undefined;
}) {
  const navigate = useNavigate();
  const { run, available, busy, error } = useCommunicationsRequest();
  const officeInvoke = window.desktopBridge?.officeInvoke;
  const [chatAccounts, setChatAccounts] = useState<readonly ChatAccount[]>([]);
  const [mailAccounts, setMailAccounts] = useState<readonly OfficeAccount[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [taskDraft, setTaskDraft] = useState<TasksPanelProps["draft"]>();
  const openedSource = useRef("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [mailError, setMailError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const projects = useProjects();
  const [projectView, setProjectView] = useState("all");
  const serverConfigs = useServerConfigs();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const createProject = useAtomCommand(projectEnvironment.create);
  const updateProject = useAtomCommand(projectEnvironment.update);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>();
  const [expandedProjectKey, setExpandedProjectKey] = useState<string>();
  const [requestedConversationId, setRequestedConversationId] = useState<string>();
  const [conversations, setConversations] = useState<readonly ChatConversation[]>([]);
  const [tool, setTool] = useState<ProjectTool>("Drive");
  const [panelOpen, setPanelOpen] = useState(true);
  const [targetUrl, setTargetUrl] = useState<string>();
  const [initialFolderId, setInitialFolderId] = useState<string>();
  const [document, setDocument] = useState<{ file: OfficeDriveFile; accountId: string }>();
  const [projectNotice, setProjectNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const accountContext = useRef({ selectedKey, tool });
  useEffect(() => {
    accountContext.current = { selectedKey, tool };
  }, [selectedKey, tool]);
  const clearResourceContext = useCallback((keepProject: boolean) => {
    setTaskDraft(undefined);
    if (!keepProject) setSelectedProjectKey(undefined);
    setRequestedConversationId(undefined);
    setTargetUrl(undefined);
    setInitialFolderId(undefined);
    setDocument(undefined);
    setProjectNotice("");
  }, []);
  const selectedProject = projects.find((p) => projectKey(p) === selectedProjectKey);
  const projectsInitialized = useRef(false);
  const openedProjectRequest = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const key = (provider: string, id: string) => JSON.stringify([provider, id]);
  const selectedChat = chatAccounts.find(
    (account) => key(account.provider, account.id) === selectedKey,
  );
  const selectedMail = mailAccounts.find((account) => key("email", account.id) === selectedKey);
  useEffect(() => {
    if (!requestedSource || !loaded) return;
    const sourceKey = JSON.stringify(requestedSource);
    if (openedSource.current === sourceKey) return;
    const account = chatAccounts.find(
      (item) => item.id === requestedSource.accountId && item.provider === requestedSource.provider,
    );
    if (!account) {
      setProjectNotice(
        "Connect the source account on this desktop to open this task's conversation.",
      );
      return;
    }
    openedSource.current = sourceKey;
    clearResourceContext(false);
    setSelectedKey(key(account.provider, account.id));
    setRequestedConversationId(requestedSource.conversationId);
  }, [requestedSource, loaded, chatAccounts, clearResourceContext]);
  function createTaskFromMessage(draft: CommunicationTaskDraft) {
    setTaskDraft({ ...draft, key: randomUUID() });
    setTool("Tasks");
    setPanelOpen(true);
  }
  useEffect(() => {
    setConversations([]);
  }, [selectedKey]);
  useEffect(() => {
    if (!openProjects) {
      projectsInitialized.current = false;
      openedProjectRequest.current = undefined;
      return;
    }
    if (!projects.length) return;
    if (projectsInitialized.current && requestedProjectKey === openedProjectRequest.current) return;
    projectsInitialized.current = true;
    openedProjectRequest.current = requestedProjectKey;
    const first =
      projects.find(
        (project) => projectKey(project) === (requestedProjectKey ?? selectedProjectKey),
      ) ?? projects[0]!;
    setSelectedProjectKey(projectKey(first));
    setTaskDraft(undefined);
    setExpandedProjectKey(projectKey(first));
    setTool("Settings");
    setPanelOpen(true);
  }, [openProjects, projects, selectedProjectKey, requestedProjectKey]);
  function openConversation(
    project: EnvironmentProject,
    conversation: ProjectOffice["conversations"][number],
  ) {
    if (projectKey(project) !== selectedProjectKey) setTaskDraft(undefined);
    setSelectedProjectKey(projectKey(project));
    setExpandedProjectKey(projectKey(project));
    setTool("Drive");
    setPanelOpen(true);
    setInitialFolderId(undefined);
    setDocument(undefined);
    setTargetUrl(undefined);
    const account = chatAccounts.find(
      (a) => a.id === conversation.accountId && a.provider === conversation.provider,
    );
    if (!account) {
      setSelectedKey("");
      setRequestedConversationId(undefined);
      setProjectNotice(
        `Connect the ${conversation.provider} account for ${conversation.title} on this computer.`,
      );
      return;
    }
    setProjectNotice("");
    setSelectedKey(key(account.provider, account.id));
    setRequestedConversationId(conversation.conversationId);
  }
  function openProject(project: EnvironmentProject, settings = false) {
    if (projectKey(project) !== selectedProjectKey) setTaskDraft(undefined);
    settings ||= openProjects;
    const id = projectKey(project);
    if (!settings && expandedProjectKey === id) {
      setExpandedProjectKey(undefined);
      return;
    }
    setExpandedProjectKey(id);
    setSelectedProjectKey(id);
    setPanelOpen(true);
    setTool(settings ? "Settings" : "Drive");
    setInitialFolderId(undefined);
    setDocument(undefined);
    setTargetUrl(undefined);
    setProjectNotice("");
    if (!settings) {
      const first = project.office?.conversations[0];
      if (first) openConversation(project, first);
      else {
        setSelectedKey("");
        setRequestedConversationId(undefined);
      }
    }
  }
  function openProjectCommunications(project: EnvironmentProject, configure = false) {
    openProject(project, true);
    const first = project.office?.conversations[0];
    if (first && !configure) openConversation(project, first);
    else if (selectedMail) setSelectedKey("");
    void navigate({ to: "/workspace", search: { space: "office", officeView: "communications" } });
  }
  async function saveOffice(office: ProjectOffice) {
    if (!selectedProject) return false;
    const result = await updateProject({
      environmentId: selectedProject.environmentId,
      input: { projectId: selectedProject.id, office },
    });
    return result._tag !== "Failure";
  }
  function openUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    if (!["http:", "https:"].includes(url.protocol)) return;
    if (!selectedProject) {
      setProjectNotice("Select a project conversation to open links in its workspace.");
      return;
    }
    setPanelOpen(true);
    setTargetUrl(value);
    const id = driveResourceId(value);
    if (id && url.hostname === "drive.google.com" && url.pathname.includes("/folders/")) {
      setInitialFolderId(id);
      setTool("Drive");
    } else if (
      id &&
      selectedProject.office?.drive &&
      ["drive.google.com", "docs.google.com"].includes(url.hostname)
    ) {
      setDocument({
        accountId: selectedProject.office.drive.accountId,
        file: { id, name: "Shared document", mimeType: "", parents: [], webViewLink: value },
      });
      setTool("Documents");
    } else setTool(parseChangeRequestUrl(value) ? "PR reviews" : "Browser");
  }
  async function addProject() {
    if (!primaryEnvironmentId || creating || !projectName.trim()) return;
    setCreating(true);
    setProjectNotice("");
    const projectId = newProjectId();
    try {
      const workspaceRoot = projectFolderPath(
        serverConfigs.get(primaryEnvironmentId)?.settings.addProjectBaseDirectory ?? "",
        projectName,
        projectId,
      );
      const result = await createProject({
        environmentId: primaryEnvironmentId,
        input: {
          projectId,
          title: projectName.trim(),
          workspaceRoot,
          createWorkspaceRootIfMissing: true,
          defaultModelSelection: null,
        },
      });
      if (result._tag === "Failure") return;
      const id = JSON.stringify([primaryEnvironmentId, projectId]);
      setSelectedProjectKey(id);
      setExpandedProjectKey(id);
      setSelectedKey("");
      setRequestedConversationId(undefined);
      setTargetUrl(undefined);
      setInitialFolderId(undefined);
      setDocument(undefined);
      setTool(openProjects ? "Settings" : "Drive");
      setPanelOpen(true);
      setCreateOpen(false);
      setProjectName("");
    } finally {
      setCreating(false);
    }
  }
  const projectSidebar = (
    <section aria-label="Projects" className="border-t border-border p-2">
      <div className="flex items-center justify-between px-2 py-2">
        <span className="text-xs font-medium text-muted-foreground">Projects</span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Create project"
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon />
        </Button>
      </div>
      {projects.map((project) => (
        <div key={projectKey(project)}>
          <div
            className={cn(
              "flex items-center rounded-md",
              selectedProjectKey === projectKey(project) && "bg-accent",
            )}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
              onClick={() => openProject(project)}
              aria-expanded={expandedProjectKey === projectKey(project)}
            >
              {expandedProjectKey === projectKey(project) ? (
                <ChevronDownIcon className="size-3 shrink-0" />
              ) : (
                <ChevronRightIcon className="size-3 shrink-0" />
              )}
              <FolderIcon className="size-4 shrink-0" />
              <span className="truncate">{project.title}</span>
            </button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Settings for ${project.title}`}
              onClick={() => openProject(project, true)}
            >
              <SettingsIcon />
            </Button>
          </div>
          {expandedProjectKey === projectKey(project) && (
            <div className="ml-5 border-l pl-2">
              {project.office?.conversations.map((c) => (
                <button
                  key={JSON.stringify([c.provider, c.accountId, c.conversationId])}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-accent",
                    requestedConversationId === c.conversationId &&
                      selectedKey === key(c.provider, c.accountId) &&
                      "bg-accent",
                  )}
                  onClick={() => openConversation(project, c)}
                >
                  <HashIcon className="size-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="text-2xs text-muted-foreground">{c.provider}</span>
                </button>
              ))}
              {!project.office?.conversations.length && (
                <button
                  className="px-2 py-3 text-left text-xs text-muted-foreground hover:underline"
                  onClick={() => openProject(project, true)}
                >
                  Link a conversation
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {!projects.length && (
        <p className="p-2 text-xs text-muted-foreground">
          Create a project with just a name. Add connections later.
        </p>
      )}
    </section>
  );
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
    const previous = accountContext.current.selectedKey;
    const preferred = mail?.[0]
      ? JSON.stringify(["email", mail[0].id])
      : chat?.[0]
        ? JSON.stringify([chat[0].provider, chat[0].id])
        : "";
    let next = previous;
    if (!previous) next = preferred;
    else {
      const [provider] = JSON.parse(previous) as [string, string];
      const latest = provider === "email" ? mail : chat;
      if (
        latest &&
        !latest.some(
          (account) =>
            JSON.stringify(["email" in account ? "email" : account.provider, account.id]) ===
            previous,
        )
      )
        next = preferred;
    }
    if (next !== previous) {
      clearResourceContext(accountContext.current.tool === "Settings");
      setSelectedKey(next);
    }
    setLoaded(true);
  }, [available, officeInvoke, run, clearResourceContext]);
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
        {openProjects ? (
          <>
            <span className="flex-1 text-sm text-muted-foreground">
              Office / <span className="text-foreground">Projects</span>
            </span>
            {selectedProject && (
              <Button size="sm" variant="outline" onClick={() => setPanelOpen((p) => !p)}>
                <SettingsIcon />
                Project details
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="hidden shrink-0 text-sm text-muted-foreground xl:inline">
              Office / <span className="text-foreground">Communications</span>
            </span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Connected communications account</span>
              <select
                aria-label="Connected communications account"
                value={selectedKey}
                disabled={busy || mailBusy}
                onChange={(event) => {
                  clearResourceContext(tool === "Settings");
                  setSelectedKey(event.target.value);
                }}
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
            {!selectedMail && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTool("Tasks");
                  setPanelOpen((previous) => (tool === "Tasks" ? !previous : true));
                }}
              >
                Tasks
              </Button>
            )}
            {selectedProject && (
              <Button size="sm" variant="outline" onClick={() => setPanelOpen((p) => !p)}>
                <FolderIcon />
                Project
              </Button>
            )}
          </>
        )}
      </header>
      {(error || mailError) && (
        <div className="border-b border-border px-4 py-2">
          <RequestState busy={busy || mailBusy} error={error ?? mailError} />
        </div>
      )}
      {projectNotice && (
        <p role="status" className="border-b px-4 py-2 text-xs text-muted-foreground">
          {projectNotice}
        </p>
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1">
          {openProjects ? (
            <>
              <OfficeSubnav
                label="Project views"
                items={[
                  { id: "all", label: "All projects", icon: FolderIcon },
                  { id: "connected", label: "Connected", icon: LinkIcon },
                ]}
                value={projectView}
                onChange={setProjectView}
              />
              <ProjectsOverview
                projects={projects}
                connectedOnly={projectView === "connected"}
                selectedProject={selectedProject}
                onSelect={(project) => openProject(project, true)}
                onCreate={() => setCreateOpen(true)}
                onOpenConversations={openProjectCommunications}
              />
            </>
          ) : (
            <>
              {!selectedChat && !selectedMail && (
                <>
                  <OfficeSubnav
                    label="Chat views"
                    items={[{ id: "home", label: "Home", icon: HomeIcon }]}
                    value="home"
                    onChange={() => {}}
                  />
                  <div className="w-52 shrink-0 overflow-y-auto border-r max-sm:w-40">
                    {projectSidebar}
                  </div>
                </>
              )}
              {selectedMail ? (
                <EmailCommunicationsWorkspace
                  key={selectedMail.id}
                  requestedAccountId={selectedMail.id}
                  tasksPanel={
                    primaryEnvironmentId ? (
                      <TasksPanel
                        environmentId={primaryEnvironmentId}
                        compact
                        draft={taskDraft}
                        onDraftHandled={() => setTaskDraft(undefined)}
                      />
                    ) : undefined
                  }
                  onCreateTask={createTaskFromMessage}
                  onConfigureProject={(project) => {
                    openProject(project, true);
                    void navigate({
                      to: "/workspace",
                      search: { space: "office", officeView: "projects" },
                    });
                  }}
                />
              ) : selectedChat ? (
                <ChatCommunicationsWorkspace
                  key={JSON.stringify([selectedChat.provider, selectedChat.id])}
                  account={selectedChat}
                  projectSidebar={projectSidebar}
                  requestedConversationId={requestedConversationId}
                  requestedMessageId={
                    requestedSource?.accountId === selectedChat.id &&
                    requestedSource?.conversationId === requestedConversationId
                      ? requestedSource.messageId
                      : undefined
                  }
                  requestedThreadId={
                    requestedSource?.accountId === selectedChat.id &&
                    requestedSource?.conversationId === requestedConversationId
                      ? requestedSource.threadId
                      : undefined
                  }
                  onCreateTask={createTaskFromMessage}
                  onConversationsChanged={setConversations}
                  onConversationSelected={() => {
                    clearResourceContext(false);
                  }}
                  onOpenLink={openUrl}
                />
              ) : (
                <main className="flex-1 overflow-y-auto p-6">
                  <h1 className="text-xl font-semibold">
                    {selectedProject ? selectedProject.title : "Your conversations, together"}
                  </h1>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    {selectedProject
                      ? "Open project settings to link a conversation, or browse its resources in the project panel."
                      : !available && !officeInvoke
                        ? "Open Pulse desktop to connect your accounts. Credentials and sessions stay on that computer; this web connection cannot access them."
                        : !loaded
                          ? "Loading connected accounts…"
                          : "Choose an account above, connect Slack or Telegram, or add a Discord bot. Connect email from Email accounts."}
                  </p>
                  <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    Slack uses your token permissions. Telegram connects your personal account and
                    its chats. Discord exposes bot-accessible team channels, not a personal inbox.
                    Gmail and Microsoft support sending after you grant send access. IMAP supports
                    reading and local drafts.
                  </p>
                </main>
              )}
            </>
          )}
        </div>
        {selectedProject && panelOpen && (openProjects || !selectedMail) && (
          <div className="absolute inset-y-0 right-0 z-10 w-[min(440px,100%)] bg-background shadow-lg xl:static xl:w-[440px] xl:shrink-0 xl:shadow-none">
            <ProjectWorkspaceTools
              key={projectKey(selectedProject)}
              project={selectedProject}
              tool={tool}
              taskDraft={taskDraft}
              onTaskDraftHandled={() => setTaskDraft(undefined)}
              onToolChange={setTool}
              onSaveOffice={saveOffice}
              account={selectedChat}
              conversations={conversations}
              targetUrl={targetUrl}
              initialFolderId={initialFolderId}
              document={document}
              onOpenFile={(file, accountId) => {
                setDocument({ file, accountId });
                setTool("Documents");
              }}
              onOpenUrl={(url) => {
                setTargetUrl(url);
                setTool("Browser");
              }}
              onClose={() => setPanelOpen(false)}
              onOpenCommunications={
                openProjects ? () => openProjectCommunications(selectedProject, true) : undefined
              }
            />
          </div>
        )}
        {!selectedProject &&
          !selectedMail &&
          !openProjects &&
          panelOpen &&
          tool === "Tasks" &&
          primaryEnvironmentId && (
            <aside
              aria-label="Task sidebar"
              className="absolute inset-y-0 right-0 z-10 flex w-[min(440px,100%)] flex-col border-l bg-background xl:static xl:w-[440px] xl:shrink-0"
            >
              <Button
                className="m-2 self-end"
                size="sm"
                variant="ghost"
                onClick={() => setPanelOpen(false)}
              >
                Close tasks
              </Button>
              <div className="min-h-0 flex-1">
                <TasksPanel
                  environmentId={primaryEnvironmentId}
                  compact
                  draft={taskDraft}
                  onDraftHandled={() => setTaskDraft(undefined)}
                />
              </div>
            </aside>
          )}
      </div>
      {createOpen && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !creating) setCreateOpen(false);
          }}
        >
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Create a project</DialogTitle>
              <DialogDescription>
                Start with a name. Pulse creates its folder; connections can be added later.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addProject();
                }}
              >
                <label className="block text-sm">
                  Project name
                  <Input
                    autoFocus
                    required
                    maxLength={80}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Project name"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  The folder is created in your connected environment's project directory.
                </p>
                <Button
                  type="submit"
                  disabled={creating || !primaryEnvironmentId || !projectName.trim()}
                >
                  {creating ? "Creating…" : "Create project"}
                </Button>
              </form>
            </DialogPanel>
          </DialogPopup>
        </Dialog>
      )}
      {connectOpen && (
        <ConnectCommunicationsDialog
          onClose={() => setConnectOpen(false)}
          onConnected={(account) => {
            setChatAccounts((previous) => [
              ...previous.filter((item) => item.id !== account.id),
              account,
            ]);
            clearResourceContext(tool === "Settings");
            setSelectedKey(key(account.provider, account.id));
            setConnectOpen(false);
          }}
        />
      )}
    </SidebarInset>
  );
}
