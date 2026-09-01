/** OMP CLI (`omp acp`) adapter. */
import {
  ApprovalRequestId,
  EventId,
  type OmpSettings,
  type ProviderApprovalDecision,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderOptionSelection,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderUserInputAnswers,
  RuntimeRequestId,
  type ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as EffectAcpErrors from "effect-acp/errors";
import * as EffectAcpSchema from "effect-acp/schema";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import { mapAcpToAdapterError } from "../acp/AcpAdapterSupport.ts";
import {
  makeAcpAssistantItemEvent,
  makeAcpContentDeltaEvent,
  makeAcpPlanUpdatedEvent,
  makeAcpRequestOpenedEvent,
  makeAcpRequestResolvedEvent,
  makeAcpToolCallEvent,
} from "../acp/AcpCoreRuntimeEvents.ts";
import { mapOmpAcpElicitationForm } from "../acp/OmpAcpElicitation.ts";
import { makeAcpNativeLoggerFactory } from "../acp/AcpNativeLogging.ts";
import { parsePermissionRequest } from "../acp/AcpRuntimeModel.ts";
import type * as AcpSessionRuntime from "../acp/AcpSessionRuntime.ts";
import { makeOmpAcpRuntime, resolveOmpAgentDir } from "../acp/OmpAcpSupport.ts";
import type { OmpAdapterShape } from "../Services/OmpAdapter.ts";
import { type EventNdjsonLogger, makeEventNdjsonLogger } from "./EventNdjsonLogger.ts";

const encodeUnknownJsonStringExit = Schema.encodeUnknownExit(Schema.fromJsonString(Schema.Unknown));
const PROVIDER = ProviderDriverKind.make("omp");
const OMP_RESUME_VERSION = 1 as const;
const isOmpResumeCursor = Schema.is(
  Schema.Struct({
    schemaVersion: Schema.Literal(OMP_RESUME_VERSION),
    sessionId: Schema.String,
  }),
);

export interface OmpAdapterLiveOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly instanceId?: ProviderInstanceId;
  readonly nativeEventLogPath?: string;
  readonly nativeEventLogger?: EventNdjsonLogger;
}

interface PendingApproval {
  readonly decision: Deferred.Deferred<ProviderApprovalDecision>;
  readonly request: EffectAcpSchema.RequestPermissionRequest;
  readonly turnId: TurnId;
}

type PendingUserInputResolution =
  | { readonly _tag: "answered"; readonly answers: ProviderUserInputAnswers }
  | { readonly _tag: "cancelled" };

interface PendingUserInput {
  readonly resolution: Deferred.Deferred<PendingUserInputResolution>;
  readonly turnId: TurnId;
}

interface OmpSessionContext {
  readonly threadId: ThreadId;
  readonly acpSessionId: string;
  session: ProviderSession;
  readonly scope: Scope.Closeable;
  readonly acp: AcpSessionRuntime.AcpSessionRuntime["Service"];
  notificationFiber: Fiber.Fiber<void, never> | undefined;
  readonly pendingApprovals: Map<ApprovalRequestId, PendingApproval>;
  readonly pendingUserInputs: Map<ApprovalRequestId, PendingUserInput>;
  readonly turns: Array<{ id: TurnId; items: Array<unknown> }>;
  readonly interruptedTurnIds: Set<TurnId>;
  lastPlanFingerprint: string | undefined;
  activeTurnId: TurnId | undefined;
  promptsInFlight: number;
  readonly queueTurnSemaphore: Semaphore.Semaphore;
  readonly requestLifecycleSemaphore: Semaphore.Semaphore;
  stopped: boolean;
}

function encodeJsonStringForDiagnostics(input: unknown): string | undefined {
  const result = encodeUnknownJsonStringExit(input);
  return Exit.isSuccess(result) ? result.value : undefined;
}

function parseOmpResume(raw: unknown): { readonly sessionId: string } | undefined {
  if (!isOmpResumeCursor(raw) || !raw.sessionId.trim()) return undefined;
  return { sessionId: raw.sessionId.trim() };
}

