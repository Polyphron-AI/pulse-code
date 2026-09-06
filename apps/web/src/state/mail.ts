import { createMailEnvironmentAtoms } from "@t3tools/client-runtime/state/mail";
import { connectionAtomRuntime } from "../connection/runtime";

export const mailEnvironment = createMailEnvironmentAtoms(connectionAtomRuntime);
