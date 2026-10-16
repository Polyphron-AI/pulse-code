import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (_session) => ({
  area: "notes",
  readyRegions: [],
  incompleteRegions: ["07.docs-format", "07.docs-comments"],
  settled: async () => {},
  dispose: () => {},
});
