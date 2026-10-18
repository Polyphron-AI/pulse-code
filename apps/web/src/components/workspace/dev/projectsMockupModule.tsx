import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";
import { DriveSettingsFixture } from "./driveMockupModule";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => ({
  area: "projects",
  readyRegions: session.id === "04" && session.driveState?.startsWith("drive-t") ? ["center"] : [],
  ...(session.id === "04" && session.driveState?.startsWith("drive-t")
    ? {
        center: (
          <main className="min-w-0 overflow-y-auto p-4">
            <h2 className="mb-4 text-sm font-medium">Project workspace settings</h2>
            <DriveSettingsFixture session={session} />
          </main>
        ),
      }
    : {}),
  settled: async () => {},
  dispose: () => {},
});
