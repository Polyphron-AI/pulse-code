// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { HostProcessExecutablePath, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { assert, it } from "@effect/vitest";
import {
  ApprovalRequestId,
  OmpSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderRuntimeEvent,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { ServerConfig } from "../../config.ts";
import type { EventNdjsonLogger } from "./EventNdjsonLogger.ts";
import {
  makeOmpAdapter,
  raceOmpTurnPipelineAgainstCancellation,
  selectOmpPermissionOptionId,
} from "./OmpAdapter.ts";

interface Fixture {
  readonly directory: string;
  readonly wrapperPath: string;
  readonly argsLogPath: string;
  readonly requestLogPath: string;
  readonly responseLogPath: string;
}

const decodeOmpSettings = Schema.decodeSync(OmpSettings);
const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(__dirname, "../../../scripts/acp-mock-agent.ts");

function shellQuote(value: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? `"${value.replaceAll('"', '""')}"`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

const makeFixture = Effect.acquireRelease(
  Effect.gen(function* () {
    const platform = yield* HostProcessPlatform;
    const executablePath = yield* HostProcessExecutablePath;
    return yield* Effect.sync(() => {
      const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-omp-adapter-"));
      const wrapperPath = NodePath.join(directory, platform === "win32" ? "omp.cmd" : "omp.sh");
      const command = `${shellQuote(executablePath, platform)} ${shellQuote(mockAgentPath, platform)}`;
      NodeFS.writeFileSync(
        wrapperPath,
        platform === "win32"
          ? `@echo off\r\n${command} %*\r\nexit /b %ERRORLEVEL%\r\n`
          : `#!/bin/sh\nexec ${command} "$@"\n`,
        "utf8",
      );
      if (platform !== "win32") NodeFS.chmodSync(wrapperPath, 0o755);
      return {
        directory,
        wrapperPath,
        argsLogPath: NodePath.join(directory, "args.ndjson"),
        requestLogPath: NodePath.join(directory, "requests.ndjson"),
        responseLogPath: NodePath.join(directory, "responses.ndjson"),
      } satisfies Fixture;
    });
  }),
  (fixture) =>
    Effect.sync(() => NodeFS.rmSync(fixture.directory, { recursive: true, force: true })),
);

function readJsonLines(path: string): ReadonlyArray<Record<string, unknown>> {
  if (!NodeFS.existsSync(path)) return [];
  return NodeFS.readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function waitForJsonLogEntry(
  path: string,
  predicate: (entry: Record<string, unknown>) => boolean,
  timeoutMs = 2_000,
): Effect.Effect<Record<string, unknown>> {
  const poll = (remaining: number): Effect.Effect<Record<string, unknown>> =>
    Effect.gen(function* () {
      const entry = readJsonLines(path).find(predicate);
      if (entry) return entry;
      if (remaining <= 0) {
        return yield* Effect.die(new Error(`Timed out waiting for a log entry in ${path}`));
      }
      yield* Effect.sleep("10 millis");
      return yield* poll(remaining - 1);
    });
  return poll(Math.ceil(timeoutMs / 10)).pipe(TestClock.withLive);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function makeBlockingNativeLogger(
  fixture: Fixture,
  methodToBlock: string,
  entered: Deferred.Deferred<void>,
  release: Deferred.Deferred<void>,
): EventNdjsonLogger {
  return {
    filePath: NodePath.join(fixture.directory, "native.ndjson"),
    write: (record) => {
      const event =
        typeof record === "object" && record !== null && "event" in record
          ? record.event
          : undefined;
      const method =
        typeof event === "object" && event !== null && "method" in event ? event.method : undefined;
      return method === methodToBlock
        ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))
        : Effect.void;
    },
    close: () => Effect.void,
  };
}

function makeNativeRequestLogger(
  fixture: Fixture,
  methodToObserve: string,
  statusToObserve: "started" | "succeeded",
  observed: Deferred.Deferred<void>,
  release?: Deferred.Deferred<void>,
): EventNdjsonLogger {
  return {
    filePath: NodePath.join(fixture.directory, "native.ndjson"),
    write: (record) => {
      const event =
        typeof record === "object" && record !== null && "event" in record
          ? record.event
          : undefined;
      const payload =
        typeof event === "object" && event !== null && "payload" in event
          ? event.payload
          : undefined;
      const method =
        typeof payload === "object" && payload !== null && "method" in payload
          ? payload.method
          : undefined;
      const status =
        typeof payload === "object" && payload !== null && "status" in payload
          ? payload.status
          : undefined;
      if (method !== methodToObserve || status !== statusToObserve) return Effect.void;
      const signal = Deferred.succeed(observed, undefined).pipe(Effect.ignore);
      return release ? signal.pipe(Effect.andThen(Deferred.await(release))) : signal;
    },
    close: () => Effect.void,
  };
}

const testLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-omp-adapter-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));
const adapterTest = it.layer(testLayer);

