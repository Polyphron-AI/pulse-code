import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  ManagerId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  managerThreadOrigin,
  type OrchestrationCommand,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent, systemProject } from "./projector.ts";

const now = "2026-01-01T00:00:00.000Z";
const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const managerId = ManagerId.make("manager-1");
const childA = ThreadId.make("thread-manager-a");
const childB = ThreadId.make("thread-manager-b");
const ownThread = ThreadId.make("thread-manager-own");

const cmd = (value: string) => CommandId.make(value);

/** Decide a command and fold its events into the read model. */
const decideAndApply = Effect.fn("decideAndApply")(function* (
  readModel: OrchestrationReadModel,
  command: OrchestrationCommand,
) {
  const decided = yield* decideOrchestrationCommand({ command, readModel });
  const events = Array.isArray(decided) ? decided : [decided];
  let model = readModel;
  let sequence = readModel.snapshotSequence;
  for (const event of events) {
    sequence += 1;
    model = yield* projectEvent(model, { ...event, sequence });
  }
  return model;
});

const seedProjects = Effect.fn("seedProjects")(function* () {
  let model = createEmptyReadModel(now);
  for (const projectId of [projectA, projectB]) {
    model = yield* decideAndApply(model, {
      type: "project.create",
      commandId: cmd(`cmd-create-${projectId}`),
      projectId,
      title: `Project ${projectId}`,
      workspaceRoot: `/tmp/${projectId}`,
      createdAt: now,
    });
  }
  return model;
});

const createManagerCommand = {
  type: "manager.create",
  commandId: cmd("cmd-manager-create"),
  managerId,
  name: "Argo",
  scope: { _tag: "project", projectId: projectA },
  mission: "Keep the build green.",
  createdAt: now,
} satisfies OrchestrationCommand;

const seedManager = Effect.fn("seedManager")(function* (
  overrides?: Partial<Extract<OrchestrationCommand, { type: "manager.create" }>>,
) {
  const model = yield* seedProjects();
  return yield* decideAndApply(model, { ...createManagerCommand, ...overrides });
});

const childThread = (threadId: ThreadId, suffix: string) =>
  ({
    type: "thread.create",
    commandId: cmd(`cmd-thread-${suffix}`),
    threadId,
    projectId: projectA,
    title: `Child ${suffix}`,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" },
    runtimeMode: "auto-accept-edits",
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: null,
    worktreePath: null,
    origin: managerThreadOrigin(managerId),
    createdAt: now,
  }) satisfies OrchestrationCommand;

