import { useState } from "react";
import type { OfficeDriveFile } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { FolderIcon, LinkIcon, SearchIcon, ChevronRightIcon } from "lucide-react";
import { useProjects } from "../../state/entities";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ProjectDrivePanel } from "./ProjectDrivePanel";

export function GlobalFilesPanel({
  onConfigureProject,
  canInsert,
  onInsertLink,
}: {
  onConfigureProject?: ((project: EnvironmentProject) => void) | undefined;
  canInsert: boolean;
  onInsertLink: (name: string, url: string) => boolean;
}) {
  const projects = useProjects();
  const [selectedKey, setSelectedKey] = useState<string>();
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<OfficeDriveFile>();
  const [notice, setNotice] = useState("");
  const key = (project: EnvironmentProject) => JSON.stringify([project.environmentId, project.id]);
  const selected = projects.find((project) => key(project) === selectedKey);
  let link: string | undefined;
  if (file?.webViewLink) {
    try {
      const url = new URL(file.webViewLink);
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        ["drive.google.com", "docs.google.com"].includes(url.hostname)
      )
        link = url.href;
    } catch {
      /* A file without a valid provider link cannot be inserted. */
    }
  }
  return (
    <div>
      <div className="space-y-3 border-b p-4">
        <h2 className="text-lg font-medium">Google Drive</h2>
        <p className="text-xs text-muted-foreground">
          Browse linked Google Drive folders across your projects.
        </p>
        {selected ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedKey(undefined);
              setFile(undefined);
              setNotice("");
            }}
          >
            All project folders
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-muted/80 px-4 py-1">
            <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <Input
              unstyled
              aria-label="Find project folders"
              placeholder="Find a project…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}
      </div>
      {selected ? (
        <>
          <p className="px-4 pt-3 text-sm font-medium">{selected.title}</p>
          {selected.office?.drive ? (
            <ProjectDrivePanel
              key={JSON.stringify([selectedKey, selected.office.drive])}
              drive={selected.office.drive}
              onConfigure={() => onConfigureProject?.(selected)}
              onOpenFile={(next) => {
                setFile(next);
                setNotice("");
              }}
            />
          ) : (
            <div className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                This project has no Google Drive folder linked yet.
              </p>
              {onConfigureProject && (
                <Button onClick={() => onConfigureProject(selected)}>Connect Google Drive</Button>
              )}
            </div>
          )}
          {file && (
            <div className="m-4 space-y-3 rounded-lg border p-3">
              <p className="break-words text-sm font-medium">{file.name}</p>
              <Button
                size="sm"
                disabled={!link || !canInsert}
                onClick={() => {
                  if (link)
                    setNotice(
                      onInsertLink(file.name, link)
                        ? "Link added to your email draft."
                        : "Wait for the draft to finish loading or saving, then try again.",
                    );
                }}
              >
                <LinkIcon /> Insert link in draft
              </Button>
              {!canInsert && (
                <p className="text-xs text-muted-foreground">
                  Open an email to add this file to its reply draft.
                </p>
              )}
              {!link && (
                <p className="text-xs text-muted-foreground">
                  Google Drive did not provide a share link for this file.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Recipients need access in Google Drive. Adding a link does not change sharing
                permissions.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            Project folders <ChevronRightIcon className="size-4 text-muted-foreground" />
          </div>
          <div className="border-b py-2 text-xs text-muted-foreground">Name</div>
          {projects
            .filter((project) => project.title.toLowerCase().includes(query.toLowerCase()))
            .map((project) => (
              <button
                key={key(project)}
                type="button"
                className="flex w-full items-center gap-3 border-b border-border/50 px-2 py-4 text-left hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => {
                  setSelectedKey(key(project));
                  setFile(undefined);
                  setNotice("");
                }}
              >
                <FolderIcon className="size-5 shrink-0 fill-warning/70 text-warning" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{project.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {project.office?.drive?.folderName ?? "Drive not connected"}
                  </span>
                </span>
              </button>
            ))}
          {!projects.length && (
            <p className="p-4 text-sm text-muted-foreground">
              Create a project and link its Google Drive folder to browse files here.
            </p>
          )}
          {projects.length > 0 &&
            !projects.some((project) =>
              project.title.toLowerCase().includes(query.toLowerCase()),
            ) && (
              <p className="p-4 text-sm text-muted-foreground">
                No project folders match your search.
              </p>
            )}
        </div>
      )}
      {notice && (
        <p role="status" className="px-4 pb-4 text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
