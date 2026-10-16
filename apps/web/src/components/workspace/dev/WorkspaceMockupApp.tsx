import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { createContext, useContext, useLayoutEffect, useState } from "react";
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
      incompleteRegions: [
        "shell.navigation",
        "shell.engagement",
        "shell.resources",
        "shell.footer",
      ],
    });
  }, [runtime]);
  if (!runtime) return null;
  const { session } = runtime;
  return (
    <main aria-label="Workspace fixture readiness">
      <p>{session.seed.sampleCopy.marker}</p>
      <h1>Recipe {session.id}</h1>
      <p>{session.recipe.route}</p>
      <p>Seed ready. Shell presentation is pending W4-T2 through W4-T5.</p>
      <ul>
        {runtime.modules.map((module) => (
          <li key={module.area}>
            {module.area}: {module.readyRegions.length ? module.readyRegions.join(", ") : "pending"}
          </li>
        ))}
      </ul>
    </main>
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
