/**
 * ManagerReactor - runs one cycle per watching manager (Argo) whose interval
 * has elapsed.
 *
 * A cycle ensures the environment's system project exists (this is the caller
 * `project.ensure-system` was written for), lazily creates and binds the
 * manager's own thread under the `manager:<id>` origin, composes the
 * four-part cycle prompt from the read model, and starts one turn on that
 * thread authored by "schedule". The manager then acts through the MCP
 * manager toolkit; this reactor never spawns children itself.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md, section 3 (Manager).
 *
 * @module ManagerReactor
 */
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ProjectId,
  ThreadId,
  managerState,
  managerThreadOrigin,
  type ModelSelection,
  type OrchestrationManager,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";

import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { composeManagerCyclePrompt, type ManagerCycleChildRow } from "../managerCyclePrompt.ts";
import { expandMissionMentions } from "../missionMentions.ts";
import { systemProject } from "../projector.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ManagerReactor, type ManagerReactorShape } from "../Services/ManagerReactor.ts";
import { RuntimeReceiptBus } from "../Services/RuntimeReceiptBus.ts";

const DEFAULT_SWEEP_INTERVAL_MS = 30 * 1000;
const MS_PER_MINUTE = 60_000;

/** Activity kind ProviderRuntimeIngestion writes for a token-usage tick. */
const CONTEXT_WINDOW_ACTIVITY_KIND = "context-window.updated";

/** One system project per environment; its id is fixed so it is easy to spot. */
export const SYSTEM_PROJECT_ID = ProjectId.make("system");
export const SYSTEM_PROJECT_TITLE = "Pulse Code system";

export interface ManagerReactorLiveOptions {
  readonly sweepIntervalMs?: number;
}

/** Deterministic id so a restart rebinds the same manager thread. */
export const managerThreadIdFor = (manager: OrchestrationManager): ThreadId =>
  ThreadId.make(`manager-thread:${manager.id}`);

const liveThread = (thread: OrchestrationThread) =>
  thread.deletedAt === null && thread.archivedAt === null;

/**
 * Which thread this manager should cycle on, and whether it already exists.
 *
 * `thread.create` refuses an id that any row holds, deleted rows included, so
 * the deterministic id alone would wedge a manager forever in two real cases:
 * a bind that failed after the create landed, and a user deleting the Argo
 * thread. Both fall back to a fresh id derived from the sweep timestamp, so
 * the manager recovers on the next sweep instead of logging `cycle-failed`
 * for the rest of the process's life.
 */
export function resolveManagerThreadTarget(input: {
  readonly manager: OrchestrationManager;
  readonly readModel: OrchestrationReadModel;
  readonly nowIso: string;
}): { readonly threadId: ThreadId; readonly existing: OrchestrationThread | undefined } {
  const byId = (threadId: ThreadId) =>
    input.readModel.threads.find((thread) => thread.id === threadId);

  const bound = input.manager.threadId === null ? undefined : byId(input.manager.threadId);
  if (bound !== undefined && bound.deletedAt === null) {
    return { threadId: bound.id, existing: bound };
  }

  const preferred = managerThreadIdFor(input.manager);
  const atPreferred = byId(preferred);
  if (atPreferred === undefined) {
    return { threadId: preferred, existing: undefined };
  }
  if (atPreferred.deletedAt === null) {
    return { threadId: preferred, existing: atPreferred };
  }
  return {
    threadId: ThreadId.make(`manager-thread:${input.manager.id}:${input.nowIso}`),
    existing: undefined,
  };
}

const isRunning = (thread: OrchestrationThread | undefined) =>
  thread?.latestTurn?.state === "running" || thread?.session?.status === "running";

/**
 * A manager is due when it has never cycled, a user asked for a cycle now, or
 * its interval has elapsed.
 */
