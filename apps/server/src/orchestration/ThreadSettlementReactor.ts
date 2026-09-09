import { CommandId } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import * as GitManager from "../git/GitManager.ts";
import * as PullRequestService from "../pullRequest/PullRequestService.ts";
import * as ServerSettings from "../serverSettings.ts";
import { forkParked } from "../serverActivation.ts";
import * as OrchestrationEngine from "./Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "./Services/ProjectionSnapshotQuery.ts";
import {
  isAutoSettlementCandidate,
  resolveAutoSettlementAt,
  type SettlementPullRequest,
} from "./ThreadSettlementPolicy.ts";

export class ThreadSettlementReactor extends Context.Service<
  ThreadSettlementReactor,
  {
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly drain: Effect.Effect<void>;
  }
>()("t3/orchestration/ThreadSettlementReactor") {}

export const make = Effect.gen(function* () {
  const engine = yield* OrchestrationEngine.OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const git = yield* GitManager.GitManager;
  const pullRequests = yield* PullRequestService.PullRequestService;
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;

  const sweep = Effect.fn("ThreadSettlementReactor.sweep")(function* (
    mergedPullRequest: PullRequestService.PullRequestMergeEvent | null,
  ) {
    const settings = yield* settingsService.getSettings;
    if (!settings.sidebarAutoSettleOnMerge && settings.sidebarAutoSettleAfterDays === null) return;
    const snapshot = yield* snapshots.getShellSnapshot();
    const now = DateTime.formatIso(yield* DateTime.now);
    const projects = new Map(snapshot.projects.map((project) => [project.id, project]));
    const activeScheduledThreads = new Set(
      (snapshot.schedules ?? []).flatMap((schedule) =>
        schedule.projectStates.flatMap((state) =>
          state.lastOccurrenceStatus === "running" && state.threadId !== null
            ? [state.threadId]
            : [],
        ),
      ),
    );
    const candidates = snapshot.threads.filter(
      (thread) => !activeScheduledThreads.has(thread.id) && isAutoSettlementCandidate(thread, now),
    );
    const settleThread = Effect.fn("ThreadSettlementReactor.settleThread")(
      function* (thread: (typeof candidates)[number], pullRequest: SettlementPullRequest | null) {
        const settings = yield* settingsService.getSettings;
        const settledAt = resolveAutoSettlementAt({
          thread,
          pullRequest,
          now: DateTime.formatIso(yield* DateTime.now),
          autoSettleAfterDays: settings.sidebarAutoSettleAfterDays,
          autoSettleOnMerge: settings.sidebarAutoSettleOnMerge,
        });
        if (settledAt === null) return thread;
        const uuid = yield* crypto.randomUUIDv4;
        yield* engine.dispatch({
          type: "thread.auto-settle",
          commandId: CommandId.make(`server:auto-settle:${thread.id}:${uuid}`),
          threadId: thread.id,
          snapshotSequence: snapshot.snapshotSequence,
          settledAt,
        });
        return null;
      },
      (effect, thread) =>
        effect.pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.logWarning("automatic thread settlement skipped", {
                  threadId: thread.id,
                  cause: Cause.pretty(cause),
                }).pipe(Effect.as(null)),
          ),
        ),
    );
    // Inactivity is independent of host state and must survive failed PR reads.
    const lookupCandidates = (yield* Effect.forEach(
      candidates,
      (thread) => settleThread(thread, null),
      { concurrency: 8 },
    )).filter((thread) => thread !== null);
    const lookupCwds = new Map<string, string>();
    yield* Effect.forEach(
      lookupCandidates,
      (thread) =>
        Effect.gen(function* () {
          const project = projects.get(thread.projectId);
          if (project === undefined || thread.linkedPullRequest != null || thread.branch === null)
            return;
          const exists =
            thread.worktreePath !== null && (yield* fileSystem.exists(thread.worktreePath));
          lookupCwds.set(
            thread.id,
            exists && thread.worktreePath !== null ? thread.worktreePath : project.workspaceRoot,
          );
        }),
      { concurrency: 8, discard: true },
    );
    const lookupCwd = (thread: (typeof candidates)[number]) => lookupCwds.get(thread.id);
    if (mergedPullRequest !== null) {
      const cwds = [
        ...new Set(
          lookupCandidates
            .filter((thread) => thread.linkedPullRequest == null && thread.branch !== null)
            .map(lookupCwd)
            .filter((cwd) => cwd !== undefined),
        ),
      ];
      yield* Effect.forEach(cwds, (cwd) => git.invalidateStatus(cwd), {
        concurrency: 8,
        discard: true,
      });
    }
    const lookupKey = (thread: (typeof candidates)[number]) => {
      if (thread.linkedPullRequest != null) {
        return JSON.stringify([
          "linked",
          thread.linkedPullRequest.projectId,
          thread.linkedPullRequest.repository,
          thread.linkedPullRequest.number,
        ]);
      }
      if (thread.branch === null) return JSON.stringify(["none", thread.id]);
      const project = projects.get(thread.projectId);
      return JSON.stringify(
        project === undefined
          ? ["missing-project", thread.id]
          : ["branch", lookupCwd(thread), thread.branch],
      );
    };
    const groups = Map.groupBy(lookupCandidates, lookupKey);

    const pullRequestFor = Effect.fn("ThreadSettlementReactor.pullRequestFor")(function* (
      thread: (typeof candidates)[number],
    ) {
      if (thread.linkedPullRequest != null) {
        if (
          mergedPullRequest !== null &&
          thread.linkedPullRequest.projectId === mergedPullRequest.projectId &&
          thread.linkedPullRequest.repository.toLowerCase() ===
            mergedPullRequest.repository.toLowerCase() &&
          thread.linkedPullRequest.number === mergedPullRequest.number
        )
          return {
            state: "merged",
            mergedAt: mergedPullRequest.mergedAt,
          } satisfies SettlementPullRequest;
        if (!projects.has(thread.linkedPullRequest.projectId)) {
          return yield* Effect.die(new Error("linked pull request project not found"));
        }
        const detail = yield* pullRequests.detail({
          projectId: thread.linkedPullRequest.projectId,
          repository: thread.linkedPullRequest.repository,
          number: thread.linkedPullRequest.number,
        });
        return {
          state: detail.state,
          closedAt: detail.closedAt,
          mergedAt: detail.mergedAt,
        } satisfies SettlementPullRequest;
      }
      if (thread.branch === null) return null;
      const project = projects.get(thread.projectId);
      if (project === undefined) {
        return yield* Effect.die(new Error("thread project not found"));
      }
      return yield* git.branchPullRequest({
        cwd: lookupCwd(thread) ?? project.workspaceRoot,
        branch: thread.branch,
      });
    });

    yield* Effect.forEach(
      groups.values(),
      (group) =>
        Effect.gen(function* () {
          const pullRequest = yield* pullRequestFor(group[0]!);
          yield* Effect.forEach(group, (thread) => settleThread(thread, pullRequest), {
            discard: true,
          });
        }).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.logWarning("automatic thread settlement skipped", {
                  threadIds: group.map((thread) => thread.id),
                  cause: Cause.pretty(cause),
                }),
          ),
        ),
      { concurrency: 8, discard: true },
    );
  });

  const worker = yield* makeDrainableWorker(
    (mergedPullRequest: PullRequestService.PullRequestMergeEvent | null) =>
      sweep(mergedPullRequest).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("automatic thread settlement sweep failed", {
                cause: Cause.pretty(cause),
              }),
        ),
      ),
  );

  const start: ThreadSettlementReactor["Service"]["start"] = Effect.fn(
    "ThreadSettlementReactor.start",
  )(function* () {
    const settingsChanges = yield* settingsService.subscribeChanges;
    const merges = yield* pullRequests.subscribeMerges;
    yield* forkParked(Stream.runForEach(merges, (event) => worker.enqueue(event)));
    const initialSettings = yield* settingsService.getSettings.pipe(Effect.orDie);
    let lastAfterDays = initialSettings.sidebarAutoSettleAfterDays;
    let lastOnMerge = initialSettings.sidebarAutoSettleOnMerge;
    yield* forkParked(
      Effect.gen(function* () {
        yield* worker.enqueue(null);
        yield* worker.drain;
      }).pipe(Effect.repeat(Schedule.spaced("1 minute")), Effect.asVoid),
    );
    yield* forkParked(
      Stream.runForEach(settingsChanges, (settings) => {
        if (
          settings.sidebarAutoSettleAfterDays === lastAfterDays &&
          settings.sidebarAutoSettleOnMerge === lastOnMerge
        ) {
          return Effect.void;
        }
        lastAfterDays = settings.sidebarAutoSettleAfterDays;
        lastOnMerge = settings.sidebarAutoSettleOnMerge;
        return worker.enqueue(null);
      }),
    );
  });

  return { start, drain: worker.drain } satisfies ThreadSettlementReactor["Service"];
});

export const layer = Layer.effect(ThreadSettlementReactor, make);
