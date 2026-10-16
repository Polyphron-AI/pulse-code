import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Tools from "./WorkspaceTools.ts";
const projectId = ProjectId.make("project-tools");
const seedWorkspaceProject = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Tools','/synthetic','[]','2026-10-15T12:00:00Z','2026-10-15T12:00:00Z')`;
  return projectId;
});
const layer = Tools.layer.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
it.effect(
  "persists basic tasks and project columns, keeps deleted records, and rejects cross-project or stale edits",
  () =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      expect((yield* tools.config(projectId)).taskColumns).toEqual([
        "To do",
        "In progress",
        "Done",
      ]);
      const id = "wskt_00000000-0000-0000-0000-000000000001";
      const input = { id, projectId, title: "Review launch", column: "To do" };
      yield* tools.upsertTask(input);
      yield* tools.upsertTask(input);
      expect((yield* tools.listTasks(projectId)).tasks).toHaveLength(1);
      expect((yield* tools.upsertTask({ ...input, title: "Updated", column: "Done" })).title).toBe(
        "Updated",
      );
      expect(
        (yield* tools
          .saveConfig({ projectId, taskColumns: ["To do", "In progress"], browserThreadId: null })
          .pipe(Effect.flip)).kind,
      ).toBe("conflict");
      expect(
        (yield* tools
          .saveConfig({ projectId, taskColumns: ["Done", "Done"], browserThreadId: null })
          .pipe(Effect.flip)).kind,
      ).toBe("invalid-input");
      yield* tools.deleteTask(id);
      expect((yield* tools.getTask(id).pipe(Effect.flip)).kind).toBe("not-found");
      expect((yield* tools.upsertTask(input).pipe(Effect.flip)).kind).toBe("not-found");
      expect((yield* tools.listTasks(projectId)).tasks).toHaveLength(0);
      yield* tools.saveConfig({
        projectId,
        taskColumns: ["Backlog", "Complete"],
        browserThreadId: null,
      });
      const restarted = yield* Tools.make;
      expect((yield* restarted.config(projectId)).taskColumns).toEqual(["Backlog", "Complete"]);
      const sql = yield* SqlClient.SqlClient;
      expect(yield* sql`SELECT id FROM workspace_tasks WHERE deleted=1`).toHaveLength(1);
    }).pipe(Effect.provide(layer)),
);
it.effect.each([
  { client: "legacy rename", taskColumns: ["Backlog", "Complete"] },
  { client: "legacy removal", taskColumns: ["To do", "In progress"] },
  { client: "revision-aware rename", taskColumns: ["Backlog", "Complete"] },
  { client: "revision-aware removal", taskColumns: ["To do", "In progress"] },
])(
  "clears the designation after a $client of Done on an empty project",
  ({ client, taskColumns }) =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      const saved = yield* tools.saveConfig({
        projectId,
        taskColumns,
        browserThreadId: null,
        ...(client.startsWith("revision-aware")
          ? { expectedRevision: 0, completedColumn: "Done" }
          : {}),
      });
      expect(saved.completedColumn).toBeNull();
      expect(saved.taskColumns).toEqual(taskColumns);
      expect(saved.revision).toBe(1);
      const restarted = yield* Tools.make;
      expect(yield* restarted.config(projectId)).toEqual(saved);
    }).pipe(Effect.provide(layer)),
);

it.effect(
  "protects tasks in Done before a legacy rename and preserves tasks after they move out",
  () =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      const done = yield* tools.upsertTask({ projectId, title: "Finished", column: "Done" });
      const open = yield* tools.upsertTask({ projectId, title: "Open", column: "To do" });
      const input = { projectId, taskColumns: ["To do", "Complete"], browserThreadId: null };
      const error = yield* tools.saveConfig(input).pipe(Effect.flip);
      expect(error.kind).toBe("conflict");
      expect(error.message).toBe("Move tasks out of a column before removing or renaming it.");
      expect(yield* tools.getTask(done.id)).toEqual(done);
      expect((yield* tools.config(projectId)).completedColumn).toBe("Done");
      const moved = yield* tools.transitionTask({
        id: done.id,
        expectedRevision: done.revision!,
        change: { type: "column", column: "To do" },
      });
      expect((yield* tools.saveConfig(input)).completedColumn).toBeNull();
      expect(yield* tools.getTask(done.id)).toEqual(moved);
      expect(yield* tools.getTask(open.id)).toEqual(open);
    }).pipe(Effect.provide(layer)),
);

