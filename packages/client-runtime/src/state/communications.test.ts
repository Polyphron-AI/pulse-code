import { EnvironmentId, WS_METHODS } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Latch, Layer, Option, Stream, SubscriptionRef } from "effect";
import * as TestClock from "effect/testing/TestClock";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import { executeAtomQuery, isAtomCommandInterrupted, type AtomCommand } from "./runtime.ts";
import { createCommunicationsAtoms, mergeSlackMessages } from "./communications.ts";
const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

function session(client: WsRpcProtocolClient, supported = true): RpcSession {
  return {
    client,
    initialConfig: Effect.succeed({
      pulseCapabilities: supported ? { communicationsSlackRead: true } : {},
    } as import("@t3tools/contracts").ServerConfig),
    subscribeServerConfig: (input) => client.subscribeServerConfig(input),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
}

const makeTestRuntime = Effect.fn("makeTestRuntime")(function* (
  client: WsRpcProtocolClient,
  supported = true,
) {
  const connectionState: SupervisorConnectionState = {
    ...AVAILABLE_CONNECTION_STATE,
    desired: true,
    network: "online",
    phase: "connected",
    attempt: 1,
    generation: 1,
  };
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state: yield* SubscriptionRef.make(connectionState),
    session: yield* SubscriptionRef.make(Option.some(session(client, supported))),
    prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  const secondTarget = new PrimaryConnectionTarget({
    ...TARGET,
    environmentId: EnvironmentId.make("environment-2"),
    label: "Second environment",
  });
  const secondSupervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    ...supervisor,
    target: secondTarget,
    state: yield* SubscriptionRef.make(connectionState),
    session: yield* SubscriptionRef.make(Option.some(session(client, supported))),
  });
  const environmentRegistry = EnvironmentRegistry.EnvironmentRegistry.of({
    entries: yield* SubscriptionRef.make<ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>>(
      new Map([
        [TARGET.environmentId, { target: TARGET, profile: Option.none(), enabled: true }],
        [
          secondTarget.environmentId,
          { target: secondTarget, profile: Option.none(), enabled: true },
        ],
      ]),
    ),
    run: (environmentId, effect) =>
      Effect.provideService(
        effect,
        EnvironmentSupervisor.EnvironmentSupervisor,
        environmentId === TARGET.environmentId ? supervisor : secondSupervisor,
      ),
    runStream: (environmentId, stream) =>
      Stream.provideService(
        stream,
        EnvironmentSupervisor.EnvironmentSupervisor,
        environmentId === TARGET.environmentId ? supervisor : secondSupervisor,
      ),
    followStream: (environmentId, stream) =>
      Stream.provideService(
        stream,
        EnvironmentSupervisor.EnvironmentSupervisor,
        environmentId === TARGET.environmentId ? supervisor : secondSupervisor,
      ),
  } as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
  );
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  return { atoms: createCommunicationsAtoms(runtime), registry, supervisor, secondSupervisor };
});

it.effect(
  "mounts a Slack list without history fanout, clock requests, or account-triggered histories",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        let histories = 0;
        const client = {
          [WS_METHODS.slackListConnections]: () => Effect.succeed([]),
          [WS_METHODS.slackListConversations]: () =>
            Effect.succeed({
              conversations: [],
              observedAt: "2026-10-13T09:00:00.000Z",
              incomplete: false,
            }),
          [WS_METHODS.slackListMessages]: () =>
            Effect.sync(() => {
              histories++;
              return { messages: [], observedAt: "2026-10-13T09:00:00.000Z", incomplete: false };
            }),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const target = {
          environmentId: TARGET.environmentId,
          input: { connectionId: "slack_test" },
        };
        const list = atoms.slackConversations(target);
        const stop = registry.mount(list);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        expect(
          AsyncResult.isSuccess(yield* Effect.promise(() => executeAtomQuery(registry, list))),
        ).toBe(true);
        yield* TestClock.adjust("1 hour");
        yield* Effect.promise(() =>
          executeAtomQuery(
            registry,
            atoms.slackConnections({ environmentId: TARGET.environmentId, input: {} }),
            { refresh: true },
          ),
        );
        expect(histories).toBe(0);
      }),
    ),
);

