import { useRef, useState, type ReactNode } from "react";
import { ProjectId, type WorkspaceProjectOverview } from "@t3tools/contracts";
import { ProjectsOverviewView, type ProjectsOverviewViewProps } from "../ProjectsOverviewView";
import {
  ProjectCreateDialogView,
  type ProjectCreateDialogViewProps,
} from "../ProjectCreateDialogView";
import { WorkspaceItemMenuView } from "../WorkspaceItemMenuView";
import { Button } from "../../ui/button";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";
import { DriveSettingsFixture } from "./driveMockupModule";

function ProjectsFixture({ session }: { session: Parameters<CreateWorkspaceMockupModule>[0] }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProjectsOverviewViewProps["driveFilter"]>("all");
  const [selected, setSelected] = useState(session.resourceProjectId);
  const [createOpen, setCreateOpen] = useState(false);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const [created, setCreated] = useState<readonly WorkspaceProjectOverview[]>([]);
  const projects: readonly WorkspaceProjectOverview[] = [
    ...session.seed.projects.map((project) => ({
      projectId: project.id,
      title: project.title,
      description: project.description,
      driveRoot: project.driveLinked ? ("linked" as const) : ("none" as const),
      channels: {
        count: project.channelCount,
        complete: true,
        providers: [{ provider: "Slack", count: project.channelCount, complete: true }],
      },
      members: {
        count: project.memberCount,
        complete: true as const,
        source: "Slack",
        observedAt: project.countsAsOf,
      },
    })),
    ...created,
  ];
  return (
    <>
      <ProjectsOverviewView
        createButtonRef={createButton}
        projects={projects.filter(
          (project) =>
            `${project.title} ${project.description ?? ""}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()) &&
            (filter === "all" || (project.driveRoot === "linked") === (filter === "linked")),
        )}
        selectedProjectId={selected}
        query={query}
        appliedQuery={search}
        driveFilter={filter}
        pending={false}
        error={null}
        hasMore={false}
        roster={session.seed.people.map((person) => ({
          initials: person.initials,
          name: person.name,
          roleLabel: `${person.role} · Slack`,
        }))}
        onQueryChange={(value) => {
          setQuery(value);
          if (!value.trim()) setSearch("");
        }}
        onSearch={() => setSearch(query)}
        onDriveFilterChange={setFilter}
        onSelect={(id) => {
          setSelected(id);
          void session.record("navigate", { type: "project", projectId: id });
        }}
        renderProjectActions={(id, row) => (
          <FixtureProjectMenu session={session} projectId={id}>
            {row}
          </FixtureProjectMenu>
        )}
        onCreate={() => setCreateOpen(true)}
        onMore={() => {}}
        onRetry={() => {}}
        onReset={() => {
          setQuery("");
          setSearch("");
          setFilter("all");
        }}
      />
      <FixtureCreateDialog
        finalFocus={createButton}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(name) => {
          const projectId = ProjectId.make(`fixture-created-${created.length + 1}`);
          setCreated([
            ...created,
            {
              projectId,
              title: name,
              description: null,
              driveRoot: "none",
              channels: { count: 0, complete: true, providers: [] },
            },
          ]);
          setSelected(projectId);
          void session.record("start-project", { type: "project", projectId }, name);
        }}
      />
    </>
  );
}

function FixtureCreateDialog({
  finalFocus,
  open,
  onOpenChange,
  onCreate,
}: {
  readonly finalFocus: ProjectCreateDialogViewProps["finalFocus"];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <ProjectCreateDialogView
      finalFocus={finalFocus}
      open={open}
      name={name}
      busy={false}
      error={null}
      created={false}
      onNameChange={setName}
      onSubmit={() => {
        if (!name.trim()) return;
        onCreate(name.trim());
        setName("");
        onOpenChange(false);
      }}
      onCancel={() => onOpenChange(false)}
      onOpenChange={onOpenChange}
      onOpenCreated={() => {}}
    />
  );
}

function FixtureProjectMenu({
  session,
  projectId,
  children,
}: {
  readonly session: Parameters<CreateWorkspaceMockupModule>[0];
  readonly projectId: ProjectId;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (value) void session.record("menu", { type: "project", projectId }, "project-menu");
  };
  return (
    <WorkspaceItemMenuView
      available
      open={open}
      onOpenChange={changeOpen}
      triggerClassName="relative"
      onContextMenu={(event) => {
        event.preventDefault();
        changeOpen(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          changeOpen(true);
        }
      }}
      actions={
        open ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void session.record("navigate", { type: "project", projectId });
              setOpen(false);
            }}
          >
            Open project
          </Button>
        ) : null
      }
    >
      {children}
    </WorkspaceItemMenuView>
  );
}

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => ({
  area: "projects",
  readyRegions: session.id === "04" ? ["center"] : [],
  ...(session.id === "04" && session.driveState?.startsWith("drive-t")
    ? {
        center: (
          <main className="min-w-0 overflow-y-auto p-4">
            <h2 className="mb-4 text-sm font-medium">Project workspace settings</h2>
            <DriveSettingsFixture session={session} />
          </main>
        ),
      }
    : session.id === "04"
      ? { center: <ProjectsFixture session={session} /> }
      : {}),
  settled: session.settled,
  dispose: () => {},
});
