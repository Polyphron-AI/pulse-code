import { createWorkspaceNoteAtoms } from "@t3tools/client-runtime/state/workspaceNotes";
import { connectionAtomRuntime } from "../connection/runtime";

export const workspaceNotes = createWorkspaceNoteAtoms(connectionAtomRuntime);
