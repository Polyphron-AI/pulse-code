/**
 * Manager (Argo) MCP toolkit handlers.
 *
 * Every handler resolves the calling session's thread first: the tools only
 * work from a thread whose origin is `manager:<id>` and which that manager is
 * bound to. The MCP tool catalog is global (one toolkit registration per
 * server, not per session), so this call-time gate is what keeps an ordinary
 * thread, and a manager's own children, from driving the fleet.
 *
 * @module toolkits/manager/handlers
 */
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  ThreadId,
  isManagerThreadOrigin,
  managerIdFromThreadOrigin,
  managerThreadOrigin,
  type OrchestrationManager,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

import * as GitWorkflowService from "../../../git/GitWorkflowService.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { ManagerToolError, ManagerToolkit, type ManagerChildSummary } from "./tools.ts";

/** Git refs reject most punctuation, so a title becomes a narrow slug. */
export function managerBranchSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 40)
    .replaceAll(/-+$/g, "");
  return slug.length > 0 ? slug : "work";
}

/** Branch for a spawned child: readable, namespaced, and collision-free. */
export function managerChildBranch(input: {
  readonly managerName: string;
  readonly title: string;
  readonly suffix: string;
}): string {
  return `argo/${managerBranchSlug(input.managerName)}/${managerBranchSlug(input.title)}-${input.suffix}`;
}

/** Live children of a manager: same origin, minus the manager's own thread. */
export function managerChildren(input: {
  readonly readModel: OrchestrationReadModel;
  readonly manager: OrchestrationManager;
  readonly managerThreadId: ThreadId;
}): ReadonlyArray<ManagerChildSummary> {
  const origin = managerThreadOrigin(input.manager.id);
  return input.readModel.threads
    .filter(
      (thread) =>
        thread.origin === origin &&
        thread.id !== input.managerThreadId &&
        thread.deletedAt === null &&
        thread.archivedAt === null,
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((thread) => ({
      threadId: thread.id,
      title: thread.title,
      projectId: thread.projectId,
      projectTitle:
        input.readModel.projects.find((project) => project.id === thread.projectId)?.title ??
        thread.projectId,
      branch: thread.branch,
      worktreePath: thread.worktreePath,
      status: thread.latestTurn?.state ?? "idle",
      lastActivityAt: thread.updatedAt,
    }));
}

const failed = (reason: ManagerToolError["reason"], detail: string) =>
  Effect.fail(new ManagerToolError({ reason, detail }));

/** Any dispatch or git failure surfaces to the model as one tool error. */
const asToolError = <A, E, R>(effect: Effect.Effect<A, E, R>, detail: string) =>
  effect.pipe(
    Effect.catchCause((cause: Cause.Cause<E>) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause as Cause.Cause<never>)
        : Effect.fail(
            new ManagerToolError({ reason: "failed", detail: `${detail}: ${Cause.pretty(cause)}` }),
          ),
    ),
  );

interface ManagerScope {
  readonly manager: OrchestrationManager;
  readonly managerThreadId: ThreadId;
  readonly readModel: OrchestrationReadModel;
}

/**
 * The gate. A session may drive these tools only from the thread its own
 * manager record is bound to; children share the origin but are refused.
 */
const requireManagerScope = Effect.fn("ManagerToolkit.requireManagerScope")(function* () {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  const engine = yield* OrchestrationEngineService;
  const readModel = yield* engine.currentReadModel;
  const thread = readModel.threads.find(
    (candidate) => candidate.id === invocation.threadId && candidate.deletedAt === null,
  );
  const origin = thread?.origin;
  if (thread === undefined || origin === undefined || !isManagerThreadOrigin(origin)) {
    return yield* failed(
      "not-a-manager-thread",
      "The manager tools are only available inside an Argo manager thread.",
    );
  }
  const managerId = managerIdFromThreadOrigin(origin);
  const manager = (readModel.managers ?? []).find(
    (candidate) => candidate.id === managerId && candidate.deletedAt === null,
  );
  if (manager === undefined) {
    return yield* failed("manager-missing", `No live manager owns origin '${origin}'.`);
  }
  if (manager.threadId !== thread.id) {
    return yield* failed(
      "not-a-manager-thread",
      "This is a managed child thread; only the manager thread may drive the fleet.",
    );
  }
  return { manager, managerThreadId: thread.id, readModel } satisfies ManagerScope;
});

