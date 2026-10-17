import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import {
  AuthOrchestrationReadScope,
  AuthOrchestrationOperateScope,
  AuthRelayReadScope,
  ProjectId,
  PulseCalendarRpcs,
  RpcScopeAuthorization,
  WS_METHODS,
} from "@t3tools/contracts";
import { vi } from "vite-plus/test";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import * as RpcTest from "effect/unstable/rpc/RpcTest";
import { RPC_REQUIRED_SCOPES, rpcScopeAuthorizationLayer } from "../auth/RpcAuthorization.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Tools from "./WorkspaceTools.ts";
import * as Stream from "effect/Stream";
import * as Calendar from "./WorkspaceCalendar.ts";

const group = RpcGroup.make(...PulseCalendarRpcs).middleware(RpcScopeAuthorization);
const storage = Layer.effect(
  Calendar.WorkspaceCalendar,
  Calendar.make({
    resolveSource: () => Effect.succeed({ connected: true, selected: true, generation: 1 }),
  }),
).pipe(
  Layer.provideMerge(Tools.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
const range = { startOn: "2026-10-13", endBefore: "2026-10-14", timeZone: "Africa/Johannesburg" };

it.effect(
  "denies relay-only reads and allows read and operate scopes through the calendar RPC family",
  () =>
    Effect.gen(function* () {
      const calendar = yield* Calendar.WorkspaceCalendar;
      yield* calendar.ingestPage({
        connectionId: "fake",
        calendarId: "primary",
        generation: 1,
        items: [
          {
            status: "confirmed",
            externalEventId: "event",
            occurrenceKey: "event",
            title: "Review",
            time: { kind: "all-day", startOn: "2026-10-13", endBefore: "2026-10-14" },
            sourceLabel: "Test",
            attendees: [],
            attendeesTruncated: false,
            hasDescription: true,
            description: "Agenda",
          },
        ],
      });
      const handlers = group.toLayer({
        [WS_METHODS.calendarSubscribeChanges]: () => calendar.changes,
        [WS_METHODS.calendarRefresh]: calendar.refresh,
        [WS_METHODS.calendarListRange]: calendar.listRange,
        [WS_METHODS.calendarGet]: calendar.get,
      });
      const relay = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(Layer.merge(handlers, rpcScopeAuthorizationLayer([AuthRelayReadScope]))),
      );
      expect(yield* relay[WS_METHODS.calendarRefresh](range).pipe(Effect.flip)).toMatchObject({
        requiredScope: AuthOrchestrationReadScope,
      });
      expect(
        yield* relay[WS_METHODS.calendarSubscribeChanges]({}).pipe(Stream.runHead, Effect.flip),
      ).toMatchObject({ requiredScope: AuthOrchestrationReadScope });
      const id = (yield* calendar.listRange(range)).events[0]!.id;
      expect(yield* relay[WS_METHODS.calendarListRange](range).pipe(Effect.flip)).toMatchObject({
        requiredScope: AuthOrchestrationReadScope,
      });
      expect(yield* relay[WS_METHODS.calendarGet]({ id }).pipe(Effect.flip)).toMatchObject({
        requiredScope: AuthOrchestrationReadScope,
      });
      for (const scopes of [
        [AuthOrchestrationReadScope],
        [AuthOrchestrationReadScope, AuthOrchestrationOperateScope],
      ]) {
        const client = yield* RpcTest.makeClient(group).pipe(
          Effect.provide(Layer.merge(handlers, rpcScopeAuthorizationLayer(scopes))),
        );
        expect((yield* client[WS_METHODS.calendarRefresh](range)).events).toHaveLength(1);
        expect(
          yield* client[WS_METHODS.calendarSubscribeChanges]({}).pipe(Stream.runHead),
        ).toMatchObject({ value: 1 });
        expect((yield* client[WS_METHODS.calendarListRange](range)).events[0]).toMatchObject({
          id,
          title: "Review",
        });
        expect(yield* client[WS_METHODS.calendarGet]({ id })).toMatchObject({
          id,
          description: "Agenda",
        });
      }
      expect(RPC_REQUIRED_SCOPES[WS_METHODS.calendarListRange]).toBe(AuthOrchestrationReadScope);
      expect(RPC_REQUIRED_SCOPES[WS_METHODS.calendarGet]).toBe(AuthOrchestrationReadScope);
      expect(PulseCalendarRpcs.map((rpc) => rpc._tag)).toEqual([
        "pulse.calendar.subscribeChanges",
        "pulse.calendar.refresh",
        "pulse.calendar.listRange",
        "pulse.calendar.get",
      ]);
    }).pipe(Effect.scoped, Effect.provide(storage)),
);

it.effect(
  "delivers a persisted TOOLS change to two read clients without reading inside the stream",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("calendar-rpc");
      yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Due','/synthetic','[]','now','now')`;
      const tools = yield* Tools.WorkspaceTools;
      const calendar = yield* Calendar.WorkspaceCalendar;
      const handlers = group.toLayer({
        [WS_METHODS.calendarSubscribeChanges]: () => calendar.changes,
        [WS_METHODS.calendarRefresh]: calendar.refresh,
        [WS_METHODS.calendarListRange]: calendar.listRange,
        [WS_METHODS.calendarGet]: calendar.get,
      });
      const makeClient = RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.merge(handlers, rpcScopeAuthorizationLayer([AuthOrchestrationReadScope])),
        ),
      );
      const a = yield* makeClient,
        b = yield* makeClient;
      const task = yield* tools.upsertTask({
        projectId,
        title: "Due",
        column: "To do",
        dueOn: "2026-10-13",
      });
      for (const client of [a, b])
        expect((yield* client[WS_METHODS.calendarListRange](range)).dueTasks[0]?.ref.taskId).toBe(
          task.id,
        );
      yield* tools.patchTask({ id: task.id, expectedRevision: task.revision!, dueOn: null });
      const query = vi.spyOn(tools, "queryTasks");
      try {
        for (const client of [a, b])
          expect(
            yield* client[WS_METHODS.calendarSubscribeChanges]({}).pipe(
              Stream.filter((n) => n > 1),
              Stream.runHead,
            ),
          ).toMatchObject({ value: 2 });
        expect(query).not.toHaveBeenCalled();
        for (const client of [a, b])
          expect((yield* client[WS_METHODS.calendarListRange](range)).dueTasks).toEqual([]);
      } finally {
        query.mockRestore();
      }
    }).pipe(Effect.scoped, Effect.provide(storage)),
);
