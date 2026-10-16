import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "communications",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
