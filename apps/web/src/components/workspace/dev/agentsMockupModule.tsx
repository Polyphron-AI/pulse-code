import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "agents",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
