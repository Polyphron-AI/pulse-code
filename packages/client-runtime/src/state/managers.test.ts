import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ManagerId,
  ThreadId,
  managerThreadOrigin,
  type OrchestrationManager,
  type OrchestrationShellSnapshot,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import { PrimaryConnectionTarget } from "../connection/model.ts";
import {
  createEnvironmentManagerAtoms,
  isManagerOwnThread,
  managerBadgeLabel,
  managerById,
  managerChildren,
  managerCycleEntries,
  managerCycleNowLabel,
  managerCycleNowState,
  managerForThread,
  managerPillAction,
  managerStateLabel,
  type EnvironmentManager,
} from "./managers.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const MANAGER_ID = ManagerId.make("manager-1");
const OTHER_MANAGER_ID = ManagerId.make("manager-2");
const MANAGER_THREAD_ID = ThreadId.make("thread-manager");

function manager(overrides: Partial<OrchestrationManager> = {}): OrchestrationManager {
  return {
    id: MANAGER_ID,
    name: "Nightly triage",
    scope: { kind: "environment", projectIds: [] },
    mission: "Keep the queue empty.",
    childModelSelection: null,
    childRuntimeMode: "auto-accept-edits",
    maxChildren: 8,
    intervalMinutes: 30,
    threadId: MANAGER_THREAD_ID,
    pausedAt: null,
    lastCycleAt: null,
    createdAt: "2026-09-11T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  } as OrchestrationManager;
}

describe("manager presentation", () => {
  it("names each state with the Argo pill copy", () => {
    expect(managerStateLabel(manager())).toBe("Watching");
    expect(managerStateLabel(manager({ pausedAt: "2026-09-11T01:00:00.000Z" }))).toBe("Paused");
    expect(managerStateLabel(manager({ mission: "   " }))).toBe("No mission");
  });

  it("makes the pill the pause toggle, and the way in when there is no mission", () => {
    expect(managerPillAction(manager())).toBe("pause");
    expect(managerPillAction(manager({ pausedAt: "2026-09-11T01:00:00.000Z" }))).toBe("resume");
    expect(managerPillAction(manager({ mission: "" }))).toBe("open");
  });

  it("offers a manual cycle only to a watching Argo with none already queued", () => {
    expect(managerCycleNowState(manager())).toBe("available");
    expect(managerCycleNowState(manager({ pausedAt: "2026-09-11T01:00:00.000Z" }))).toBe(
      "unavailable",
    );
    expect(managerCycleNowState(manager({ mission: "" }))).toBe("unavailable");
    expect(managerCycleNowLabel(manager())).toBe("Cycle now");
    expect(
      managerCycleNowLabel({ ...manager(), cycleRequestedAt: "2026-09-11T02:00:00.000Z" }),
    ).toBe("Cycle queued");
  });

  it("badges children with the product name", () => {
    expect(managerBadgeLabel(manager())).toBe("Argo: Nightly triage");
  });
});

describe("manager thread ownership", () => {
  const origin = managerThreadOrigin(MANAGER_ID);

  it("resolves the owning manager from both the manager thread and a child", () => {
    expect(managerForThread({ origin })).toBe(MANAGER_ID);
    expect(managerForThread({ origin: "schedule:abc" })).toBeNull();
    expect(managerForThread({ origin: null })).toBeNull();
    expect(managerForThread(null)).toBeNull();
  });

  it("separates the manager thread from its children", () => {
    const threads = [
      { id: MANAGER_THREAD_ID, origin, archivedAt: null },
      { id: ThreadId.make("child-1"), origin, archivedAt: null },
      { id: ThreadId.make("child-2"), origin, archivedAt: "2026-09-11T02:00:00.000Z" },
      {
        id: ThreadId.make("other"),
        origin: managerThreadOrigin(OTHER_MANAGER_ID),
        archivedAt: null,
      },
      { id: ThreadId.make("plain"), origin: null, archivedAt: null },
    ];

    expect(managerChildren(threads, MANAGER_ID, MANAGER_THREAD_ID).map((t) => t.id)).toEqual([
      "child-1",
    ]);
    expect(isManagerOwnThread(manager(), { id: MANAGER_THREAD_ID })).toBe(true);
    expect(isManagerOwnThread(manager(), { id: ThreadId.make("child-1") })).toBe(false);
    expect(isManagerOwnThread(manager({ threadId: null }), { id: MANAGER_THREAD_ID })).toBe(false);
  });
});

describe("manager cycle log", () => {
  it("keeps well-formed cycle rows and drops the rest", () => {
    const entries = managerCycleEntries([
      { kind: "message", payload: { kind: "spawned" } },
      {
        kind: "manager.cycle",
        payload: {
          kind: "spawned",
          threadId: "child-1",
          summary: "Started a worktree for #42",
          occurredAt: "2026-09-11T03:00:00.000Z",
        },
      },
      { kind: "manager.cycle", payload: { kind: "not-a-kind", summary: "x" } },
      { kind: "manager.cycle", payload: null },
      {
        kind: "manager.cycle",
        payload: { kind: "idle" },
        createdAt: "2026-09-11T04:00:00.000Z",
      },
    ]);

    expect(entries).toEqual([
      {
        kind: "spawned",
        threadId: "child-1",
        summary: "Started a worktree for #42",
        occurredAt: "2026-09-11T03:00:00.000Z",
      },
      { kind: "idle", threadId: null, summary: "", occurredAt: "2026-09-11T04:00:00.000Z" },
    ]);
  });
});

describe("manager atoms", () => {
  function harness(managers: ReadonlyArray<OrchestrationManager> | undefined) {
    const snapshot = { managers } as unknown as OrchestrationShellSnapshot;
    const catalogValueAtom = Atom.make({
      isReady: true,
      entries: new Map([
        [
          ENVIRONMENT_ID,
          {
            target: new PrimaryConnectionTarget({
              environmentId: ENVIRONMENT_ID,
              label: "Environment",
              httpBaseUrl: "https://example.test",
              wsBaseUrl: "wss://example.test",
            }),
            profile: Option.none(),
          },
        ],
      ]),
    });
    const snapshotAtom = Atom.family((_environmentId: EnvironmentId) => Atom.make(snapshot));
    return {
      registry: AtomRegistry.make(),
      atoms: createEnvironmentManagerAtoms({ catalogValueAtom, snapshotAtom }),
    };
  }

  it("scopes every manager to its environment", () => {
    const { registry, atoms } = harness([manager(), manager({ id: OTHER_MANAGER_ID })]);
    const managers = registry.get(atoms.managersAtom);

    expect(managers.map((entry) => entry.id)).toEqual([MANAGER_ID, OTHER_MANAGER_ID]);
    expect(managers.every((entry) => entry.environmentId === ENVIRONMENT_ID)).toBe(true);
    expect(registry.get(atoms.managerByIdAtom(OTHER_MANAGER_ID))?.id).toBe(OTHER_MANAGER_ID);
    expect(registry.get(atoms.managerByIdAtom(ManagerId.make("missing")))).toBeNull();
  });

  it("treats a snapshot from a pre-manager server as no managers", () => {
    const { registry, atoms } = harness(undefined);
    expect(registry.get(atoms.managersAtom)).toEqual([]);
  });

  it("looks a manager up out of a plain list", () => {
    const list = [{ ...manager(), environmentId: ENVIRONMENT_ID }] as EnvironmentManager[];
    expect(managerById(list, MANAGER_ID)?.name).toBe("Nightly triage");
    expect(managerById(list, OTHER_MANAGER_ID)).toBeNull();
    expect(managerById(list, null)).toBeNull();
  });
});
