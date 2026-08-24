import type {
  EnvironmentId,
  ProjectId,
  OrchestrationSchedule,
  OrchestrationShellSnapshot,
  ScheduleId,
  ThreadOrigin,
} from "@t3tools/contracts";
import { scheduleIdFromThreadOrigin, scheduleTargetsProject } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentCatalogState } from "./connections.ts";

const EMPTY_SCHEDULES: ReadonlyArray<OrchestrationSchedule> = Object.freeze([]);
const EMPTY_SCHEDULE_INDEX: ReadonlyMap<ScheduleId, OrchestrationSchedule> = new Map();

/**
 * Schedules for each connected environment, read straight off the shell
 * snapshot the same way projects and threads are. Schedules are few and
 * slow-moving, so there is no per-schedule atom family: Settings renders the
 * whole list and the thread badge only needs the index.
 */
export function createEnvironmentScheduleAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly snapshotAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<OrchestrationShellSnapshot | null>;
}) {
  const environmentSchedulesAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<OrchestrationSchedule> =>
        get(input.snapshotAtom(environmentId))?.schedules ?? EMPTY_SCHEDULES,
    ).pipe(Atom.withLabel(`environment-schedules:${environmentId}`)),
  );

  const environmentScheduleIndexAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get): ReadonlyMap<ScheduleId, OrchestrationSchedule> => {
      const schedules = get(environmentSchedulesAtom(environmentId));
      if (schedules.length === 0) {
        return EMPTY_SCHEDULE_INDEX;
      }
      return new Map(schedules.map((schedule) => [schedule.id, schedule] as const));
    }).pipe(Atom.withLabel(`environment-schedule-index:${environmentId}`)),
  );

  /**
   * How many live schedules would touch a project group. Groups can span
   * environments, so the key carries the whole ref list; build it with
   * `projectScheduleCountKey` so the same group always hits the same atom.
   */
  const projectScheduleCountAtom = Atom.family((refsKey: string) =>
    Atom.make((get): number => {
      let count = 0;
      for (const [environmentId, projectIds] of parseProjectScheduleCountKey(refsKey)) {
        for (const schedule of get(environmentSchedulesAtom(environmentId))) {
          if (schedule.deletedAt !== null) continue;
          if (projectIds.some((projectId) => scheduleTargetsProject(schedule, projectId))) {
            count += 1;
          }
        }
      }
      return count;
    }).pipe(Atom.withLabel(`project-schedule-count:${refsKey}`)),
  );

  /**
   * Every live schedule across the connected environments, newest first by the
   * environment order the catalog reports. Mobile lists all of them on one
   * screen, so the cross-environment walk lives here instead of a variable
   * number of hooks in the component.
   */
  let previousEntries: ReadonlyArray<EnvironmentSchedule> = [];
  const schedulesAtom = Atom.make((get): ReadonlyArray<EnvironmentSchedule> => {
    const next: EnvironmentSchedule[] = [];
    for (const environmentId of get(input.catalogValueAtom).entries.keys()) {
      for (const schedule of get(environmentSchedulesAtom(environmentId))) {
        if (schedule.deletedAt !== null) continue;
        next.push({ environmentId, schedule });
      }
    }
    const unchanged =
      previousEntries.length === next.length &&
      next.every(
        (entry, index) =>
          previousEntries[index]?.environmentId === entry.environmentId &&
          previousEntries[index]?.schedule === entry.schedule,
      );
    if (unchanged) return previousEntries;
    previousEntries = next;
    return next;
  }).pipe(Atom.withLabel("environment-schedule-list"));

  return {
    environmentSchedulesAtom,
    environmentScheduleIndexAtom,
    projectScheduleCountAtom,
    schedulesAtom,
  };
}

export interface EnvironmentSchedule {
  readonly environmentId: EnvironmentId;
  readonly schedule: OrchestrationSchedule;
}

export interface ProjectScheduleRef {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

/**
 * Stable atom key for a set of project refs: sorted so two renders of the same
 * group in a different order share one atom.
 */
export function projectScheduleCountKey(refs: ReadonlyArray<ProjectScheduleRef>): string {
  return JSON.stringify(refs.map((ref) => [ref.environmentId, ref.projectId] as const).toSorted());
}

function parseProjectScheduleCountKey(
  key: string,
): ReadonlyArray<readonly [EnvironmentId, ReadonlyArray<ProjectId>]> {
  const byEnvironment = new Map<EnvironmentId, ProjectId[]>();
  for (const [environmentId, projectId] of JSON.parse(key) as ReadonlyArray<
    readonly [EnvironmentId, ProjectId]
  >) {
    const existing = byEnvironment.get(environmentId);
    if (existing === undefined) {
      byEnvironment.set(environmentId, [projectId]);
    } else {
      existing.push(projectId);
    }
  }
  return [...byEnvironment];
}

/**
 * The schedule a thread was started by, or null for a thread the user started.
 * Drives the inline "Scheduled" badge, which needs the schedule's name rather
 * than the raw origin string.
 */
export function scheduleForThreadOrigin(
  index: ReadonlyMap<ScheduleId, OrchestrationSchedule>,
  origin: ThreadOrigin | undefined,
): OrchestrationSchedule | null {
  if (origin === undefined) return null;
  const scheduleId = scheduleIdFromThreadOrigin(origin);
  return scheduleId === null ? null : (index.get(scheduleId) ?? null);
}
