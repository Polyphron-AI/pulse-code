// @effect-diagnostics nodeBuiltinImport:off
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ManagerId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  managerThreadOrigin,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Scope from "effect/Scope";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { deriveServerPaths, ServerConfig } from "../../config.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { ManagerReactorLive } from "./ManagerReactor.ts";
import { RuntimeReceiptBusTest } from "./RuntimeReceiptBus.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ManagerReactor } from "../Services/ManagerReactor.ts";
import { RuntimeReceiptBus } from "../Services/RuntimeReceiptBus.ts";

const managerId = ManagerId.make("manager-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("claude"), "sonnet");
const managerThreadId = ThreadId.make(`manager-thread:${managerId}`);
const now = "2026-01-01T00:00:00.000Z";

const deriveServerPathsSync = (baseDir: string, devUrl: URL | undefined) =>
  Effect.runSync(deriveServerPaths(baseDir, devUrl).pipe(Effect.provide(NodeServices.layer)));

describe("ManagerReactor", () => {
  let runtime: ManagedRuntime.ManagedRuntime<
    OrchestrationEngineService | ManagerReactor | RuntimeReceiptBus,
    unknown
  > | null = null;
  let scope: Scope.Closeable | null = null;
  const createdBaseDirs = new Set<string>();

  afterEach(async () => {
    if (scope) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    scope = null;
    if (runtime) {
      await runtime.dispose();
    }
    runtime = null;
    for (const baseDir of createdBaseDirs) {
      NodeFS.rmSync(baseDir, { recursive: true, force: true });
    }
    createdBaseDirs.clear();
  });

  async function createHarness(input: { readonly mission?: string; readonly paused?: boolean }) {
    const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-manager-"));
    createdBaseDirs.add(baseDir);
    deriveServerPathsSync(baseDir, undefined);

    const orchestrationLayer = OrchestrationEngineLive.pipe(
      Layer.provide(OrchestrationProjectionSnapshotQueryLive),
      Layer.provide(ThreadBackgroundLiveness.layer),
      Layer.provide(ThreadPlanProgress.layer),
      Layer.provide(OrchestrationProjectionPipelineLive),
      Layer.provide(OrchestrationEventStoreLive),
      Layer.provide(OrchestrationCommandReceiptRepositoryLive),
      Layer.provide(RepositoryIdentityResolver.layer),
      Layer.provide(SqlitePersistenceMemory),
    );

    const layer = ManagerReactorLive.pipe(
      Layer.provideMerge(orchestrationLayer),
      Layer.provideMerge(RuntimeReceiptBusTest),
      Layer.provideMerge(ServerSettingsService.layerTest()),
      Layer.provideMerge(ServerConfig.layerTest(process.cwd(), baseDir)),
      Layer.provideMerge(NodeServices.layer),
    );

    runtime = ManagedRuntime.make(layer);

    const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
    const reactor = await runtime.runPromise(Effect.service(ManagerReactor));

    await Effect.runPromise(
      engine.dispatch({
        type: "manager.create",
        commandId: CommandId.make("cmd-manager-create"),
        managerId,
        name: "Release Argo",
        scope: { _tag: "environment", projectIds: [] },
        mission: input.mission ?? "Keep the release green.",
        intervalMinutes: 30,
        createdAt: now,
      }),
    );
    if (input.paused === true) {
      await Effect.runPromise(
        engine.dispatch({
          type: "manager.pause",
          commandId: CommandId.make("cmd-manager-pause"),
          managerId,
        }),
      );
    }

    scope = await Effect.runPromise(Scope.make("sequential"));

    return {
      engine,
      sweep: () => runtime!.runPromise(reactor.sweepNow),
      readModel: () => Effect.runPromise(engine.currentReadModel),
    };
  }

  it("creates the system project, the manager thread, and starts one cycle", async () => {
    const harness = await createHarness({});

    await harness.sweep();

    const model = await harness.readModel();
    const systemProjects = model.projects.filter((project) => project.system === true);
    expect(systemProjects).toHaveLength(1);

    const thread = model.threads.find((candidate) => candidate.id === managerThreadId);
    expect(thread?.projectId).toBe(systemProjects[0]?.id);
    expect(thread?.title).toBe("Release Argo");
    expect(thread?.origin).toBe(managerThreadOrigin(managerId));

    const manager = (model.managers ?? []).find((entry) => entry.id === managerId);
    expect(manager?.threadId).toBe(managerThreadId);
    expect(manager?.lastCycleAt).toEqual(expect.any(String));

    const cyclePrompt = thread?.messages[0];
    expect(cyclePrompt?.authoredBy).toBe("schedule");
    expect(cyclePrompt?.text).toContain("Keep the release green.");
    expect(cyclePrompt?.text).toContain("No live children.");
  });

  it("does nothing on a second sweep inside the interval", async () => {
    const harness = await createHarness({});

    await harness.sweep();
    const firstCycleAt = (await harness.readModel()).managers?.find(
      (entry) => entry.id === managerId,
    )?.lastCycleAt;

    await harness.sweep();

    const model = await harness.readModel();
    const thread = model.threads.find((candidate) => candidate.id === managerThreadId);
    expect(thread?.messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(model.managers?.find((entry) => entry.id === managerId)?.lastCycleAt).toBe(firstCycleAt);
  });

  it("binds the thread but runs no cycle for a paused manager", async () => {
    const harness = await createHarness({ paused: true });

    await harness.sweep();

    const model = await harness.readModel();
    const thread = model.threads.find((candidate) => candidate.id === managerThreadId);
    expect(thread?.messages).toHaveLength(0);
    expect(model.managers?.find((entry) => entry.id === managerId)?.threadId).toBe(managerThreadId);
    expect(model.managers?.find((entry) => entry.id === managerId)?.lastCycleAt).toBeNull();
  });

  it("binds the thread but runs no cycle for a manager with no mission", async () => {
    const harness = await createHarness({ mission: "   " });

    await harness.sweep();

    const model = await harness.readModel();
    const manager = model.managers?.find((entry) => entry.id === managerId);
    expect(manager?.threadId).toBe(managerThreadId);
    expect(manager?.lastCycleAt).toBeNull();

    const thread = model.threads.find((candidate) => candidate.id === managerThreadId);
    expect(thread?.origin).toBe(managerThreadOrigin(managerId));
    expect(thread?.messages).toHaveLength(0);
    expect(thread?.latestTurn ?? null).toBeNull();

    // The bind is a one-shot: a second sweep must not re-create the thread.
    await harness.sweep();
    expect((await harness.readModel()).threads).toHaveLength(1);
  });

  it("cycles again inside the interval once a cycle is requested", async () => {
    const harness = await createHarness({});

    await harness.sweep();
    const firstCycleAt = (await harness.readModel()).managers?.find(
      (entry) => entry.id === managerId,
    )?.lastCycleAt;

    await Effect.runPromise(
      harness.engine.dispatch({
        type: "manager.cycle-now",
        commandId: CommandId.make("cmd-manager-cycle-now"),
        managerId,
      }),
    );
    expect(
      (await harness.readModel()).managers?.find((entry) => entry.id === managerId)
        ?.cycleRequestedAt,
    ).toEqual(expect.any(String));

    await harness.sweep();

    const model = await harness.readModel();
    const manager = model.managers?.find((entry) => entry.id === managerId);
    // Recording the cycle clears the request so it fires exactly once.
    expect(manager?.cycleRequestedAt).toBeNull();
    expect(manager?.lastCycleAt).not.toBe(firstCycleAt);
    const thread = model.threads.find((candidate) => candidate.id === managerThreadId);
    expect(thread?.messages.filter((message) => message.role === "user")).toHaveLength(2);
  });

  it("rebinds a fresh thread when the user deletes the Argo thread", async () => {
    const harness = await createHarness({});

    await harness.sweep();
    await Effect.runPromise(
      harness.engine.dispatch({
        type: "thread.delete",
        commandId: CommandId.make("cmd-manager-thread-delete"),
        threadId: managerThreadId,
      }),
    );

    // `thread.create` refuses an id any row holds, deleted rows included, so
    // reusing the deterministic id here would wedge the manager forever.
    await harness.sweep();

    const model = await harness.readModel();
    const manager = model.managers?.find((entry) => entry.id === managerId);
    expect(manager?.threadId).not.toBe(managerThreadId);
    const rebound = model.threads.find((candidate) => candidate.id === manager?.threadId);
    expect(rebound?.deletedAt).toBeNull();
    expect(rebound?.origin).toBe(managerThreadOrigin(managerId));
  });

  it("keeps the system project when a project already exists", async () => {
    const harness = await createHarness({});
    await Effect.runPromise(
      harness.engine.dispatch({
        type: "project.create",
        commandId: CommandId.make("cmd-project-create"),
        projectId: ProjectId.make("project-1"),
        title: "User Project",
        workspaceRoot: "/tmp/manager-user-project",
        defaultModelSelection: modelSelection,
        createdAt: now,
      }),
    );

    await harness.sweep();
    await harness.sweep();

    const model = await harness.readModel();
    expect(model.projects.filter((project) => project.system === true)).toHaveLength(1);
  });
  it("shows a child's token spend in the cycle table", async () => {
    const harness = await createHarness({});
    const childThreadId = ThreadId.make("manager-child-1");

    await Effect.runPromise(
      harness.engine.dispatch({
        type: "project.create",
        commandId: CommandId.make("cmd-project-create-child"),
        projectId: ProjectId.make("project-1"),
        title: "User Project",
        workspaceRoot: "/tmp/manager-user-project",
        defaultModelSelection: modelSelection,
        createdAt: now,
      }),
    );
    await Effect.runPromise(
      harness.engine.dispatch({
        type: "thread.create",
        commandId: CommandId.make("cmd-child-thread-create"),
        threadId: childThreadId,
        projectId: ProjectId.make("project-1"),
        title: "Child work",
        modelSelection,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: "argo/release-argo/child",
        worktreePath: "/tmp/manager-user-project-worktree",
        origin: managerThreadOrigin(managerId),
        createdAt: now,
      }),
    );
    // Two ticks: the newest context-window activity is the one that counts.
    for (const [index, usedTokens] of [4_096, 12_345].entries()) {
      await Effect.runPromise(
        harness.engine.dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make(`cmd-child-usage-${index}`),
          threadId: childThreadId,
          activity: {
            id: EventId.make(`child-usage-${index}`),
            tone: "info",
            kind: "context-window.updated",
            summary: "Context window updated",
            payload: { usedTokens, maxTokens: 200_000 },
            turnId: null,
            createdAt: now,
          },
          createdAt: now,
        }),
      );
    }

    await harness.sweep();

    const model = await harness.readModel();
    const thread = model.threads.find((candidate) => candidate.id === managerThreadId);
    const cyclePrompt = thread?.messages[0]?.text ?? "";
    expect(cyclePrompt).toContain("Tokens");
    expect(cyclePrompt).toContain("12345");
  });

  it("drops the tokens column when no child has reported usage", async () => {
    const harness = await createHarness({});
    const childThreadId = ThreadId.make("manager-child-2");

    await Effect.runPromise(
      harness.engine.dispatch({
        type: "project.create",
        commandId: CommandId.make("cmd-project-create-child-2"),
        projectId: ProjectId.make("project-1"),
        title: "User Project",
        workspaceRoot: "/tmp/manager-user-project",
        defaultModelSelection: modelSelection,
        createdAt: now,
      }),
    );
    await Effect.runPromise(
      harness.engine.dispatch({
        type: "thread.create",
        commandId: CommandId.make("cmd-child-thread-create-2"),
        threadId: childThreadId,
        projectId: ProjectId.make("project-1"),
        title: "Child work",
        modelSelection,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        origin: managerThreadOrigin(managerId),
        createdAt: now,
      }),
    );

    await harness.sweep();

    const model = await harness.readModel();
    const thread = model.threads.find((candidate) => candidate.id === managerThreadId);
    expect(thread?.messages[0]?.text ?? "").not.toContain("Tokens");
  });
});
