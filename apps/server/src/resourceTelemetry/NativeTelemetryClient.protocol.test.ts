import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  RESOURCE_MONITOR_PROTOCOL_VERSION,
  ResourceMonitorCommand,
  type ResourceMonitorEvent,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { ChildProcessSpawner } from "effect/unstable/process";
import { ServerConfig } from "../config.ts";
import * as NativeTelemetry from "./NativeTelemetryClient.ts";
import { ResourceMonitorBinary } from "./ResourceMonitorBinary.ts";

const TestLayer = ServerConfig.layerTest(process.cwd(), { prefix: "native-protocol-test-" }).pipe(
  Layer.provideMerge(NodeServices.layer),
);
const decodeCommand = Schema.decodeUnknownEffect(Schema.fromJsonString(ResourceMonitorCommand));

const makeFixture = Effect.fn("makeNativeProtocolFixture")(function* () {
  const output = yield* Queue.unbounded<Uint8Array, Cause.Done>();
  const commands = yield* Queue.unbounded<ResourceMonitorCommand>();
  const exitCode = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
  const stallWrites = yield* Ref.make(false);
  const interruptedWrites = yield* Ref.make(0);
  const kills = yield* Ref.make(0);
  const clientScope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(clientScope, Exit.succeed(undefined)));
  const send = (event: ResourceMonitorEvent) =>
    Queue.offer(output, new TextEncoder().encode(`${JSON.stringify(event)}\n`));
  const stdin = Sink.forEach((bytes: Uint8Array) =>
    Effect.gen(function* () {
      const command = yield* decodeCommand(new TextDecoder().decode(bytes).trim()).pipe(
        Effect.orDie,
      );
      yield* Queue.offer(commands, command);
      if (command.type === "processTable" && (yield* Ref.get(stallWrites))) {
        return yield* Effect.never.pipe(
          Effect.onInterrupt(() => Ref.update(interruptedWrites, (n) => n + 1)),
        );
      }
    }),
  );
  const spawner = ChildProcessSpawner.make(() =>
    Effect.gen(function* () {
      yield* send({
        version: RESOURCE_MONITOR_PROTOCOL_VERSION,
        type: "hello",
        sidecarVersion: "test",
        sidecarPid: 123,
        platform: "windows",
        arch: "x86_64",
        capabilities: {
          cumulativeCpuTime: true,
          currentCpuPercent: true,
          residentMemory: true,
          virtualMemory: true,
          ioBytes: true,
          processStartTime: true,
          processTree: true,
        },
      });
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(123),
        exitCode: Deferred.await(exitCode),
        isRunning: Effect.succeed(true),
        kill: () => Ref.update(kills, (n) => n + 1),
        unref: Effect.succeed(Effect.void),
        stdin,
        stdout: Stream.fromQueue(output),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      });
    }),
  );
  const client = yield* NativeTelemetry.make().pipe(
    Effect.provideService(ResourceMonitorBinary, { resolve: Effect.succeed("test-monitor") }),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    Effect.provideService(Scope.Scope, clientScope),
  );
  expect((yield* Queue.take(commands)).type).toBe("configure");
  expect((yield* Queue.take(commands)).type).toBe("setExternalProcesses");
  const takeRequest = Effect.gen(function* () {
    const command = yield* Queue.take(commands);
    if (command.type !== "processTable") return yield* Effect.die("expected processTable request");
    return command;
  });
  return {
    client,
    output,
    send,
    exitCode,
    stallWrites,
    interruptedWrites,
    kills,
    clientScope,
    takeRequest,
  };
});

it.layer(TestLayer)("native process table protocol", (it) => {
  it.effect("routes concurrent replies by request ID and ignores unknown replies", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture();
      const first = yield* fixture.client.processTable.pipe(Effect.forkChild);
      const firstRequest = yield* fixture.takeRequest;
      const second = yield* fixture.client.processTable.pipe(Effect.forkChild);
      const secondRequest = yield* fixture.takeRequest;
      const processes = [{ pid: 22, ppid: 11, name: "node.exe" }];
      yield* fixture.send({ version: 3, type: "processTable", requestId: "unknown", processes });
      yield* fixture.send({
        version: 3,
        type: "processTable",
        requestId: secondRequest.requestId,
        processes,
      });
      yield* fixture.send({
        version: 3,
        type: "processTable",
        requestId: firstRequest.requestId,
        processes: [],
      });
      expect(yield* Fiber.join(first)).toEqual([]);
      expect(yield* Fiber.join(second)).toEqual(processes);
      expect((yield* fixture.client.health).status).toBe("healthy");
    }),
  );

  it.effect.each([false, true])("times out the entire request, stalled write %s", (stall) =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture();
      yield* Ref.set(fixture.stallWrites, stall);
      const request = yield* fixture.client.processTable.pipe(Effect.flip, Effect.forkChild);
      const timedOut = yield* fixture.takeRequest;
      yield* TestClock.adjust("5 seconds");
      expect(yield* Fiber.join(request)).toMatchObject({
        _tag: "NativeTelemetryRequestTimedOut",
        operation: "processTable",
        timeoutMs: 5000,
      });
      expect(yield* Ref.get(fixture.interruptedWrites)).toBe(stall ? 1 : 0);
      yield* Ref.set(fixture.stallWrites, false);
      const next = yield* fixture.client.processTable.pipe(Effect.forkChild);
      const nextRequest = yield* fixture.takeRequest;
      yield* fixture.send({
        version: 3,
        type: "processTable",
        requestId: timedOut.requestId,
        processes: [{ pid: 99, ppid: 0, name: "late" }],
      });
      yield* fixture.send({
        version: 3,
        type: "processTable",
        requestId: nextRequest.requestId,
        processes: [],
      });
      expect(yield* Fiber.join(next)).toEqual([]);
    }),
  );

  it.effect("interrupts a stalled write and permits the next request", () =>
    Effect.gen(function* () {
      const fixture = yield* makeFixture();
      yield* Ref.set(fixture.stallWrites, true);
      const request = yield* fixture.client.processTable.pipe(Effect.forkChild);
      yield* fixture.takeRequest;
      yield* Fiber.interrupt(request);
      expect(yield* Ref.get(fixture.interruptedWrites)).toBe(1);
      yield* Ref.set(fixture.stallWrites, false);
      const next = yield* fixture.client.processTable.pipe(Effect.forkChild);
      const nextRequest = yield* fixture.takeRequest;
      yield* fixture.send({
        version: 3,
        type: "processTable",
        requestId: nextRequest.requestId,
        processes: [],
      });
      expect(yield* Fiber.join(next)).toEqual([]);
    }),
  );

  it.effect.each(["exit", "stream", "scope"] as const)(
    "fails pending requests on %s termination",
    (kind) =>
      Effect.gen(function* () {
        const fixture = yield* makeFixture();
        const request = yield* fixture.client.processTable.pipe(Effect.flip, Effect.forkChild);
        yield* fixture.takeRequest;
        if (kind === "exit")
          yield* Deferred.succeed(fixture.exitCode, ChildProcessSpawner.ExitCode(7));
        else if (kind === "stream") yield* Queue.end(fixture.output);
        else yield* Scope.close(fixture.clientScope, Exit.succeed(undefined));
        expect((yield* Fiber.join(request))._tag).toBe(
          kind === "exit"
            ? "NativeTelemetryExited"
            : kind === "stream"
              ? "NativeTelemetryStreamClosed"
              : "NativeTelemetryUnavailable",
        );
        expect(yield* Ref.get(fixture.kills)).toBe(1);
      }),
  );
});
