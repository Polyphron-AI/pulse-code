import {
  createAssistantEnvironmentAtoms,
  createEnvironmentAssistantAtoms,
} from "@t3tools/client-runtime/state/assistants";

import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentSnapshotAtom } from "./shell";

/** The assistant record (Luna) for every connected environment, plus its commands. */
export const environmentAssistants = createEnvironmentAssistantAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: environmentSnapshotAtom,
});

export const assistantEnvironment: ReturnType<typeof createAssistantEnvironmentAtoms> =
  createAssistantEnvironmentAtoms(connectionAtomRuntime);
