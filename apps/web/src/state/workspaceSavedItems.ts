import { createWorkspaceSavedItemAtoms } from "@t3tools/client-runtime/state/workspace-saved-items";

import { connectionAtomRuntime } from "../connection/runtime";

export const workspaceSavedItems = createWorkspaceSavedItemAtoms(connectionAtomRuntime);
