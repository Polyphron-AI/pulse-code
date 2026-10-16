import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, useContext, useLayoutEffect, useState } from "react";
import { WorkspaceNavigation } from "../WorkspaceNavigation.tsx";
import { WorkspaceViewRail, workspaceRailItems } from "../WorkspaceViewRail";
import { WorkspaceShellLayout } from "../WorkspaceShellLayout";
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
      incompleteRegions: ["shell.engagement", "shell.resources", "shell.footer"],
    });
  }, [runtime]);
  if (!runtime) return null;
  const { session } = runtime;
  const recordNavigation = (value: string) => {
    void session.record("navigate", undefined, value);
  };
  return (
    <WorkspaceShellLayout
      navigation={
        <WorkspaceNavigation
          destination={session.recipe.space}
          environmentId={session.environmentId}
          mode="workspace"
          labels={{ brand: "Pulse Next", workspaceMode: "Office", group: "Office" }}
          onModeChange={(mode) => recordNavigation(`mode:${mode}`)}
          onNavigate={(destination) => recordNavigation(`space:${destination}`)}
          onSettings={() => recordNavigation("settings")}
          onToggleSidebar={() => recordNavigation("sidebar:toggle")}
        />
      }
      breadcrumb={
        <div className="flex h-[26px] shrink-0 items-center justify-end border-b border-border px-3 text-4xs text-primary">
          {session.seed.sampleCopy.marker}
        </div>
      }
      rail={
        <WorkspaceViewRail
          items={workspaceRailItems[session.recipe.space]}
          selected={session.recipe.view ?? workspaceRailItems[session.recipe.space][0]!.id}
          onSelect={(view) => recordNavigation(`view:${view}`)}
        />
      }
      engagement={
        <main
          aria-label="Workspace fixture readiness"
          className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4"
        >
          <h1>Recipe {session.id}</h1>
          <p>{session.recipe.route}</p>
          <p>Navigation ready. Engagement, resources and footer are pending W4-T3 through W4-T5.</p>
          <ul>
            {runtime.modules.map((module) => (
              <li key={module.area}>
                {module.area}:{" "}
                {module.readyRegions.length ? module.readyRegions.join(", ") : "pending"}
              </li>
            ))}
          </ul>
        </main>
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
