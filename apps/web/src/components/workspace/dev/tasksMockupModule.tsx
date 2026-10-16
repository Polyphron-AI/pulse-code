import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "tasks",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