/** Select the arbitrary option id supplied by one ACP permission request. */
export function selectOmpPermissionOptionId(
  request: EffectAcpSchema.RequestPermissionRequest,
  decision: Exclude<ProviderApprovalDecision, "cancel">,
): string | undefined {
  const expectedKind =
    decision === "acceptForSession"
      ? "allow_always"
      : decision === "accept"
        ? "allow_once"
        : "reject_once";
  const optionId = request.options.find((option) => option.kind === expectedKind)?.optionId;
  return optionId?.trim() ? optionId : undefined;
}

function settlePendingApprovalsAsCancelled(
  pending: ReadonlyArray<PendingApproval>,
): Effect.Effect<void> {
  return Effect.forEach(
    pending,
    (entry) => Deferred.succeed(entry.decision, "cancel").pipe(Effect.ignore),
    { discard: true },
  );
}

function settlePendingUserInputsAsCancelled(
  pending: ReadonlyArray<PendingUserInput>,
): Effect.Effect<void> {
  return Effect.forEach(
    pending,
    (entry) => Deferred.succeed(entry.resolution, { _tag: "cancelled" }).pipe(Effect.ignore),
    { discard: true },
  );
}

function takePending<K, V>(pending: Map<K, V>): ReadonlyArray<V> {
  const entries = Array.from(pending.values());
  pending.clear();
  return entries;
}

function flattenOmpLegacyElicitationResponse(
  response: EffectAcpSchema.ElicitationResponse,
):
  | { readonly action: "accept"; readonly content: Record<string, unknown> }
  | { readonly action: "decline" | "cancel" } {
  const action = response.action;
  return action.action === "accept"
    ? { action: "accept", content: action.content ?? {} }
    : { action: action.action };
}

function validateOmpSelections(
  selections: ReadonlyArray<ProviderOptionSelection> | null | undefined,
): Effect.Effect<string | undefined, ProviderAdapterValidationError> {
  let thinking: string | undefined;
  for (const selection of selections ?? []) {
    if (selection.id !== "reasoning") {
      return Effect.fail(
        new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "session/set_config_option",
          issue: `Unsupported OMP model option '${selection.id}'.`,
        }),
      );
    }
    if (typeof selection.value !== "string" || !selection.value.trim()) {
      return Effect.fail(
        new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "session/set_config_option",
          issue: "OMP reasoning must be a non-empty string selection.",
        }),
      );
    }
    thinking = selection.value.trim();
  }
  return Effect.succeed(thinking);
}

