import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import {
  AuthOrchestrationReadScope,
  AuthOrchestrationOperateScope,
  AuthRelayReadScope,
  PulseNotesRpcs,
  RpcScopeAuthorization,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import * as RpcTest from "effect/unstable/rpc/RpcTest";
import { RPC_REQUIRED_SCOPES, rpcScopeAuthorizationLayer } from "../auth/RpcAuthorization.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Notes from "./WorkspaceNotes.ts";

const group = RpcGroup.make(...PulseNotesRpcs).middleware(RpcScopeAuthorization);
const storage = Notes.layer.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
const input = { requestId: "00000000-0000-0000-0000-000000000001", title: "Review", body: "Draft" };

it.effect(
  "denies read-only note mutations and permits operate through the authorized RPC family",
  () =>
    Effect.gen(function* () {
      const notes = yield* Notes.WorkspaceNotes;
      const handlers = group.toLayer({
        [WS_METHODS.notesCreate]: notes.create,
        [WS_METHODS.notesGet]: notes.get,
        [WS_METHODS.notesRead]: notes.read,
        [WS_METHODS.notesUpdate]: notes.update,
        [WS_METHODS.notesDelete]: notes.delete,
        [WS_METHODS.notesRestore]: notes.restore,
        [WS_METHODS.notesSubscribeChanges]: () => notes.changes,
      });
      const read = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.merge(handlers, rpcScopeAuthorizationLayer([AuthOrchestrationReadScope])),
        ),
      );
      const operate = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.merge(handlers, rpcScopeAuthorizationLayer([AuthOrchestrationOperateScope])),
        ),
      );
      expect(yield* read[WS_METHODS.notesCreate](input).pipe(Effect.flip)).toMatchObject({
        requiredScope: AuthOrchestrationOperateScope,
      });
      const note = yield* operate[WS_METHODS.notesCreate](input);
      expect((yield* read[WS_METHODS.notesGet]({ id: note.id })).body).toBe("Draft");
      expect((yield* read[WS_METHODS.notesRead]({ id: note.id })).body.text).toBe("Draft");
      const update = {
        ...input,
        requestId: "00000000-0000-0000-0000-000000000002",
        id: note.id,
        expectedRevision: note.revision,
        body: "Reviewed",
      };
      const deletion = {
        ...update,
        requestId: "00000000-0000-0000-0000-000000000003",
        expectedRevision: note.revision + 1,
      };
      expect(yield* read[WS_METHODS.notesUpdate](update).pipe(Effect.flip)).toMatchObject({
        requiredScope: AuthOrchestrationOperateScope,
      });
      expect(yield* read[WS_METHODS.notesDelete](deletion).pipe(Effect.flip)).toMatchObject({
        requiredScope: AuthOrchestrationOperateScope,
      });
      const changed = yield* operate[WS_METHODS.notesUpdate](update);
      expect(changed.body).toBe("Reviewed");
      expect(
        yield* operate[WS_METHODS.notesUpdate]({
          ...update,
          requestId: "00000000-0000-0000-0000-000000000004",
        }).pipe(Effect.flip),
      ).toMatchObject({ _tag: "WorkspaceNotesError", kind: "conflict" });
      yield* operate[WS_METHODS.notesDelete](deletion);
      expect(yield* read[WS_METHODS.notesGet]({ id: note.id }).pipe(Effect.flip)).toMatchObject({
        kind: "not-found",
      });
      const restoration = {
        requestId: "00000000-0000-0000-0000-000000000005",
        id: note.id,
        expectedRevision: deletion.expectedRevision + 1,
      };
      expect(yield* read[WS_METHODS.notesRestore](restoration).pipe(Effect.flip)).toMatchObject({
        requiredScope: AuthOrchestrationOperateScope,
      });
      expect(
        yield* operate[WS_METHODS.notesRestore]({
          ...restoration,
          expectedRevision: deletion.expectedRevision,
        }).pipe(Effect.flip),
      ).toMatchObject({
        _tag: "WorkspaceNotesError",
        kind: "conflict",
      });
      yield* operate[WS_METHODS.notesRestore](restoration);
      expect(yield* read[WS_METHODS.notesGet]({ id: note.id })).toMatchObject({
        body: "Reviewed",
        revision: restoration.expectedRevision + 1,
      });
    }).pipe(Effect.scoped, Effect.provide(storage)),
);

it.effect("requires read scope for note reads and subscriptions", () =>
  Effect.gen(function* () {
    const notes = yield* Notes.WorkspaceNotes;
    const note = yield* notes.create(input);
    const handlers = group.toLayer({
      [WS_METHODS.notesCreate]: notes.create,
      [WS_METHODS.notesGet]: notes.get,
      [WS_METHODS.notesRead]: notes.read,
      [WS_METHODS.notesUpdate]: notes.update,
      [WS_METHODS.notesDelete]: notes.delete,
      [WS_METHODS.notesRestore]: notes.restore,
      [WS_METHODS.notesSubscribeChanges]: () => Stream.make(1),
    });
    const client = yield* RpcTest.makeClient(group).pipe(
      Effect.provide(Layer.merge(handlers, rpcScopeAuthorizationLayer([AuthRelayReadScope]))),
    );
    expect(yield* client[WS_METHODS.notesGet]({ id: note.id }).pipe(Effect.flip)).toMatchObject({
      requiredScope: AuthOrchestrationReadScope,
    });
    expect(yield* client[WS_METHODS.notesRead]({ id: note.id }).pipe(Effect.flip)).toMatchObject({
      requiredScope: AuthOrchestrationReadScope,
    });
    expect(
      yield* Stream.runCollect(client[WS_METHODS.notesSubscribeChanges]({})).pipe(Effect.flip),
    ).toMatchObject({ requiredScope: AuthOrchestrationReadScope });
    const reader = yield* RpcTest.makeClient(group).pipe(
      Effect.provide(
        Layer.merge(handlers, rpcScopeAuthorizationLayer([AuthOrchestrationReadScope])),
      ),
    );
    expect(yield* Stream.runCollect(reader[WS_METHODS.notesSubscribeChanges]({}))).toEqual([1]);
    for (const method of [
      WS_METHODS.notesGet,
      WS_METHODS.notesRead,
      WS_METHODS.notesSubscribeChanges,
    ])
      expect(RPC_REQUIRED_SCOPES[method]).toBe(AuthOrchestrationReadScope);
  }).pipe(Effect.scoped, Effect.provide(storage)),
);
