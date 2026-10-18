import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  workspaceItemKey,
  type WorkspaceItemRef,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Statement from "effect/unstable/sql/Statement";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ServerEnvironmentIdentity } from "../environment/ServerEnvironment.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Tools from "./WorkspaceTools.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const identity = (id: string) =>
  Layer.succeed(
    ServerEnvironmentIdentity,
    ServerEnvironmentIdentity.of({
      getEnvironmentId: Effect.succeed(EnvironmentId.make(id)),
    }),
  );
const layer = Tools.layer.pipe(
  Layer.provideMerge(identity("overview-test")),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
const seed = (titles: readonly string[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO projection_projects ${sql.insert(
      titles.map((title, index) => ({
        project_id: `overview-${String(index).padStart(2, "0")}`,
        title,
        workspace_root: `/synthetic/${index}`,
        scripts_json: "[]",
        created_at: "2026-10-13T07:00:00Z",
        updated_at: "2026-10-13T07:00:00Z",
      })),
    )}`;
  });
const link = (index: number, project: number, other: WorkspaceItemRef, status = "confirmed") =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const refs = [
      {
        type: "project",
        projectId: ProjectId.make(`overview-${String(project).padStart(2, "0")}`),
      } satisfies WorkspaceItemRef,
      other,
    ].sort((a, b) => workspaceItemKey(a).localeCompare(workspaceItemKey(b)));
    const keys = refs.map(workspaceItemKey);
    const id = `wl_00000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
    yield* sql`INSERT INTO workspace_links(link_id,key_a,key_b,ref_a_json,ref_b_json,status,source_json,created_at,updated_at) VALUES(${id},${keys[0]!},${keys[1]!},${encodeJson(refs[0])},${encodeJson(refs[1])},${status},'{}','2026-10-13','2026-10-13')`;
    return id;
  });
it.effect("pages 51 projects with stable keyed raw descriptions", () =>
  Effect.gen(function* () {
    yield* seed(Array.from({ length: 51 }, (_, i) => `Project ${String(i).padStart(2, "0")}`));
    const tools = yield* Tools.WorkspaceTools;
    for (const i of [0, 50])
      yield* tools.saveConfig({
        projectId: ProjectId.make(`overview-${String(i).padStart(2, "0")}`),
        description: `First line ${i}\n${"x".repeat(580)}`,
        taskColumns: ["Done"],
        browserThreadId: null,
      });
    const first = yield* tools.overview({ limit: 50, filter: "", order: "title" });
    expect(first.projects).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.incomplete).toBe(false);
    expect(first.projects[0]?.description).toBe(`First line 0\n${"x".repeat(580)}`);
    const second = yield* tools.overview({ limit: 50, cursor: first.nextCursor });
    expect(second.projects.map((p) => p.projectId)).toEqual(["overview-50"]);
    expect(second.projects[0]?.description).toBe(`First line 50\n${"x".repeat(580)}`);
    expect(second.nextCursor).toBeUndefined();
    expect(first.projects.every((p) => p.members === undefined)).toBe(true);
  }).pipe(Effect.provide(layer)),
);
it.effect("uses SQLite title folding and IDs through empty, equal and non-ASCII titles", () =>
  Effect.gen(function* () {
    yield* seed(["", "Ecoles", "\u00c9coles", "\u00e9coles", "Same", "same", "Same"]);
    const tools = yield* Tools.WorkspaceTools;
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = yield* tools.overview({ limit: 1, cursor });
      ids.push(...page.projects.map((p) => p.projectId));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual([
      "overview-00",
      "overview-01",
      "overview-04",
      "overview-05",
      "overview-06",
      "overview-02",
      "overview-03",
    ]);
  }).pipe(Effect.provide(layer)),
);
it.effect("filters title and description before paging and excludes deleted projects", () =>
  Effect.gen(function* () {
    yield* seed(["Other", "Growth A", "Growth B", "Deleted growth"]);
    const sql = yield* SqlClient.SqlClient;
    const tools = yield* Tools.WorkspaceTools;
    yield* tools.saveConfig({
      projectId: ProjectId.make("overview-00"),
      description: "Brand GROWTH",
      taskColumns: ["Done"],
      browserThreadId: null,
    });
    yield* sql`UPDATE projection_projects SET deleted_at='2026-10-14' WHERE project_id='overview-03'`;
    const first = yield* tools.overview({ filter: "  GROWTH  ", limit: 2 });
    const last = yield* tools.overview({ filter: "growth", limit: 2, cursor: first.nextCursor });
    expect(first.projects.map((p) => p.projectId)).toEqual(["overview-01", "overview-02"]);
    expect(last.projects.map((p) => p.projectId)).toEqual(["overview-00"]);
    expect(last.nextCursor).toBeUndefined();
  }).pipe(Effect.provide(layer)),
);
it.effect("rejects invalid and mismatched cursors including another owning environment", () =>
  Effect.gen(function* () {
    yield* seed(["A", "B"]);
    const tools = yield* Tools.WorkspaceTools;
    const first = yield* tools.overview({ limit: 1 });
    for (const input of [
      { limit: 0 },
      { limit: 51 },
      { filter: "x".repeat(257) },
      { cursor: "x".repeat(2049) },
      { cursor: "not-json" },
      { cursor: first.nextCursor, filter: "different" },
      { cursor: first.nextCursor, drive: "linked" as const },
    ]) {
      expect(yield* tools.overview(input).pipe(Effect.flip)).toMatchObject({
        kind: "invalid-input",
      });
    }
    const other = yield* Tools.make.pipe(Effect.provide(identity("other-environment")));
    expect(yield* other.overview({ cursor: first.nextCursor }).pipe(Effect.flip)).toMatchObject({
      kind: "invalid-input",
    });
  }).pipe(Effect.provide(layer)),
);
it.effect("filters by designated roots and distinguishes available, absent and unavailable", () =>
  Effect.gen(function* () {
    yield* seed(["A absent", "B available", "C disconnected", "D malformed", "E ordinary file"]);
    const sql = yield* SqlClient.SqlClient;
    const tools = yield* Tools.WorkspaceTools;
    const connectionId = "drv_00000000-0000-0000-0000-000000000001";
    yield* sql`INSERT INTO drive_connections(id,nickname,nickname_key,client_id,connected) VALUES(${connectionId},'Synthetic','synthetic','client',1)`;
    for (const i of [1, 2]) {
      const fileId = `folder-${i}`;
      const linkId = yield* link(i, i, { type: "file", provider: "google-drive", fileId });
      yield* sql`INSERT INTO drive_file_bindings(file_id,connection_id,file_json) VALUES(${fileId},${connectionId},${encodeJson({ id: fileId, name: "Folder", mimeType: "application/vnd.google-apps.folder", url: "https://drive.google.com/drive/folders/synthetic" })})`;
      yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,drive_root_json) VALUES(${`overview-0${i}`},'["Done"]',${encodeJson({ linkId, connectionId, fileId })})`;
    }
    yield* sql`UPDATE workspace_links SET status='dismissed' WHERE link_id='wl_00000000-0000-0000-0000-000000000002'`;
    yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,drive_root_json) VALUES('overview-03','["Done"]','invalid')`;
    yield* link(4, 4, { type: "file", provider: "google-drive", fileId: "ordinary" });
    expect((yield* tools.overview({})).projects.map((p) => p.driveRoot)).toEqual([
      "none",
      "linked",
      "unavailable",
      "unavailable",
      "none",
    ]);
    const first = yield* tools.overview({ drive: "linked", limit: 1 });
    expect(first.projects.map((p) => p.projectId)).toEqual(["overview-01"]);
    expect(
      (yield* tools.overview({ drive: "linked", limit: 1, cursor: first.nextCursor })).projects.map(
        (p) => p.projectId,
      ),
    ).toEqual(["overview-02"]);
    expect((yield* tools.overview({ drive: "unlinked" })).projects.map((p) => p.projectId)).toEqual(
      ["overview-00", "overview-04"],
    );
    yield* sql`UPDATE drive_connections SET connected=0`;
    expect(
      (yield* tools.overview({ drive: "linked" })).projects.every(
        (p) => p.driveRoot === "unavailable",
      ),
    ).toBe(true);
  }).pipe(Effect.provide(layer)),
);
it.effect(
  "keeps channel totals keyed, excludes nonconfirmed edges and never guesses Slack identity",
  () =>
    Effect.gen(function* () {
      yield* seed(["A", "B", "C", "D"]);
      const sql = yield* SqlClient.SqlClient;
      const tools = yield* Tools.WorkspaceTools;
      yield* sql`INSERT INTO telegram_chats(connection_id,chat_id,chat_type,title,paired_user_id,paired_user_label,active,created_at) VALUES('telegram_1','-1','channel','One','1','Owner',1,0),('telegram_1','-2','channel','Two','1','Owner',1,0),('telegram_1','-3','group','Group','1','Owner',1,0)`;
      for (const [id, project, resourceId, status] of [
        [1, 0, "telegram_1/-1", "confirmed"],
        [2, 0, "telegram_1/-2", "confirmed"],
        [3, 1, "telegram_1/-1", "confirmed"],
        [4, 1, "telegram_1/-2", "suggested"],
        [5, 1, "telegram_1/-3", "dismissed"],
      ] as const)
        yield* link(
          id,
          project,
          { type: "provider-resource", provider: "telegram", resourceId },
          status,
        );
      yield* link(6, 2, {
        type: "provider-resource",
        provider: "slack",
        resourceId: "channel:C123",
      });
      const page = yield* tools.overview({});
      expect(page.projects.map((p) => p.channels.count)).toEqual([2, 1, null, 0]);
      expect(page.projects[0]?.channels.providers).toEqual([
        { provider: "telegram", count: 2, complete: true },
      ]);
      expect(page.projects[2]?.channels).toEqual({ count: null, complete: false, providers: [] });
      expect(page.projects[3]?.channels).toEqual({ count: 0, complete: true, providers: [] });
      expect(page.incomplete).toBe(false);
    }).pipe(Effect.provide(layer)),
);
it.effect("excludes known non-channel endpoints from complete channel totals", () =>
  Effect.gen(function* () {
    yield* seed(["Project"]);
    const sql = yield* SqlClient.SqlClient;
    const tools = yield* Tools.WorkspaceTools;
    yield* sql`INSERT INTO telegram_chats(connection_id,chat_id,chat_type,title,paired_user_id,paired_user_label,active,created_at) VALUES('telegram_1','-1','channel','One','1','Owner',1,0)`;
    yield* link(1, 0, {
      type: "provider-resource",
      provider: "telegram",
      resourceId: "telegram_1/-1",
    });
    yield* link(2, 0, {
      type: "provider-resource",
      provider: "workspace-calendar",
      resourceId: "event-1",
    });
    yield* link(3, 0, {
      type: "provider-resource",
      provider: "pulse-meeting",
      resourceId: "meeting-1",
    });
    yield* link(4, 0, {
      type: "provider-resource",
      provider: "telegram",
      resourceId: "telegram_1/-1/1",
    });
    expect((yield* tools.overview({})).projects[0]?.channels).toEqual({
      count: 1,
      complete: true,
      providers: [{ provider: "telegram", count: 1, complete: true }],
    });
  }).pipe(Effect.provide(layer)),
);
it.effect("tracks channel completeness per provider and combines it for each project", () =>
  Effect.gen(function* () {
    yield* seed(["A Slack", "B X", "C Unknown", "D Telegram"]);
    const sql = yield* SqlClient.SqlClient;
    const tools = yield* Tools.WorkspaceTools;
    yield* sql`INSERT INTO telegram_chats(connection_id,chat_id,chat_type,title,paired_user_id,paired_user_label,active,created_at) VALUES('telegram_1','-1','channel','One','1','Owner',1,0)`;
    for (const [project, provider, resourceId] of [
      [0, "slack", "channel:C123"],
      [1, "x", "unknown"],
      [2, "unknown", "unknown"],
      [3, "telegram", "telegram_1/-2"],
    ] as const) {
      yield* link(project * 2 + 1, project, {
        type: "provider-resource",
        provider: "telegram",
        resourceId: "telegram_1/-1",
      });
      yield* link(project * 2 + 2, project, {
        type: "provider-resource",
        provider,
        resourceId,
      });
    }
    expect((yield* tools.overview({})).projects.map((p) => p.channels)).toEqual([
      ...Array.from({ length: 3 }, () => ({
        count: null,
        complete: false,
        providers: [{ provider: "telegram", count: 1, complete: true }],
      })),
      {
        count: null,
        complete: false,
        providers: [{ provider: "telegram", count: 1, complete: false }],
      },
    ]);
  }).pipe(Effect.provide(layer)),
);
it.effect("bounds SQL reads and per-project link inspection without any provider services", () =>
  Effect.gen(function* () {
    yield* seed(Array.from({ length: 51 }, (_, i) => `Project ${i}`));
    for (let i = 0; i < 102; i++)
      yield* link(i, 0, { type: "url", url: `https://example.test/${i}` });
    const queries: string[] = [];
    const tools = yield* Tools.make;
    const page = yield* tools.overview({ limit: 50 }).pipe(
      Effect.provideService(Statement.CurrentTransformer, (statement) =>
        Effect.sync(() => {
          queries.push(statement.compile()[0]);
          return statement;
        }),
      ),
    );
    expect(page.projects).toHaveLength(50);
    expect(queries.filter((q) => /^\s*(SELECT|WITH)/i.test(q))).toHaveLength(3);
    expect(queries.length).toBeGreaterThan(0);
    expect(page.projects.find((p) => p.projectId === "overview-00")?.channels).toEqual({
      count: null,
      complete: false,
      providers: [],
    });
  }).pipe(Effect.provide(layer)),
);

it.effect("treats a root with corrupt shared Drive metadata as unavailable", () =>
  Effect.gen(function* () {
    yield* seed(["Project"]);
    const sql = yield* SqlClient.SqlClient;
    const tools = yield* Tools.WorkspaceTools;
    const connectionId = "drv_00000000-0000-0000-0000-000000000001",
      fileId = "folder";
    const linkId = yield* link(1, 0, { type: "file", provider: "google-drive", fileId });
    yield* sql`INSERT INTO drive_connections(id,nickname,nickname_key,client_id,connected) VALUES(${connectionId},'Synthetic','synthetic','client',1)`;
    yield* sql`INSERT INTO drive_file_bindings(file_id,connection_id,file_json) VALUES(${fileId},${connectionId},${encodeJson({ id: fileId, mimeType: "application/vnd.google-apps.folder" })})`;
    yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,drive_root_json) VALUES('overview-00','["Done"]',${encodeJson({ linkId, connectionId, fileId })})`;
    expect((yield* tools.overview({})).projects[0]?.driveRoot).toBe("unavailable");
  }).pipe(Effect.provide(layer)),
);
