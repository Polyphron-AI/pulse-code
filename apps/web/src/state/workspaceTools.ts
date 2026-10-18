import { createWorkspaceToolsAtoms } from "@t3tools/client-runtime/state/workspaceTools";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentProjects } from "./projects";
export const workspaceTools = createWorkspaceToolsAtoms(connectionAtomRuntime, {
  projects: environmentProjects.environmentProjectsAtom,
});