it.effect("coalesces two explicit Refresh clicks and never requests on clock ticks", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let calls = 0;
      const client = {
        [WS_METHODS.slackListMessages]: () =>
          Effect.gen(function* () {
            calls++;
            if (calls === 2) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
            }
            return { messages: [], observedAt: "2026-10-13T09:00:00.000Z", incomplete: false };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const target = {
        signal: new AbortController().signal,
        environmentId: TARGET.environmentId,
        input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
      };
      const query = atoms.slackMessages(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      expect(
        AsyncResult.isSuccess(yield* Effect.promise(() => executeAtomQuery(registry, query))),
      ).toBe(true);
      const first = atoms.refreshSlackMessages.run(registry, target);
      yield* Deferred.await(entered);
      const second = atoms.refreshSlackMessages.run(registry, target);
      expect(second).toBe(first);
      expect(calls).toBe(2);
      yield* Deferred.succeed(release, undefined);
      expect(AsyncResult.isSuccess(yield* Effect.promise(() => first))).toBe(true);
      yield* TestClock.adjust("1 hour");
      expect(calls).toBe(2);
      yield* Effect.promise(() => atoms.refreshSlackMessages.run(registry, target));
      expect(calls).toBe(3);
    }),
  ),
);

it.effect("old capability absence issues zero Slack RPCs", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let calls = 0;
      const client = Object.fromEntries(
        [
          WS_METHODS.slackListConnections,
          WS_METHODS.slackListConversations,
          WS_METHODS.slackListMessages,
        ].map((tag) => [
          tag,
          () =>
            Effect.sync(() => {
              calls++;
              return [];
            }),
        ]),
      ) as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client, false);
      const target = {
        environmentId: TARGET.environmentId,
        input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
      };
      const options = { reportFailure: false, reportDefect: false };
      const results = yield* Effect.promise(() =>
        Promise.all([
          executeAtomQuery(registry, atoms.slackConnections({ ...target, input: {} }), options),
          executeAtomQuery(registry, atoms.slackConversations(target), options),
          executeAtomQuery(registry, atoms.slackMessages(target), options),
        ]),
      );
      expect(results.every((result) => result._tag === "Failure")).toBe(true);
      yield* TestClock.adjust("1 hour");
      expect(calls).toBe(0);
    }),
  ),
);

it.effect(
  "closing a channel aborts its held RPC and a late result cannot replace the new channel",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const aborted = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const calls: string[] = [];
        const client = {
          [WS_METHODS.slackListMessages]: (input: { conversationId: string }) =>
            Effect.gen(function* () {
              calls.push(input.conversationId);
              if (input.conversationId === "C1") {
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(release).pipe(
                  Effect.onInterrupt(() => Deferred.succeed(aborted, undefined)),
                );
              }
              return {
                messages: [
                  {
                    id: "1760343120.000001",
                    accountId: "slack_test",
                    connectionId: "slack_test",
                    workspaceId: "T123",
                    conversationId: input.conversationId,
                    author: "U1",
                    date: "2026-10-13T09:00:00.000Z",
                    text: input.conversationId,
                  },
                ],
                observedAt: "2026-10-13T09:00:00.000Z",
                incomplete: false,
              };
            }),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const target = {
          environmentId: TARGET.environmentId,
          input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
        };
        const old = atoms.slackMessages(target);
        const stop = registry.mount(old);
        yield* Deferred.await(entered);
        stop();
        const next = atoms.slackMessages({
          ...target,
          input: { ...target.input, conversationId: "C2" },
        });
        const stopNext = registry.mount(next);
        yield* Effect.addFinalizer(() => Effect.sync(stopNext));
        const result = yield* Effect.promise(() => executeAtomQuery(registry, next));
        expect(AsyncResult.isSuccess(result) && result.value.messages[0]!.text).toBe("C2");
        yield* Deferred.await(aborted);
        yield* Deferred.succeed(release, undefined);
        const current = registry.get(next);
        expect(AsyncResult.isSuccess(current) && current.value.messages[0]!.conversationId).toBe(
          "C2",
        );
        expect(calls).toEqual(["C1", "C2"]);
      }),
    ),
);

it("merges older pages with exact equal-time identities and edited replacement, keeping the anchor", () => {
  const row = {
    accountId: "slack_test",
    connectionId: "slack_test",
    workspaceId: "T123",
    conversationId: "C1",
    author: "U1",
    date: "2026-10-13T09:00:00.000Z",
    text: "old",
  };
  const previous = [
    { ...row, id: "1760343120.000002" },
    { ...row, id: "1760343120.000003" },
  ];
  const merged = mergeSlackMessages(previous, [
    { ...row, id: "1760343120.000001" },
    { ...row, id: "1760343120.000002", text: "edited" },
    { ...row, id: "1760343120.000004", connectionId: "other" },
  ]);
  expect(merged.messages.map((message) => message.id)).toEqual([
    "1760343120.000001",
    "1760343120.000002",
    "1760343120.000003",
  ]);
  expect(merged.messages.find((message) => message.id === previous[0]!.id)!.text).toBe("edited");
});

