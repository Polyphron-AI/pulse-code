// @effect-diagnostics nodeBuiltinImport:off
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EnvironmentId,
  ManagerId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  managerThreadOrigin,
  type ManagerMaxChildren,
  type ModelSelection,
  type RuntimeMode,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";

import { deriveServerPaths, ServerConfig } from "../../../config.ts";
import * as GitManager from "../../../git/GitManager.ts";
import * as GitWorkflowService from "../../../git/GitWorkflowService.ts";
import * as GitVcsDriver from "../../../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../../../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../../../vcs/VcsProcess.ts";
import { OrchestrationEventStoreLive } from "../../../persistence/Layers/OrchestrationEventStore.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { SqlitePersistenceMemory } from "../../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../../project/RepositoryIdentityResolver.ts";
import { OrchestrationEngineLive } from "../../../orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "../../../orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "../../../orchestration/Layers/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import * as ThreadBackgroundLiveness from "../../../orchestration/ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../../../orchestration/ThreadPlanProgress.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { managerBranchSlug, managerChildBranch, managerToolHandlers } from "./handlers.ts";

const managerId = ManagerId.make("manager-1");
const managerThreadId = ThreadId.make("manager-thread-1");
const childThreadId = ThreadId.make("child-thread-1");
const outsiderThreadId = ThreadId.make("outsider-thread-1");
const projectId = ProjectId.make("project-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("claude"), "sonnet");
const now = "2026-01-01T00:00:00.000Z";

const invocationFor = (threadId: ThreadId): McpInvocationContext.McpInvocationScope => ({
  environmentId: EnvironmentId.make("environment-1"),
  threadId,
  providerSessionId: "session-1",
  providerInstanceId: ProviderInstanceId.make("claude"),
  capabilities: new Set<McpInvocationContext.McpCapability>(),
  issuedAt: 0,
});

/**
 * GitManager only enters this flow through `localStatus`, and that reads the
 * same details the driver already exposes, so the test wires the one method
 * straight to the real driver instead of standing up the whole manager stack.
 */
const gitManagerFromDriver = Layer.effect(
  GitManager.GitManager,
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    return {
      localStatus: (input: { readonly cwd: string }) =>
        driver.statusDetailsLocal(input.cwd).pipe(
          Effect.map((details) => ({
            isRepo: details.isRepo,
            hasPrimaryRemote: details.hasOriginRemote,
            isDefaultRef: details.isDefaultBranch,
            refName: details.branch,
            hasWorkingTreeChanges: details.hasWorkingTreeChanges,
            workingTree: details.workingTree,
          })),
        ),
    } as unknown as GitManager.GitManager["Service"];
  }),
);

/** Real git: real worktrees on a real temporary repository. */
const realGitWorkflowLayer = GitWorkflowService.layer.pipe(
  Layer.provide(gitManagerFromDriver),
  Layer.provide(VcsDriverRegistry.layer),
  Layer.provideMerge(GitVcsDriver.layer),
  Layer.provideMerge(VcsProcess.layer),
);

/** A temporary repository with one commit, cleaned up with its base dir. */
function initTempRepo(root: string): void {
  const run = (args: ReadonlyArray<string>) =>
    NodeChildProcess.execFileSync("git", [...args], { cwd: root, stdio: "pipe" });
  run(["init", "--initial-branch=main"]);
  run(["config", "user.email", "test@test.com"]);
  run(["config", "user.name", "Test"]);
  run(["config", "commit.gpgsign", "false"]);
  NodeFS.writeFileSync(NodePath.join(root, "README.md"), "# manager spawn test\n");
  run(["add", "."]);
  run(["commit", "-m", "initial commit"]);
}

const deriveServerPathsSync = (baseDir: string) =>
  Effect.runSync(deriveServerPaths(baseDir, undefined).pipe(Effect.provide(NodeServices.layer)));

