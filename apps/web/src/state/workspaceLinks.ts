import { createWorkspaceLinkAtoms } from "@t3tools/client-runtime/state/workspace-links";

import { connectionAtomRuntime } from "../connection/runtime";

/** Link lists and link commands for every environment this client talks to. */
export const workspaceLinks = createWorkspaceLinkAtoms(connectionAtomRuntime);