it.effect("a new connection generation cannot join an old generation Refresh", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let calls = 0;
      const client = {
        [WS_METHODS.slackListMessages]: () =>
          Effect.gen(function* () {
            calls++;
            if (calls === 1) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
            }
            return { messages: [], observedAt: "2026-10-13T09:00:00.000Z", incomplete: false };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const target = {
        signal: new AbortController().signal,
        environmentId: TARGET.environmentId,
        generation: 1,
        input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
      };
      const first = atoms.refreshSlackMessages.run(registry, target);
      yield* Deferred.await(entered);
      const second = atoms.refreshSlackMessages.run(registry, { ...target, generation: 2 });
      expect(second).not.toBe(first);
      expect(AsyncResult.isSuccess(yield* Effect.promise(() => second))).toBe(true);
      yield* Deferred.succeed(release, undefined);
      yield* Effect.promise(() => first);
      expect(calls).toBe(2);
    }),
  ),
);

it.effect("environment change aborts the old request and isolates identical endpoint keys", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let calls = 0;
      const client = {
        [WS_METHODS.slackListMessages]: () =>
          Effect.gen(function* () {
            const number = ++calls;
            if (number === 1) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release).pipe(
                Effect.onInterrupt(() => Deferred.succeed(aborted, undefined)),
              );
            }
            return {
              messages: [],
              observedAt: number === 1 ? "2026-10-13T09:00:00.000Z" : "2026-10-13T10:00:00.000Z",
              incomplete: false,
            };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry, secondSupervisor } = yield* makeTestRuntime(client);
      const target = {
        environmentId: TARGET.environmentId,
        input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
      };
      const stop = registry.mount(atoms.slackMessages(target));
      yield* Deferred.await(entered);
      stop();
      const next = atoms.slackMessages({
        ...target,
        environmentId: secondSupervisor.target.environmentId,
      });
      const stopNext = registry.mount(next);
      yield* Effect.addFinalizer(() => Effect.sync(stopNext));
      const result = yield* Effect.promise(() => executeAtomQuery(registry, next));
      expect(AsyncResult.isSuccess(result) && result.value.observedAt).toBe(
        "2026-10-13T10:00:00.000Z",
      );
      yield* Deferred.await(aborted);
      yield* Deferred.succeed(release, undefined);
      const current = registry.get(next);
      expect(AsyncResult.isSuccess(current) && current.value.observedAt).toBe(
        "2026-10-13T10:00:00.000Z",
      );
      expect(calls).toBe(2);
    }),
  ),
);

