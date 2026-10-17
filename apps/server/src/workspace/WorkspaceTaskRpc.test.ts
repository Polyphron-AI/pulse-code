import { expect, it } from "@effect/vitest";
import {
  AuthOrchestrationReadScope,
  AuthOrchestrationOperateScope,
  AuthRelayReadScope,
  WS_METHODS,
  WsRpcGroup,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcTest from "effect/unstable/rpc/RpcTest";
import { RPC_REQUIRED_SCOPES, rpcScopeAuthorizationLayer } from "../auth/RpcAuthorization.ts";
const method = WS_METHODS.workspaceQueryTasks;
const group = WsRpcGroup.omit(
  ...[...WsRpcGroup.requests.keys()].filter(
    (tag): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, typeof method> => tag !== method,
  ),
);
it.effect("authorizes summary reads without granting task writes", () =>
  Effect.gen(function* () {
    let calls = 0;
    for (const scope of [
      AuthRelayReadScope,
      AuthOrchestrationReadScope,
      AuthOrchestrationOperateScope,
    ]) {
      const client = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.mergeAll(
            group.toLayerHandler(method, () =>
              Effect.sync(() => {
                calls++;
                return {
                  tasks: [],
                  total: 0,
                  openTotal: 0,
                  nextCursor: null,
                  projects: [],
                  laneTotals: [],
                };
              }),
            ),
            rpcScopeAuthorizationLayer(
              scope === AuthOrchestrationOperateScope
                ? [AuthOrchestrationReadScope, scope]
                : [scope],
            ),
          ),
        ),
      );
      if (scope === AuthRelayReadScope) {
        expect(
          yield* client[method]({ state: "all", owner: "all", limit: 50 }).pipe(Effect.flip),
        ).toMatchObject({ requiredScope: AuthOrchestrationReadScope });
        expect(calls).toBe(0);
      } else
        expect((yield* client[method]({ state: "all", owner: "all", limit: 50 })).total).toBe(0);
    }
    expect(calls).toBe(2);
  }).pipe(Effect.scoped),
);
