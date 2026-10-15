import {
  CommandId,
  ScheduledTaskId,
  ThreadId,
  WorkspaceToolsError,
  normalizeWorkspaceItemRef,
  workspaceItemKey,
  type WorkspaceAutomationSave,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { makeKeyedSerialExecutor } from "../orchestration-v2/KeyedSerialExecutor.ts";
import { ThreadLaunchService } from "../orchestration-v2/ThreadLaunchService.ts";
import { ScheduledTaskService } from "../scheduledTasks/ScheduledTaskService.ts";
import { WorkspaceLinks } from "./WorkspaceLinks.ts";
import { WorkspaceTools } from "./WorkspaceTools.ts";
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const isToolsError = Schema.is(WorkspaceToolsError);
const fail = (kind: WorkspaceToolsError["kind"], message: string) =>
  new WorkspaceToolsError({ kind, message });
export const make = Effect.gen(function* () {
  const launch = yield* ThreadLaunchService;
  const schedules = yield* ScheduledTaskService;
  const links = yield* WorkspaceLinks;
  const tools = yield* WorkspaceTools;
  const sql = yield* SqlClient.SqlClient;
  const locks = yield* makeKeyedSerialExecutor<string>();
  return {
    save: (input: WorkspaceAutomationSave) =>
      locks.withLock(
        input.requestId,
        Effect.gen(function* () {
          const ref = normalizeWorkspaceItemRef(input.source.ref);
          if (!ref) return yield* fail("invalid-input", "This source reference is invalid.");
          const id = ScheduledTaskId.make(`workspace:${input.requestId}`);
          const threadId = ThreadId.make(`workspace-automation:${input.requestId}`);
          const commandId = CommandId.make(`workspace-automation:${input.requestId}`);
          if (
            (input.task.id !== undefined && input.task.id !== id) ||
            (input.task.threadId !== undefined &&
              input.task.threadId !== null &&
              input.task.threadId !== threadId) ||
            input.task.requireExisting === true
          )
            return yield* fail(
              "invalid-input",
              "Create this automation through its source editor. Edit saved schedules in Settings.",
            );
          if (ref.type === "thread" && ref.threadId === threadId)
            return yield* fail(
              "invalid-input",
              "An automation cannot use its own thread as its source.",
            );
          yield* tools.config(input.task.projectId);
          const fingerprint = encodeJson({
            source: workspaceItemKey(ref),
            projectId: input.task.projectId,
            workspace: input.task.workspaceStrategy,
          });
          yield* sql`INSERT INTO workspace_automation_starts(request_id,fingerprint) VALUES(${input.requestId},${fingerprint}) ON CONFLICT(request_id) DO NOTHING`;
          const rows = yield* sql<{
            fingerprint: string;
          }>`SELECT fingerprint FROM workspace_automation_starts WHERE request_id=${input.requestId}`;
          if (rows[0]?.fingerprint !== fingerprint)
            return yield* fail(
              "conflict",
              "This save already started with a different source or workspace. Retry with the original selections, or close the editor and start another automation.",
            );
          const result = yield* launch.launch({
            commandId,
            threadId,
            projectId: input.task.projectId,
            title: input.task.title,
            modelSelection: input.task.modelSelection,
            runtimeMode: input.task.runtimeMode,
            interactionMode: input.task.interactionMode,
            workspaceStrategy: input.task.workspaceStrategy,
            createdBy: "user",
            creationSource: input.task.creationSource ?? "web",
          });
          const source = { ...input.source, ref };
          yield* links.link({
            a: { ref: { type: "thread", threadId: result.threadId } },
            b: source,
            viewing: source,
            source: { type: "action", action: "start-automation" },
          });
          if (ref.type !== "project" || ref.projectId !== input.task.projectId)
            yield* links.link({
              a: { ref: { type: "thread", threadId: result.threadId } },
              b: { ref: { type: "project", projectId: input.task.projectId } },
              viewing: source,
              source: { type: "action", action: "start-automation" },
            });
          // The first scheduled dispatch becomes possible only after the idle thread and its links exist.
          return yield* schedules.upsert({
            ...input.task,
            id,
            commandId,
            threadId: result.threadId,
            createdBy: "user",
          });
        }).pipe(
          Effect.mapError((error) =>
            isToolsError(error)
              ? error
              : fail(
                  "unavailable",
                  "The automation was not saved. An idle thread may already exist; retrying this editor reuses it and never starts a provider turn.",
                ),
          ),
        ),
      ),
  };
});
export class WorkspaceAutomation extends Context.Service<
  WorkspaceAutomation,
  Effect.Success<typeof make>
>()("t3/workspace/WorkspaceAutomation") {}
export const layer = Layer.effect(WorkspaceAutomation, make);
