import { createTelegramAtoms } from "@t3tools/client-runtime/state/telegram";
import { connectionAtomRuntime } from "../connection/runtime";
export const telegram = createTelegramAtoms(connectionAtomRuntime);
