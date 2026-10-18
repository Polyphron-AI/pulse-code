import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { PanelLeftIcon } from "lucide-react";
import { Sheet, SheetPopup, SheetTitle } from "../../ui/sheet";
import { WorkspaceNavigation } from "../WorkspaceNavigationView";
import { WorkspaceViewRail, workspaceRailItems } from "../WorkspaceViewRail";
import { WorkspaceShellLayout } from "../WorkspaceShellLayout";
import { WorkspaceEngagement } from "../WorkspaceEngagement";
import { WorkspaceResourcesPanelView } from "../WorkspaceResourcesPanelView";
import { WorkspaceResourceFooter } from "../WorkspaceResourceFooter";
import { WorkspaceResourcesProvider, useWorkspaceResourceState } from "../workspaceResourceState";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import type { WorkspaceHeaderModel } from "../WorkspaceHeader";
import type { WorkspaceMockupModule, WorkspaceMockupSession } from "./workspaceMockupFixtures";

export const WorkspaceMockupRenderContext = createContext<{
  readonly session: WorkspaceMockupSession;
  readonly modules: readonly WorkspaceMockupModule[];
  readonly onCommit: (report: {
    readonly shellReady: boolean;
    readonly incompleteRegions: readonly string[];
  }) => void;
} | null>(null);

