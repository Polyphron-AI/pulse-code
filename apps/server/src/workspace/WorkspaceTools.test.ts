import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId, WorkspaceDriveRoot } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Tools from "./WorkspaceTools.ts";
import { ServerEnvironmentIdentity } from "../environment/ServerEnvironment.ts";
const projectId = ProjectId.make("project-tools");
const encodeRoot = Schema.encodeSync(Schema.fromJsonString(WorkspaceDriveRoot));
const seedWorkspaceProject = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Tools','/synthetic','[]','2026-10-15T12:00:00Z','2026-10-15T12:00:00Z')`;
  return projectId;
});
const layer = Tools.layer.pipe(
  Layer.provideMerge(
    Layer.succeed(
      ServerEnvironmentIdentity,
      ServerEnvironmentIdentity.of({
        getEnvironmentId: Effect.succeed(EnvironmentId.make("tools-test")),
      }),
    ),
  ),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
it.effect("preserves a designated Drive root through legacy and forged-property config saves", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const sql = yield* SqlClient.SqlClient;
    const root = {
      linkId: "wl_00000000-0000-0000-0000-000000000001",
      connectionId: "drv_00000000-0000-0000-0000-000000000001",
      fileId: "folder",
    };
    const original = yield* tools.saveConfig({
      projectId,
      taskColumns: ["To do", "Review", "Done"],
      browserThreadId: null,
      completedColumn: "Review",
      expectedRevision: 0,
    });
    yield* sql`UPDATE workspace_project_config SET drive_root_json=${encodeRoot(root)} WHERE project_id=${projectId}`;
    const forged = { ...original, driveRoot: null };
    const saved = yield* tools.saveConfig(forged);
    expect(saved.driveRoot).toEqual(root);
    expect(saved.completedColumn).toBe("Review");
    const legacy = yield* tools.saveConfig({
      projectId,
      taskColumns: original.taskColumns,
      browserThreadId: null,
    });
    expect(legacy.driveRoot).toEqual(root);
    expect((yield* tools.config(projectId)).driveRoot).toEqual(root);
    yield* sql`UPDATE workspace_project_config SET drive_root_json='invalid-json' WHERE project_id=${projectId}`;
    const damaged = yield* tools.config(projectId);
    expect(damaged).not.toHaveProperty("driveRoot");
    expect(damaged.taskColumns).toEqual(original.taskColumns);
    expect(damaged.completedColumn).toBe("Review");
    const savedWithDamage = yield* tools.saveConfig({
      projectId,
      taskColumns: original.taskColumns,
      browserThreadId: null,
    });
    expect(savedWithDamage).not.toHaveProperty("driveRoot");
    const task = yield* tools.upsertTask({ projectId, title: "Root recovery", column: "To do" });
    expect(
      (yield* tools.transitionTask({
        id: task.id,
        expectedRevision: task.revision,
        change: { type: "completion", completed: true },
      })).column,
    ).toBe("Review");
    expect(
      (yield* sql`SELECT drive_root_json FROM workspace_project_config WHERE project_id=${projectId}`)[0]!
        .drive_root_json,
    ).toBe("invalid-json");
  }).pipe(Effect.provide(layer)),
);
it.effect("defaults new tasks to owner and preserves explicit unassignment", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const task = yield* tools.upsertTask({ projectId, title: "Review", column: "To do" });
    expect(task.owner).toBe("environment-owner");
    const cleared = yield* tools.patchTask({
      id: task.id,
      expectedRevision: task.revision,
      owner: null,
    });
    expect(cleared.owner).toBeNull();
    expect(cleared.revision).toBe(task.revision + 1);
    const legacy = yield* tools.upsertTask({
      id: task.id,
      projectId,
      title: "Review again",
      column: "To do",
    });
    expect(legacy.owner).toBeNull();
    const assigned = yield* tools.patchTask({
      id: task.id,
      expectedRevision: legacy.revision,
      owner: "environment-owner",
    });
    expect(assigned.owner).toBe("environment-owner");
    expect((yield* tools.getTask(task.id)).owner).toBe("environment-owner");
    expect((yield* tools.listTasks(projectId)).tasks[0]?.owner).toBe("environment-owner");
    expect(
      (yield* tools
        .patchTask({ id: task.id, expectedRevision: legacy.revision, owner: null })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
    expect(
      (yield* tools.upsertTask({ id: task.id, projectId, title: "Renamed", column: "Done" })).owner,
    ).toBe("environment-owner");
    const unassigned = yield* tools.upsertTask({
      projectId,
      title: "Unassigned",
      column: "To do",
      owner: null,
    });
    expect(unassigned.owner).toBeNull();
    const same = yield* tools.patchTask({
      id: unassigned.id,
      expectedRevision: unassigned.revision,
      owner: null,
    });
    expect(same.revision).toBe(unassigned.revision);
    expect((yield* tools.upsertTask({ ...unassigned, owner: "environment-owner" })).owner).toBe(
      "environment-owner",
    );
    expect((yield* tools.upsertTask({ ...unassigned, owner: null })).owner).toBeNull();
  }).pipe(Effect.provide(layer)),
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

it.effect.each([
  { change: "enters", affectedCount: 2 },
  { change: "leaves", affectedCount: 0 },
])(
  "requires fresh confirmation when a task $change the affected columns",
  ({ change, affectedCount }) =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      const done = yield* tools.upsertTask({ projectId, title: "Done", column: "Done" });
      const open = yield* tools.upsertTask({ projectId, title: "Open", column: "To do" });
      const config = yield* tools.config(projectId);
      const save = {
        projectId,
        taskColumns: config.taskColumns,
        browserThreadId: null,
        completedColumn: "In progress",
        expectedRevision: config.revision,
      };
      const prompt = yield* tools.saveConfig(save).pipe(Effect.flip);
      yield* tools.transitionTask({
        id: change === "enters" ? open.id : done.id,
        expectedRevision: 0,
        change: { type: "column", column: change === "enters" ? "Done" : "To do" },
      });
      const tasksBeforeConfirmation = yield* tools.listTasks(projectId);
      const revisionBeforeConfirmation = Option.getOrNull(yield* Stream.runHead(tools.changes));
      const stale = yield* tools
        .saveConfig({ ...save, confirmCompletionChanges: true, expectedAffectedCount: 1 })
        .pipe(Effect.flip);
      expect(stale).toMatchObject({
        kind: "conflict",
        reason: "completion-confirmation-required",
        affectedCount,
      });
      expect(prompt).toMatchObject({
        reason: "completion-confirmation-required",
        affectedCount: 1,
      });
      expect(yield* tools.config(projectId)).toEqual(config);
      expect(yield* tools.listTasks(projectId)).toEqual(tasksBeforeConfirmation);
      expect(Option.getOrNull(yield* Stream.runHead(tools.changes))).toBe(
        revisionBeforeConfirmation,
      );
      const saved = yield* tools.saveConfig({
        ...save,
        confirmCompletionChanges: true,
        expectedAffectedCount: affectedCount,
      });
      expect(saved.completedColumn).toBe("In progress");
      expect(saved.revision).toBe(config.revision + 1);
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

it.effect("preserves metadata on legacy upsert and clears only explicitly", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const task = yield* tools.upsertTask({ projectId, title: "Launch", column: "To do" });
    const dated = yield* tools.patchTask({
      id: task.id,
      expectedRevision: task.revision!,
      dueOn: "2026-10-16",
      areaLabel: "Marketing",
    });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TRIGGER reject_legacy_metadata BEFORE UPDATE OF due_on,area_label ON workspace_tasks BEGIN SELECT RAISE(ABORT, 'Legacy save must omit metadata'); END`;
    const legacy = yield* tools.upsertTask({
      id: task.id,
      projectId,
      title: "Launch review",
      column: "To do",
    });
    expect(legacy.dueOn).toBe("2026-10-16");
    expect(legacy.areaLabel).toBe("Marketing");
    expect(legacy.revision).toBeGreaterThan(dated.revision!);
    yield* sql`DROP TRIGGER reject_legacy_metadata`;
    const cleared = yield* tools.patchTask({
      id: task.id,
      expectedRevision: legacy.revision!,
      dueOn: null,
      areaLabel: null,
    });
    expect(cleared.dueOn).toBeNull();
    const restarted = yield* Tools.make;
    expect((yield* restarted.getTask(task.id)).areaLabel).toBeNull();
  }).pipe(Effect.provide(layer)),
);
it.effect(
  "creates all metadata atomically and patches title, column and metadata in one revision",
  () =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      const task = yield* tools.upsertTask({
        projectId,
        title: "Launch",
        column: "To do",
        dueOn: "2024-02-29",
        areaLabel: "  Marketing  ",
      });
      expect(task).toMatchObject({ dueOn: "2024-02-29", areaLabel: "Marketing", revision: 0 });
      const changed = yield* tools.patchTask({
        id: task.id,
        expectedRevision: task.revision!,
        title: "Review",
        column: "Done",
        dueOn: "2026-10-16",
        areaLabel: null,
      });
      expect(changed).toMatchObject({
        title: "Review",
        column: "Done",
        done: true,
        dueOn: "2026-10-16",
        areaLabel: null,
        revision: 1,
      });
      expect(yield* tools.patchTask({ id: task.id, expectedRevision: 0, column: "Done" })).toEqual(
        changed,
      );
      expect(
        (yield* tools
          .patchTask({ id: task.id, expectedRevision: 0, title: "Stale" })
          .pipe(Effect.flip)).kind,
      ).toBe("conflict");
      expect(
        yield* tools
          .patchTask({ id: task.id, expectedRevision: 1, column: "Missing" })
          .pipe(Effect.flip),
      ).toMatchObject({
        kind: "invalid-input",
        message: "Choose a column from this project's task columns.",
      });
      expect(
        (yield* tools
          .patchTask({ id: task.id, expectedRevision: 1, dueOn: "2026-02-30" })
          .pipe(Effect.flip)).kind,
      ).toBe("invalid-input");
      expect(
        (yield* tools
          .upsertTask({ projectId, title: "Bad", column: "To do", areaLabel: " " })
          .pipe(Effect.flip)).kind,
      ).toBe("invalid-input");
      expect((yield* tools.listTasks(projectId)).tasks[0]).toEqual(changed);
      yield* tools.deleteTask(task.id);
      expect(
        (yield* tools
          .patchTask({ id: task.id, expectedRevision: 2, title: "Gone" })
          .pipe(Effect.flip)).kind,
      ).toBe("not-found");
    }).pipe(Effect.provide(layer)),
);
it.effect("rolls back a failed metadata write without announcing a change", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const task = yield* tools.upsertTask({ projectId, title: "Launch", column: "To do" });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TRIGGER reject_metadata BEFORE UPDATE ON workspace_tasks BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END`;
    expect(
      (yield* tools
        .patchTask({ id: task.id, expectedRevision: 0, dueOn: "2026-10-16" })
        .pipe(Effect.flip)).kind,
    ).toBe("unavailable");
    expect(yield* tools.getTask(task.id)).toEqual(task);
    expect(Option.getOrNull(yield* Stream.runHead(tools.changes))).toBe(1);
  }).pipe(Effect.provide(layer)),
);
it.effect("normalizes legacy Done-only settings only when no completion is affected", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const input = { projectId, taskColumns: ["Done"], browserThreadId: null };
    expect(yield* tools.saveConfig(input)).toMatchObject({ completedColumn: null, revision: 1 });
    yield* tools.saveConfig({
      projectId,
      taskColumns: ["To do", "Done"],
      browserThreadId: null,
      completedColumn: "Done",
      expectedRevision: 1,
    });
    const task = yield* tools.upsertTask({ projectId, title: "Done task", column: "Done" });
    const error = yield* tools.saveConfig(input).pipe(Effect.flip);
    expect(error.kind).toBe("conflict");
    expect(error.message).toBe(
      "Keep at least one open column, or move tasks out of the completed column.",
    );
    expect(yield* tools.getTask(task.id)).toEqual(task);
    expect((yield* tools.config(projectId)).completedColumn).toBe("Done");
  }).pipe(Effect.provide(layer)),
);
it.effect("keeps legacy trimmed titles and title-specific validation errors", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    expect(
      (yield* tools.upsertTask({ projectId, title: `  ${"a".repeat(240)}  `, column: "To do" }))
        .title,
    ).toBe("a".repeat(240));
    for (const title of ["", " ", "a".repeat(241)]) {
      const error = yield* tools
        .upsertTask({ projectId, title, column: "To do" })
        .pipe(Effect.flip);
      expect(error).toMatchObject({
        kind: "invalid-input",
        message: "Enter a task title and choose one of this project's columns.",
      });
    }
  }).pipe(Effect.provide(layer)),
);
it.effect(
  "requires revision for an explicit replacement while removing the designated column",
  () =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      expect(
        (yield* tools
          .saveConfig({
            projectId,
            taskColumns: ["To do", "Review"],
            browserThreadId: null,
            completedColumn: "Review",
          })
          .pipe(Effect.flip)).kind,
      ).toBe("conflict");
      expect((yield* tools.config(projectId)).completedColumn).toBe("Done");
    }).pipe(Effect.provide(layer)),
);