describe("manager toolkit handlers", () => {
  let runtime: ManagedRuntime.ManagedRuntime<
    OrchestrationEngineService | GitWorkflowService.GitWorkflowService,
    unknown
  > | null = null;
  const createdBaseDirs = new Set<string>();

  afterEach(async () => {
    if (runtime) {
      await runtime.dispose();
    }
    runtime = null;
    for (const baseDir of createdBaseDirs) {
      NodeFS.rmSync(baseDir, { recursive: true, force: true });
    }
    createdBaseDirs.clear();
  });

  async function createHarness(options?: {
    /** Real git stack over a real temporary repository, for spawn tests. */
    readonly workspaceRoot?: string;
    readonly maxChildren?: ManagerMaxChildren;
    readonly childRuntimeMode?: RuntimeMode;
    readonly childModelSelection?: ModelSelection;
  }) {
    const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-manager-mcp-"));
    createdBaseDirs.add(baseDir);
    deriveServerPathsSync(baseDir);

    const layer = OrchestrationEngineLive.pipe(
      Layer.provide(OrchestrationProjectionSnapshotQueryLive),
      Layer.provide(ThreadBackgroundLiveness.layer),
      Layer.provide(ThreadPlanProgress.layer),
      Layer.provide(OrchestrationProjectionPipelineLive),
      Layer.provide(OrchestrationEventStoreLive),
      Layer.provide(OrchestrationCommandReceiptRepositoryLive),
      Layer.provide(RepositoryIdentityResolver.layer),
      Layer.provide(SqlitePersistenceMemory),
      Layer.provideMerge(
        options?.workspaceRoot === undefined
          ? Layer.mock(GitWorkflowService.GitWorkflowService, {})
          : realGitWorkflowLayer,
      ),
      Layer.provideMerge(ServerConfig.layerTest(process.cwd(), baseDir)),
      Layer.provideMerge(NodeServices.layer),
    );
    runtime = ManagedRuntime.make(layer);

    const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
    const dispatch = (command: Parameters<typeof engine.dispatch>[0]) =>
      Effect.runPromise(engine.dispatch(command));

    await dispatch({
      type: "project.create",
      commandId: CommandId.make("cmd-project-create"),
      projectId,
      title: "Manager Project",
      workspaceRoot: options?.workspaceRoot ?? "/tmp/manager-project",
      defaultModelSelection: modelSelection,
      createdAt: now,
    });
    await dispatch({
      type: "manager.create",
      commandId: CommandId.make("cmd-manager-create"),
      managerId,
      name: "Release Argo",
      scope: { _tag: "environment", projectIds: [] },
      mission: "Keep the release green.",
      ...(options?.maxChildren === undefined ? {} : { maxChildren: options.maxChildren }),
      ...(options?.childRuntimeMode === undefined
        ? {}
        : { childRuntimeMode: options.childRuntimeMode }),
      ...(options?.childModelSelection === undefined
        ? {}
        : { childModelSelection: options.childModelSelection }),
      createdAt: now,
    });
    for (const [threadId, title, origin] of [
      [managerThreadId, "Release Argo", managerThreadOrigin(managerId)],
      [childThreadId, "Child work", managerThreadOrigin(managerId)],
      [outsiderThreadId, "Plain thread", undefined],
    ] as const) {
      await dispatch({
        type: "thread.create",
        commandId: CommandId.make(`cmd-thread-create-${threadId}`),
        threadId,
        projectId,
        title,
        modelSelection,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        ...(origin === undefined ? {} : { origin }),
        createdAt: now,
      });
    }
    await dispatch({
      type: "manager.thread.bind",
      commandId: CommandId.make("cmd-manager-bind"),
      managerId,
      threadId: managerThreadId,
    });

    const call = <A, E>(
      effect: Effect.Effect<A, E, never>,
      threadId: ThreadId,
    ): Promise<Exit.Exit<A, E>> =>
      runtime!.runPromise(
        (effect as Effect.Effect<A, E, McpInvocationContext.McpInvocationContext>).pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocationFor(threadId)),
          Effect.exit,
        ) as Effect.Effect<Exit.Exit<A, E>, never, never>,
      );

    return {
      dispatch,
      readModel: () => Effect.runPromise(engine.currentReadModel),
      call,
    };
  }

  it("refuses every tool from a thread with no manager origin", async () => {
    const harness = await createHarness();

    const exit = await harness.call(
      managerToolHandlers.manager_list_children() as never,
      outsiderThreadId,
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain("not-a-manager-thread");
  });

  it("refuses a managed child that tries to drive the fleet", async () => {
    const harness = await createHarness();

    const exit = await harness.call(
      managerToolHandlers.manager_list_children() as never,
      childThreadId,
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain("not-a-manager-thread");
  });

  it("lists the manager's live children without its own thread", async () => {
    const harness = await createHarness();

    const exit = await harness.call(
      managerToolHandlers.manager_list_children() as never,
      managerThreadId,
    );

    expect(exit).toStrictEqual(
      Exit.succeed({
        managerId,
        maxChildren: 8,
        children: [
          {
            threadId: childThreadId,
            title: "Child work",
            projectId,
            projectTitle: "Manager Project",
            branch: null,
            worktreePath: null,
            status: "idle",
            lastActivityAt: now,
          },
        ],
      }),
    );
  });

  it("messages its own child and refuses an unrelated thread", async () => {
    const harness = await createHarness();

    const refused = await harness.call(
      managerToolHandlers.manager_message_child({
        threadId: outsiderThreadId,
        prompt: "Do the thing",
      }) as never,
      managerThreadId,
    );
    expect(Exit.isFailure(refused)).toBe(true);
    expect(String(refused)).toContain("not-your-child");

    const accepted = await harness.call(
      managerToolHandlers.manager_message_child({
        threadId: childThreadId,
        prompt: "Do the thing",
      }) as never,
      managerThreadId,
    );
    expect(Exit.isSuccess(accepted)).toBe(true);

    const model = await harness.readModel();
    const child = model.threads.find((thread) => thread.id === childThreadId);
    const message = child?.messages.find((entry) => entry.role === "user");
    expect(message?.text).toBe("Do the thing");
    expect(message?.authoredBy).toBe("manager");
  });

  it("archives a child it stops", async () => {
    const harness = await createHarness();

    const exit = await harness.call(
      managerToolHandlers.manager_stop_child({ threadId: childThreadId }) as never,
      managerThreadId,
    );
    expect(Exit.isSuccess(exit)).toBe(true);

    const model = await harness.readModel();
    const child = model.threads.find((thread) => thread.id === childThreadId);
    expect(child?.archivedAt).toEqual(expect.any(String));
  });

  it("appends one manager.cycle activity to the manager thread", async () => {
    const harness = await createHarness();

    const exit = await harness.call(
      managerToolHandlers.manager_log({
        kind: "progressed",
        threadId: childThreadId,
        summary: "Child moved the release forward.",
      }) as never,
      managerThreadId,
    );
    expect(Exit.isSuccess(exit)).toBe(true);

    const model = await harness.readModel();
    const managerThread = model.threads.find((thread) => thread.id === managerThreadId);
    const activity = managerThread?.activities.find((entry) => entry.kind === "manager.cycle");
    expect(activity?.tone).toBe("info");
    expect(activity?.summary).toBe("Child moved the release forward.");
    expect(activity?.payload).toMatchObject({
      kind: "progressed",
      threadId: childThreadId,
      summary: "Child moved the release forward.",
    });
  });
  it("spawns a child in a real worktree on a new branch", async () => {
    const repoRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-manager-repo-"));
    createdBaseDirs.add(repoRoot);
    initTempRepo(repoRoot);

    const childModelSelection = createModelSelection(
      ProviderInstanceId.make("codex"),
      "gpt-5.3-codex",
    );
    const harness = await createHarness({
      workspaceRoot: repoRoot,
      maxChildren: 2,
      childRuntimeMode: "full-access",
      childModelSelection,
    });

    const exit = await harness.call(
      managerToolHandlers.manager_spawn_child({
        title: "Fix the CI",
        prompt: "Get the pipeline green.",
        projectId,
      }) as never,
      managerThreadId,
    );

    if (!Exit.isSuccess(exit)) {
      throw new Error(`manager_spawn_child failed: ${String(exit)}`);
    }
    const spawned = exit.value as unknown as {
      readonly threadId: ThreadId;
      readonly branch: string | null;
      readonly worktreePath: string;
    };

    expect(spawned.branch).toMatch(/^argo\/release-argo\/fix-the-ci-[0-9a-f]{8}$/);
    expect(NodeFS.existsSync(spawned.worktreePath)).toBe(true);
    const checkedOut = NodeChildProcess.execFileSync("git", ["branch", "--show-current"], {
      cwd: spawned.worktreePath,
      encoding: "utf8",
    }).trim();
    expect(checkedOut).toBe(spawned.branch);

    const model = await harness.readModel();
    const child = model.threads.find((thread) => thread.id === spawned.threadId);
    expect(child?.projectId).toBe(projectId);
    expect(child?.origin).toBe(managerThreadOrigin(managerId));
    expect(child?.title).toBe("Fix the CI");
    expect(child?.runtimeMode).toBe("full-access");
    expect(child?.modelSelection).toStrictEqual(childModelSelection);
    expect(child?.branch).toBe(spawned.branch);
    expect(child?.worktreePath).toBe(spawned.worktreePath);

    const first = child?.messages.find((entry) => entry.role === "user");
    expect(first?.text).toBe("Get the pipeline green.");
    // No provider reactor runs in this harness, so the turn is requested but
    // never started; the recorded first message is the proof it was asked for.
    expect(first?.authoredBy).toBe("manager");
  });

  it("refuses to spawn past maxChildren", async () => {
    const repoRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-manager-repo-"));
    createdBaseDirs.add(repoRoot);
    initTempRepo(repoRoot);

    // The harness already seeds one live child, so a cap of two leaves room
    // for exactly one spawn.
    const harness = await createHarness({ workspaceRoot: repoRoot, maxChildren: 2 });

    const accepted = await harness.call(
      managerToolHandlers.manager_spawn_child({
        title: "First",
        prompt: "Do the first thing.",
        projectId,
      }) as never,
      managerThreadId,
    );
    expect(Exit.isSuccess(accepted)).toBe(true);

    const refused = await harness.call(
      managerToolHandlers.manager_spawn_child({
        title: "Second",
        prompt: "Do the second thing.",
        projectId,
      }) as never,
      managerThreadId,
    );
    expect(Exit.isFailure(refused)).toBe(true);
    expect(String(refused)).toContain("child-limit-reached");
  });

  it("holds maxChildren under two concurrent spawns", async () => {
    const repoRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-manager-repo-"));
    createdBaseDirs.add(repoRoot);
    initTempRepo(repoRoot);

    // One seeded child plus a cap of two leaves room for exactly one spawn,
    // so two parallel tool calls must not both find that room.
    const harness = await createHarness({ workspaceRoot: repoRoot, maxChildren: 2 });

    const exits = await Promise.all([
      harness.call(
        managerToolHandlers.manager_spawn_child({
          title: "First",
          prompt: "Do the first thing.",
          projectId,
        }) as never,
        managerThreadId,
      ),
      harness.call(
        managerToolHandlers.manager_spawn_child({
          title: "Second",
          prompt: "Do the second thing.",
          projectId,
        }) as never,
        managerThreadId,
      ),
    ]);

    expect(exits.filter(Exit.isSuccess)).toHaveLength(1);
    expect(exits.filter(Exit.isFailure)).toHaveLength(1);
    expect(String(exits.find(Exit.isFailure))).toContain("child-limit-reached");

    const model = await harness.readModel();
    const children = model.threads.filter(
      (thread) =>
        thread.origin === managerThreadOrigin(managerId) &&
        thread.id !== managerThreadId &&
        thread.archivedAt === null &&
        thread.deletedAt === null,
    );
    expect(children).toHaveLength(2);
  });
});

describe("managerChildBranch", () => {
  it("slugs a manager name and title into one git-safe ref", () => {
    expect(
      managerChildBranch({ managerName: "Release Argo!", title: "Fix the CI", suffix: "abcd1234" }),
    ).toBe("argo/release-argo/fix-the-ci-abcd1234");
  });

  it("falls back to a placeholder when a title slugs to nothing", () => {
    expect(managerBranchSlug("!!!")).toBe("work");
  });
});
