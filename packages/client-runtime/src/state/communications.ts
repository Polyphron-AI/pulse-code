// @effect-diagnostics preferSchemaOverJson:off -- Exact endpoint keys and UTF-8 byte budgets.
import {
  CommunicationsError,
  WS_METHODS,
  type CommunicationMessage,
  type EnvironmentId,
  type SlackListConversationsInput,
  type SlackListMessagesInput,
} from "@t3tools/contracts";
import { Cause, Effect, Schema, SubscriptionRef } from "effect";
import { Atom, AsyncResult, type AtomRegistry } from "effect/unstable/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as Supervisor from "../connection/supervisor.ts";
import { getInitialServerConfig, request } from "../rpc/client.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentQueryAtomFamily,
  createEnvironmentRpcQueryAtomFamily,
  executeAtomQuery,
  type AtomCommandResult,
} from "./runtime.ts";

const hasSlack = Schema.is(
  Schema.Struct({
    pulseCapabilities: Schema.Struct({ communicationsSlackRead: Schema.Literal(true) }),
  }),
);
const requireSupport = Effect.gen(function* () {
  const config = yield* getInitialServerConfig().pipe(
    Effect.mapError(
      () =>
        new CommunicationsError({
          kind: "unavailable",
          message: "This server connection is unavailable.",
        }),
    ),
  );
  if (!hasSlack(config))
    return yield* new CommunicationsError({
      kind: "unsupported",
      message: "This server does not support Slack reading.",
    });
});
type Target<I> = {
  readonly environmentId: EnvironmentId;
  readonly input: I;
  readonly generation?: number;
};
type RefreshTarget<I> = Target<I> & {
  /** Abort and release the view's query mount on close or target change. */
  readonly signal: AbortSignal;
};