export function managerIsDue(manager: OrchestrationManager, nowMillis: number): boolean {
  if (managerState(manager) !== "watching") return false;
  // Absent and null both mean no pending request.
  if ((manager.cycleRequestedAt ?? null) !== null) return true;
  if (manager.lastCycleAt === null) return true;
  const last = Date.parse(manager.lastCycleAt);
  if (Number.isNaN(last)) return true;
  return nowMillis - last >= manager.intervalMinutes * MS_PER_MINUTE;
}

/**
 * Token spend for one thread, read from the usage the provider already
 * reports: ingestion turns every `thread.token-usage.updated` runtime event
 * into a `context-window.updated` activity, and the newest one carries the
 * session's current context size. Null when the provider has reported none,
 * which drops the Tokens column instead of printing a table of dashes.
 */
export function threadTokenTotal(thread: OrchestrationThread): number | null {
  for (const activity of thread.activities.toReversed()) {
    if (activity.kind !== CONTEXT_WINDOW_ACTIVITY_KIND) continue;
    const payload = activity.payload;
    if (typeof payload !== "object" || payload === null) continue;
    const used = (payload as { readonly usedTokens?: unknown }).usedTokens;
    if (typeof used === "number" && Number.isFinite(used)) return used;
  }
  return null;
}

/**
 * Children are every live thread carrying this manager's origin, minus the
 * manager's own thread. Cycles-since-change is the child's idle time measured
 * in this manager's interval, which is what the stall rule counts.
 */
export function managerChildRows(input: {
  readonly manager: OrchestrationManager;
  readonly readModel: OrchestrationReadModel;
  readonly managerThreadId: ThreadId;
  readonly nowMillis: number;
}): ReadonlyArray<ManagerCycleChildRow> {
  const origin = managerThreadOrigin(input.manager.id);
  const intervalMs = input.manager.intervalMinutes * MS_PER_MINUTE;
  return input.readModel.threads
    .filter(
      (thread) =>
        thread.origin === origin && thread.id !== input.managerThreadId && liveThread(thread),
    )
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((thread) => {
      const updatedMillis = Date.parse(thread.updatedAt);
      const idleMs = Number.isNaN(updatedMillis) ? 0 : Math.max(0, input.nowMillis - updatedMillis);
      return {
        threadId: thread.id,
        projectTitle:
          input.readModel.projects.find((project) => project.id === thread.projectId)?.title ??
          thread.projectId,
        branch: thread.branch,
        status: thread.latestTurn?.state ?? "idle",
        lastActivityAt: thread.updatedAt,
        cyclesSinceChange: Math.floor(idleMs / intervalMs),
        tokens: threadTokenTotal(thread),
      } satisfies ManagerCycleChildRow;
    });
}

/** User messages typed into the manager thread since the last cycle. */
export function managerDirectives(input: {
  readonly managerThread: OrchestrationThread | undefined;
  readonly since: string | null;
}): ReadonlyArray<string> {
  if (!input.managerThread) return [];
  return input.managerThread.messages
    .filter(
      (message) =>
        message.role === "user" &&
        (message.authoredBy === undefined || message.authoredBy === "user") &&
        message.text.trim().length > 0 &&
        (input.since === null || message.createdAt > input.since),
    )
    .map((message) => message.text.trim());
}

