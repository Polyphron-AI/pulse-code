import { useState } from "react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { FolderIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

export function ProjectsOverview({
  projects,
  selectedProject,
  onSelect,
  onCreate,
  onOpenConversations,
  connectedOnly = false,
}: {
  projects: readonly EnvironmentProject[];
  selectedProject: EnvironmentProject | undefined;
  onSelect: (project: EnvironmentProject) => void;
  onCreate: () => void;
  onOpenConversations: (project: EnvironmentProject) => void;
  connectedOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = projects.filter(
    (project) =>
      (!connectedOnly ||
        project.office?.drive ||
        project.office?.conversations.length ||
        project.office?.agentThreadIds.length ||
        project.office?.browserThreadId) &&
      [project.title, project.workspaceRoot, project.office?.drive?.folderName ?? ""].some(
        (value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
  );
  return (
    <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6" aria-label="Project management">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Your project folders, conversations and connected work. Select a project to manage it in
            the sidebar.
          </p>
        </div>
        <Button size="sm" aria-label="New project" onClick={onCreate}>
          <PlusIcon />
          New project
        </Button>
      </div>
      <div className="relative my-6 max-w-md">
        <Input
          aria-label="Search projects"
          placeholder="Search projects or folders"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {projects.length === 0 ? (
        <div className="border-y py-12">
          <FolderIcon className="mb-4 size-7 text-muted-foreground" />
          <h2 className="font-medium">Start your first project</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Give it a name. Connect Google Drive and conversations when you are ready.
          </p>
        </div>
      ) : matches.length === 0 ? (
        <p role="status" className="border-y py-12 text-sm text-muted-foreground">
          {connectedOnly
            ? "No connected projects match this view. Open All projects to add connections."
            : "No matching projects. Try a different name or folder."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="pb-3 pr-4 font-medium">Project</th>
                <th className="pb-3 pr-4 font-medium">Google Drive</th>
                <th className="pb-3 pr-4 font-medium">Conversations</th>
                <th className="pb-3 pr-4 font-medium">Agent links</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {matches.map((project) => {
                const selected =
                  project.id === selectedProject?.id &&
                  project.environmentId === selectedProject.environmentId;
                return (
                  <tr
                    key={JSON.stringify([project.environmentId, project.id])}
                    className={cn("border-b hover:bg-muted/40", selected && "bg-accent/50")}
                  >
                    <td className="max-w-72 py-4 pr-4">
                      <button
                        className="flex w-full items-start gap-3 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
                        aria-label={`Manage ${project.title}`}
                        aria-pressed={selected}
                        onClick={() => onSelect(project)}
                      >
                        <FolderIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{project.title}</span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {project.workspaceRoot}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="max-w-44 py-4 pr-4">
                      <span className="block truncate text-muted-foreground">
                        {project.office?.drive?.folderName ?? "Not connected"}
                      </span>
                    </td>
                    <td className="py-4 pr-4 tabular-nums">
                      {project.office?.conversations.length ?? 0}
                    </td>
                    <td className="py-4 pr-4 tabular-nums">
                      {project.office?.agentThreadIds.length ?? 0}
                    </td>
                    <td className="py-4">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Open conversations for ${project.title}`}
                        onClick={() => onOpenConversations(project)}
                      >
                        <MessageSquareIcon />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-muted-foreground">
            Agent links are project assignments, not a count of running agents.
          </p>
        </div>
      )}
    </main>
  );
}