/** Reads only mounted endpoints. A generation change mounts a distinct, uncached account scope. */
export function createCommunicationsAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const refreshSchedulers = new WeakMap<
    AbortSignal,
    ReturnType<typeof createAtomCommandScheduler>
  >();
  const pending = new Set<string>();
  const endpoint = (target: {
    environmentId: string;
    generation?: number;
    input: {
      connectionId: string;
      workspaceId?: string;
      conversationId?: string;
      replyRootId?: string;
    };
  }) =>
    JSON.stringify([
      target.environmentId,
      target.generation ?? 0,
      target.input.connectionId,
      target.input.workspaceId ?? null,
      target.input.conversationId ?? null,
      target.input.replyRootId ?? null,
    ]);
  const boundedRead = <A, F, S>(
    input: SlackListConversationsInput | SlackListMessagesInput,
    generation: number,
    read: Effect.Effect<A, F, S>,
  ) =>
    Effect.gen(function* () {
      yield* requireSupport;
      const supervisor = yield* Supervisor.EnvironmentSupervisor;
      const state = yield* SubscriptionRef.get(supervisor.state);
      const key = JSON.stringify([
        endpoint({ environmentId: supervisor.target.environmentId, input }),
        generation,
        state.generation,
      ]);
      if (pending.has(key))
        return yield* new CommunicationsError({
          kind: "unavailable",
          message: "A read is already pending for this Slack endpoint.",
        });
      pending.add(key);
      return yield* read.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            pending.delete(key);
          }),
        ),
      );
    });
  const slackConnections = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "communications:slack-connections",
    tag: WS_METHODS.slackListConnections,
    idleTtlMs: 0,
    staleTimeMs: Infinity,
    execute: (input) =>
      requireSupport.pipe(Effect.andThen(request(WS_METHODS.slackListConnections, input))),
  });
  const conversations = createEnvironmentQueryAtomFamily(runtime, {
    label: "communications:slack-conversations",
    idleTtlMs: 0,
    staleTimeMs: Infinity,
    execute: ({ input, generation }: { input: SlackListConversationsInput; generation: number }) =>
      boundedRead(input, generation, request(WS_METHODS.slackListConversations, input)),
  });
  const messages = createEnvironmentQueryAtomFamily(runtime, {
    label: "communications:slack-messages",
    idleTtlMs: 0,
    staleTimeMs: Infinity,
    execute: ({ input, generation }: { input: SlackListMessagesInput; generation: number }) =>
      boundedRead(input, generation, request(WS_METHODS.slackListMessages, input)),
  });
  const slackConversations = (target: Target<SlackListConversationsInput>) =>
    conversations({
      environmentId: target.environmentId,
      input: { input: target.input, generation: target.generation ?? 0 },
    });
  const slackMessages = (target: Target<SlackListMessagesInput>) =>
    messages({
      environmentId: target.environmentId,
      input: { input: target.input, generation: target.generation ?? 0 },
    });
  const refresh = <A, F, I extends SlackListConversationsInput | SlackListMessagesInput>(
    registry: AtomRegistry.AtomRegistry,
    query: Atom.Atom<AsyncResult.AsyncResult<A, F>>,
    target: RefreshTarget<I>,
  ): Promise<AtomCommandResult<A, F | CommunicationsError>> => {
    if (!target.signal)
      return Promise.resolve(
        AsyncResult.fail(
          new CommunicationsError({
            kind: "invalid-input",
            message: "Slack Refresh requires its owner's AbortSignal.",
          }),
        ),
      );
    if (target.signal.aborted) return Promise.resolve(AsyncResult.failure(Cause.interrupt()));
    // Each owner waits independently; the shared query retains other live mounts.
    let scheduler = refreshSchedulers.get(target.signal);
    if (!scheduler) {
      scheduler = createAtomCommandScheduler();
      refreshSchedulers.set(target.signal, scheduler);
    }
    return scheduler.schedule(registry, { mode: "singleFlight", key: endpoint }, target, () =>
      executeAtomQuery(registry, query, {
        signal: target.signal,
        refresh: registry.getNodes().has(query),
        reportFailure: false,
        reportDefect: false,
      }),
    );
  };
  const refreshSlackConversations = {
    label: "communications:refresh-slack-conversations",
    run: (
      registry: AtomRegistry.AtomRegistry,
      target: RefreshTarget<SlackListConversationsInput>,
    ) => refresh(registry, slackConversations(target), target),
  };
  const refreshSlackMessages = {
    label: "communications:refresh-slack-messages",
    run: (registry: AtomRegistry.AtomRegistry, target: RefreshTarget<SlackListMessagesInput>) =>
      refresh(registry, slackMessages(target), target),
  };
  return {
    slackConnections,
    slackConversations,
    slackMessages,
    refreshSlackConversations,
    refreshSlackMessages,
  };
}

/** T5 retains the first visible message ID before prepending this bounded, oldest-first window. */
export function mergeSlackMessages(
  previous: ReadonlyArray<CommunicationMessage>,
  incoming: ReadonlyArray<CommunicationMessage>,
) {
  const first = previous[0] ?? incoming[0];
  const rows = new Map<string, CommunicationMessage>();
  for (const message of [...previous, ...incoming]) {
    if (
      message.connectionId !== first?.connectionId ||
      message.workspaceId !== first.workspaceId ||
      message.conversationId !== first.conversationId
    )
      continue;
    rows.set(message.id, message);
  }
  const chronological = (a: CommunicationMessage, b: CommunicationMessage) => {
    const [as, af] = a.id.split(".");
    const [bs, bf] = b.id.split(".");
    return Number(as) - Number(bs) || (af! < bf! ? -1 : af! > bf! ? 1 : 0);
  };
  const ordered = [...rows.values()].sort(chronological);
  const anchor = first ? rows.get(first.id) : undefined;
  const messages: CommunicationMessage[] = [];
  let size = 2;
  for (const message of anchor
    ? [anchor, ...ordered.filter((row) => row.id !== anchor.id)]
    : ordered) {
    let length = 1;
    for (const char of JSON.stringify(message)) {
      const code = char.codePointAt(0)!;
      length += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    if (messages.length === 100 || size + length > 32000) break;
    messages.push(message);
    size += length;
  }
  return { messages: messages.sort(chronological), incomplete: messages.length < ordered.length };
}