export function makeOmpAdapter(ompSettings: OmpSettings, options?: OmpAdapterLiveOptions) {
  return Effect.gen(function* () {
    const boundInstanceId = options?.instanceId ?? ProviderInstanceId.make("omp");
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const serverConfig = yield* Effect.service(ServerConfig);
    const crypto = yield* Crypto.Crypto;
    const nativeEventLogger =
      options?.nativeEventLogger ??
      (options?.nativeEventLogPath
        ? yield* makeEventNdjsonLogger(options.nativeEventLogPath, { stream: "native" })
        : undefined);
    const managedNativeEventLogger =
      options?.nativeEventLogger === undefined ? nativeEventLogger : undefined;
    const makeAcpNativeLoggers = yield* makeAcpNativeLoggerFactory();
    const sessions = new Map<ThreadId, OmpSessionContext>();
    const threadLocksRef = yield* SynchronizedRef.make(new Map<string, Semaphore.Semaphore>());
    const runtimeEventPubSub = yield* PubSub.unbounded<ProviderRuntimeEvent>();
    const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
    const randomUUIDv4 = crypto.randomUUIDv4.pipe(
      Effect.mapError(
        (cause) =>
          new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "crypto/randomUUIDv4",
            detail: "Failed to generate OMP runtime identifier.",
            cause,
          }),
      ),
    );
    const makeEventStamp = () =>
      Effect.all({ eventId: Effect.map(randomUUIDv4, EventId.make), createdAt: nowIso });
    const offerRuntimeEvent = (event: ProviderRuntimeEvent) =>
      PubSub.publish(runtimeEventPubSub, event).pipe(Effect.asVoid);
    const mapCallbackFailure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.mapError(
          (cause) =>
            new EffectAcpErrors.AcpTransportError({
              detail: "Failed to process OMP ACP callback.",
              cause,
            }),
        ),
      );

    const getThreadSemaphore = (threadId: string) =>
      SynchronizedRef.modifyEffect(threadLocksRef, (current) => {
        const existing = Option.fromNullishOr(current.get(threadId));
        return Option.match(existing, {
          onSome: (semaphore) => Effect.succeed([semaphore, current] as const),
          onNone: () =>
            Semaphore.make(1).pipe(
              Effect.map((semaphore) => {
                const next = new Map(current);
                next.set(threadId, semaphore);
                return [semaphore, next] as const;
              }),
            ),
        });
      });
    const withThreadLock = <A, E, R>(threadId: string, effect: Effect.Effect<A, E, R>) =>
      Effect.flatMap(getThreadSemaphore(threadId), (semaphore) => semaphore.withPermit(effect));

    const logNative = (threadId: ThreadId, method: string, payload: unknown) =>
      Effect.gen(function* () {
        if (!nativeEventLogger) return;
        const observedAt = yield* nowIso;
        yield* nativeEventLogger.write(
          {
            observedAt,
            event: {
              id: yield* randomUUIDv4,
              kind: "notification",
              provider: PROVIDER,
              createdAt: observedAt,
              method,
              threadId,
              payload,
            },
          },
          threadId,
        );
      }).pipe(Effect.catch(() => Effect.void));

    const requireSession = (
      threadId: ThreadId,
    ): Effect.Effect<OmpSessionContext, ProviderAdapterSessionNotFoundError> => {
      const context = sessions.get(threadId);
      return context && !context.stopped
        ? Effect.succeed(context)
        : Effect.fail(new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId }));
    };

    const stopSessionInternal = (context: OmpSessionContext) =>
      Effect.gen(function* () {
        const claimed = yield* context.requestLifecycleSemaphore.withPermit(
          Effect.gen(function* () {
            if (context.stopped) return undefined;
            context.stopped = true;
            const approvals = takePending(context.pendingApprovals);
            const userInputs = takePending(context.pendingUserInputs);
            yield* settlePendingApprovalsAsCancelled(approvals);
            yield* settlePendingUserInputsAsCancelled(userInputs);
            return true;
          }),
        );
        if (!claimed) return;
        yield* Effect.yieldNow;
        if (context.notificationFiber) yield* Fiber.interrupt(context.notificationFiber);
        yield* Scope.close(context.scope, Exit.void).pipe(Effect.ignore);
        sessions.delete(context.threadId);
        yield* offerRuntimeEvent({
          type: "session.exited",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          threadId: context.threadId,
          payload: { exitKind: "graceful" },
        });
      });

    const applyModelSelection = (
      context: Pick<OmpSessionContext, "acp" | "threadId">,
      selection:
        | {
            readonly model: string;
            readonly options?: ReadonlyArray<ProviderOptionSelection> | null;
          }
        | undefined,
    ) =>
      Effect.gen(function* () {
        if (!selection) return;
        const thinking = yield* validateOmpSelections(selection.options);
        yield* context.acp
          .setModel(selection.model)
          .pipe(
            Effect.mapError((error) =>
              mapAcpToAdapterError(PROVIDER, context.threadId, "session/set_config_option", error),
            ),
          );
        if (thinking !== undefined) {
          yield* context.acp
            .setConfigOption("thinking", thinking)
            .pipe(
              Effect.mapError((error) =>
                mapAcpToAdapterError(
                  PROVIDER,
                  context.threadId,
                  "session/set_config_option",
                  error,
                ),
              ),
            );
        }
      });

    const startSession: OmpAdapterShape["startSession"] = (input) =>
      withThreadLock(
        input.threadId,
        Effect.gen(function* () {
          if (input.provider !== undefined && input.provider !== PROVIDER) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "startSession",
              issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
            });
          }
          if (!input.cwd?.trim()) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "startSession",
              issue: "cwd is required and must be non-empty.",
            });
          }
          const cwd = path.resolve(input.cwd.trim());
          const modelSelection =
            input.modelSelection?.instanceId === boundInstanceId ? input.modelSelection : undefined;
          const existing = sessions.get(input.threadId);
          if (existing && !existing.stopped) yield* stopSessionInternal(existing);

          const pendingApprovals = new Map<ApprovalRequestId, PendingApproval>();
          const pendingUserInputs = new Map<ApprovalRequestId, PendingUserInput>();
          const sessionScope = yield* Scope.make("sequential");
          let sessionScopeTransferred = false;
          yield* Effect.addFinalizer(() =>
            sessionScopeTransferred ? Effect.void : Scope.close(sessionScope, Exit.void),
          );
          let context: OmpSessionContext | undefined;
          const agentDir = resolveOmpAgentDir(path, serverConfig.stateDir, boundInstanceId);
          yield* fileSystem.makeDirectory(agentDir, { recursive: true }).pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: input.threadId,
                  detail: `Failed to create OMP instance directory: ${cause.message}`,
                  cause,
                }),
            ),
          );
          const nativeLoggers = makeAcpNativeLoggers({
            nativeEventLogger,
            provider: PROVIDER,
            threadId: input.threadId,
          });
          const resumeSessionId = parseOmpResume(input.resumeCursor)?.sessionId;
          const acp = yield* makeOmpAcpRuntime({
            ompSettings,
            runtimeMode: input.runtimeMode,
            childProcessSpawner,
            cwd,
            agentDir,
            environment: options?.environment ?? {},
            ...(resumeSessionId ? { resumeSessionId } : {}),
            clientInfo: { name: "t3-code", version: "0.0.0" },
            ...nativeLoggers,
          }).pipe(
            Effect.provideService(Crypto.Crypto, crypto),
            Effect.provideService(Scope.Scope, sessionScope),
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: input.threadId,
                  detail: cause.message,
                  cause,
                }),
            ),
          );

          const started = yield* Effect.gen(function* () {
            const handleOmpFormElicitation = (
              request: Extract<EffectAcpSchema.ElicitationRequest, { readonly mode: "form" }>,
              method: "session/elicitation" | "elicitation/create",
            ) =>
              Effect.gen(function* () {
                const live = context;
                if (!live || request.sessionId !== live.acpSessionId) {
                  return { action: { action: "cancel" as const } };
                }
                const mapped = mapOmpAcpElicitationForm(request);
                if (!mapped) return { action: { action: "cancel" as const } };
                const requestId = ApprovalRequestId.make(yield* randomUUIDv4);
                const runtimeRequestId = RuntimeRequestId.make(requestId);
                const resolution = yield* Deferred.make<PendingUserInputResolution>();
                const turnId = yield* live.requestLifecycleSemaphore.withPermit(
                  Effect.gen(function* () {
                    const activeTurnId = live.activeTurnId;
                    if (
                      live.stopped ||
                      !activeTurnId ||
                      live.interruptedTurnIds.has(activeTurnId)
                    ) {
                      return undefined;
                    }
                    pendingUserInputs.set(requestId, { resolution, turnId: activeTurnId });
                    yield* offerRuntimeEvent({
                      type: "user-input.requested",
                      ...(yield* makeEventStamp()),
                      provider: PROVIDER,
                      threadId: input.threadId,
                      turnId: activeTurnId,
                      requestId: runtimeRequestId,
                      payload: { questions: mapped.questions },
                      raw: {
                        source: "acp.jsonrpc",
                        method,
                        payload: request,
                      },
                    });
                    return activeTurnId;
                  }),
                );
                if (!turnId) return { action: { action: "cancel" as const } };
                const resolved = yield* Deferred.await(resolution);
                const answers = resolved._tag === "answered" ? resolved.answers : {};
                const resolutionPublished = yield* live.requestLifecycleSemaphore.withPermit(
                  Effect.gen(function* () {
                    if (
                      live.stopped ||
                      live.activeTurnId !== turnId ||
                      live.interruptedTurnIds.has(turnId)
                    ) {
                      return false;
                    }
                    yield* offerRuntimeEvent({
                      type: "user-input.resolved",
                      ...(yield* makeEventStamp()),
                      provider: PROVIDER,
                      threadId: input.threadId,
                      turnId,
                      requestId: runtimeRequestId,
                      payload: { answers },
                    });
                    return true;
                  }),
                );
                if (!resolutionPublished) return { action: { action: "cancel" as const } };
                return resolved._tag === "answered"
                  ? mapped.resolve(resolved.answers)
                  : { action: { action: "cancel" as const } };
              });

            yield* acp.handleRequestPermission((request) =>
              mapCallbackFailure(
                Effect.gen(function* () {
                  yield* logNative(input.threadId, "session/request_permission", request);
                  const live = context;
                  if (!live || request.sessionId !== live.acpSessionId) {
                    return { outcome: { outcome: "cancelled" as const } };
                  }
                  const permissionRequest = parsePermissionRequest(request);
                  const requestId = ApprovalRequestId.make(yield* randomUUIDv4);
                  const runtimeRequestId = RuntimeRequestId.make(requestId);
                  const decision = yield* Deferred.make<ProviderApprovalDecision>();
                  const turnId = yield* live.requestLifecycleSemaphore.withPermit(
                    Effect.gen(function* () {
                      const activeTurnId = live.activeTurnId;
                      if (
                        live.stopped ||
                        !activeTurnId ||
                        live.interruptedTurnIds.has(activeTurnId)
                      ) {
                        return undefined;
                      }
                      pendingApprovals.set(requestId, { decision, request, turnId: activeTurnId });
                      yield* offerRuntimeEvent(
                        makeAcpRequestOpenedEvent({
                          stamp: yield* makeEventStamp(),
                          provider: PROVIDER,
                          threadId: input.threadId,
                          turnId: activeTurnId,
                          requestId: runtimeRequestId,
                          permissionRequest,
                          detail:
                            permissionRequest.detail ??
                            encodeJsonStringForDiagnostics(request)?.slice(0, 2_000) ??
                            "[unserializable params]",
                          args: request,
                          source: "acp.jsonrpc",
                          method: "session/request_permission",
                          rawPayload: request,
                        }),
                      );
                      return activeTurnId;
                    }),
                  );
                  if (!turnId) return { outcome: { outcome: "cancelled" as const } };
                  const resolved = yield* Deferred.await(decision);
                  const resolutionPublished = yield* live.requestLifecycleSemaphore.withPermit(
                    Effect.gen(function* () {
                      if (
                        live.stopped ||
                        live.activeTurnId !== turnId ||
                        live.interruptedTurnIds.has(turnId)
                      ) {
                        return false;
                      }
                      yield* offerRuntimeEvent(
                        makeAcpRequestResolvedEvent({
                          stamp: yield* makeEventStamp(),
                          provider: PROVIDER,
                          threadId: input.threadId,
                          turnId,
                          requestId: runtimeRequestId,
                          permissionRequest,
                          decision: resolved,
                        }),
                      );
                      return true;
                    }),
                  );
                  if (!resolutionPublished) {
                    return { outcome: { outcome: "cancelled" as const } };
                  }
                  if (resolved === "cancel") {
                    return { outcome: { outcome: "cancelled" as const } };
                  }
                  const optionId = selectOmpPermissionOptionId(request, resolved);
                  return optionId
                    ? { outcome: { outcome: "selected" as const, optionId } }
                    : { outcome: { outcome: "cancelled" as const } };
                }),
              ),
            );
            yield* acp.handleElicitation((request) =>
              mapCallbackFailure(
                Effect.gen(function* () {
                  yield* logNative(input.threadId, "session/elicitation", request);
                  return request.mode === "url"
                    ? { action: { action: "decline" as const } }
                    : yield* handleOmpFormElicitation(request, "session/elicitation");
                }),
              ),
            );
            yield* acp.handleExtRequest(
              "elicitation/create",
              EffectAcpSchema.ElicitationRequest,
              (request) =>
                mapCallbackFailure(
                  Effect.gen(function* () {
                    yield* logNative(input.threadId, "elicitation/create", request);
                    return flattenOmpLegacyElicitationResponse(
                      request.mode === "url"
                        ? { action: { action: "decline" as const } }
                        : yield* handleOmpFormElicitation(request, "elicitation/create"),
                    );
                  }),
                ),
            );
            return yield* acp.start();
          }).pipe(
            Effect.mapError((error) =>
              mapAcpToAdapterError(PROVIDER, input.threadId, "session/start", error),
            ),
          );

          const now = yield* nowIso;
          const session: ProviderSession = {
            provider: PROVIDER,
            providerInstanceId: boundInstanceId,
            status: "ready",
            runtimeMode: input.runtimeMode,
            cwd,
            ...(modelSelection ? { model: modelSelection.model } : {}),
            threadId: input.threadId,
            resumeCursor: { schemaVersion: OMP_RESUME_VERSION, sessionId: started.sessionId },
            createdAt: now,
            updatedAt: now,
          };
          context = {
            threadId: input.threadId,
            acpSessionId: started.sessionId,
            session,
            scope: sessionScope,
            acp,
            notificationFiber: undefined,
            pendingApprovals,
            pendingUserInputs,
            turns: [],
            interruptedTurnIds: new Set(),
            lastPlanFingerprint: undefined,
            activeTurnId: undefined,
            promptsInFlight: 0,
            queueTurnSemaphore: yield* Semaphore.make(1),
            requestLifecycleSemaphore: yield* Semaphore.make(1),
            stopped: false,
          };
          yield* acp
            .setMode("default")
            .pipe(
              Effect.mapError((error) =>
                mapAcpToAdapterError(PROVIDER, input.threadId, "session/set_mode", error),
              ),
            );
          yield* applyModelSelection(context, modelSelection);

          const notificationFiber = yield* Stream.runDrain(
            Stream.mapEffect(acp.getEvents(), (event) =>
              Effect.gen(function* () {
                if (event._tag === "EventStreamBarrier") {
                  yield* Deferred.succeed(event.acknowledge, undefined);
                  return;
                }
                if (event._tag === "ModeChanged") return;
                if (
                  event._tag === "PlanUpdated" ||
                  event._tag === "ToolCallUpdated" ||
                  event._tag === "ContentDelta"
                ) {
                  yield* logNative(input.threadId, "session/update", event.rawPayload);
                }
                const live = context;
                const turnId = live?.activeTurnId;
                if (!live || !turnId || live.interruptedTurnIds.has(turnId)) return;
                switch (event._tag) {
                  case "AssistantItemStarted":
                  case "AssistantItemCompleted":
                    yield* offerRuntimeEvent(
                      makeAcpAssistantItemEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: input.threadId,
                        turnId,
                        itemId: event.itemId,
                        lifecycle:
                          event._tag === "AssistantItemStarted" ? "item.started" : "item.completed",
                      }),
                    );
                    return;
                  case "PlanUpdated": {
                    const fingerprint = `${turnId}:${encodeJsonStringForDiagnostics(event.payload) ?? "[unserializable payload]"}`;
                    if (fingerprint === live.lastPlanFingerprint) return;
                    live.lastPlanFingerprint = fingerprint;
                    yield* offerRuntimeEvent(
                      makeAcpPlanUpdatedEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: input.threadId,
                        turnId,
                        payload: event.payload,
                        source: "acp.jsonrpc",
                        method: "session/update",
                        rawPayload: event.rawPayload,
                      }),
                    );
                    return;
                  }
                  case "ToolCallUpdated":
                    yield* offerRuntimeEvent(
                      makeAcpToolCallEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: input.threadId,
                        turnId,
                        toolCall: event.toolCall,
                        rawPayload: event.rawPayload,
                      }),
                    );
                    return;
                  case "ContentDelta":
                    yield* offerRuntimeEvent(
                      makeAcpContentDeltaEvent({
                        stamp: yield* makeEventStamp(),
                        provider: PROVIDER,
                        threadId: input.threadId,
                        turnId,
                        ...(event.itemId ? { itemId: event.itemId } : {}),
                        text: event.text,
                        rawPayload: event.rawPayload,
                      }),
                    );
                    return;
                }
              }),
            ),
          ).pipe(
            Effect.catch((cause) =>
              Effect.logError("Failed to process OMP runtime notification.", { cause }),
            ),
            Effect.forkIn(sessionScope),
          );
          context.notificationFiber = notificationFiber;
          sessions.set(input.threadId, context);
          sessionScopeTransferred = true;
          yield* offerRuntimeEvent({
            type: "session.started",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            payload: { resume: started.initializeResult },
          });
          yield* offerRuntimeEvent({
            type: "session.state.changed",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            payload: { state: "ready", reason: "OMP ACP session ready" },
          });
          yield* offerRuntimeEvent({
            type: "thread.started",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId: input.threadId,
            payload: { providerThreadId: started.sessionId },
          });
          return session;
        }).pipe(Effect.scoped),
      );

    const sendTurnNow: OmpAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const context = yield* requireSession(input.threadId);
        const steeringTurnId = context.promptsInFlight > 0 ? context.activeTurnId : undefined;
        const turnId = steeringTurnId ?? TurnId.make(yield* randomUUIDv4);
        context.promptsInFlight += 1;
        return yield* Effect.gen(function* () {
          const modelSelection =
            input.modelSelection?.instanceId === boundInstanceId ? input.modelSelection : undefined;
          yield* context.acp
            .setMode(input.interactionMode ?? "default")
            .pipe(
              Effect.mapError((error) =>
                mapAcpToAdapterError(PROVIDER, input.threadId, "session/set_mode", error),
              ),
            );
          yield* applyModelSelection(context, modelSelection);
          context.activeTurnId = turnId;
          if (steeringTurnId === undefined) context.lastPlanFingerprint = undefined;
          context.session = {
            ...context.session,
            status: "running",
            activeTurnId: turnId,
            updatedAt: yield* nowIso,
            ...(modelSelection ? { model: modelSelection.model } : {}),
          };
          if (steeringTurnId === undefined) {
            yield* offerRuntimeEvent({
              type: "turn.started",
              ...(yield* makeEventStamp()),
              provider: PROVIDER,
              threadId: input.threadId,
              turnId,
              payload: context.session.model ? { model: context.session.model } : {},
            });
          }

          const prompt: Array<EffectAcpSchema.ContentBlock> = [];
          if (input.input?.trim()) prompt.push({ type: "text", text: input.input.trim() });
          for (const attachment of input.attachments ?? []) {
            const attachmentPath = resolveAttachmentPath({
              attachmentsDir: serverConfig.attachmentsDir,
              attachment,
            });
            if (!attachmentPath) {
              return yield* new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "session/prompt",
                detail: `Invalid attachment id '${attachment.id}'.`,
              });
            }
            const bytes = yield* fileSystem.readFile(attachmentPath).pipe(
              Effect.mapError(
                (cause) =>
                  new ProviderAdapterRequestError({
                    provider: PROVIDER,
                    method: "session/prompt",
                    detail: cause.message,
                    cause,
                  }),
              ),
            );
            prompt.push({
              type: "image",
              data: Buffer.from(bytes).toString("base64"),
              mimeType: attachment.mimeType,
            });
          }
          if (prompt.length === 0) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: "Turn requires non-empty text or attachments.",
            });
          }

          const result = yield* context.acp
            .prompt({ prompt })
            .pipe(
              Effect.mapError((error) =>
                mapAcpToAdapterError(PROVIDER, input.threadId, "session/prompt", error),
              ),
            );
          yield* context.acp.drainEvents;
          if (context.interruptedTurnIds.has(turnId)) {
            return { threadId: input.threadId, turnId, resumeCursor: context.session.resumeCursor };
          }
          const turn = context.turns.find((entry) => entry.id === turnId);
          if (turn) turn.items.push({ prompt, result });
          else context.turns.push({ id: turnId, items: [{ prompt, result }] });
          if (context.promptsInFlight === 1) {
            const { activeTurnId: _activeTurnId, ...readySession } = context.session;
            context.activeTurnId = undefined;
            context.session = { ...readySession, status: "ready", updatedAt: yield* nowIso };
            yield* offerRuntimeEvent({
              type: "turn.completed",
              ...(yield* makeEventStamp()),
              provider: PROVIDER,
              threadId: input.threadId,
              turnId,
              payload: {
                state: result.stopReason === "cancelled" ? "cancelled" : "completed",
                stopReason: result.stopReason ?? null,
              },
            });
          }
          return { threadId: input.threadId, turnId, resumeCursor: context.session.resumeCursor };
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              context.promptsInFlight = Math.max(0, context.promptsInFlight - 1);
            }),
          ),
        );
      });

    const sendTurn: OmpAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const context = yield* requireSession(input.threadId);
        if (input.busyBehavior === "steer" && context.promptsInFlight > 0) {
          return yield* sendTurnNow(input);
        }
        return yield* context.queueTurnSemaphore.withPermit(sendTurnNow(input));
      });

    const interruptTurn: OmpAdapterShape["interruptTurn"] = (threadId, requestedTurnId) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        const claimed = yield* context.requestLifecycleSemaphore.withPermit(
          Effect.gen(function* () {
            const activeTurnId = context.activeTurnId ?? context.session.activeTurnId;
            if (requestedTurnId !== undefined && activeTurnId !== requestedTurnId) {
              return undefined;
            }
            const interruptedTurnId = requestedTurnId ?? activeTurnId;
            if (interruptedTurnId) context.interruptedTurnIds.add(interruptedTurnId);
            const approvals = takePending(context.pendingApprovals);
            const userInputs = takePending(context.pendingUserInputs);
            yield* settlePendingApprovalsAsCancelled(approvals);
            yield* settlePendingUserInputsAsCancelled(userInputs);
            return { activeTurnId, interruptedTurnId };
          }),
        );
        if (!claimed) return;
        const { activeTurnId, interruptedTurnId } = claimed;
        yield* Effect.yieldNow;
        yield* context.acp.cancel.pipe(Effect.ignore);
        if (interruptedTurnId && activeTurnId === interruptedTurnId) {
          context.promptsInFlight = 0;
          context.activeTurnId = undefined;
          const { activeTurnId: _activeTurnId, ...readySession } = context.session;
          context.session = { ...readySession, status: "ready", updatedAt: yield* nowIso };
          yield* offerRuntimeEvent({
            type: "turn.completed",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            threadId,
            turnId: interruptedTurnId,
            payload: { state: "cancelled", stopReason: "cancelled" },
          });
        }
      });

    const respondToRequest: OmpAdapterShape["respondToRequest"] = (threadId, requestId, decision) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        const accepted = yield* context.requestLifecycleSemaphore.withPermit(
          Effect.gen(function* () {
            const pending = context.pendingApprovals.get(requestId);
            if (!pending) return undefined;
            context.pendingApprovals.delete(requestId);
            return yield* Deferred.succeed(pending.decision, decision);
          }),
        );
        if (accepted !== true) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "session/request_permission",
            detail: `Unknown pending approval request: ${requestId}`,
          });
        }
      });

    const respondToUserInput: OmpAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      answers,
    ) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        const accepted = yield* context.requestLifecycleSemaphore.withPermit(
          Effect.gen(function* () {
            const pending = context.pendingUserInputs.get(requestId);
            if (!pending) return undefined;
            context.pendingUserInputs.delete(requestId);
            return yield* Deferred.succeed(pending.resolution, { _tag: "answered", answers });
          }),
        );
        if (accepted !== true) {
          return yield* new ProviderAdapterRequestError({
            provider: PROVIDER,
            method: "session/elicitation",
            detail: `Unknown pending user-input request: ${requestId}`,
          });
        }
      });

    const readThread: OmpAdapterShape["readThread"] = (threadId) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        return { threadId, turns: context.turns };
      });
    const rollbackThread: OmpAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const context = yield* requireSession(threadId);
        if (!Number.isInteger(numTurns) || numTurns < 1) {
          return yield* new ProviderAdapterValidationError({
            provider: PROVIDER,
            operation: "rollbackThread",
            issue: "numTurns must be an integer >= 1.",
          });
        }
        context.turns.splice(Math.max(0, context.turns.length - numTurns));
        return { threadId, turns: context.turns };
      });
    const stopSession: OmpAdapterShape["stopSession"] = (threadId) =>
      withThreadLock(threadId, requireSession(threadId).pipe(Effect.flatMap(stopSessionInternal)));
    const listSessions: OmpAdapterShape["listSessions"] = () =>
      Effect.sync(() => Array.from(sessions.values(), (context) => ({ ...context.session })));
    const hasSession: OmpAdapterShape["hasSession"] = (threadId) =>
      Effect.sync(() => {
        const context = sessions.get(threadId);
        return context !== undefined && !context.stopped;
      });
    const stopAll: OmpAdapterShape["stopAll"] = () =>
      Effect.forEach(Array.from(sessions.values()), stopSessionInternal, { discard: true });

    yield* Effect.addFinalizer(() =>
      Effect.ignore(stopAll()).pipe(
        Effect.tap(() => PubSub.shutdown(runtimeEventPubSub)),
        Effect.tap(() => managedNativeEventLogger?.close() ?? Effect.void),
      ),
    );

    return {
      provider: PROVIDER,
      capabilities: { sessionModelSwitch: "in-session" },
      startSession,
      sendTurn,
      interruptTurn,
      respondToRequest,
      respondToUserInput,
      stopSession,
      listSessions,
      hasSession,
      readThread,
      rollbackThread,
      stopAll,
      streamEvents: Stream.fromPubSub(runtimeEventPubSub),
    } satisfies OmpAdapterShape;
  });
}
