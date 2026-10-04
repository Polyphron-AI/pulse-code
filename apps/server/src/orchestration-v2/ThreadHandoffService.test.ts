import { expect, it } from "@effect/vitest";
import {
  MessageId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ProjectService from "../project/ProjectService.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import * as Handoff from "./ThreadHandoffService.ts";

const now = DateTime.makeUnsafe("2026-10-04T00:00:00Z");
const threadId = ThreadId.make("handoff-thread");
const source = { instanceId: ProviderInstanceId.make("source"), model: "source-model" };
const destination = {
  instanceId: ProviderInstanceId.make("destination"),
  model: "destination-model",
};
const projection: OrchestrationV2ThreadProjection = {
  thread: {
    id: threadId,
    projectId: ProjectId.make("project"),
    title: "Continue work",
    providerInstanceId: source.instanceId,
    modelSelection: source,
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "develop",
    worktreePath: "/workspace",
    activeProviderThreadId: null,
    lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  },
  messages: [
    {
      id: MessageId.make("message"),
      threadId,
      runId: RunId.make("run"),
      nodeId: null,
      role: "user",
      text: "Finish the queued work",
      attachments: [],
      streaming: false,
      createdAt: now,
      updatedAt: now,
      createdBy: "user",
      creationSource: "web",
    },
  ],
  runs: [],
  attempts: [],
  nodes: [],
  subagents: [],
  providerSessions: [],
  providerThreads: [],
  providerTurns: [],
  runtimeRequests: [],
  plans: [],
  turnItems: [],
  checkpointScopes: [],
  checkpoints: [],
  contextHandoffs: [],
  contextTransfers: [],
  visibleTurnItems: [],
  updatedAt: now,
};

for (const changed of [false, true]) {
  it.effect(`generates a v2 handoff and rejects source changes (${changed})`, () => {
    let reads = 0;
    const layer = Handoff.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(ThreadManagement.ThreadManagementService)({
            getThreadProjection: () =>
              Effect.sync(() =>
                ++reads > 1 && changed
                  ? {
                      ...projection,
                      messages: [
                        {
                          ...projection.messages[0]!,
                          text: "new message",
                          updatedAt: DateTime.makeUnsafe("2026-10-04T00:00:01Z"),
                        },
                      ],
                    }
                  : projection,
              ),
          }),
          Layer.mock(ProjectService.ProjectService)({
            getById: () => Effect.succeed(Option.none()),
          }),
          Layer.mock(TextGeneration.TextGeneration)({
            generateThreadHandoff: (input) =>
              Effect.sync(() => {
                expect(input.modelSelection).toEqual(destination);
                expect(input.source?.modelSelection).toEqual(source);
                expect(input.source?.nativeEligible).toBe(false);
                expect(input.threadContext).toContain("Finish the queued work");
                return { summary: "Continue finishing the queued work" };
              }),
          }),
        ),
      ),
    );
    return Effect.gen(function* () {
      const handoff = yield* Handoff.ThreadHandoffService;
      const result = yield* Effect.result(handoff.generate({ threadId, destination }));
      if (changed) {
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure.message).toContain("source thread changed");
      } else {
        expect(result._tag).toBe("Success");
        if (result._tag === "Success") expect(result.success.summary).toContain("queued work");
      }
    }).pipe(Effect.provide(layer));
  });
}
