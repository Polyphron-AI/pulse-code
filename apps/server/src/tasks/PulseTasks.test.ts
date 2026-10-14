import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import * as DateTime from "effect/DateTime";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ProjectId } from "@t3tools/contracts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { makePulseTasks } from "./PulseTasks.ts";
import { nextTaskDueDate } from "./taskRecurrence.ts";

const layer = Layer.merge(SqlitePersistenceMemory, NodeServices.layer);
const fields = {
  title: "Write launch copy",
  description: "Review the headline",
  status: "todo" as const,
  tags: ["marketing"],
  projectId: null,
  dueDate: null,
  recurrence: null,
  columnId: null,
  assignee: null,
  followers: [],
  source: null,
  parentTaskId: null,
  dependencyIds: [],
};

it.effect("persists shared tasks and supports edit, complete, reopen, archive and restore", () =>
  Effect.gen(function* () {
    const tasks = yield* makePulseTasks;
    const created = yield* tasks.mutate({ operation: "create", ...fields });
    assert.strictEqual(created.revision, 0);
    const complete = yield* tasks.mutate({
      operation: "update",
      ...created,
      status: "done",
      tags: ["marketing", "launch", "launch"],
    });
    assert.deepEqual(complete.tags, ["marketing", "launch"]);
    const reopened = yield* tasks.mutate({
      operation: "update",
      ...complete,
      status: "in_progress",
    });
    const archived = yield* tasks.mutate({
      operation: "archive",
      id: reopened.id,
      revision: reopened.revision,
      archived: true,
    });
    const restored = yield* tasks.mutate({
      operation: "archive",
      id: archived.id,
      revision: archived.revision,
      archived: false,
    });
    const freshStore = yield* makePulseTasks;
    assert.deepEqual(yield* freshStore.list, [restored]);
  }).pipe(Effect.provide(layer)),
);

it.effect("rejects stale edits without overwriting the saved task", () =>
  Effect.gen(function* () {
    const tasks = yield* makePulseTasks;
    const created = yield* tasks.mutate({ operation: "create", ...fields });
    const updated = yield* tasks.mutate({ operation: "update", ...created, title: "New title" });
    const stale = yield* tasks
      .mutate({ operation: "update", ...created, title: "Stale title" })
      .pipe(Effect.flip);
    assert.include(stale.message, "changed elsewhere");
    assert.deepEqual(yield* tasks.list, [updated]);
  }).pipe(Effect.provide(layer)),
);

it.effect("validates existing project references and empty titles on the server", () =>
  Effect.gen(function* () {
    const tasks = yield* makePulseTasks;
    const missing = yield* tasks
      .mutate({ operation: "create", ...fields, projectId: ProjectId.make("missing") })
      .pipe(Effect.flip);
    assert.include(missing.message, "existing project");
    const blank = yield* tasks
      .mutate({ operation: "create", ...fields, title: "   " })
      .pipe(Effect.flip);
    assert.include(blank.message, "Check the task");
    assert.deepEqual(yield* tasks.list, []);
  }).pipe(Effect.provide(layer)),
);

it.effect("subscribers observe committed changes without polling", () =>
  Effect.gen(function* () {
    const tasks = yield* makePulseTasks;
    const stream = yield* tasks.subscribe.pipe(
      Stream.filter((records) => records.length === 1),
      Stream.take(1),
      Stream.runCollect,
      Effect.forkChild,
    );
    const created = yield* tasks.mutate({ operation: "create", ...fields });
    const snapshots = yield* Fiber.join(stream);
    assert.deepEqual(snapshots, [[created]]);
  }).pipe(Effect.provide(layer)),
);

it.effect("rejects invalid dates, missing dependencies and relationship cycles", () =>
  Effect.gen(function* () {
    const tasks = yield* makePulseTasks;
    const parent = yield* tasks.mutate({ operation: "create", ...fields });
    const child = yield* tasks.mutate({
      operation: "create",
      ...fields,
      title: "Subtask",
      parentTaskId: parent.id,
      dueDate: "2026-10-20",
    });
    const cycle = yield* tasks
      .mutate({ operation: "update", ...parent, dependencyIds: [child.id] })
      .pipe(Effect.flip);
    assert.include(cycle.message, "cycle");
    const missing = yield* tasks
      .mutate({ operation: "update", ...child, dependencyIds: ["missing"] })
      .pipe(Effect.flip);
    assert.include(missing.message, "existing tasks");
    const date = yield* tasks
      .mutate({ operation: "update", ...child, dueDate: "2026-02-30" })
      .pipe(Effect.flip);
    assert.include(date.message, "valid due date");
    assert.strictEqual((yield* tasks.list).length, 2);
  }).pipe(Effect.provide(layer)),
);

it.effect(
  "creates one successor atomically and never duplicates it on stale completion or reopen",
  () =>
    Effect.gen(function* () {
      const tasks = yield* makePulseTasks;
      const recurring = yield* tasks.mutate({
        operation: "create",
        ...fields,
        dueDate: "2026-01-31",
        recurrence: { mode: "fixed", frequency: "monthly", interval: 1 },
      });
      const completed = yield* tasks.mutate({ operation: "update", ...recurring, status: "done" });
      assert.isNotNull(completed.nextOccurrenceId);
      const successor = (yield* tasks.list).find((task) => task.id === completed.nextOccurrenceId)!;
      assert.strictEqual(successor.status, "todo");
      assert.strictEqual(successor.title, recurring.title);
      assert.deepEqual(successor.tags, recurring.tags);
      assert.strictEqual(successor.recurrenceAnchorDate, "2026-01-31");
      assert.strictEqual(successor.dueDate, "2026-02-28");
      yield* tasks.mutate({ operation: "update", ...recurring, status: "done" }).pipe(Effect.flip);
      const reopened = yield* tasks.mutate({ operation: "update", ...completed, status: "todo" });
      yield* tasks.mutate({ operation: "update", ...reopened, status: "done" });
      assert.strictEqual((yield* tasks.list).length, 2);
    }).pipe(Effect.provide(layer)),
);

