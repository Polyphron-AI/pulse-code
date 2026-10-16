import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "browser",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
