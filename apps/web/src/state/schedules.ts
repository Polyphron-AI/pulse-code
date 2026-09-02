import type {
  EnvironmentId,
  OrchestrationSchedule,
  OrchestrationShellSnapshot,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import { environmentCatalog } from "../connection/catalog";
import { environmentSnapshotAtom } from "./shell";

export interface EnvironmentSchedule extends OrchestrationSchedule {
  readonly environmentId: EnvironmentId;
}

export interface ScheduleCatalogState {
  readonly schedules: ReadonlyArray<EnvironmentSchedule>;
  readonly environmentCount: number;
  readonly loadedEnvironmentCount: number;
  readonly supportedEnvironmentCount: number;
}

export function buildScheduleCatalogState(
  entries: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly snapshot: OrchestrationShellSnapshot | null;
  }>,
): ScheduleCatalogState {
  const schedules: EnvironmentSchedule[] = [];
  let loadedEnvironmentCount = 0;
  let supportedEnvironmentCount = 0;

  for (const { environmentId, snapshot } of entries) {
    if (snapshot === null) continue;
    loadedEnvironmentCount += 1;
    if (snapshot.schedules === undefined) continue;
    supportedEnvironmentCount += 1;
    for (const schedule of snapshot.schedules) {
      schedules.push({ ...schedule, environmentId });
    }
  }

  return {
    schedules,
    environmentCount: entries.length,
    loadedEnvironmentCount,
    supportedEnvironmentCount,
  };
}

export const scheduleCatalogAtom = Atom.make((get) =>
  buildScheduleCatalogState(
    Array.from(get(environmentCatalog.catalogValueAtom).entries.keys(), (environmentId) => ({
      environmentId,
      snapshot: get(environmentSnapshotAtom(environmentId)),
    })),
  ),
).pipe(Atom.withLabel("web-schedule-catalog"));
