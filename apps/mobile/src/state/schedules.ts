import {
  createEnvironmentScheduleAtoms,
  createScheduleEnvironmentAtoms,
} from "@t3tools/client-runtime/state/schedules";

import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentSnapshotAtom } from "./shell";

export const scheduleEnvironment = createScheduleEnvironmentAtoms(connectionAtomRuntime);
export const environmentSchedules = createEnvironmentScheduleAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: environmentSnapshotAtom,
});
