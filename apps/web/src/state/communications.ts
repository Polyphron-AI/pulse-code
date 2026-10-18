import { createCommunicationsAtoms } from "@t3tools/client-runtime/state/communications";
import { connectionAtomRuntime } from "../connection/runtime";

export const communications = createCommunicationsAtoms(connectionAtomRuntime);