it.effect("reads the current counter without changing the existing changes stream", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    expect(yield* tools.currentChange).toBe(0);
    const emitted = yield* tools.changes.pipe(
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild({ startImmediately: true }),
    );
    yield* tools.upsertTask({ projectId, title: "First", column: "To do" });
    expect(yield* tools.currentChange).toBe(1);
    yield* tools.upsertTask({ projectId, title: "Second", column: "To do" });
    expect(yield* tools.currentChange).toBe(2);
    expect(yield* Fiber.join(emitted)).toEqual([1, 2]);
  }).pipe(Effect.provide(layer)),
);

it.effect("preserves description when an old client omits it", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const sql = yield* SqlClient.SqlClient;
    const root = {
      linkId: "wl_00000000-0000-0000-0000-000000000001",
      connectionId: "drv_00000000-0000-0000-0000-000000000001",
      fileId: "folder",
    };
    yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,completed_column,revision,drive_root_json) VALUES(${projectId},'["To do","Review","Done"]','Review',7,${encodeRoot(root)})`;
    const saved = yield* tools.saveConfig({
      ...(yield* tools.config(projectId)),
      description: " Brand and growth ",
    });
    expect(saved.description).toBe("Brand and growth");
    expect(saved.completedColumn).toBe("Review");
    expect(saved.driveRoot).toEqual(root);
    const {
      description: ignored,
      completedColumn: _completed,
      driveRoot: _root,
      ...oldWire
    } = yield* tools.config(projectId);
    expect(ignored).toBe("Brand and growth");
    yield* tools.saveConfig(oldWire);
    expect(yield* tools.config(projectId)).toEqual(saved);
    const cleared = yield* tools.saveConfig({ ...oldWire, description: null });
    expect(cleared).toEqual({ ...saved, description: null, revision: saved.revision + 1 });
    const restarted = yield* Tools.make;
    expect(yield* restarted.config(projectId)).toEqual(cleared);
  }).pipe(Effect.provide(layer)),
);
it.effect("defaults descriptions to null and persists them across a service restart", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const original = yield* tools.config(projectId);
    expect(original.description).toBeNull();
    const saved = yield* tools.saveConfig({ ...original, description: "  Launch \u{1f680}  " });
    const restarted = yield* Tools.make;
    expect((yield* restarted.config(projectId)).description).toBe("Launch \u{1f680}");
    expect(yield* tools.currentChange).toBe(1);
    expect(yield* tools.saveConfig({ ...saved, description: "  Launch \u{1f680}  " })).toEqual(
      saved,
    );
    expect(yield* tools.currentChange).toBe(1);
    const cleared = yield* tools.saveConfig({ ...saved, description: " \n\t\u2003 " });
    expect(cleared.description).toBeNull();
    expect(yield* tools.currentChange).toBe(2);
    expect(Option.getOrNull(yield* Stream.runHead(tools.changes))).toBe(2);
  }).pipe(Effect.provide(layer)),
);
it.effect.each(["x".repeat(600), "\u{1f680}".repeat(300), ` ${"x".repeat(598)} `])(
  "accepts 600 raw UTF-16 units and trims only after validation %#",
  (description) =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      const saved = yield* tools.saveConfig({ ...(yield* tools.config(projectId)), description });
      expect(saved.description).toBe(description.trim());
      expect((yield* tools.config(projectId)).description).toBe(description.trim());
    }).pipe(Effect.provide(layer)),
);
it.effect.each(["x".repeat(601), "\u{1f680}".repeat(300) + "x", ` ${"x".repeat(600)} `])(
  "rejects oversize raw service descriptions without changing storage or announcing %#",
  (description) =>
    Effect.gen(function* () {
      yield* seedWorkspaceProject;
      const tools = yield* Tools.WorkspaceTools;
      const saved = yield* tools.saveConfig({
        ...(yield* tools.config(projectId)),
        description: "Kept",
      });
      const error = yield* tools.saveConfig({ ...saved, description }).pipe(Effect.flip);
      expect(error.kind).toBe("invalid-input");
      expect(yield* tools.config(projectId)).toEqual(saved);
      expect(yield* tools.currentChange).toBe(1);
    }).pipe(Effect.provide(layer)),
);
it.effect("rejects 601 raw description units before opening a storage transaction", () =>
  Effect.gen(function* () {
    const tools = yield* Tools.WorkspaceTools;
    const sql = yield* SqlClient.SqlClient;
    const transaction = vi.spyOn(sql, "withTransaction");
    try {
      const error = yield* tools
        .saveConfig({
          projectId,
          description: "x".repeat(601),
          taskColumns: ["To do", "Done"],
          browserThreadId: null,
        })
        .pipe(Effect.flip);
      expect(error).toMatchObject({
        kind: "invalid-input",
        message: "Use a project description of at most 600 characters.",
      });
      expect(transaction).not.toHaveBeenCalled();
      expect(yield* tools.currentChange).toBe(0);
    } finally {
      transaction.mockRestore();
    }
  }).pipe(Effect.provide(layer)),
);
it.effect("preserves descriptions through concurrent omitted-field saves", () =>
  Effect.gen(function* () {
    yield* seedWorkspaceProject;
    const tools = yield* Tools.WorkspaceTools;
    const original = yield* tools.config(projectId);
    yield* Effect.all(
      [
        tools.saveConfig({ ...original, description: "Concurrent description" }),
        tools.saveConfig({ projectId, taskColumns: ["Backlog", "Done"], browserThreadId: null }),
      ],
      { concurrency: "unbounded" },
    );
    const current = yield* tools.config(projectId);
    expect(current.description).toBe("Concurrent description");
    for (const input of [
      { ...current, taskColumns: ["Done", "Done"], description: "Invalid columns" },
      { ...current, browserThreadId: ThreadId.make("foreign"), description: "Invalid browser" },
    ])
      expect((yield* tools.saveConfig(input).pipe(Effect.flip)).kind).toBe("invalid-input");
    expect(yield* tools.config(projectId)).toEqual(current);
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE projection_projects SET deleted_at='2026-10-17T12:00:00Z' WHERE project_id=${projectId}`;
    expect(
      (yield* tools.saveConfig({ ...current, description: null }).pipe(Effect.flip)).kind,
    ).toBe("not-found");
    expect((yield* tools.config(projectId).pipe(Effect.flip)).kind).toBe("not-found");
    expect(
      (yield* sql`SELECT description FROM workspace_project_config WHERE project_id=${projectId}`)[0]
        ?.description,
    ).toBe("Concurrent description");
  }).pipe(Effect.provide(layer)),
);
