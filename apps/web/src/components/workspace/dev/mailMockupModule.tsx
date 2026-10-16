import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "mail",
  readyRegions: [],
  settled: async () => {},
  dispose: () => {},
});