function FixtureReport() {
  const runtime = useContext(WorkspaceMockupRenderContext);
  const compact = useMediaQuery("max-md");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    runtime?.onCommit({
      shellReady: false,
      incompleteRegions: ["shell.responsive"],
    });
  }, [runtime]);
  const wide = useMediaQuery("xl");
  const resources = useWorkspaceResourceState(runtime?.session.environmentId ?? null, {
    ...(runtime ? { storage: runtime.session.storage } : {}),
    presentation: wide ? "dock" : "sheet",
  });
  if (!runtime) return null;
  const { session } = runtime;
  const recordNavigation = (value: string) => {
    setMenuOpen(false);
    void session.record("navigate", undefined, value);
  };
  const title = {
    mail: "Inbox",
    communications: "# marketing",
    tasks: "Tasks",
    projects: "Projects",
    meetings: "Meetings",
    calendar: "Calendar",
  }[session.recipe.space];
  const subtitle = {
    mail: "maya@synkek.com",
    communications: "SynKEK · Slack · 8 members",
    tasks: "A clear plan for everything that comes next.",
    projects: "SynKEK · Brand & growth",
    meetings: "SynKEK · Brand & growth",
    calendar: "SynKEK · Brand & growth",
  }[session.recipe.space];
  const owner = session.seed.people.find((person) => person.id === session.seed.ownerDisplayId)!;
  const header: WorkspaceHeaderModel = {
    title,
    subtitle,
    environmentLabel: "SynKEK workspace",
    spaceLabel:
      session.recipe.space === "mail"
        ? "Email"
        : session.recipe.space.charAt(0).toUpperCase() + session.recipe.space.slice(1),
    sample: true,
    owner: { name: owner.name, initials: owner.initials },
  };
  const centerModule = runtime.modules.find((module) => module.area === session.recipe.centerArea);
  const center = centerModule?.center ?? (
    <main aria-label="Workspace fixture readiness" className="p-4">
      <h2>Recipe {session.id}</h2>
      <p>Module body pending its owning wave.</p>
    </main>
  );
  const selectedProject = session.seed.projects.find(
    (project) => project.id === resources.projectId,
  );
  const resource = runtime.modules.find(
    (module) => module.area === session.recipe.resourceArea,
  )?.resource;
  const navigation = (
    <WorkspaceNavigation
      destination={session.recipe.space}
      environmentId={session.environmentId}
      mode="workspace"
      backdropVariant="dev"
      labels={{ brand: "Pulse Next", workspaceMode: "Office", group: "Office" }}
      onModeChange={(mode) => recordNavigation(`mode:${mode}`)}
      onNavigate={(destination) => recordNavigation(`space:${destination}`)}
      onSettings={() => recordNavigation("settings")}
      onToggleSidebar={() => setMenuOpen(false)}
    />
  );
  const resourcePanel = (
    <WorkspaceResourcesPanelView
      projects={session.seed.projects}
      selectedProjectId={resources.projectId}
      status={
        selectedProject ? "selected" : resources.projectId === null ? "choose" : "unavailable"
      }
      tab={resources.selectedTab}
      onTabChange={resources.selectTab}
      onChooseProject={resources.chooseProject}
      body={
        selectedProject && resources.selectedTab === session.recipe.resourceTab ? (
          (resource ?? <p>Resource body pending its owning wave.</p>)
        ) : (
          <p>Choose the recipe project and tab to view its sample resource.</p>
        )
      }
      footer={
        selectedProject ? (
          <WorkspaceResourceFooter
            scope={{
              environmentId: session.environmentId,
              projectId: selectedProject.id,
            }}
            observations={[]}
            sample
            onSettings={() => recordNavigation("project-settings")}
          />
        ) : (
          <span>Connection status unavailable</span>
        )
      }
      onClose={resources.close}
    />
  );
  return (
    <WorkspaceResourcesProvider value={resources}>
      {compact ? (
        <button
          ref={menuTrigger}
          data-workspace-fixture-menu-trigger=""
          type="button"
          aria-label="Toggle workspace navigation"
          onClick={() => setMenuOpen(true)}
        >
          <PanelLeftIcon />
        </button>
      ) : null}
      <WorkspaceShellLayout
        navigation={
          compact ? (
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetPopup side="left" finalFocus={menuTrigger} transitionDurationMs={0}>
                <SheetTitle className="sr-only">Workspace menu</SheetTitle>
                {navigation}
              </SheetPopup>
            </Sheet>
          ) : (
            navigation
          )
        }
        header={header}
        onOpenWorkspace={() => recordNavigation("space:projects")}
        rail={
          <WorkspaceViewRail
            items={workspaceRailItems[session.recipe.space]}
            selected={session.recipe.view ?? workspaceRailItems[session.recipe.space][0]!.id}
            onSelect={(view) => recordNavigation(`view:${view}`)}
          />
        }
        engagement={
          centerModule?.renderEngagement ? (
            centerModule.renderEngagement(resourcePanel)
          ) : (
            <WorkspaceEngagement
              environmentId={session.environmentId}
              space={session.recipe.space}
              header={header}
              {...(session.driveState === "drive-t1-20"
                ? {
                    linkedContext: {
                      item: {
                        ref: { type: "project" as const, projectId: session.resourceProjectId },
                        title: "SynKEK",
                      },
                      render: () => (
                        <div className="p-4 text-sm">Sample project Linked context</div>
                      ),
                    },
                  }
                : {})}
              storage={session.storage}
              resources={resourcePanel}
              {...(session.recipe.space === "mail" || session.recipe.space === "communications"
                ? {
                    layout: "split" as const,
                    selected: true,
                    list: <p className="p-3 text-xs">List pending its owning wave.</p>,
                  }
                : { layout: "full" as const })}
            >
              {center}
            </WorkspaceEngagement>
          )
        }
      />
    </WorkspaceResourcesProvider>
  );
}

export function WorkspaceMockupApp({ session }: { readonly session: WorkspaceMockupSession }) {
  const [router] = useState(() => {
    session.storage.setItem(
      `pulse.workspace.resources.v1:${session.environmentId}`,
      JSON.stringify({
        version: 1,
        open: true,
        projectId: session.resourceProjectId,
        tabs: { [session.resourceProjectId]: session.recipe.resourceTab },
      }),
    );
    const root = createRootRoute({ component: Outlet });
    const workspace = createRoute({
      getParentRoute: () => root,
      path: "/workspace",
      component: FixtureReport,
    });
    return createRouter({
      routeTree: root.addChildren([workspace]),
      history: createMemoryHistory({ initialEntries: [session.recipe.route] }),
      defaultPendingMinMs: 0,
    });
  });
  return <RouterProvider router={router} />;
}