it.effect("supports completion-based repeats and rejects fixed repeats without an anchor", () =>
  Effect.gen(function* () {
    const tasks = yield* makePulseTasks;
    const invalid = yield* tasks
      .mutate({
        operation: "create",
        ...fields,
        recurrence: { mode: "fixed", frequency: "daily", interval: 1 },
      })
      .pipe(Effect.flip);
    assert.include(invalid.message, "due date");
    const recurrence = { mode: "after_completion", frequency: "weekly", interval: 2 } as const;
    const recurring = yield* tasks.mutate({ operation: "create", ...fields, recurrence });
    const completed = yield* tasks.mutate({ operation: "update", ...recurring, status: "done" });
    const successor = (yield* tasks.list).find((task) => task.id === completed.nextOccurrenceId)!;
    const today = DateTime.formatIsoDate(
      DateTime.setZone(yield* DateTime.now, DateTime.zoneMakeLocal()),
    );
    assert.strictEqual(successor.dueDate, nextTaskDueDate(recurrence, null, null, today));
    assert.isNull(successor.parentTaskId);
    assert.deepEqual(successor.dependencyIds, []);
  }).pipe(Effect.provide(layer)),
);

it.effect(
  "validates project-linked people, columns and source URLs without granting provider access",
  () =>
    Effect.gen(function* () {
      const tasks = yield* makePulseTasks;
      const sql = yield* SqlClient.SqlClient;
      const office =
        '{"conversations":[{"provider":"slack","accountId":"account","conversationId":"channel","title":"Launch"}],"agentThreadIds":[],"taskColumns":[{"id":"copy-review","name":"Copy review","status":"review"}]}';
      yield* sql`INSERT INTO projection_projects (project_id, title, workspace_root, scripts_json, office_json, created_at, updated_at) VALUES ('project', 'SynKEK', '/projects/synkek', '[]', ${office}, '2026-01-01', '2026-01-01')`;
      const member = {
        provider: "slack",
        accountId: "account",
        conversationId: "channel",
        memberId: "human",
        displayName: "Alex",
      } as const;
      const noProject = yield* tasks
        .mutate({ operation: "create", ...fields, assignee: member })
        .pipe(Effect.flip);
      assert.include(noProject.message, "Choose a project");
      const wrongChannel = yield* tasks
        .mutate({
          operation: "create",
          ...fields,
          projectId: ProjectId.make("project"),
          assignee: { ...member, conversationId: "other" },
        })
        .pipe(Effect.flip);
      assert.include(wrongChannel.message, "linked channels");
      const mismatch = yield* tasks
        .mutate({
          operation: "create",
          ...fields,
          projectId: ProjectId.make("project"),
          columnId: "copy-review",
        })
        .pipe(Effect.flip);
      assert.include(mismatch.message, "matches the task status");
      const invalidSource = yield* tasks
        .mutate({
          operation: "create",
          ...fields,
          source: { url: "javascript:alert(1)", excerpt: "" },
        })
        .pipe(Effect.flip);
      assert.include(invalidSource.message, "HTTP");
      for (const url of [
        "//evil.example/workspace",
        "/workspace#fragment",
        "/workspace/other",
        "/workspace?x=1\\evil",
        "/workspace?x=1\n",
        "https://name:password@example.com",
      ]) {
        const rejected = yield* tasks
          .mutate({ operation: "create", ...fields, source: { url, excerpt: "" } })
          .pipe(Effect.flip);
        assert.include(rejected.message, "source link");
      }
      const linked = yield* tasks.mutate({
        operation: "create",
        ...fields,
        source: {
          url: "/workspace?space=office&officeView=communications&sourceMessage=123",
          excerpt: "Selected message",
        },
      });
      assert.strictEqual(linked.source?.excerpt, "Selected message");
      const task = yield* tasks.mutate({
        operation: "create",
        ...fields,
        projectId: ProjectId.make("project"),
        assignee: member,
        followers: [member],
        status: "review",
        columnId: "copy-review",
        source: { url: "https://example.com/message", excerpt: "Please check this headline." },
      });
      assert.strictEqual(task.assignee?.memberId, "human");
      yield* sql`UPDATE projection_projects SET office_json = '{"conversations":[{"provider":"slack","accountId":"account","conversationId":"channel","title":"Launch"}],"agentThreadIds":[]}' WHERE project_id = 'project'`;
      const edited = yield* tasks.mutate({
        operation: "update",
        ...task,
        title: "Updated after column removal",
      });
      assert.strictEqual(edited.status, "review");
      const cleared = yield* tasks.mutate({
        operation: "update",
        ...edited,
        columnId: null,
        projectId: null,
        assignee: null,
        followers: [],
      });
      assert.isNull(cleared.projectId);
    }).pipe(Effect.provide(layer)),
);
