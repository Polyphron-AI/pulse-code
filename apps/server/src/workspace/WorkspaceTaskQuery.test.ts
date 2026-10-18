import { ServerEnvironmentIdentity } from "../environment/ServerEnvironment.ts";
import { EnvironmentId as OverviewEnvironmentId } from "@t3tools/contracts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import {
  ProjectId,
  WorkspaceTaskId,
  type WorkspaceTaskQuery,
  WorkspaceTaskPage,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Tools from "./WorkspaceTools.ts";
const isTaskPage = Schema.is(WorkspaceTaskPage);
const layer = Tools.layer.pipe(
  Layer.provideMerge(
    Layer.succeed(
      ServerEnvironmentIdentity,
      ServerEnvironmentIdentity.of({
        getEnvironmentId: Effect.succeed(OverviewEnvironmentId.make("workspace-test")),
      }),
    ),
  ),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
const a = ProjectId.make("a"),
  b = ProjectId.make("b"),
  deleted = ProjectId.make("deleted");
const id = (n: number) =>
  WorkspaceTaskId.make(`wskt_00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`);
const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  for (const projectId of [a, b, deleted])
    yield* sql`INSERT INTO projection_projects ${sql.insert({ project_id: projectId, title: projectId === a ? "Alpha" : "Beta", workspace_root: "/synthetic", scripts_json: "[]", created_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", deleted_at: projectId === deleted ? "2026-10-16T00:00:00Z" : null })}`;
  yield* sql`INSERT INTO workspace_tasks ${sql.insert(Array.from({ length: 250 }, (_, n) => ({ id: id(n), project_id: n % 2 === 0 ? a : b, title: n === 1 ? "Review keyword plan" : "Review launch", column_name: n % 5 === 0 ? "Done" : "To do", due_on: "2026-10-16", area_label: n === 2 ? "Marketing 100%_" : null, owner: n % 2 === 0 ? "environment-owner" : null })))}`;
  yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name) VALUES(${id(999)},${deleted},'Deleted project','To do')`;
  return yield* Tools.WorkspaceTools;
});
it.effect("enumerates equal-date summaries beyond 200 without fanout", () =>
  Effect.gen(function* () {
    const tools = yield* seed;
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = yield* tools.queryTasks({
        state: "all",
        limit: 37,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.tasks.length).toBeLessThanOrEqual(37);
      expect(page.total).toBe(250);
      expect(page.openTotal).toBe(200);
      expect(page.projects.length).toBeLessThanOrEqual(2);
      expect(page.laneTotals.reduce((sum, lane) => sum + lane.total, 0)).toBeLessThanOrEqual(250);
      seen.push(...page.tasks.map((task) => task.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
    expect(seen).toEqual([
      ...Array.from({ length: 125 }, (_, n) => id(n * 2)),
      ...Array.from({ length: 125 }, (_, n) => id(n * 2 + 1)),
    ]);
    const filtered = yield* tools.queryTasks({ text: "keyword", state: "open", limit: 1 });
    expect(filtered.total).toBe(1);
    expect(filtered.tasks[0]?.title).toBe("Review keyword plan");
    expect(filtered.tasks[0]?.owner).toBeNull();
    const first = yield* tools.queryTasks({ state: "all", limit: 1 });
    expect(
      (yield* tools
        .queryTasks({ state: "done", limit: 1, cursor: first.nextCursor! })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
  }).pipe(Effect.provide(layer)),
);
it.effect("filters owners, text and inclusive dates before every aggregate and page", () =>
  Effect.gen(function* () {
    const tools = yield* seed;
    for (const [owner, total, openTotal] of [
      ["environment-owner", 125, 100],
      ["unassigned", 125, 100],
    ] as const) {
      const page = yield* tools.queryTasks({ owner, limit: 1 });
      expect(page.total).toBe(total);
      expect(page.openTotal).toBe(openTotal);
      expect(page.laneTotals.reduce((sum, lane) => sum + lane.total, 0)).toBe(125);
      expect(page.tasks[0]?.owner).toBe(owner === "unassigned" ? null : owner);
    }
    for (const [text, total] of [
      ["Alpha", 125],
      ["Marketing", 1],
      ["%_", 1],
      ["keyword", 1],
      ["' OR 1=1 --", 0],
    ] as const) {
      expect((yield* tools.queryTasks({ text, limit: 1 })).total).toBe(total);
    }
    expect((yield* tools.queryTasks({ state: "done" })).openTotal).toBe(0);
    expect((yield* tools.queryTasks({ dueFrom: "2026-10-16", dueTo: "2026-10-16" })).total).toBe(
      250,
    );
    expect((yield* tools.queryTasks({ dueFrom: "2026-10-17" })).total).toBe(0);
    expect((yield* tools.queryTasks({ dueTo: "2026-10-15" })).total).toBe(0);
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE workspace_tasks SET due_on=NULL WHERE id=${id(0)}`;
    expect((yield* tools.queryTasks({ dueTo: "2026-10-16" })).total).toBe(249);
    let cursor: string | undefined;
    let last: string | undefined;
    for (let n = 0; n < 4; n++) {
      const page = yield* tools.queryTasks({ limit: 100, ...(cursor ? { cursor } : {}) });
      last = page.tasks.at(-1)?.id;
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(last).toBe(id(0));
    yield* tools.saveConfig({
      projectId: a,
      taskColumns: ["To do", "Done"],
      browserThreadId: null,
      completedColumn: null,
      expectedRevision: 0,
      confirmCompletionChanges: true,
    });
    expect((yield* tools.queryTasks({ projectId: a, state: "done" })).total).toBe(0);
    expect((yield* tools.queryTasks({ projectId: a, state: "open" })).openTotal).toBe(125);
  }).pipe(Effect.provide(layer)),
);
it.effect("bounds configs to represented projects and includes an empty explicit scope", () =>
  Effect.gen(function* () {
    const tools = yield* seed;
    const page = yield* tools.queryTasks({ limit: 1 });
    expect(page.projects.map((p) => p.projectId)).toEqual([a]);
    expect(page.laneTotals.every((lane) => lane.projectId === a)).toBe(true);
    const empty = yield* tools.queryTasks({ projectId: b, text: "no match" });
    expect(empty).toMatchObject({
      tasks: [],
      total: 0,
      openTotal: 0,
      nextCursor: null,
      laneTotals: [],
    });
    expect(empty.projects.map((p) => p.projectId)).toEqual([b]);
    for (const projectId of [deleted, ProjectId.make("missing")])
      expect((yield* tools.queryTasks({ projectId }).pipe(Effect.flip)).kind).toBe("not-found");
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE workspace_tasks SET project_id=${a} WHERE project_id=${b}`;
    expect((yield* tools.listTasks(a)).incomplete).toBe(true);
    expect((yield* tools.listTasks(a)).tasks).toHaveLength(200);
  }).pipe(Effect.provide(layer)),
);
it.effect("rejects malformed, mismatched, restarted and changed-generation cursors", () =>
  Effect.gen(function* () {
    const tools = yield* seed;
    const first = yield* tools.queryTasks({ limit: 1 });
    for (const input of [
      { cursor: "!bad" },
      { cursor: Buffer.from('{"v":9}').toString("base64url") },
      { cursor: first.nextCursor!, owner: "unassigned" },
      { dueFrom: "2026-10-17", dueTo: "2026-10-16" },
      { limit: 0 },
    ] as (typeof WorkspaceTaskQuery.Encoded)[])
      expect((yield* tools.queryTasks(input).pipe(Effect.flip)).kind).toBe("invalid-input");
    const restarted = yield* Tools.make;
    expect(
      (yield* restarted.queryTasks({ limit: 1, cursor: first.nextCursor! }).pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    yield* tools.patchTask({ id: id(1), expectedRevision: 0, title: "Changed" });
    expect(
      (yield* tools.queryTasks({ limit: 1, cursor: first.nextCursor! }).pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    const second = yield* tools.queryTasks({ limit: 1 });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE projection_projects SET title='Renamed' WHERE project_id=${a}`;
    expect(
      (yield* tools.queryTasks({ limit: 1, cursor: second.nextCursor! }).pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    expect((yield* tools.queryTasks({ limit: 1 })).tasks[0]?.projectTitle).toBe("Renamed");
    for (const change of [
      sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES('new','New','/synthetic','[]','2026-10-16T00:00:00Z','2026-10-16T00:00:00Z')`,
      sql`DELETE FROM projection_projects WHERE project_id='new'`,
    ]) {
      const before = yield* tools.queryTasks({ limit: 1 });
      yield* change;
      expect(
        (yield* tools.queryTasks({ limit: 1, cursor: before.nextCursor! }).pipe(Effect.flip)).kind,
      ).toBe("invalid-input");
      expect((yield* tools.queryTasks({ limit: 1 })).total).toBe(250);
    }
  }).pipe(Effect.provide(layer)),
);
it.effect("isolates matching task IDs and cursors in separate SQL environments", () =>
  Effect.gen(function* () {
    const first = yield* Effect.gen(function* () {
      const tools = yield* seed;
      return yield* tools.queryTasks({ limit: 1 });
    }).pipe(Effect.provide(layer));
    yield* Effect.gen(function* () {
      const tools = yield* seed;
      expect(
        (yield* tools.queryTasks({ limit: 1, cursor: first.nextCursor! }).pipe(Effect.flip)).kind,
      ).toBe("invalid-input");
      expect((yield* tools.queryTasks({ text: "keyword" })).total).toBe(1);
    }).pipe(Effect.provide(layer));
  }),
);

it.effect("pages within undated ties and returns configs for an actually empty project", () =>
  Effect.gen(function* () {
    const tools = yield* seed;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE workspace_tasks SET due_on=NULL`;
    let cursor: string | undefined;
    const seen: string[] = [];
    for (let n = 0; n < 8; n++) {
      const page = yield* tools.queryTasks({ limit: 37, ...(cursor ? { cursor } : {}) });
      seen.push(...page.tasks.map((task) => task.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(250);
    expect(new Set(seen).size).toBe(250);
    yield* sql`UPDATE workspace_tasks SET deleted=1 WHERE project_id=${b}`;
    const empty = yield* tools.queryTasks({ projectId: b });
    expect(empty).toMatchObject({
      tasks: [],
      total: 0,
      openTotal: 0,
      nextCursor: null,
      laneTotals: [],
    });
    expect(empty.projects.map((project) => project.projectId)).toEqual([b]);
  }).pipe(Effect.provide(layer)),
);

it.effect("continues across distinct due dates, split date groups and undated tasks", () =>
  Effect.gen(function* () {
    const tools = yield* seed;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DELETE FROM workspace_tasks`;
    const dates = [
      null,
      "2026-10-18",
      "2026-10-16",
      "2026-10-17",
      "2026-10-16",
      "2026-10-16",
      null,
    ];
    yield* sql`INSERT INTO workspace_tasks ${sql.insert(dates.map((due_on, n) => ({ id: id(n), project_id: n % 2 ? b : a, title: "Dated", column_name: "To do", due_on })))}`;
    let cursor: string | undefined;
    const seen: string[] = [];
    for (let n = 0; n < 4; n++) {
      const page = yield* tools.queryTasks({ limit: 2, ...(cursor ? { cursor } : {}) });
      expect(page.total).toBe(7);
      seen.push(...page.tasks.map((task) => task.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual([id(2), id(4), id(5), id(3), id(1), id(0), id(6)]);
  }).pipe(Effect.provide(layer)),
);
it.effect("bounds lane totals even when removed legacy columns exceed the config limit", () =>
  Effect.gen(function* () {
    const tools = yield* seed;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DELETE FROM workspace_tasks`;
    // Batch inserts stay below SQLite's parameter bound.
    for (let offset = 0; offset < 1201; offset += 100) {
      yield* sql`INSERT INTO workspace_tasks ${sql.insert(Array.from({ length: Math.min(100, 1201 - offset) }, (_, n) => ({ id: id(offset + n), project_id: a, title: "Legacy", column_name: `Removed ${String(offset + n).padStart(4, "0")}` })))}`;
    }
    const page = yield* tools.queryTasks({ projectId: a, limit: 1 });
    expect(page.total).toBe(1201);
    expect(page.laneTotals).toHaveLength(1200);
    expect(page.laneTotals[0]?.column).toBe("Removed 0000");
    expect(page.laneTotals.at(-1)?.column).toBe("Removed 1199");
    expect(isTaskPage(page)).toBe(true);
  }).pipe(Effect.provide(layer)),
);