const requireOwnChild = (scope: ManagerScope, threadId: ThreadId) =>
  Effect.gen(function* () {
    const origin = managerThreadOrigin(scope.manager.id);
    const thread = scope.readModel.threads.find(
      (candidate) =>
        candidate.id === threadId &&
        candidate.deletedAt === null &&
        candidate.id !== scope.managerThreadId &&
        candidate.origin === origin,
    );
    if (thread === undefined) {
      return yield* failed(
        "not-your-child",
        `Thread '${threadId}' is not a child of this manager.`,
      );
    }
    return thread satisfies OrchestrationThread;
  });

const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

const shortId = Crypto.Crypto.pipe(
  Effect.flatMap((crypto) => crypto.randomUUIDv4),
  Effect.map((uuid) => uuid.replaceAll("-", "").slice(0, 8)),
  // A platform without a CSPRNG is a defect, not something a tool call can
  // report to the model.
  Effect.orDie,
);

/**
 * Spawns are serialized. A provider may issue several tool calls in parallel,
 * and `maxChildren` is checked against a read-model snapshot, so two
 * concurrent spawns would both see room and both create a child. One permit
 * makes the check-then-create atomic; spawning is rare enough that queuing
 * costs nothing.
 */
const spawnLock = Semaphore.makeUnsafe(1);