it.effect("reads a dangling designation left by an older binary as null without writing", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,completed_column,revision) VALUES(${projectId},'["Backlog","Complete"]','Done',4)`;
    const tools = yield* Tools.WorkspaceTools;
    const task = yield* tools.upsertTask({ projectId, title: "Kept", column: "Complete" });
    expect(yield* tools.config(projectId)).toMatchObject({
      taskColumns: ["Backlog", "Complete"],
      completedColumn: null,
      revision: 4,
    });
    expect(yield* tools.getTask(task.id)).toEqual(task);
    const rows =
      yield* sql`SELECT completed_column,revision FROM workspace_project_config WHERE project_id=${projectId}`;
    expect(rows[0]).toEqual({ completed_column: "Done", revision: 4 });
  }).pipe(Effect.provide(layer)),
);
it.effect("caps task lists and refuses deleted projects and foreign browser threads", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO workspace_tasks ${sql.insert(Array.from({ length: 201 }, (_, index) => ({ id: `wskt_00000000-0000-0000-0000-${index.toString(16).padStart(12, "0")}`, project_id: projectId, title: `Task ${index}`, column_name: "To do" })))}`;
    const result = yield* tools.listTasks(projectId);
    expect(result.tasks).toHaveLength(200);
    expect(result.incomplete).toBe(true);
    expect(
      (yield* tools
        .saveConfig({
          projectId,
          taskColumns: ["To do"],
          browserThreadId: ThreadId.make("missing"),
        })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    yield* sql`UPDATE projection_projects SET deleted_at='2026-10-15T13:00:00Z' WHERE project_id=${projectId}`;
    expect((yield* tools.listTasks(projectId).pipe(Effect.flip)).kind).toBe("not-found");
  }).pipe(Effect.provide(layer)),
);

it.effect("derives completion from the designated column and rejects stale moves", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const created = yield* tools.upsertTask({ projectId, title: "Review launch", column: "To do" });
    const done = yield* tools.transitionTask({
      id: created.id,
      expectedRevision: created.revision!,
      change: { type: "completion", completed: true },
    });
    expect(done.column).toBe("Done");
    expect(done.done).toBe(true);
    const repeated = yield* tools.transitionTask({
      id: created.id,
      expectedRevision: created.revision!,
      change: { type: "completion", completed: true },
    });
    expect(repeated.revision).toBe(done.revision);
    const stale = yield* tools
      .transitionTask({
        id: created.id,
        expectedRevision: created.revision!,
        change: { type: "column", column: "In progress" },
      })
      .pipe(Effect.flip);
    expect(stale.kind).toBe("conflict");
    const reopened = yield* tools.transitionTask({
      id: created.id,
      expectedRevision: done.revision!,
      change: { type: "completion", completed: false },
    });
    expect(reopened.column).toBe("To do");
    expect(reopened.done).toBe(false);
  }).pipe(Effect.provide(layer)),
);

