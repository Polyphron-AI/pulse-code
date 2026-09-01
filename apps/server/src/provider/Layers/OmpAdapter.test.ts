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
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../../config.ts";
import { makeOmpAdapter, selectOmpPermissionOptionId } from "./OmpAdapter.ts";

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

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const testLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-omp-adapter-test-",
}).pipe(Layer.provideMerge(NodeServices.layer));
const adapterTest = it.layer(testLayer);

function makeAdapter(
  fixture: Fixture,
  environment: NodeJS.ProcessEnv = {},
  instanceId = ProviderInstanceId.make("omp_work"),
) {
  return makeOmpAdapter(
    { ...decodeOmpSettings({}), enabled: true, binaryPath: fixture.wrapperPath },
    {
      instanceId,
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

  it.effect(
    "always surfaces explicit permissions and returns the request's arbitrary option id",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* makeFixture;
          const adapter = yield* makeAdapter(fixture, {
            T3_ACP_EMIT_TOOL_CALLS: "1",
            T3_ACP_ALLOW_ONCE_OPTION_ID: "omp-allow-this-time",
            T3_ACP_ALLOW_ALWAYS_OPTION_ID: "omp-allow-session",
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
          yield* adapter.respondToRequest(
            threadId,
            ApprovalRequestId.make(requestEvent.requestId!),
            "acceptForSession",
          );
          yield* Fiber.join(turnFiber);
          const response = readJsonLines(fixture.responseLogPath).find(
            (entry) => entry.method === "session/request_permission",
          );
          assert.deepStrictEqual(response?.response, {
            outcome: { outcome: "selected", optionId: "omp-allow-session" },
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
        const requestEventFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "user-input.requested",
        );
        const turnFiber = yield* adapter
          .sendTurn({ threadId, input: "make a plan" })
          .pipe(Effect.forkChild);
        const requestEvent = yield* Fiber.join(requestEventFiber);
        const completedEventFiber = yield* waitForEvent(
          adapter.streamEvents,
          (event) => event.type === "turn.completed",
        );
        yield* adapter.interruptTurn(threadId, requestEvent.turnId);
        const completedEvent = yield* Fiber.join(completedEventFiber);
        yield* Fiber.join(turnFiber);
        assert.equal(completedEvent.type, "turn.completed");
        assert.deepStrictEqual(completedEvent.payload, {
          state: "cancelled",
          stopReason: "cancelled",
        });
        const lateResponseError = yield* adapter
          .respondToUserInput(threadId, ApprovalRequestId.make(requestEvent.requestId!), {
            value: "Approve and execute",
          })
          .pipe(Effect.flip);
        assert.equal(lateResponseError._tag, "ProviderAdapterRequestError");
        assert.equal((yield* adapter.listSessions())[0]?.status, "ready");
      }),
    ),
  );
});

it("prefers matching ACP permission kinds and fails closed when absent", () => {
  const request = {
    sessionId: "session-1",
    toolCall: { toolCallId: "tool-1", title: "Tool", status: "pending" as const },
    options: [
      { optionId: "once-x", name: "Once", kind: "allow_once" as const },
      { optionId: "always-x", name: "Always", kind: "allow_always" as const },
      { optionId: "reject-x", name: "Reject", kind: "reject_always" as const },
    ],
  };
  assert.equal(selectOmpPermissionOptionId(request, "accept"), "once-x");
  assert.equal(selectOmpPermissionOptionId(request, "acceptForSession"), "always-x");
  assert.equal(selectOmpPermissionOptionId(request, "decline"), "reject-x");
  assert.equal(selectOmpPermissionOptionId({ ...request, options: [] }, "accept"), undefined);
});
