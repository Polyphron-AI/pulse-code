import {
  managerIdFromThreadOrigin,
  managerState,
  managerThreadOrigin,
  type EnvironmentId,
  type ManagerId,
  type ManagerState,
  type OrchestrationManager,
  type OrchestrationShellSnapshot,
  type ThreadId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  type CreateManagerInput,
  type CycleNowManagerInput,
  type DeleteManagerInput,
  type PauseManagerInput,
  type ResumeManagerInput,
  type UpdateManagerInput,
  createManager,
  cycleNowManager,
  deleteManager,
  pauseManager,
  resumeManager,
  updateManager,
} from "../operations/commands.ts";
import type { EnvironmentCatalogState } from "./connections.ts";
import { createAtomCommandScheduler, createEnvironmentCommand } from "./runtime.ts";

export type {
  CreateManagerInput,
  CycleNowManagerInput,
  DeleteManagerInput,
  PauseManagerInput,
  ResumeManagerInput,
  UpdateManagerInput,
} from "../operations/commands.ts";

/**
 * The manager role ships to users as Argo. Everything in this module says
 * manager; only the labels below are user-visible copy.
 */
export interface EnvironmentManager extends OrchestrationManager {
  readonly environmentId: EnvironmentId;
}

/** Pill copy for each state, shared by web and mobile so the words match. */
export const MANAGER_STATE_LABELS: Readonly<Record<ManagerState, string>> = Object.freeze({
  watching: "Watching",
  paused: "Paused",
  "no-mission": "No mission",
});

export function managerStateLabel(
  manager: Pick<OrchestrationManager, "mission" | "pausedAt">,
): string {
  return MANAGER_STATE_LABELS[managerState(manager)];
}

/**
 * Whether "Cycle now" can be offered. A cycle only makes sense while the Argo
 * is watching, and only once: `cycleRequestedAt` is cleared by the server when
 * the requested cycle runs, so a set value means one is already queued.
 */
export type ManagerCycleNowState = "available" | "queued" | "unavailable";

export interface ManagerCycleNowInput {
  readonly mission: string;
  readonly pausedAt: string | null;
  readonly cycleRequestedAt?: string | null | undefined;
}

export function managerCycleNowState(manager: ManagerCycleNowInput): ManagerCycleNowState {
  if (managerState(manager) !== "watching") return "unavailable";
  return manager.cycleRequestedAt ? "queued" : "available";
}

export const MANAGER_CYCLE_NOW_LABELS: Readonly<Record<ManagerCycleNowState, string>> =
  Object.freeze({
    available: "Cycle now",
    queued: "Cycle queued",
    unavailable: "Cycle now",
  });

export function managerCycleNowLabel(manager: ManagerCycleNowInput): string {
  return MANAGER_CYCLE_NOW_LABELS[managerCycleNowState(manager)];
}

/** "Argo: Nightly triage", the badge a child thread wears. */
export function managerBadgeLabel(manager: Pick<OrchestrationManager, "name">): string {
  return `Argo: ${manager.name}`;
}

/**
 * Clicking the pill pauses a watching manager and resumes a paused one. A
 * manager with no mission has nothing to toggle, so the pill opens its thread
 * instead.
 */
export type ManagerPillAction = "pause" | "resume" | "open";

export function managerPillAction(
  manager: Pick<OrchestrationManager, "mission" | "pausedAt">,
): ManagerPillAction {
  switch (managerState(manager)) {
    case "watching":
      return "pause";
    case "paused":
      return "resume";
    default:
      return "open";
  }
}

interface ManagerThreadLike {
  readonly id: ThreadId;
  readonly origin?: string | null | undefined;
  readonly archivedAt?: string | null | undefined;
}

/** The manager that owns a thread, whether it is the manager thread or a child. */
export function managerForThread(
  thread: Pick<ManagerThreadLike, "origin"> | null | undefined,
): ManagerId | null {
  const origin = thread?.origin;
  if (typeof origin !== "string" || origin.length === 0) return null;
  return managerIdFromThreadOrigin(origin);
}

/** True only for the manager's own persistent thread. */
export function isManagerOwnThread(
  manager: Pick<OrchestrationManager, "threadId">,
  thread: Pick<ManagerThreadLike, "id">,
): boolean {
  return manager.threadId !== null && manager.threadId === thread.id;
}

/**
 * Live children of one manager: same `manager:<id>` origin, not archived, and
 * never the manager's own thread. Pass `managerThreadId` so the header thread
 * does not nest under itself.
 */
export function managerChildren<T extends ManagerThreadLike>(
  threads: ReadonlyArray<T>,
  managerId: ManagerId,
  managerThreadId?: ThreadId | null,
): ReadonlyArray<T> {
  const origin = managerThreadOrigin(managerId);
  return threads.filter(
    (thread) =>
      thread.origin === origin &&
      (thread.archivedAt ?? null) === null &&
      thread.id !== managerThreadId,
  );
}

/** Activity kind the server appends once per cycle. */
export const MANAGER_CYCLE_ACTIVITY_KIND = "manager.cycle";

export type ManagerCycleKind = "spawned" | "stopped" | "progressed" | "stalled" | "idle" | "error";

