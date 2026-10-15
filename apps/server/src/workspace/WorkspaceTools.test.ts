import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
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