it.layer(NodeServices.layer)("decider managers", (it) => {
  it.effect("creates a manager with defaults and materializes it in the read model", () =>
    Effect.gen(function* () {
      const model = yield* seedManager();
      expect(model.managers?.find((entry) => entry.id === managerId)).toMatchObject({
        id: managerId,
        name: "Argo",
        scope: { _tag: "project", projectId: projectA },
        mission: "Keep the build green.",
        childModelSelection: null,
        childRuntimeMode: "auto-accept-edits",
        maxChildren: 8,
        intervalMinutes: 30,
        threadId: null,
        pausedAt: null,
        lastCycleAt: null,
        deletedAt: null,
      });
    }),
  );

  it.effect("rejects a duplicate manager id", () =>
    Effect.gen(function* () {
      const seeded = yield* seedManager();
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { ...createManagerCommand, commandId: cmd("cmd-dupe") },
          readModel: seeded,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("rejects a manager scoped to a project that does not exist", () =>
    Effect.gen(function* () {
      const model = yield* seedProjects();
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            ...createManagerCommand,
            scope: { _tag: "project", projectId: ProjectId.make("project-missing") },
          },
          readModel: model,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("updates the editable fields and leaves the rest alone", () =>
    Effect.gen(function* () {
      const seeded = yield* seedManager();
      const updated = yield* decideAndApply(seeded, {
        type: "manager.update",
        commandId: cmd("cmd-manager-update"),
        managerId,
        mission: "Ship the roadmap.",
        maxChildren: 4,
        intervalMinutes: 60,
        scope: { _tag: "environment", projectIds: [projectB] },
      });
      expect(updated.managers?.find((entry) => entry.id === managerId)).toMatchObject({
        name: "Argo",
        mission: "Ship the roadmap.",
        maxChildren: 4,
        intervalMinutes: 60,
        scope: { _tag: "environment", projectIds: [projectB] },
      });
    }),
  );

  it.effect("rejects an empty name on update", () =>
    Effect.gen(function* () {
      const seeded = yield* seedManager();
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "manager.update",
            commandId: cmd("cmd-manager-blank"),
            managerId,
            name: "   " as never,
          },
          readModel: seeded,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("pauses and resumes, and refuses redundant transitions", () =>
    Effect.gen(function* () {
      const seeded = yield* seedManager();
      const paused = yield* decideAndApply(seeded, {
        type: "manager.pause",
        commandId: cmd("cmd-manager-pause"),
        managerId,
      });
      expect(paused.managers?.[0]?.pausedAt).not.toBeNull();

      const pauseAgain = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { type: "manager.pause", commandId: cmd("cmd-pause-2"), managerId },
          readModel: paused,
        }),
      );
      expect(pauseAgain._tag).toBe("OrchestrationCommandInvariantError");

      const resumed = yield* decideAndApply(paused, {
        type: "manager.resume",
        commandId: cmd("cmd-manager-resume"),
        managerId,
      });
      expect(resumed.managers?.[0]?.pausedAt).toBeNull();

      const resumeAgain = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { type: "manager.resume", commandId: cmd("cmd-resume-2"), managerId },
          readModel: resumed,
        }),
      );
      expect(resumeAgain._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("binds its own thread and records a cycle", () =>
    Effect.gen(function* () {
      const seeded = yield* seedManager();
      const withThread = yield* decideAndApply(seeded, childThread(ownThread, "own"));
      const bound = yield* decideAndApply(withThread, {
        type: "manager.thread.bind",
        commandId: cmd("cmd-manager-bind"),
        managerId,
        threadId: ownThread,
      });
      expect(bound.managers?.[0]?.threadId).toBe(ownThread);

      const cycled = yield* decideAndApply(bound, {
        type: "manager.cycle.record",
        commandId: cmd("cmd-manager-cycle"),
        managerId,
        occurredAt: "2026-01-02T03:04:05.000Z",
      });
      expect(cycled.managers?.[0]?.lastCycleAt).toBe("2026-01-02T03:04:05.000Z");
    }),
  );

  it.effect("cycle-now records a request that the next recorded cycle clears", () =>
    Effect.gen(function* () {
      const seeded = yield* seedManager();
      const requested = yield* decideAndApply(seeded, {
        type: "manager.cycle-now",
        commandId: cmd("cmd-manager-cycle-now"),
        managerId,
      });
      expect(requested.managers?.[0]?.cycleRequestedAt).toEqual(expect.any(String));

      const cycled = yield* decideAndApply(requested, {
        type: "manager.cycle.record",
        commandId: cmd("cmd-manager-cycle-after-request"),
        managerId,
        occurredAt: "2026-01-02T03:04:05.000Z",
      });
      expect(cycled.managers?.[0]?.cycleRequestedAt).toBeNull();
    }),
  );

  it.effect("cycle-now is refused for a deleted manager", () =>
    Effect.gen(function* () {
      const seeded = yield* seedManager();
      const deleted = yield* decideAndApply(seeded, {
        type: "manager.delete",
        commandId: cmd("cmd-manager-delete-before-cycle-now"),
        managerId,
        keepChildren: true,
      });
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { type: "manager.cycle-now", commandId: cmd("cmd-cycle-now-late"), managerId },
          readModel: deleted,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("delete with keepChildren leaves the children live", () =>
    Effect.gen(function* () {
      let model = yield* seedManager();
      model = yield* decideAndApply(model, childThread(childA, "a"));
      model = yield* decideAndApply(model, childThread(childB, "b"));
      const deleted = yield* decideAndApply(model, {
        type: "manager.delete",
        commandId: cmd("cmd-manager-delete-keep"),
        managerId,
        keepChildren: true,
      });
      expect(deleted.managers?.[0]?.deletedAt).not.toBeNull();
      for (const threadId of [childA, childB]) {
        const thread = deleted.threads.find((entry) => entry.id === threadId);
        expect(thread?.archivedAt).toBeNull();
        expect(thread?.origin).toBe(`manager:${managerId}`);
      }
    }),
  );

  it.effect("delete without keepChildren archives every live child thread", () =>
    Effect.gen(function* () {
      let model = yield* seedManager();
      model = yield* decideAndApply(model, childThread(childA, "a"));
      model = yield* decideAndApply(model, childThread(childB, "b"));
      const deleted = yield* decideAndApply(model, {
        type: "manager.delete",
        commandId: cmd("cmd-manager-delete"),
        managerId,
        keepChildren: false,
      });
      expect(deleted.managers?.[0]?.deletedAt).not.toBeNull();
      for (const threadId of [childA, childB]) {
        expect(deleted.threads.find((entry) => entry.id === threadId)?.archivedAt).not.toBeNull();
      }
    }),
  );

  it.effect("delete archives the manager's own thread even with keepChildren", () =>
    Effect.gen(function* () {
      let model = yield* seedManager();
      model = yield* decideAndApply(model, childThread(ownThread, "own-delete"));
      model = yield* decideAndApply(model, {
        type: "manager.thread.bind",
        commandId: cmd("cmd-manager-bind-delete"),
        managerId,
        threadId: ownThread,
      });
      model = yield* decideAndApply(model, childThread(childA, "a-keep"));

      const deleted = yield* decideAndApply(model, {
        type: "manager.delete",
        commandId: cmd("cmd-manager-delete-own-thread"),
        managerId,
        keepChildren: true,
      });

      // The Argo thread is the deleted record's control surface and lives in
      // the hidden system project, so nothing left in the UI could archive it.
      expect(deleted.threads.find((entry) => entry.id === ownThread)?.archivedAt).not.toBeNull();
      expect(deleted.threads.find((entry) => entry.id === childA)?.archivedAt).toBeNull();
    }),
  );

  it.effect("blocks commands against a deleted manager", () =>
    Effect.gen(function* () {
      const seeded = yield* seedManager();
      const deleted = yield* decideAndApply(seeded, {
        type: "manager.delete",
        commandId: cmd("cmd-manager-delete-late"),
        managerId,
        keepChildren: true,
      });
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { type: "manager.pause", commandId: cmd("cmd-pause-late"), managerId },
          readModel: deleted,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );
});

it.layer(NodeServices.layer)("decider system project", (it) => {
  const ensure = (commandId: string) =>
    ({
      type: "project.ensure-system",
      commandId: cmd(commandId),
      projectId: ProjectId.make("project-system"),
      title: "Pulse",
      workspaceRoot: "/home/pulse",
      createdAt: now,
    }) satisfies OrchestrationCommand;

  it.effect("creates exactly one system project however often it is dispatched", () =>
    Effect.gen(function* () {
      const seeded = yield* seedProjects();
      const first = yield* decideAndApply(seeded, ensure("cmd-ensure-1"));
      const second = yield* decideAndApply(first, ensure("cmd-ensure-2"));
      const third = yield* decideAndApply(second, ensure("cmd-ensure-3"));

      const systemProjects = third.projects.filter((project) => project.system === true);
      expect(systemProjects).toHaveLength(1);
      expect(systemProject(third)).toMatchObject({
        title: "Pulse",
        workspaceRoot: "/home/pulse",
        system: true,
      });
      // The user's own projects are untouched and stay non-system.
      expect(third.projects.filter((project) => project.system !== true)).toHaveLength(2);
    }),
  );
});