const MANAGER_CYCLE_KINDS: ReadonlyArray<ManagerCycleKind> = [
  "spawned",
  "stopped",
  "progressed",
  "stalled",
  "idle",
  "error",
];

export const MANAGER_CYCLE_KIND_LABELS: Readonly<Record<ManagerCycleKind, string>> = Object.freeze({
  spawned: "Spawned",
  stopped: "Stopped",
  progressed: "Progressed",
  stalled: "Stalled",
  idle: "Idle",
  error: "Error",
});

export interface ManagerCycleEntry {
  readonly kind: ManagerCycleKind;
  readonly threadId: ThreadId | null;
  readonly summary: string;
  readonly occurredAt: string;
}

interface ActivityLike {
  readonly kind: string;
  readonly payload?: unknown;
  readonly createdAt?: string | undefined;
}

/**
 * Reads `manager.cycle` activities off a manager thread into the rows the
 * fleet view table renders. Unknown or malformed payloads are dropped rather
 * than rendered half-empty.
 */
export function managerCycleEntries(
  activities: ReadonlyArray<ActivityLike>,
): ReadonlyArray<ManagerCycleEntry> {
  const entries: ManagerCycleEntry[] = [];
  for (const activity of activities) {
    if (activity.kind !== MANAGER_CYCLE_ACTIVITY_KIND) continue;
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const kind = payload?.kind;
    if (typeof kind !== "string" || !MANAGER_CYCLE_KINDS.includes(kind as ManagerCycleKind)) {
      continue;
    }
    const threadId = payload?.threadId;
    const summary = payload?.summary;
    const occurredAt = payload?.occurredAt;
    entries.push({
      kind: kind as ManagerCycleKind,
      threadId: typeof threadId === "string" ? (threadId as ThreadId) : null,
      summary: typeof summary === "string" ? summary : "",
      occurredAt:
        typeof occurredAt === "string"
          ? occurredAt
          : typeof activity.createdAt === "string"
            ? activity.createdAt
            : "",
    });
  }
  return entries;
}

const EMPTY_MANAGERS: ReadonlyArray<OrchestrationManager> = Object.freeze([]);

/**
 * Managers across every connected environment, newest name order left alone so
 * the server's ordering wins. Deleted managers never reach the shell.
 */
export function createEnvironmentManagerAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly snapshotAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<OrchestrationShellSnapshot | null>;
}) {
  const environmentManagersAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<OrchestrationManager> =>
        get(input.snapshotAtom(environmentId))?.managers ?? EMPTY_MANAGERS,
    ).pipe(Atom.withLabel(`environment-managers:${environmentId}`)),
  );

  let previous: ReadonlyArray<EnvironmentManager> = [];
  const managersAtom = Atom.make((get) => {
    const next: EnvironmentManager[] = [];
    for (const environmentId of get(input.catalogValueAtom).entries.keys()) {
      for (const manager of get(environmentManagersAtom(environmentId))) {
        next.push({ ...manager, environmentId });
      }
    }
    // Reference equality is impossible here because each entry is rebuilt, so
    // compare field-wise on the cheap identity fields instead.
    if (
      previous.length === next.length &&
      previous.every(
        (manager, index) =>
          manager.id === next[index]?.id &&
          manager.updatedAt === next[index]?.updatedAt &&
          manager.environmentId === next[index]?.environmentId,
      )
    ) {
      return previous;
    }
    previous = next;
    return next;
  }).pipe(Atom.withLabel("environment-managers"));

  const managerByIdAtom = Atom.family((managerId: ManagerId) =>
    Atom.make(
      (get): EnvironmentManager | null =>
        get(managersAtom).find((manager) => manager.id === managerId) ?? null,
    ).pipe(Atom.withLabel(`environment-manager:${managerId}`)),
  );

  return { environmentManagersAtom, managersAtom, managerByIdAtom };
}

/** Pure lookup, for callers holding a list rather than an atom. */
export function managerById(
  managers: ReadonlyArray<EnvironmentManager>,
  managerId: ManagerId | null,
): EnvironmentManager | null {
  if (managerId === null) return null;
  return managers.find((manager) => manager.id === managerId) ?? null;
}

export function createManagerEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { managerId: string } }) =>
      JSON.stringify([environmentId, input.managerId]),
  };
  return {
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:manager:create",
      execute: (input: CreateManagerInput) => createManager(input),
      scheduler,
      concurrency,
    }),
    update: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:manager:update",
      execute: (input: UpdateManagerInput) => updateManager(input),
      scheduler,
      concurrency,
    }),
    pause: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:manager:pause",
      execute: (input: PauseManagerInput) => pauseManager(input),
      scheduler,
      concurrency,
    }),
    cycleNow: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:manager:cycle-now",
      execute: (input: CycleNowManagerInput) => cycleNowManager(input),
      scheduler,
      concurrency,
    }),
    resume: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:manager:resume",
      execute: (input: ResumeManagerInput) => resumeManager(input),
      scheduler,
      concurrency,
    }),
    delete: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:manager:delete",
      execute: (input: DeleteManagerInput) => deleteManager(input),
      scheduler,
      concurrency,
    }),
  };
}

export { managerState, managerThreadOrigin };
export type { ManagerState, OrchestrationManager };