const makeManagerReactor = (options?: ManagerReactorLiveOptions) =>
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const serverSettings = yield* ServerSettingsService;
    const receiptBus = yield* RuntimeReceiptBus;
    const config = yield* ServerConfig;
    const sweepIntervalMs = Math.max(1, options?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);

    const ensureSystemProject = Effect.fn("managerEnsureSystemProject")(function* (
      readModel: OrchestrationReadModel,
      nowIso: string,
    ) {
      const existing = systemProject(readModel);
      if (existing !== undefined) return existing.id;
      yield* engine.dispatch({
        type: "project.ensure-system",
        commandId: CommandId.make(`manager:system-project:${nowIso}`),
        projectId: SYSTEM_PROJECT_ID,
        title: SYSTEM_PROJECT_TITLE,
        workspaceRoot: config.baseDir,
        createdAt: nowIso,
      });
      return SYSTEM_PROJECT_ID;
    });

    /**
     * Every manager gets its thread as soon as it exists, whatever its state.
     * A new manager starts with no mission and the mission editor lives in
     * that thread's header, so the thread has to be there before the first
     * cycle can ever be due.
     */
    const ensureManagerThread = Effect.fn("managerEnsureThread")(function* (input: {
      readonly manager: OrchestrationManager;
      readonly readModel: OrchestrationReadModel;
      readonly nowIso: string;
    }) {
      const { manager } = input;
      const target = resolveManagerThreadTarget({
        manager,
        readModel: input.readModel,
        nowIso: input.nowIso,
      });
      const threadId = target.threadId;
      const base = `manager:${manager.id}:${input.nowIso}`;
      const settings = yield* serverSettings.getSettings;
      const projectId = yield* ensureSystemProject(input.readModel, input.nowIso);
      const modelSelection: ModelSelection | null =
        input.readModel.projects.find((project) => project.id === projectId)
          ?.defaultModelSelection ??
        settings.textGenerationModelSelection ??
        null;
      if (modelSelection === null) {
        yield* Effect.logWarning("manager.reactor.thread-skipped", {
          managerId: manager.id,
          reason: "no-model-selection",
        });
        return;
      }
      // A thread already at this id (a bind that failed after the create
      // landed) only needs the bind.
      if (target.existing === undefined) {
        yield* engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make(`${base}:thread-create`),
          threadId,
          projectId,
          title: manager.name,
          modelSelection,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          branch: null,
          worktreePath: null,
          origin: managerThreadOrigin(manager.id),
          createdAt: input.nowIso,
        });
      }
      yield* engine.dispatch({
        type: "manager.thread.bind",
        commandId: CommandId.make(`${base}:thread-bind`),
        managerId: manager.id,
        threadId,
      });
    });

    const runCycle = Effect.fn("managerRunCycle")(function* (input: {
      readonly manager: OrchestrationManager;
      readonly readModel: OrchestrationReadModel;
      readonly nowIso: string;
      readonly nowMillis: number;
    }) {
      const { manager } = input;
      const base = `manager:${manager.id}:${input.nowIso}`;
      const target = resolveManagerThreadTarget({
        manager,
        readModel: input.readModel,
        nowIso: input.nowIso,
      });
      const threadId = target.threadId;
      const existingThread = target.existing;

      // A manager that is still thinking gets its next cycle later; two
      // overlapping cycles would spawn the same child twice.
      if (isRunning(existingThread)) {
        yield* Effect.logInfo("manager.reactor.cycle-skipped", {
          managerId: manager.id,
          reason: "thread-running",
        });
        return;
      }

      const settings = yield* serverSettings.getSettings;
      const projectId = yield* ensureSystemProject(input.readModel, input.nowIso);
      // The manager record only configures its children's model, so its own
      // thread runs on the environment's text-generation default.
      const modelSelection: ModelSelection | null =
        existingThread?.modelSelection ??
        input.readModel.projects.find((project) => project.id === projectId)
          ?.defaultModelSelection ??
        settings.textGenerationModelSelection ??
        null;
      if (modelSelection === null) {
        yield* Effect.logWarning("manager.reactor.cycle-skipped", {
          managerId: manager.id,
          reason: "no-model-selection",
        });
        return;
      }

      if (existingThread === undefined) {
        yield* engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make(`${base}:thread-create`),
          threadId,
          projectId,
          title: manager.name,
          modelSelection,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          branch: null,
          worktreePath: null,
          origin: managerThreadOrigin(manager.id),
          createdAt: input.nowIso,
        });
      }
      if (manager.threadId !== threadId) {
        yield* engine.dispatch({
          type: "manager.thread.bind",
          commandId: CommandId.make(`${base}:thread-bind`),
          managerId: manager.id,
          threadId,
        });
      }

      const text = composeManagerCyclePrompt({
        managerName: manager.name,
        expandedMission: expandMissionMentions({
          mission: manager.mission,
          readModel: input.readModel,
          selfManagerId: manager.id,
        }).text,
        children: managerChildRows({
          manager,
          readModel: input.readModel,
          managerThreadId: threadId,
          nowMillis: input.nowMillis,
        }),
        directives: managerDirectives({
          managerThread: existingThread,
          since: manager.lastCycleAt,
        }),
        maxChildren: manager.maxChildren,
      });

      yield* engine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`${base}:turn`),
        threadId,
        message: {
          messageId: MessageId.make(`${base}:message`),
          role: "user",
          text,
          attachments: [],
        },
        modelSelection,
        runtimeMode: existingThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
        interactionMode: existingThread?.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE,
        sessionMode: "fresh",
        authoredBy: "schedule",
        createdAt: input.nowIso,
      });

      yield* engine.dispatch({
        type: "manager.cycle.record",
        commandId: CommandId.make(`${base}:cycle-record`),
        managerId: manager.id,
        occurredAt: input.nowIso,
      });

      yield* receiptBus.publish({
        type: "manager.cycle.started",
        managerId: manager.id,
        threadId,
        createdAt: input.nowIso,
      });
    });

    const sweep = Effect.gen(function* () {
      const nowUtc = yield* DateTime.now;
      const nowIso = DateTime.formatIso(nowUtc);
      const nowMillis = DateTime.toEpochMillis(nowUtc);

      for (const manager of (yield* engine.currentReadModel).managers ?? []) {
        if (manager.deletedAt !== null) continue;
        const readModel = yield* engine.currentReadModel;
        // Unbound, or bound to a thread the user has since deleted.
        const bound =
          manager.threadId === null
            ? undefined
            : readModel.threads.find(
                (thread) => thread.id === manager.threadId && thread.deletedAt === null,
              );
        if (manager.threadId !== null && bound !== undefined) continue;
        yield* ensureManagerThread({
          manager,
          readModel,
          nowIso,
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("manager.reactor.thread-failed", { managerId: manager.id, cause }),
          ),
        );
      }

      for (const manager of (yield* engine.currentReadModel).managers ?? []) {
        if (manager.deletedAt !== null) continue;
        if (!managerIsDue(manager, nowMillis)) continue;
        // Re-read per manager: the previous cycle may have created the system
        // project or bound a thread this one needs to see.
        const readModel = yield* engine.currentReadModel;
        const current = (readModel.managers ?? []).find((entry) => entry.id === manager.id);
        if (current === undefined || current.deletedAt !== null) continue;
        yield* runCycle({ manager: current, readModel, nowIso, nowMillis }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("manager.reactor.cycle-failed", {
              managerId: manager.id,
              cause,
            }),
          ),
        );
      }
    });

    const sweepNow: ManagerReactorShape["sweepNow"] = sweep.pipe(
      Effect.catch((error: unknown) =>
        Effect.logWarning("manager.reactor.sweep-failed", { error }),
      ),
      Effect.catchDefect((defect: unknown) =>
        Effect.logWarning("manager.reactor.sweep-defect", { defect }),
      ),
    );

    const start: ManagerReactorShape["start"] = () =>
      Effect.gen(function* () {
        // Plain scoped fork, like the schedule sweep: a manager must keep
        // cycling whether or not a client keeps the server active.
        yield* Effect.forkScoped(
          sweepNow.pipe(Effect.repeat(Schedule.spaced(Duration.millis(sweepIntervalMs)))),
        );
        yield* Effect.logInfo("manager.reactor.started", { sweepIntervalMs });
      });

    return { start, sweepNow } satisfies ManagerReactorShape;
  });

export const makeManagerReactorLive = (options?: ManagerReactorLiveOptions) =>
  Layer.effect(ManagerReactor, makeManagerReactor(options));

export const ManagerReactorLive = makeManagerReactorLive();
