import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "notes",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
