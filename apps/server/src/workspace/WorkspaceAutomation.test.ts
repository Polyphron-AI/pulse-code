import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import {
  ProjectId,
  WorkspaceAutomationSave,
  ScheduledTaskError,
  workspaceItemKey,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ThreadLaunchService } from "../orchestration-v2/ThreadLaunchService.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import * as Scheduled from "../scheduledTasks/ScheduledTaskService.ts";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as Automation from "./WorkspaceAutomation.ts";
import * as Tools from "./WorkspaceTools.ts";
import { WorkspaceLinks, WorkspaceLinksLive } from "./WorkspaceLinks.ts";
import { renderLinkedItems, withLinkedItems } from "./linkedItemsContext.ts";
const decodeInput = Schema.decodeUnknownEffect(WorkspaceAutomationSave);
const projectId = ProjectId.make("project-automation");
const layer = Layer.mergeAll(Tools.layer, WorkspaceLinksLive).pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
const setup = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Automation','/synthetic','[]','2026-10-15T12:00:00Z','2026-10-15T12:00:00Z')`;
  const links = yield* WorkspaceLinks;
  const created = new Set<string>();
  const providerInputs: string[] = [];
  let failSave = false;
  const launchLayer = Layer.mock(ThreadLaunchService)({
    launch: (input) =>
      Effect.sync(() => {
        expect(input.initialMessage).toBeUndefined();
        expect(input.reuseExistingThread).not.toBe(true);
        created.add(input.threadId!);
        return { threadId: input.threadId!, projection: {} as never, resumed: false };
      }),
  });
  const management = Layer.mock(ThreadManagementService)({
    sendToThread: (input) =>
      Effect.gen(function* () {
        const context = yield* links.contextFor({
          threadId: input.threadId,
          projectId: input.projectId,
        });
        providerInputs.push(withLinkedItems(input.text, renderLinkedItems(context)));
        expect(
          Option.isSome(
            yield* links.resolveLinked(
              { threadId: input.threadId, projectId: input.projectId },
              workspaceItemKey({ type: "url", url: "https://example.test/source" }),
            ),
          ),
        ).toBe(true);
        return {} as never;
      }).pipe(Effect.orDie),
  });
  const context = yield* Layer.build(
    Scheduled.layer.pipe(Layer.provide(Layer.mergeAll(launchLayer, management, Scheduler.layer))),
  );
  const schedules = Context.get(context, Scheduled.ScheduledTaskService);
  const launchContext = yield* Layer.build(launchLayer);
  const launch = Context.get(launchContext, ThreadLaunchService);
  const service = yield* Automation.make.pipe(
    Effect.provideService(ThreadLaunchService, launch),
    Effect.provideService(Scheduled.ScheduledTaskService, {
      ...schedules,
      upsert: (input) =>
        failSave
          ? Effect.fail(new ScheduledTaskError({ message: "Synthetic storage failure" }))
          : schedules.upsert(input),
    }),
  );
  const input = yield* decodeInput({
    requestId: "00000000-0000-0000-0000-000000000001",
    source: { ref: { type: "url", url: "https://example.test/source" }, title: "Source" },
    task: {
      title: "Check source",
      prompt: "Review the source",
      projectId,
      enabled: true,
      schedule: { type: "interval", everyMs: 60000 },
      workspaceStrategy: { type: "root" },
      modelSelection: { instanceId: "codex", model: "synthetic" },
      runtimeMode: "full-access",
      interactionMode: "default",
    },
  });
  return {
    service,
    schedules,
    created,
    providerInputs,
    input,
    failSave: (value: boolean) => {
      failSave = value;
    },
  };
});
it.effect(
  "does nothing before Save, binds an idle thread before enabling, and runs only confirmed context through the existing schedule",
  () =>
    Effect.gen(function* () {
      const { service, schedules, created, providerInputs, input } = yield* setup;
      expect(created.size).toBe(0);
      expect((yield* schedules.list()).tasks).toHaveLength(0);
      const result = yield* service.save(input);
      expect(created.size).toBe(1);
      expect(providerInputs).toHaveLength(0);
      expect(result.task.threadId).not.toBeNull();
      const links = yield* WorkspaceLinks;
      yield* links.saveSuggestions({
        item: { ref: { type: "thread", threadId: result.task.threadId! } },
        suggestions: [
          {
            item: { ref: { type: "url", url: "https://example.test/suggested" } },
            reason: "Synthetic",
          },
        ],
        model: "synthetic",
        modelKey: "synthetic",
        revision: "1",
        incomplete: false,
      });
      const run = yield* schedules.runNow({ id: result.task.id });
      expect(run.task.lastRunStatus).toBe("succeeded");
      expect(providerInputs).toHaveLength(1);
      expect(providerInputs[0]).toContain(workspaceItemKey(input.source.ref));
      expect(providerInputs[0]).not.toContain(
        workspaceItemKey({ type: "url", url: "https://example.test/suggested" }),
      );
      const read = yield* links.list(input.source.ref);
      expect(read.linked[0]?.source).toEqual({ type: "action", action: "start-automation" });
      yield* service.save(input);
      expect(created.size).toBe(1);
      expect((yield* schedules.list()).tasks).toHaveLength(1);
      yield* schedules.setEnabled({ id: result.task.id, enabled: false });
      expect((yield* schedules.list()).tasks[0]?.nextRunAt).toBeNull();
      yield* schedules.delete({ id: result.task.id });
      expect((yield* schedules.list()).tasks).toHaveLength(0);
      expect((yield* links.list(input.source.ref)).linked).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(layer)),
);
it.effect(
  "recovers a partial save without a second thread or provider turn and rejects changed retry ownership",
  () =>
    Effect.gen(function* () {
      const { service, schedules, created, providerInputs, input, failSave } = yield* setup;
      failSave(true);
      expect((yield* service.save(input).pipe(Effect.flip)).kind).toBe("unavailable");
      expect(created.size).toBe(1);
      expect(providerInputs).toHaveLength(0);
      expect((yield* schedules.list()).tasks).toHaveLength(0);
      failSave(false);
      const result = yield* service.save(input);
      expect(created.size).toBe(1);
      expect(result.task.enabled).toBe(true);
      expect(providerInputs).toHaveLength(0);
      expect(
        (yield* service
          .save({ ...input, source: { ref: { type: "url", url: "https://example.test/other" } } })
          .pipe(Effect.flip)).kind,
      ).toBe("conflict");
      expect((yield* schedules.list()).tasks).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(layer)),
);