function makeAdapter(
  fixture: Fixture,
  environment: NodeJS.ProcessEnv = {},
  instanceId = ProviderInstanceId.make("omp_work"),
  nativeEventLogger?: EventNdjsonLogger,
) {
  return makeOmpAdapter(
    { ...decodeOmpSettings({}), enabled: true, binaryPath: fixture.wrapperPath },
    {
      instanceId,
      ...(nativeEventLogger ? { nativeEventLogger } : {}),
      environment: {
        T3_ACP_OMP_MODE: "1",
        T3_ACP_REQUEST_LOG_PATH: fixture.requestLogPath,
        T3_ACP_CLIENT_RESPONSE_LOG_PATH: fixture.responseLogPath,
        T3_OMP_CLI_ARGS_LOG_PATH: fixture.argsLogPath,
        ...environment,
      },
    },
  );
}

function waitForEvent(
  events: Stream.Stream<ProviderRuntimeEvent>,
  predicate: (event: ProviderRuntimeEvent) => boolean,
) {
  return Stream.runHead(Stream.filter(events, predicate)).pipe(
    Effect.map(Option.getOrThrow),
    Effect.forkChild,
  );
}

adapterTest("OMP adapter", (it) => {
  it.effect("does not start a turn pipeline after cancellation wins admission", () =>
    Effect.gen(function* () {
      const cancellation = yield* Deferred.make<void>();
      const pipelineStarted = yield* Ref.make(false);
      yield* Deferred.succeed(cancellation, undefined);

      const outcome = yield* raceOmpTurnPipelineAgainstCancellation(
        cancellation,
        Ref.set(pipelineStarted, true).pipe(Effect.as({ _tag: "Prompted" as const })),
      );

      assert.equal(outcome._tag, "Cancelled");
      assert.isFalse(yield* Ref.get(pipelineStarted));
    }),
  );

  it.effect("starts, resumes, streams a turn, and cleans up its child", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture);
        const threadId = ThreadId.make("omp-session-flow");
        const eventsFiber = yield* Stream.take(adapter.streamEvents, 9).pipe(
          Stream.runCollect,
          Effect.forkChild,
        );
        const session = yield* adapter.startSession({
          threadId,
          provider: ProviderDriverKind.make("omp"),
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        assert.equal(session.providerInstanceId, "omp_work");
        assert.deepStrictEqual(session.resumeCursor, {
          schemaVersion: 1,
          sessionId: "mock-session-1",
        });
        yield* adapter.sendTurn({ threadId, input: "hello OMP", attachments: [] });
        const events = Array.from(yield* Fiber.join(eventsFiber));
        for (const type of [
          "session.started",
          "session.state.changed",
          "thread.started",
          "turn.started",
          "turn.plan.updated",
          "item.started",
          "content.delta",
          "item.completed",
          "turn.completed",
        ])
          assert.include(
            events.map((event) => event.type),
            type,
          );

        yield* adapter.stopSession(threadId);
        const invocation = readJsonLines(fixture.argsLogPath)[0] as
          | { readonly pid?: number; readonly args?: ReadonlyArray<string> }
          | undefined;
        assert.deepStrictEqual(invocation?.args, ["acp", "--approval-mode", "always-ask"]);
        assert.isFalse(invocation?.pid ? processIsAlive(invocation.pid) : true);

        const resumedThreadId = ThreadId.make("omp-resumed-flow");
        const resumed = yield* adapter.startSession({
          threadId: resumedThreadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
          resumeCursor: { schemaVersion: 1, sessionId: "persisted-omp-session" },
        });
        assert.deepStrictEqual(resumed.resumeCursor, {
          schemaVersion: 1,
          sessionId: "persisted-omp-session",
        });
        assert.isTrue(
          readJsonLines(fixture.requestLogPath).some((entry) => entry.method === "session/load"),
        );
      }),
    ),
  );

  it.effect("sets the exact model before thinking and applies exact plan/default modes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture);
        const threadId = ThreadId.make("omp-config-flow");
        const instanceId = ProviderInstanceId.make("omp_work");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "auto-accept-edits",
          modelSelection: {
            instanceId,
            model: "openai/gpt-5",
            options: [{ id: "reasoning", value: "high" }],
          },
        });
        yield* adapter.sendTurn({ threadId, input: "plan", interactionMode: "plan" });
        yield* adapter.sendTurn({ threadId, input: "implement", interactionMode: "default" });
        const configWrites = readJsonLines(fixture.requestLogPath)
          .filter((entry) => entry.method === "session/set_config_option")
          .map((entry) => entry.params as { readonly configId?: string; readonly value?: unknown });
        assert.deepStrictEqual(
          configWrites.slice(0, 2).map((entry) => [entry.configId, entry.value]),
          [
            ["model", "openai/gpt-5"],
            ["thinking", "high"],
          ],
        );
        assert.deepStrictEqual(
          configWrites.slice(2).map((entry) => [entry.configId, entry.value]),
          [
            ["mode", "plan"],
            ["mode", "default"],
          ],
        );
      }),
    ),
  );

  it.effect("keeps the ready snapshot unchanged when configuration fails before turn start", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture, { T3_ACP_FAIL_SET_CONFIG_OPTION: "1" });
        const threadId = ThreadId.make("omp-config-failure-before-start");
        const instanceId = ProviderInstanceId.make("omp_work");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        const eventsFiber = yield* adapter.streamEvents.pipe(
          Stream.takeUntil((event) => event.type === "session.exited"),
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* Effect.yieldNow;

        const error = yield* adapter
          .sendTurn({
            threadId,
            input: "do not start",
            modelSelection: { instanceId, model: "anthropic/claude" },
          })
          .pipe(Effect.flip);
        assert.equal(error._tag, "ProviderAdapterRequestError");
        const session = (yield* adapter.listSessions())[0];
        assert.equal(session?.status, "ready");
        assert.isUndefined(session?.activeTurnId);
        assert.isUndefined(session?.model);
        assert.isFalse(
          readJsonLines(fixture.requestLogPath).some((entry) => entry.method === "session/prompt"),
        );

        yield* adapter.stopSession(threadId);
        const events = Array.from(yield* Fiber.join(eventsFiber));
        assert.isFalse(events.some((event) => event.type === "turn.started"));
        assert.isFalse(events.some((event) => event.type === "turn.completed"));
      }),
    ),
  );

  it.effect("publishes one failed terminal event when a started prompt fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture, { T3_ACP_FAIL_PROMPT: "1" });
        const threadId = ThreadId.make("omp-started-prompt-failure");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        const eventsFiber = yield* adapter.streamEvents.pipe(
          Stream.takeUntil((event) => event.type === "session.exited"),
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* Effect.yieldNow;

        const error = yield* adapter
          .sendTurn({ threadId, input: "fail after start" })
          .pipe(Effect.flip);
        assert.equal(error._tag, "ProviderAdapterRequestError");
        assert.equal((yield* adapter.listSessions())[0]?.status, "ready");

        yield* adapter.stopSession(threadId);
        const events = Array.from(yield* Fiber.join(eventsFiber));
        const started = events.filter((event) => event.type === "turn.started");
        const completed = events.filter((event) => event.type === "turn.completed");
        assert.lengthOf(started, 1);
        assert.lengthOf(completed, 1);
        assert.equal(completed[0]?.turnId, started[0]?.turnId);
        assert.equal(completed[0]?.payload.state, "failed");
        assert.include(completed[0]?.payload.errorMessage, "Mock prompt failure");
      }),
    ),
  );

  it.effect("updates the session model for a successful steer without restarting the turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture, { T3_ACP_OMP_ELICITATION: "plan" });
        const threadId = ThreadId.make("omp-steer-model-snapshot");
        const instanceId = ProviderInstanceId.make("omp_work");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
          modelSelection: { instanceId, model: "openai/gpt-5" },
        });
        const eventsFiber = yield* adapter.streamEvents.pipe(
          Stream.takeUntil((event) => event.type === "session.exited"),
          Stream.runCollect,
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        const firstInputFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const firstTurnFiber = yield* adapter
          .sendTurn({ threadId, input: "start the turn" })
          .pipe(Effect.forkChild);
        const firstInput = yield* Fiber.join(firstInputFiber);

        const steerInputFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const steerFiber = yield* adapter
          .sendTurn({
            threadId,
            input: "switch model",
            busyBehavior: "steer",
            modelSelection: { instanceId, model: "anthropic/claude" },
          })
          .pipe(Effect.forkChild);
        yield* adapter.respondToUserInput(threadId, ApprovalRequestId.make(firstInput.requestId!), {
          value: "Refine plan",
        });
        const steerInput = yield* Fiber.join(steerInputFiber).pipe(Effect.timeout("3 seconds"));
        assert.equal(steerInput.turnId, firstInput.turnId);
        yield* adapter.respondToUserInput(threadId, ApprovalRequestId.make(steerInput.requestId!), {
          value: "Refine plan",
        });
        yield* Fiber.join(firstTurnFiber).pipe(Effect.timeout("3 seconds"));
        yield* Fiber.join(steerFiber).pipe(Effect.timeout("3 seconds"));
        const session = (yield* adapter.listSessions())[0];
        assert.equal(session?.status, "ready");
        assert.equal(session?.model, "anthropic/claude");

        yield* adapter.stopSession(threadId);
        const events = Array.from(yield* Fiber.join(eventsFiber));
        const started = events.filter(
          (event) => event.type === "turn.started" && event.turnId === firstInput.turnId,
        );
        assert.lengthOf(started, 1);
        assert.deepStrictEqual(started[0]?.payload, { model: "openai/gpt-5" });
      }),
    ),
  );

  it.effect(
    "always surfaces explicit permissions and returns the request's arbitrary option id",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* makeFixture;
          const adapter = yield* makeAdapter(fixture, {
            T3_ACP_EMIT_TOOL_CALLS: "1",
            T3_ACP_ALLOW_ONCE_OPTION_ID: "omp-allow-this-time",
            T3_ACP_ALLOW_ALWAYS_OPTION_ID: "  opaque omp/session id  ",
            T3_ACP_POST_CLIENT_RESPONSE_DELAY_MS: "500",
          });
          const threadId = ThreadId.make("omp-permission-flow");
          yield* adapter.startSession({
            threadId,
            cwd: process.cwd(),
            runtimeMode: "full-access",
          });
          const requestEventFiber = yield* waitForEvent(
            adapter.streamEvents,
            (event) => event.type === "request.opened",
          );
          const turnFiber = yield* adapter
            .sendTurn({ threadId, input: "run it" })
            .pipe(Effect.forkChild);
          const requestEvent = yield* Fiber.join(requestEventFiber);
          assert.equal(requestEvent.type, "request.opened");
          const resolvedEventFiber = yield* waitForEvent(
            adapter.streamEvents,
            (event) => event.type === "request.resolved",
          );
          yield* adapter.respondToRequest(
            threadId,
            ApprovalRequestId.make(requestEvent.requestId!),
            "acceptForSession",
          );
          const activeTurnId = (yield* adapter.listSessions())[0]?.activeTurnId;
          assert.isDefined(activeTurnId);
          yield* adapter.interruptTurn(threadId, activeTurnId);
          const resolvedEvent = yield* Fiber.join(resolvedEventFiber);
          assert.equal(resolvedEvent.type, "request.resolved");
          const duplicateError = yield* adapter
            .respondToRequest(
              threadId,
              ApprovalRequestId.make(requestEvent.requestId!),
              "acceptForSession",
            )
            .pipe(Effect.flip);
          assert.equal(duplicateError._tag, "ProviderAdapterRequestError");
          const response = yield* waitForJsonLogEntry(
            fixture.responseLogPath,
            (entry) => entry.method === "session/request_permission",
          );
          yield* Fiber.join(turnFiber);
          assert.deepStrictEqual(response?.response, {
            outcome: { outcome: "selected", optionId: "  opaque omp/session id  " },
          });
        }),
      ),
  );

  it.effect("maps a generic OMP form through Pulse and returns typed ACP content", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture, { T3_ACP_OMP_ELICITATION: "generic" });
        const threadId = ThreadId.make("omp-form-flow");
        yield* adapter.startSession({ threadId, cwd: process.cwd(), runtimeMode: "auto" });
        const requestEventFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const turnFiber = yield* adapter
          .sendTurn({ threadId, input: "ask me" })
          .pipe(Effect.forkChild);
        const requestEvent = yield* Fiber.join(requestEventFiber);
        assert.equal(requestEvent.type, "user-input.requested");
        yield* adapter.respondToUserInput(
          threadId,
          ApprovalRequestId.make(requestEvent.requestId!),
          {
            q0: "Desktop",
            q1: ["tests", "lint"],
            notes: "ship it",
            enabled: "Yes",
            retries: "2",
          },
        );
        yield* Fiber.join(turnFiber);
        const response = readJsonLines(fixture.responseLogPath).find(
          (entry) => entry.method === "session/elicitation",
        );
        assert.deepStrictEqual(response?.response, {
          action: {
            action: "accept",
            content: {
              q0__other: "Desktop",
              q1: ["tests", "lint"],
              notes: "ship it",
              enabled: true,
              retries: 2,
            },
          },
        });
      }),
    ),
  );

  it.effect("handles OMP's literal elicitation/create wire shape and rejects duplicates", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture, {
          T3_ACP_OMP_ELICITATION: "legacy-plan",
          T3_ACP_POST_CLIENT_RESPONSE_DELAY_MS: "500",
        });
        const threadId = ThreadId.make("omp-legacy-elicitation-flow");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        const requestEventFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const turnFiber = yield* adapter
          .sendTurn({ threadId, input: "review this plan", interactionMode: "plan" })
          .pipe(Effect.forkChild);
        const requestEvent = yield* Fiber.join(requestEventFiber);
        assert.equal(requestEvent.type, "user-input.requested");
        const requestId = ApprovalRequestId.make(requestEvent.requestId!);
        const resolvedEventFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.resolved",
        );
        yield* adapter.respondToUserInput(threadId, requestId, {
          value: "Approve and execute",
        });
        const activeTurnId = (yield* adapter.listSessions())[0]?.activeTurnId;
        assert.isDefined(activeTurnId);
        yield* adapter.interruptTurn(threadId, activeTurnId);
        const resolvedEvent = yield* Fiber.join(resolvedEventFiber);
        assert.equal(resolvedEvent.type, "user-input.resolved");
        const duplicateError = yield* adapter
          .respondToUserInput(threadId, requestId, { value: "Refine plan" })
          .pipe(Effect.flip);
        assert.equal(duplicateError._tag, "ProviderAdapterRequestError");
        const response = yield* waitForJsonLogEntry(
          fixture.responseLogPath,
          (entry) => entry.method === "elicitation/create",
        );
        yield* Fiber.join(turnFiber);
        assert.deepStrictEqual(response?.response, {
          action: "accept",
          content: { value: "Approve and execute" },
        });
      }),
    ),
  );

  it.effect("declines unadvertised URL elicitation without opening Pulse user input", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture, { T3_ACP_OMP_ELICITATION: "url" });
        const threadId = ThreadId.make("omp-url-elicitation-flow");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        yield* adapter.sendTurn({ threadId, input: "authorize" });
        const response = readJsonLines(fixture.responseLogPath).find(
          (entry) => entry.method === "session/elicitation",
        );
        assert.deepStrictEqual(response?.response, { action: { action: "decline" } });
      }),
    ),
  );

  it.effect("cleans up an adapter child after startup failure without logging its secret", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const secret = "omp-adapter-startup-secret";
        const adapter = yield* makeAdapter(fixture, {
          T3_ACP_FAIL_INITIALIZE: "1",
          OPENAI_API_KEY: secret,
        });
        const error = yield* adapter
          .startSession({
            threadId: ThreadId.make("omp-startup-failure"),
            cwd: process.cwd(),
            runtimeMode: "auto",
          })
          .pipe(Effect.flip);
        const invocation = readJsonLines(fixture.argsLogPath)[0] as
          | { readonly pid?: number }
          | undefined;
        assert.isFalse(invocation?.pid ? processIsAlive(invocation.pid) : true);
        assert.notInclude(String(error), secret);
        assert.notInclude(NodeFS.readFileSync(fixture.requestLogPath, "utf8"), secret);
      }),
    ),
  );

  it.effect("cancels a queued steer before dispatch and gives the next turn a fresh signal", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const steerConfigured = yield* Deferred.make<void>();
        const adapter = yield* makeAdapter(
          fixture,
          { T3_ACP_OMP_ELICITATION: "plan" },
          ProviderInstanceId.make("omp_work"),
          makeNativeRequestLogger(
            fixture,
            "session/set_config_option",
            "succeeded",
            steerConfigured,
          ),
        );
        const threadId = ThreadId.make("omp-interrupt-queued-steer");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });

        const firstInputFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const firstTurnFiber = yield* adapter
          .sendTurn({ threadId, input: "make a plan" })
          .pipe(Effect.forkChild);
        const firstInput = yield* Fiber.join(firstInputFiber);
        const steerFiber = yield* adapter
          .sendTurn({
            threadId,
            input: "steer this plan",
            interactionMode: "plan",
            busyBehavior: "steer",
          })
          .pipe(Effect.forkChild);
        yield* Deferred.await(steerConfigured).pipe(Effect.timeout("2 seconds"));
        yield* Effect.yieldNow;
        assert.lengthOf(
          readJsonLines(fixture.requestLogPath).filter(
            (entry) => entry.method === "session/prompt",
          ),
          1,
        );

        yield* adapter.interruptTurn(threadId, firstInput.turnId);
        yield* Fiber.join(firstTurnFiber).pipe(Effect.timeout("3 seconds"));
        yield* Fiber.join(steerFiber).pipe(Effect.timeout("3 seconds"));
        assert.lengthOf(
          readJsonLines(fixture.requestLogPath).filter(
            (entry) => entry.method === "session/prompt",
          ),
          1,
        );

        const nextInputFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const nextTurnFiber = yield* adapter
          .sendTurn({ threadId, input: "start a fresh turn", interactionMode: "default" })
          .pipe(Effect.forkChild);
        const nextInput = yield* Fiber.join(nextInputFiber).pipe(Effect.timeout("3 seconds"));
        assert.notEqual(nextInput.turnId, firstInput.turnId);
        yield* adapter.respondToUserInput(threadId, ApprovalRequestId.make(nextInput.requestId!), {
          value: "Refine plan",
        });
        yield* Fiber.join(nextTurnFiber).pipe(Effect.timeout("3 seconds"));
        assert.lengthOf(
          readJsonLines(fixture.requestLogPath).filter(
            (entry) => entry.method === "session/prompt",
          ),
          2,
        );
      }),
    ),
  );

  it.effect("stops during pre-prompt configuration without dispatching a prompt", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const configStarted = yield* Deferred.make<void>();
        const releaseConfig = yield* Deferred.make<void>();
        const adapter = yield* makeAdapter(
          fixture,
          {},
          ProviderInstanceId.make("omp_work"),
          makeNativeRequestLogger(
            fixture,
            "session/set_config_option",
            "started",
            configStarted,
            releaseConfig,
          ),
        );
        const threadId = ThreadId.make("omp-stop-during-config");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        const turnFiber = yield* adapter
          .sendTurn({ threadId, input: "never dispatch", interactionMode: "plan" })
          .pipe(Effect.forkChild);
        yield* Deferred.await(configStarted).pipe(Effect.timeout("2 seconds"));
        assert.isFalse(
          readJsonLines(fixture.requestLogPath).some((entry) => entry.method === "session/prompt"),
        );

        yield* adapter.stopSession(threadId);
        yield* Deferred.succeed(releaseConfig, undefined).pipe(Effect.ignore);
        yield* Fiber.join(turnFiber).pipe(Effect.timeout("3 seconds"));
        assert.isFalse(
          readJsonLines(fixture.requestLogPath).some((entry) => entry.method === "session/prompt"),
        );
      }),
    ),
  );

  it.effect("cancels pending elicitation and the active turn on interrupt", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture, { T3_ACP_OMP_ELICITATION: "plan" });
        const threadId = ThreadId.make("omp-interrupt-flow");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        const observed = yield* Ref.make<ReadonlyArray<ProviderRuntimeEvent>>([]);
        const eventsFiber = yield* Stream.runForEach(adapter.streamEvents, (event) =>
          Ref.update(observed, (events) => [...events, event]),
        ).pipe(Effect.forkChild);
        const requestEventFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const turnFiber = yield* adapter
          .sendTurn({ threadId, input: "make a plan" })
          .pipe(Effect.forkChild);
        const requestEvent = yield* Fiber.join(requestEventFiber);
        const firstInterrupt = yield* adapter
          .interruptTurn(threadId, requestEvent.turnId)
          .pipe(Effect.forkChild);
        const secondInterrupt = yield* adapter
          .interruptTurn(threadId, requestEvent.turnId)
          .pipe(Effect.forkChild);
        yield* Fiber.join(firstInterrupt);
        yield* Fiber.join(secondInterrupt);
        yield* Fiber.join(turnFiber);
        const lateResponseError = yield* adapter
          .respondToUserInput(threadId, ApprovalRequestId.make(requestEvent.requestId!), {
            value: "Approve and execute",
          })
          .pipe(Effect.flip);
        assert.equal(lateResponseError._tag, "ProviderAdapterRequestError");
        assert.equal((yield* adapter.listSessions())[0]?.status, "ready");
        yield* adapter.stopSession(threadId);
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(eventsFiber);
        const events = yield* Ref.get(observed);
        const terminalEvents = events.filter(
          (event) => event.type === "turn.completed" && event.turnId === requestEvent.turnId,
        );
        assert.lengthOf(terminalEvents, 1);
        assert.deepStrictEqual(terminalEvents[0]?.payload, {
          state: "cancelled",
          stopReason: "cancelled",
        });
        const terminalIndex = events.findIndex((event) => event === terminalEvents[0]);
        const exitIndex = events.findIndex((event) => event.type === "session.exited");
        assert.isAtLeast(terminalIndex, 0);
        assert.isAbove(exitIndex, terminalIndex);
      }),
    ),
  );

  it.effect("does not publish a turn terminal event after stop wins", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const adapter = yield* makeAdapter(fixture, { T3_ACP_OMP_ELICITATION: "plan" });
        const threadId = ThreadId.make("omp-stop-before-interrupt");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        const observed = yield* Ref.make<ReadonlyArray<ProviderRuntimeEvent>>([]);
        const eventsFiber = yield* Stream.runForEach(adapter.streamEvents, (event) =>
          Ref.update(observed, (events) => [...events, event]),
        ).pipe(Effect.forkChild);
        const requestEventFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const turnFiber = yield* adapter
          .sendTurn({ threadId, input: "make a plan" })
          .pipe(Effect.forkChild);
        const requestEvent = yield* Fiber.join(requestEventFiber);
        yield* adapter.stopSession(threadId);
        const interruptError = yield* adapter
          .interruptTurn(threadId, requestEvent.turnId)
          .pipe(Effect.flip);
        assert.equal(interruptError._tag, "ProviderAdapterSessionNotFoundError");
        yield* Fiber.await(turnFiber).pipe(Effect.timeout("3 seconds"));
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(eventsFiber);
        const events = yield* Ref.get(observed);
        const exitIndex = events.findIndex((event) => event.type === "session.exited");
        assert.isAtLeast(exitIndex, 0);
        assert.isFalse(events.some((event) => event.type === "turn.completed"));
        assert.isFalse(
          events
            .slice(exitIndex + 1)
            .some(
              (event) => event.type === "turn.completed" || event.type === "user-input.resolved",
            ),
        );
      }),
    ),
  );

  it.effect("does not publish a late elicitation when interrupt wins registration", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const callbackEntered = yield* Deferred.make<void>();
        const releaseCallback = yield* Deferred.make<void>();
        const nativeEventLogger = makeBlockingNativeLogger(
          fixture,
          "session/elicitation",
          callbackEntered,
          releaseCallback,
        );
        const adapter = yield* makeAdapter(
          fixture,
          { T3_ACP_OMP_ELICITATION: "plan" },
          ProviderInstanceId.make("omp_work"),
          nativeEventLogger,
        );
        const threadId = ThreadId.make("omp-interrupt-before-elicitation");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "approval-required",
        });
        const observed = yield* Ref.make<ReadonlyArray<ProviderRuntimeEvent>>([]);
        const eventsFiber = yield* Stream.runForEach(adapter.streamEvents, (event) =>
          Ref.update(observed, (events) => [...events, event]),
        ).pipe(Effect.forkChild);
        const turnFiber = yield* adapter
          .sendTurn({ threadId, input: "make a plan" })
          .pipe(Effect.forkChild);
        yield* Deferred.await(callbackEntered).pipe(Effect.timeout("2 seconds"));
        const activeTurnId = (yield* adapter.listSessions())[0]?.activeTurnId;
        assert.isDefined(activeTurnId);
        yield* adapter.interruptTurn(threadId, activeTurnId);
        yield* Deferred.succeed(releaseCallback, undefined);
        yield* Fiber.join(turnFiber).pipe(Effect.timeout("3 seconds"));
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(eventsFiber);
        const eventTypes = (yield* Ref.get(observed)).map((event) => event.type);
        assert.notInclude(eventTypes, "user-input.requested");
        assert.notInclude(eventTypes, "user-input.resolved");
        assert.equal(
          (yield* adapter.listSessions()).find((session) => session.threadId === threadId)?.status,
          "ready",
        );
      }),
    ),
  );

  it.effect("does not publish a late permission when interrupt wins registration", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture;
        const callbackEntered = yield* Deferred.make<void>();
        const releaseCallback = yield* Deferred.make<void>();
        const adapter = yield* makeAdapter(
          fixture,
          { T3_ACP_EMIT_TOOL_CALLS: "1" },
          ProviderInstanceId.make("omp_work"),
          makeBlockingNativeLogger(
            fixture,
            "session/request_permission",
            callbackEntered,
            releaseCallback,
          ),
        );
        const threadId = ThreadId.make("omp-interrupt-before-permission");
        yield* adapter.startSession({
          threadId,
          cwd: process.cwd(),
          runtimeMode: "full-access",
        });
        const observed = yield* Ref.make<ReadonlyArray<ProviderRuntimeEvent>>([]);
        const eventsFiber = yield* Stream.runForEach(adapter.streamEvents, (event) =>
          Ref.update(observed, (events) => [...events, event]),
        ).pipe(Effect.forkChild);
        const turnFiber = yield* adapter
          .sendTurn({ threadId, input: "run a tool" })
          .pipe(Effect.forkChild);
        yield* Deferred.await(callbackEntered).pipe(Effect.timeout("2 seconds"));
        const activeTurnId = (yield* adapter.listSessions())[0]?.activeTurnId;
        assert.isDefined(activeTurnId);
        yield* adapter.interruptTurn(threadId, activeTurnId);
        yield* Deferred.succeed(releaseCallback, undefined);
        yield* Fiber.join(turnFiber).pipe(Effect.timeout("3 seconds"));
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(eventsFiber);
        const eventTypes = (yield* Ref.get(observed)).map((event) => event.type);
        assert.notInclude(eventTypes, "request.opened");
        assert.notInclude(eventTypes, "request.resolved");
        assert.equal(
          (yield* adapter.listSessions()).find((session) => session.threadId === threadId)?.status,
          "ready",
        );
      }),
    ),
  );
});