it.effect("disconnect aborts held RPC and reconnect mounts only the selected endpoint", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      const reconnected = yield* Deferred.make<void>();
      let calls = 0;
      const client = {
        [WS_METHODS.slackListMessages]: () =>
          Effect.gen(function* () {
            calls++;
            if (calls === 1) {
              yield* Deferred.succeed(entered, undefined);
              return yield* Effect.never.pipe(
                Effect.onInterrupt(() => Deferred.succeed(aborted, undefined)),
              );
            }
            yield* Deferred.succeed(reconnected, undefined);
            return { messages: [], observedAt: "2026-10-13T10:00:00.000Z", incomplete: false };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry, supervisor } = yield* makeTestRuntime(client);
      const target = {
        environmentId: TARGET.environmentId,
        input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
      };
      const query = atoms.slackMessages(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Deferred.await(entered);
      const state = yield* SubscriptionRef.get(supervisor.state);
      yield* SubscriptionRef.set(supervisor.state, {
        ...state,
        phase: "offline",
        network: "offline",
        generation: 2,
      } satisfies SupervisorConnectionState);
      yield* Deferred.await(aborted);
      yield* TestClock.adjust("1 hour");
      expect(calls).toBe(1);
      const settled = Latch.makeUnsafe();
      const stopSettled = registry.subscribe(query, (result) => {
        if (AsyncResult.isSuccess(result) && !result.waiting) settled.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(stopSettled));
      yield* SubscriptionRef.set(supervisor.state, { ...state, generation: 3 });
      yield* Deferred.await(reconnected);
      yield* settled.await;
      const result = yield* Effect.promise(() => executeAtomQuery(registry, query));
      expect(AsyncResult.isSuccess(result)).toBe(true);
      expect(calls).toBe(2);
    }),
  ),
);

it("keeps the previously visible anchor when an older merge reaches the row ceiling", () => {
  const row = {
    accountId: "slack_test",
    connectionId: "slack_test",
    workspaceId: "T123",
    conversationId: "C1",
    author: "U1",
    date: "2026-10-13T09:00:00.000Z",
    text: "message",
  };
  const anchor = { ...row, id: "1760343121.000001" };
  const merged = mergeSlackMessages(
    [anchor],
    Array.from({ length: 100 }, (_, i) => ({
      ...row,
      id: `1760343120.${String(i).padStart(6, "0")}`,
    })),
  );
  expect(merged.messages).toHaveLength(100);
  expect(merged.messages.some((message) => message.id === anchor.id)).toBe(true);
  expect(merged.incomplete).toBe(true);
});

it.effect.each(["close", "channel", "environment"] as const)(
  "explicit message Refresh interrupts its owner on %s and remount reads once",
  (move) =>
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const interrupted = yield* Deferred.make<void>();
        const disposed = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let calls = 0;
        const client = {
          [WS_METHODS.slackListMessages]: () =>
            Effect.gen(function* () {
              if (++calls === 2) {
                yield* Effect.addFinalizer(() => Deferred.succeed(disposed, undefined));
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(release).pipe(
                  Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
                );
              }
              return { messages: [], observedAt: "2026-10-13T09:00:00.000Z", incomplete: false };
            }),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry, secondSupervisor } = yield* makeTestRuntime(client);
        const owner = new AbortController();
        const target = {
          signal: owner.signal,
          environmentId: TARGET.environmentId,
          input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
        };
        const old = atoms.slackMessages(target);
        const stop = registry.mount(old);
        expect(
          AsyncResult.isSuccess(yield* Effect.promise(() => executeAtomQuery(registry, old))),
        ).toBe(true);
        const refresh = atoms.refreshSlackMessages.run(registry, target);
        yield* Deferred.await(entered);
        owner.abort();
        stop();
        const nextTarget = {
          ...target,
          signal: new AbortController().signal,
          environmentId:
            move === "environment" ? secondSupervisor.target.environmentId : target.environmentId,
          input: { ...target.input, conversationId: move === "channel" ? "C2" : "C1" },
        };
        if (move !== "close") {
          const next = atoms.slackMessages(nextTarget);
          const stopNext = registry.mount(next);
          yield* Effect.addFinalizer(() => Effect.sync(stopNext));
          expect(
            AsyncResult.isSuccess(yield* Effect.promise(() => executeAtomQuery(registry, next))),
          ).toBe(true);
        }
        expect(isAtomCommandInterrupted(yield* Effect.promise(() => refresh))).toBe(true);
        yield* Deferred.await(interrupted);
        yield* Deferred.await(disposed);
        yield* Deferred.succeed(release, undefined);
        if (move === "close") {
          expect(
            AsyncResult.isSuccess(
              yield* Effect.promise(() => atoms.refreshSlackMessages.run(registry, nextTarget)),
            ),
          ).toBe(true);
        }
        expect(calls).toBe(3);
      }),
    ),
);

it.effect("explicit conversations Refresh releases its owned query and held RPC on close", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const interrupted = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let calls = 0;
      const client = {
        [WS_METHODS.slackListConversations]: () =>
          Effect.gen(function* () {
            if (++calls === 2) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release).pipe(
                Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
              );
            }
            return { conversations: [], observedAt: "2026-10-13T09:00:00.000Z", incomplete: false };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const owner = new AbortController();
      const target = {
        environmentId: TARGET.environmentId,
        input: { connectionId: "slack_test" },
        signal: owner.signal,
      };
      const query = atoms.slackConversations(target);
      const stop = registry.mount(query);
      expect(
        AsyncResult.isSuccess(yield* Effect.promise(() => executeAtomQuery(registry, query))),
      ).toBe(true);
      const first = atoms.refreshSlackConversations.run(registry, target);
      yield* Deferred.await(entered);
      expect(atoms.refreshSlackConversations.run(registry, target)).toBe(first);
      owner.abort();
      stop();
      expect(isAtomCommandInterrupted(yield* Effect.promise(() => first))).toBe(true);
      yield* Deferred.await(interrupted);
      yield* Deferred.succeed(release, undefined);
      expect(calls).toBe(2);
    }),
  ),
);