const handlers = {
  manager_list_children: () =>
    Effect.gen(function* () {
      const scope = yield* requireManagerScope();
      return {
        managerId: scope.manager.id,
        maxChildren: scope.manager.maxChildren,
        children: managerChildren(scope),
      };
    }),

  manager_spawn_child: (input) =>
    spawnLock.withPermits(1)(
      Effect.gen(function* () {
        const scope = yield* requireManagerScope();
        const engine = yield* OrchestrationEngineService;
        const git = yield* GitWorkflowService.GitWorkflowService;
        const children = managerChildren(scope);
        if (children.length >= scope.manager.maxChildren) {
          return yield* failed(
            "child-limit-reached",
            `This manager already owns ${children.length} of ${scope.manager.maxChildren} allowed children. Stop one first.`,
          );
        }
        const project = scope.readModel.projects.find(
          (candidate) => candidate.id === input.projectId && candidate.deletedAt === null,
        );
        if (project === undefined) {
          return yield* failed("project-missing", `No live project '${input.projectId}'.`);
        }
        const modelSelection =
          scope.manager.childModelSelection ?? project.defaultModelSelection ?? null;
        if (modelSelection === null) {
          return yield* failed(
            "no-model-selection",
            `Project '${project.title}' has no default model and this manager sets no child model.`,
          );
        }

        const suffix = yield* shortId;
        const createdAt = yield* nowIso;
        const status = yield* asToolError(
          git.localStatus({ cwd: project.workspaceRoot }),
          "Failed to read the project's git status",
        );
        const baseBranch = status.refName ?? "main";
        const branch = managerChildBranch({
          managerName: scope.manager.name,
          title: input.title,
          suffix,
        });
        const worktree = yield* asToolError(
          git.createWorktree({
            cwd: project.workspaceRoot,
            refName: baseBranch,
            newRefName: branch,
            baseRefName: baseBranch,
            path: null,
          }),
          "Failed to create the child worktree",
        );

        const threadId = ThreadId.make(`manager-child:${scope.manager.id}:${suffix}`);
        yield* asToolError(
          engine.dispatch({
            type: "thread.create",
            commandId: CommandId.make(`manager:${scope.manager.id}:${suffix}:thread-create`),
            threadId,
            projectId: project.id,
            title: input.title,
            modelSelection,
            runtimeMode: scope.manager.childRuntimeMode,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: worktree.worktree.refName,
            worktreePath: worktree.worktree.path,
            origin: managerThreadOrigin(scope.manager.id),
            createdAt,
          }),
          "Failed to create the child thread",
        );
        yield* asToolError(
          engine.dispatch({
            type: "thread.turn.start",
            commandId: CommandId.make(`manager:${scope.manager.id}:${suffix}:turn`),
            threadId,
            message: {
              messageId: MessageId.make(`manager:${scope.manager.id}:${suffix}:message`),
              role: "user",
              text: input.prompt,
              attachments: [],
            },
            modelSelection,
            runtimeMode: scope.manager.childRuntimeMode,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            authoredBy: "manager",
            createdAt,
          }),
          "Failed to start the child's first turn",
        );

        return {
          threadId,
          branch: worktree.worktree.refName,
          worktreePath: worktree.worktree.path,
        };
      }),
    ),

  manager_message_child: (input) =>
    Effect.gen(function* () {
      const scope = yield* requireManagerScope();
      const engine = yield* OrchestrationEngineService;
      const child = yield* requireOwnChild(scope, input.threadId);
      const suffix = yield* shortId;
      const createdAt = yield* nowIso;
      yield* asToolError(
        engine.dispatch({
          type: "thread.turn.start",
          commandId: CommandId.make(`manager:${scope.manager.id}:message:${suffix}`),
          threadId: child.id,
          message: {
            messageId: MessageId.make(`manager:${scope.manager.id}:message:${suffix}:message`),
            role: "user",
            text: input.prompt,
            attachments: [],
          },
          runtimeMode: child.runtimeMode,
          interactionMode: child.interactionMode,
          authoredBy: "manager",
          createdAt,
        }),
        "Failed to message the child",
      );
      return { threadId: child.id };
    }),

  manager_stop_child: (input) =>
    Effect.gen(function* () {
      const scope = yield* requireManagerScope();
      const engine = yield* OrchestrationEngineService;
      const child = yield* requireOwnChild(scope, input.threadId);
      const suffix = yield* shortId;
      const createdAt = yield* nowIso;
      if (child.latestTurn?.state === "running") {
        yield* asToolError(
          engine.dispatch({
            type: "thread.turn.interrupt",
            commandId: CommandId.make(`manager:${scope.manager.id}:stop:${suffix}:interrupt`),
            threadId: child.id,
            createdAt,
          }),
          "Failed to interrupt the child",
        );
      }
      yield* asToolError(
        engine.dispatch({
          type: "thread.archive",
          commandId: CommandId.make(`manager:${scope.manager.id}:stop:${suffix}:archive`),
          threadId: child.id,
        }),
        "Failed to archive the child",
      );
      return { threadId: child.id };
    }),

  manager_log: (input) =>
    Effect.gen(function* () {
      const scope = yield* requireManagerScope();
      const engine = yield* OrchestrationEngineService;
      const suffix = yield* shortId;
      const occurredAt = yield* nowIso;
      yield* asToolError(
        engine.dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make(`manager:${scope.manager.id}:log:${suffix}`),
          threadId: scope.managerThreadId,
          activity: {
            id: EventId.make(`manager-cycle:${scope.manager.id}:${suffix}`),
            tone: "info",
            kind: "manager.cycle",
            summary: input.summary,
            payload: {
              kind: input.kind,
              threadId: input.threadId ?? null,
              summary: input.summary,
              occurredAt,
            },
            turnId: null,
            createdAt: occurredAt,
          },
          createdAt: occurredAt,
        }),
        "Failed to append the cycle log row",
      );
      return { threadId: scope.managerThreadId, kind: input.kind };
    }),
} satisfies Parameters<typeof ManagerToolkit.toLayer>[0];

/** Exported so tests can drive one tool without standing up MCP transport. */
export const managerToolHandlers = handlers;

export const ManagerToolkitHandlersLive = ManagerToolkit.toLayer(handlers);
