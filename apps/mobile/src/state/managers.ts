import {
  createEnvironmentManagerAtoms,
  createManagerEnvironmentAtoms,
} from "@t3tools/client-runtime/state/managers";

import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentSnapshotAtom } from "./shell";

/** Argo records across every connected environment, plus their commands. */
export const environmentManagers = createEnvironmentManagerAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: environmentSnapshotAtom,
});

export const managerEnvironment: ReturnType<typeof createManagerEnvironmentAtoms> =
  createManagerEnvironmentAtoms(connectionAtomRuntime);
