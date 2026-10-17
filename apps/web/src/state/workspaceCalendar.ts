import { createWorkspaceCalendarAtoms } from "@t3tools/client-runtime/state/workspaceCalendar";
import { connectionAtomRuntime } from "../connection/runtime";

export const workspaceCalendar = createWorkspaceCalendarAtoms(connectionAtomRuntime);
