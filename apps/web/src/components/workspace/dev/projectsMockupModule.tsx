import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "projects",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
