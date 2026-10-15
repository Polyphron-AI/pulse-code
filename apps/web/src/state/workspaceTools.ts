import { createWorkspaceToolsAtoms } from "@t3tools/client-runtime/state/workspaceTools";
import { connectionAtomRuntime } from "../connection/runtime";
export const workspaceTools = createWorkspaceToolsAtoms(connectionAtomRuntime);
