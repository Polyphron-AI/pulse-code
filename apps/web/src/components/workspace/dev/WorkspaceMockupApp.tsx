import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, useContext, useLayoutEffect, useState } from "react";
import { WorkspaceNavigation } from "../WorkspaceNavigationView";
import { WorkspaceViewRail, workspaceRailItems } from "../WorkspaceViewRail";
import { WorkspaceShellLayout } from "../WorkspaceShellLayout";
import { WorkspaceEngagement } from "../WorkspaceEngagement";
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
  useLayoutEffect(() => {
    runtime?.onCommit({
      shellReady: false,
      incompleteRegions: ["shell.resources", "shell.footer"],
    });
  }, [runtime]);
  const [resourcesOpen, setResourcesOpen] = useState(true);
  if (!runtime) return null;
  const { session } = runtime;
  const recordNavigation = (value: string) => {
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
  const center = runtime.modules.find((module) => module.area === session.recipe.centerArea)
    ?.center ?? (
    <main aria-label="Workspace fixture readiness" className="p-4">
      <h2>Recipe {session.id}</h2>
      <p>Module body pending its owning wave.</p>
    </main>
  );
  return (
    <WorkspaceShellLayout
      navigation={
        <WorkspaceNavigation
          destination={session.recipe.space}
          environmentId={session.environmentId}
          mode="workspace"
          backdropVariant="dev"
          labels={{ brand: "Pulse Next", workspaceMode: "Office", group: "Office" }}
          onModeChange={(mode) => recordNavigation(`mode:${mode}`)}
          onNavigate={(destination) => recordNavigation(`space:${destination}`)}
          onSettings={() => recordNavigation("settings")}
          onToggleSidebar={() => recordNavigation("sidebar:toggle")}
        />
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
        <WorkspaceEngagement
          environmentId={session.environmentId}
          space={session.recipe.space}
          header={header}
          storage={session.storage}
          resourcesOpen={resourcesOpen}
          onResourcesChange={setResourcesOpen}
          resources={<p className="p-3 text-xs">Resources pending W4-T4a.</p>}
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
      }
    />
  );
}

export function WorkspaceMockupApp({ session }: { readonly session: WorkspaceMockupSession }) {
  const [router] = useState(() => {
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
