import { useEffect, useState } from "react";
import type {
  ChatAccount,
  ChatConversation,
  ChatMembership,
  OfficeDriveFile,
  ProjectOffice,
} from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { ArrowLeftIcon, FileTextIcon, FolderIcon, SettingsIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { ProjectDriveConnection, ProjectDrivePanel } from "./ProjectDrivePanel";
import { ProjectResourcePanel } from "./ProjectResourcePanel";
import { RequestState, useOfficeRequest } from "./office/shared";
import { useCommunicationsRequest } from "./useCommunicationsRequest";
import { TasksPanel, type TasksPanelProps } from "./TasksPanel";
import { ProjectTaskColumns } from "./ProjectTaskColumns";
import { OfficeModuleTabs } from "./OfficeModuleTabs";

export type ProjectTool =
  | "Drive"
  | "Browser"
  | "Agents"
  | "Documents"
  | "PR reviews"
  | "Tasks"
  | "Settings";
const moduleTools: Record<string, ProjectTool> = {
  Files: "Drive",
  Browser: "Browser",
  Agents: "Agents",
  Tasks: "Tasks",
  Docs: "Documents",
  PRs: "PR reviews",
};
export const emptyProjectOffice: ProjectOffice = { conversations: [], agentThreadIds: [] };

function SourceMembers({ conversation }: { conversation: ProjectOffice["conversations"][number] }) {
  const { run, busy, error, available } = useCommunicationsRequest();
  const [membership, setMembership] = useState<ChatMembership>();
  async function load(cursor?: string) {
    const result = await run({
      operation: "members.list",
      accountId: conversation.accountId,
      conversationId: conversation.conversationId,
      ...(cursor ? { cursor } : {}),
    });
    if (!result?.membership) return;
    const next = result.membership;
    setMembership((previous) => ({
      ...next,
      members: cursor
        ? [
            ...new Map(
              [...(previous?.members ?? []), ...next.members].map((m) => [m.id, m]),
            ).values(),
          ]
        : next.members,
    }));
  }
  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" disabled={busy || !available} onClick={() => void load()}>
        {membership ? "Refresh members" : "Load members"}
      </Button>
      {!available && (
        <p className="text-xs text-muted-foreground">
          Open Pulse desktop to read source membership.
        </p>
      )}
      <RequestState busy={busy} error={error} />
      {membership && (
        <>
          <h3 className="text-sm font-medium">{membership.title}</h3>
          <p className="text-xs text-muted-foreground">{membership.note}</p>
          <ul className="divide-y">
            {membership.members.map((member) => (
              <li key={member.id} className="py-3">
                <p className="break-words text-sm">
                  {member.displayName}
                  {member.isBot ? " · Bot" : ""}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {member.roles?.join(" · ") || "Role information unavailable"}
                </p>
              </li>
            ))}
          </ul>
          {!membership.members.length && (
            <p className="text-sm text-muted-foreground">No members returned by the source.</p>
          )}
          {membership.nextCursor && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void load(membership.nextCursor)}
            >
              Load more members
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function ProjectMembers({ office }: { office: ProjectOffice }) {
  const sources = office.conversations.filter(
    (c) => c.provider === "slack" || c.provider === "discord",
  );
  const [selected, setSelected] = useState("");
  const sourceKey = (c: ProjectOffice["conversations"][number]) =>
    JSON.stringify([c.provider, c.accountId, c.conversationId]);
  const source = sources.find((c) => sourceKey(c) === selected) ?? sources[0];
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Members & roles</h2>
      <p className="text-sm text-muted-foreground">
        Membership and roles come from linked Slack or Discord accounts. Manage changes in the
        source workspace. Drive and GitHub keep their own permissions.
      </p>
      {source ? (
        <>
          <label className="block text-xs">
            Membership source
            <select
              className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
              value={sourceKey(source)}
              onChange={(e) => setSelected(e.target.value)}
            >
              {sources.map((c) => (
                <option key={sourceKey(c)} value={sourceKey(c)}>
                  {c.title} · {c.provider}
                </option>
              ))}
            </select>
          </label>
          <SourceMembers key={sourceKey(source)} conversation={source} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Link a Slack or Discord conversation in Connections to view its source membership.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Connecting a channel or assigning an agent here does not grant source access.
      </p>
    </section>
  );
}

function DriveDocument({
  file,
  accountId,
  onOpenUrl,
}: {
  file: OfficeDriveFile;
  accountId: string;
  onOpenUrl: (url: string) => void;
}) {
  const { run, busy, error } = useOfficeRequest({ queue: true });
  const [document, setDocument] = useState(file);
  useEffect(() => {
    let current = true;
    void run({ operation: "drive.get", accountId, fileId: file.id }).then((result) => {
      if (current && result?.file) setDocument(result.file);
    });
    return () => {
      current = false;
    };
  }, [file, accountId, run]);
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <FileTextIcon className="size-5 text-primary" />
        <h2 className="min-w-0 break-words font-semibold">{document.name}</h2>
      </div>
      <RequestState busy={busy} error={error} />
      {document.webViewLink && (
        <Button variant="outline" onClick={() => onOpenUrl(document.webViewLink!)}>
          Open document and comments
        </Button>
      )}
      {document.text !== undefined ? (
        <article className="whitespace-pre-wrap break-words rounded-sm bg-card p-6 text-sm leading-7 text-card-foreground">
          {document.text}
        </article>
      ) : (
        !busy && (
          <p className="text-sm text-muted-foreground">
            Open the source document in the Browser panel to read this file and its comments.
          </p>
        )
      )}
      {document.textTruncated && (
        <p className="text-xs text-muted-foreground">
          This text view is shortened. Open the source document to read it in full.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Source comments use your Google account and its document permissions.
      </p>
    </div>
  );
}

export function ProjectWorkspaceTools({
  project,
  tool,
  onToolChange,
  onSaveOffice,
  account,
  conversations,
  targetUrl,
  initialFolderId,
  document,
  onOpenFile,
  onOpenUrl,
  onClose,
  onOpenCommunications,
  taskDraft,
  onTaskDraftHandled,
}: {
  project: EnvironmentProject;
  tool: ProjectTool;
  onToolChange: (tool: ProjectTool) => void;
  onSaveOffice: (office: ProjectOffice) => Promise<boolean>;
  account: ChatAccount | undefined;
  conversations: readonly ChatConversation[];
  targetUrl?: string | undefined;
  initialFolderId?: string | undefined;
  document?: { file: OfficeDriveFile; accountId: string } | undefined;
  onOpenFile: (file: OfficeDriveFile, accountId: string) => void;
  onOpenUrl: (url: string) => void;
  onClose: () => void;
  onOpenCommunications?: (() => void) | undefined;
  taskDraft?: TasksPanelProps["draft"];
  onTaskDraftHandled?: (() => void) | undefined;
}) {
  const office = project.office ?? emptyProjectOffice;
  const [settingsTab, setSettingsTab] = useState("Connections");
  const [selectedConversation, setSelectedConversation] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(next: ProjectOffice) {
    setSaving(true);
    try {
      return await onSaveOffice(next);
    } finally {
      setSaving(false);
    }
  }
  async function linkConversation() {
    const conversation = conversations.find((c) => c.id === selectedConversation);
    if (!account || !conversation) return;
    const ref = {
      provider: account.provider,
      accountId: account.id,
      conversationId: conversation.id,
      title: conversation.title,
    };
    await save({
      ...office,
      conversations: [
        ...office.conversations.filter(
          (c) =>
            !(
              c.accountId === account.id &&
              c.conversationId === conversation.id &&
              c.provider === account.provider
            ),
        ),
        ref,
      ],
    });
  }
  return (
    <aside
      className="flex h-full min-h-0 w-full flex-col border-l border-border bg-muted/20"
      aria-label={`${project.title} project workspace`}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3 text-sm">
        <FolderIcon className="size-4 text-muted-foreground" />
        <strong className="min-w-0 flex-1 truncate">{project.title}</strong>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Project settings"
          onClick={() => onToolChange("Settings")}
        >
          <SettingsIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close project workspace"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      {tool === "Settings" ? (
        <>
          <div className="border-b p-2">
            <Button size="sm" variant="ghost" onClick={() => onToolChange("Drive")}>
              <ArrowLeftIcon />
              Back to Files
            </Button>
            <nav aria-label="Project settings" className="mt-2 flex gap-1 overflow-auto">
              {["Overview", "Members & roles", "Connections", "Task columns"].map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={settingsTab === t ? "secondary" : "ghost"}
                  onClick={() => setSettingsTab(t)}
                >
                  {t}
                </Button>
              ))}
            </nav>
          </div>
          <div className="min-h-0 flex-1 space-y-6 overflow-auto p-4">
            {settingsTab === "Overview" ? (
              <>
                <h2 className="text-lg font-semibold">{project.title}</h2>
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Project folder</dt>
                    <dd className="break-all">{project.workspaceRoot}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Default Drive folder</dt>
                    <dd>{office.drive?.folderName ?? "Not connected"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Connected conversations</dt>
                    <dd>{office.conversations.length}</dd>
                  </div>
                </dl>
              </>
            ) : settingsTab === "Task columns" ? (
              <ProjectTaskColumns
                key={JSON.stringify([project.environmentId, project.id])}
                office={office}
                onSave={onSaveOffice}
              />
            ) : settingsTab === "Members & roles" ? (
              <ProjectMembers office={office} />
            ) : (
              <>
                <section className="space-y-3">
                  <h2 className="font-semibold">Google Drive</h2>
                  <ProjectDriveConnection
                    key={JSON.stringify([
                      project.environmentId,
                      project.id,
                      office.drive?.accountId,
                      office.drive?.folderId,
                    ])}
                    drive={office.drive}
                    onSave={async (drive) => {
                      const { drive: _previous, ...rest } = office;
                      return save({ ...rest, ...(drive ? { drive } : {}) });
                    }}
                  />
                </section>
                <section className="space-y-3 border-t pt-5">
                  <h2 className="font-semibold">Linked conversations</h2>
                  <p className="text-xs text-muted-foreground">
                    {onOpenCommunications
                      ? "Open Communications to choose an account and link a channel to this project."
                      : "Choose a connected account above, then link one of its loaded conversations."}
                  </p>
                  {office.conversations.map((c) => (
                    <div
                      key={JSON.stringify([c.provider, c.accountId, c.conversationId])}
                      className="flex items-center gap-2 border-b py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{c.title}</div>
                        <div className="text-xs text-muted-foreground">{c.provider}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() =>
                          void save({
                            ...office,
                            conversations: office.conversations.filter((item) => item !== c),
                          })
                        }
                      >
                        Unlink
                      </Button>
                    </div>
                  ))}
                  {onOpenCommunications ? (
                    <Button size="sm" variant="outline" onClick={onOpenCommunications}>
                      Open Communications
                    </Button>
                  ) : account ? (
                    <>
                      <label className="block text-xs">
                        {account.label}
                        <select
                          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                          value={selectedConversation}
                          onChange={(e) => setSelectedConversation(e.target.value)}
                        >
                          <option value="">Choose a conversation</option>
                          {conversations.map((c) => (
                            <option value={c.id} key={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        size="sm"
                        disabled={saving || !selectedConversation}
                        onClick={() => void linkConversation()}
                      >
                        Link conversation
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Connect or select a chat account to link a channel.
                    </p>
                  )}
                </section>
                <section className="space-y-2 border-t pt-5">
                  <h2 className="font-semibold">GitHub and repositories</h2>
                  <p className="text-sm text-muted-foreground">
                    Repository access uses this project's existing Git checkout and source-control
                    connection. Open a shared PR link to review it in the project panel.
                  </p>
                  <p className="break-all text-xs text-muted-foreground">{project.workspaceRoot}</p>
                </section>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <OfficeModuleTabs
            value={Object.keys(moduleTools).find((name) => moduleTools[name] === tool) ?? tool}
            onChange={(name) => onToolChange(moduleTools[name] ?? "Drive")}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            {tool === "Drive" ? (
              <ProjectDrivePanel
                key={`${office.drive?.accountId}:${office.drive?.folderId}:${initialFolderId ?? ""}`}
                drive={office.drive}
                initialFolderId={initialFolderId}
                onConfigure={() => onToolChange("Settings")}
                onOpenFile={onOpenFile}
              />
            ) : tool === "Tasks" ? (
              <TasksPanel
                environmentId={project.environmentId}
                projectId={project.id}
                compact
                draft={taskDraft}
                onDraftHandled={onTaskDraftHandled}
              />
            ) : tool === "Documents" ? (
              document ? (
                <DriveDocument
                  key={`${document.accountId}:${document.file.id}`}
                  {...document}
                  onOpenUrl={onOpenUrl}
                />
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
                  Open a document from Drive or a shared link in your conversation.
                </p>
              )
            ) : (
              <ProjectResourcePanel
                key={`${project.environmentId}:${project.id}:${tool}`}
                project={project}
                office={office}
                onSaveOffice={onSaveOffice}
                resource={tool}
                targetUrl={targetUrl}
              />
            )}
          </div>
        </>
      )}
    </aside>
  );
}
