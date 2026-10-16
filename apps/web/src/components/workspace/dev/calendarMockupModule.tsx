import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "calendar",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