it.effect("validates completion designation, confirmation and immutable ownership", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    expect(
      (yield* tools
        .saveConfig({
          projectId,
          taskColumns: ["Done"],
          browserThreadId: null,
          completedColumn: "Done",
          expectedRevision: 0,
        })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    const a = yield* tools.upsertTask({ projectId, title: "A", column: "To do" });
    const b = yield* tools.upsertTask({ projectId, title: "B", column: "Done" });
    const config = yield* tools.config(projectId);
    const save = {
      projectId,
      taskColumns: config.taskColumns,
      browserThreadId: null,
      completedColumn: "In progress",
      expectedRevision: config.revision!,
    };
    expect(yield* tools.saveConfig(save).pipe(Effect.flip)).toMatchObject({
      kind: "conflict",
      reason: "completion-confirmation-required",
      message: "Changing the completed column changes completion for 1 task. Confirm to continue.",
    });
    expect((yield* tools.getTask(b.id)).revision).toBe(b.revision);
    const changed = yield* tools.saveConfig({ ...save, confirmCompletionChanges: true });
    expect(changed.completedColumn).toBe("In progress");
    expect((yield* tools.getTask(b.id)).revision).toBe(b.revision! + 1);
    expect((yield* tools.getTask(a.id)).revision).toBe(a.revision);
    expect(
      (yield* tools.saveConfig({ ...save, confirmCompletionChanges: true }).pipe(Effect.flip)).kind,
    ).toBe("conflict");
    expect(
      (yield* tools
        .saveConfig({ ...save, expectedRevision: changed.revision!, completedColumn: "Missing" })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    expect(
      (yield* tools
        .saveConfig({
          ...save,
          taskColumns: ["To do", "In progress"],
          expectedRevision: changed.revision!,
        })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
    const other = ProjectId.make("other-project");
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${other},'Other','/synthetic','[]','now','now')`;
    expect(
      (yield* tools
        .upsertTask({ id: a.id, projectId: other, title: "Moved", column: "To do" })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
    const preserved = yield* tools.saveConfig({
      projectId,
      taskColumns: config.taskColumns,
      browserThreadId: null,
    });
    expect(preserved.completedColumn).toBe("In progress");
    yield* tools.saveConfig({
      ...save,
      completedColumn: null,
      expectedRevision: preserved.revision!,
      confirmCompletionChanges: true,
    });
    expect(
      (yield* tools
        .transitionTask({
          id: a.id,
          expectedRevision: a.revision!,
          change: { type: "completion", completed: false },
        })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    const moved = yield* tools.transitionTask({
      id: a.id,
      expectedRevision: a.revision!,
      change: { type: "column", column: "In progress" },
    });
    expect(moved.done).toBe(false);
  }).pipe(Effect.provide(layer)),
);
it.effect("keeps stable retries unchanged and increments legacy writes and tombstones", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const created = yield* tools.upsertTask({ projectId, title: "A", column: "To do" });
    expect(yield* tools.upsertTask(created)).toEqual(created);
    const changed = yield* tools.upsertTask({ ...created, title: "B" });
    expect(changed.revision).toBe(created.revision! + 1);
    expect(
      (yield* tools
        .transitionTask({
          id: created.id,
          expectedRevision: created.revision!,
          change: { type: "column", column: "Done" },
        })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
    yield* tools.deleteTask(created.id);
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      revision: number;
      deleted: number;
    }>`SELECT revision,deleted FROM workspace_tasks WHERE id=${created.id}`;
    expect(rows[0]).toEqual({ revision: changed.revision! + 1, deleted: 1 });
    expect((yield* tools.upsertTask(created).pipe(Effect.flip)).kind).toBe("not-found");
  }).pipe(Effect.provide(layer)),
);

it.effect("serializes competing moves and announces only committed changes", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const task = yield* tools.upsertTask({ projectId, title: "Task", column: "To do" });
    const results = yield* Effect.all(
      ["Done", "In progress"].map((column) =>
        tools
          .transitionTask({
            id: task.id,
            expectedRevision: task.revision!,
            change: { type: "column", column },
          })
          .pipe(Effect.result),
      ),
      { concurrency: "unbounded" },
    );
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(1);
    expect(results.filter((result) => result._tag === "Failure")).toHaveLength(1);
    const current = yield* tools.getTask(task.id);
    expect(current.revision).toBe(task.revision! + 1);
    yield* tools.transitionTask({
      id: task.id,
      expectedRevision: task.revision!,
      change: { type: "column", column: current.column },
    });
    yield* tools.upsertTask(current);
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TRIGGER reject_task_revision BEFORE UPDATE ON workspace_tasks BEGIN SELECT RAISE(ABORT, 'Synthetic write failure'); END`;
    const before = yield* tools.config(projectId);
    const completedColumn = "In progress";
    expect(
      (yield* tools
        .saveConfig({
          projectId,
          taskColumns: before.taskColumns,
          browserThreadId: null,
          completedColumn,
          expectedRevision: before.revision!,
          confirmCompletionChanges: true,
        })
        .pipe(Effect.flip)).kind,
    ).toBe("unavailable");
    expect(yield* tools.config(projectId)).toEqual(before);
    expect(yield* tools.getTask(task.id)).toEqual(current);
    expect(Option.getOrNull(yield* Stream.runHead(tools.changes))).toBe(2);
  }).pipe(Effect.provide(layer)),
);
it.effect("keeps a custom Done lane open until designated and reopens in configured order", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO workspace_project_config(project_id,columns_json) VALUES(${projectId},'["Backlog","Done","Review"]')`;
    const tools = yield* Tools.WorkspaceTools;
    const config = yield* tools.config(projectId);
    expect(config.completedColumn).toBeNull();
    const task = yield* tools.upsertTask({ projectId, title: "Custom", column: "Done" });
    expect(task.done).toBe(false);
    const settings = {
      projectId,
      taskColumns: config.taskColumns,
      browserThreadId: null,
      completedColumn: "Review",
    };
    expect((yield* tools.saveConfig(settings).pipe(Effect.flip)).kind).toBe("conflict");
    yield* tools.saveConfig({ ...settings, expectedRevision: 0 });
    const done = yield* tools.transitionTask({
      id: task.id,
      expectedRevision: task.revision!,
      change: { type: "completion", completed: true },
    });
    expect(done.column).toBe("Review");
    expect(done.done).toBe(true);
    expect((yield* tools.listTasks(projectId)).tasks[0]).toEqual(done);
    const reopened = yield* tools.transitionTask({
      id: done.id,
      expectedRevision: done.revision!,
      change: { type: "completion", completed: false },
    });
    expect(reopened.column).toBe("Backlog");
    expect(
      (yield* tools.transitionTask({
        id: done.id,
        expectedRevision: 0,
        change: { type: "completion", completed: false },
      })).revision,
    ).toBe(reopened.revision);
    expect(
      (yield* tools
        .transitionTask({
          id: done.id,
          expectedRevision: reopened.revision!,
          change: { type: "column", column: "Missing" },
        })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    yield* tools.deleteTask(task.id);
    expect(
      (yield* tools
        .transitionTask({
          id: done.id,
          expectedRevision: reopened.revision!,
          change: { type: "completion", completed: true },
        })
        .pipe(Effect.flip)).kind,
    ).toBe("not-found");
  }).pipe(Effect.provide(layer)),
);