it.effect.each(["messages", "conversations"] as const)(
  "canceling one %s Refresh owner preserves another owner's shared read",
  (kind) =>
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let calls = 0;
        let interrupted = false;
        const read = Effect.gen(function* () {
          if (++calls === 1) {
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release).pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  interrupted = true;
                }),
              ),
            );
          }
          return {
            messages: [],
            conversations: [],
            observedAt: "2026-10-13T09:00:00.000Z",
            incomplete: false,
          };
        });
        const client = {
          [WS_METHODS.slackListMessages]: () => read,
          [WS_METHODS.slackListConversations]: () => read,
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const firstOwner = new AbortController();
        const secondOwner = new AbortController();
        const target = {
          environmentId: TARGET.environmentId,
          input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
        };
        const command: AtomCommand<typeof target & { signal: AbortSignal }, unknown, unknown> =
          kind === "messages" ? atoms.refreshSlackMessages : atoms.refreshSlackConversations;
        const first = command.run(registry, { ...target, signal: firstOwner.signal });
        yield* Deferred.await(entered);
        const second = command.run(registry, { ...target, signal: secondOwner.signal });
        expect(second).not.toBe(first);
        expect(command.run(registry, { ...target, signal: secondOwner.signal })).toBe(second);
        firstOwner.abort();
        expect(isAtomCommandInterrupted(yield* Effect.promise(() => first))).toBe(true);
        expect(interrupted).toBe(false);
        expect(calls).toBe(1);
        yield* Deferred.succeed(release, undefined);
        expect(AsyncResult.isSuccess(yield* Effect.promise(() => second))).toBe(true);
        expect(interrupted).toBe(false);
        expect(calls).toBe(1);
      }),
    ),
);

it.effect("canceling Refresh preserves an independent mounted query until its own close", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const interrupted = yield* Deferred.make<void>();
      let aborted = false;
      const client = {
        [WS_METHODS.slackListMessages]: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(entered, undefined);
            return yield* Effect.never.pipe(
              Effect.onInterrupt(() =>
                Effect.gen(function* () {
                  aborted = true;
                  yield* Deferred.succeed(interrupted, undefined);
                }),
              ),
            );
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const owner = new AbortController();
      const target = {
        environmentId: TARGET.environmentId,
        input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
        signal: owner.signal,
      };
      const stop = registry.mount(atoms.slackMessages(target));
      yield* Deferred.await(entered);
      const refresh = atoms.refreshSlackMessages.run(registry, target);
      owner.abort();
      expect(isAtomCommandInterrupted(yield* Effect.promise(() => refresh))).toBe(true);
      expect(aborted).toBe(false);
      stop();
      yield* Deferred.await(interrupted);
      expect(aborted).toBe(true);
    }),
  ),
);

it.effect("missing or already aborted Refresh ownership starts no Slack read", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let calls = 0;
      const client = {
        [WS_METHODS.slackListMessages]: () =>
          Effect.sync(() => {
            calls++;
            return { messages: [] };
          }),
        [WS_METHODS.slackListConversations]: () =>
          Effect.sync(() => {
            calls++;
            return { conversations: [] };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const owner = new AbortController();
      owner.abort();
      const target = {
        environmentId: TARGET.environmentId,
        input: { connectionId: "slack_test", workspaceId: "T123", conversationId: "C1" },
        signal: owner.signal,
      };
      const message = yield* Effect.promise(() => atoms.refreshSlackMessages.run(registry, target));
      const conversations = yield* Effect.promise(() =>
        atoms.refreshSlackConversations.run(registry, target),
      );
      expect(isAtomCommandInterrupted(message)).toBe(true);
      expect(isAtomCommandInterrupted(conversations)).toBe(true);
      const missingMessage = yield* Effect.promise(() =>
        // @ts-expect-error The public command deliberately rejects the old unowned signature.
        atoms.refreshSlackMessages.run(registry, { ...target, signal: undefined }),
      );
      const missingConversations = yield* Effect.promise(() =>
        // @ts-expect-error Both commands require a view-lifetime signal.
        atoms.refreshSlackConversations.run(registry, { ...target, signal: undefined }),
      );
      expect(missingMessage).toMatchObject({ _tag: "Failure" });
      expect(missingConversations).toMatchObject({ _tag: "Failure" });
      expect(calls).toBe(0);
    }),
  ),
);