it("maps only exact ACP permission kinds and preserves opaque option ids", () => {
  const request = {
    sessionId: "session-1",
    toolCall: { toolCallId: "tool-1", title: "Tool", status: "pending" as const },
    options: [
      { optionId: "once-x", name: "Once", kind: "allow_once" as const },
      { optionId: "  always opaque/x  ", name: "Always", kind: "allow_always" as const },
      { optionId: "reject-x", name: "Reject", kind: "reject_once" as const },
    ],
  };
  assert.equal(selectOmpPermissionOptionId(request, "accept"), "once-x");
  assert.equal(selectOmpPermissionOptionId(request, "acceptForSession"), "  always opaque/x  ");
  assert.equal(selectOmpPermissionOptionId(request, "decline"), "reject-x");
  assert.equal(
    selectOmpPermissionOptionId(
      { ...request, options: request.options.filter((option) => option.kind === "allow_once") },
      "acceptForSession",
    ),
    undefined,
  );
  assert.equal(
    selectOmpPermissionOptionId(
      {
        ...request,
        options: [{ optionId: "reject-always", name: "Reject", kind: "reject_always" }],
      },
      "decline",
    ),
    undefined,
  );
  assert.equal(
    selectOmpPermissionOptionId(
      {
        ...request,
        options: [{ optionId: "   ", name: "Always", kind: "allow_always" }],
      },
      "acceptForSession",
    ),
    undefined,
  );
});
