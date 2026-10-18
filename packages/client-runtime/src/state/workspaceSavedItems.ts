import { WS_METHODS, WorkspaceSavedItemsError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import {
  getInitialServerConfig,
  request,
  subscribeDynamicWithSession,
  EnvironmentRpcUnavailableError,
  type EnvironmentRpcInput,
} from "../rpc/client.ts";
import type { RpcSession } from "../rpc/session.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentSubscriptionAtomFamily,
} from "./runtime.ts";

const hasSavedItems = Schema.is(
  Schema.Struct({
    pulseCapabilities: Schema.Struct({ workspaceSavedItems: Schema.Literal(true) }),
  }),
);
const supported = Effect.gen(function* () {
  const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
  const config = yield* getInitialServerConfig().pipe(
    Effect.mapError(
      () =>
        new EnvironmentRpcUnavailableError({
          environmentId: supervisor.target.environmentId,
          message: "Saved items configuration is unavailable.",
        }),
    ),
  );
  return hasSavedItems(config);
});
const requireSupport = supported.pipe(
  Effect.flatMap((available) =>
    available
      ? Effect.void
      : Effect.fail(
          new WorkspaceSavedItemsError({
            kind: "unsupported",
            message: "Saved items are unavailable on this server.",
          }),
        ),
  ),
);

/** Environment-owned refs only. Change notifications never fetch original item bodies. */
export function createWorkspaceSavedItemAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const changes = createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "environment-data:workspace-saved-items:changes",
    idleTtlMs: 0,
    subscribe: (
      input: EnvironmentRpcInput<typeof WS_METHODS.workspaceSavedItemsSubscribeChanges>,
    ) =>
      Stream.suspend(() => {
        let previous: readonly [RpcSession, number] | undefined;
        return subscribeDynamicWithSession(
          WS_METHODS.workspaceSavedItemsSubscribeChanges,
          Effect.fnUntraced(function* (session) {
            const config = yield* session.initialConfig.pipe(Effect.catch(() => Effect.never));
            return hasSavedItems(config) ? input : yield* Effect.never;
          }),
        ).pipe(
          // Session replacement already refreshes the query. Seed each session from its replay.
          Stream.filter(([session, revision]) => {
            const changed =
              previous !== undefined && previous[0] === session && previous[1] !== revision;
            previous = [session, revision];
            return changed;
          }),
          Stream.map(([, revision]) => revision),
        );
      }),
  });
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial",
    key: ({ environmentId }: { readonly environmentId: string }) => environmentId,
  } as const;
  return {
    changes,
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:workspace-saved-items:list",
      tag: WS_METHODS.workspaceSavedItemsList,
      staleTimeMs: 30_000,
      idleTtlMs: 0,
      refreshTrigger: ({ environmentId }) => changes({ environmentId, input: {} }),
      execute: Effect.fnUntraced(function* (input) {
        yield* requireSupport;
        return yield* request(WS_METHODS.workspaceSavedItemsList, input);
      }),
    }),
    add: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:workspace-saved-items:add",
      tag: WS_METHODS.workspaceSavedItemsAdd,
      scheduler,
      concurrency,
      execute: (input) =>
        requireSupport.pipe(Effect.andThen(request(WS_METHODS.workspaceSavedItemsAdd, input))),
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:workspace-saved-items:remove",
      tag: WS_METHODS.workspaceSavedItemsRemove,
      scheduler,
      concurrency,
      execute: (input) =>
        requireSupport.pipe(Effect.andThen(request(WS_METHODS.workspaceSavedItemsRemove, input))),
    }),
  };
}
