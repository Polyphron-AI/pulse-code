import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "drive",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
