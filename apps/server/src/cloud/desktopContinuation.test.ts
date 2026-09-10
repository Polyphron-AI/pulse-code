import { expect, it } from "@effect/vitest";
import { ServerSelfUpdateError, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as ServerSelfUpdate from "./selfUpdate.ts";

it.effect("keeps continuation opt-in scoped to the prepared token", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const service = yield* ServerSelfUpdate.withRunningThreadContinuation({
      mode: "desktop",
      selfUpdate: {
        update: (input) =>
          Effect.succeed({
            targetVersion: input.targetVersion,
            method: "desktop-app" as const,
            desktopUpdateToken: input.targetVersion,
          }),
        commitDesktopUpdate: () =>
          Effect.fail(new ServerSelfUpdateError({ reason: "not installed" })),
      },
      prepare: Effect.sync(() => {
        events.push("prepare");
        return [ThreadId.make("running")];
      }),
      clear: (ids) =>
        Effect.sync(() => {
          if (ids.length) events.push("clear");
        }),
    });
    yield* service.update({ targetVersion: "selected", continueRunningThreads: true });
    yield* service.update({ targetVersion: "ordinary", continueRunningThreads: false });
    yield* service.commitDesktopUpdate("ordinary").pipe(Effect.result);
    yield* service.commitDesktopUpdate("unknown").pipe(Effect.result);
    expect(events).toEqual([]);
    yield* service.commitDesktopUpdate("selected").pipe(Effect.result);
    expect(events).toEqual(["prepare", "clear"]);
  }),
);

it.effect("clears markers and rearms the same token when interrupted before handoff", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const service = yield* ServerSelfUpdate.withRunningThreadContinuation({
      mode: "desktop",
      selfUpdate: {
        update: () =>
          Effect.succeed({
            targetVersion: "1.2.0",
            method: "desktop-app" as const,
            desktopUpdateToken: "retry",
          }),
        commitDesktopUpdate: () => Effect.interrupt,
      },
      prepare: Effect.sync(() => {
        events.push("prepare");
        return [ThreadId.make("running")];
      }),
      clear: () =>
        Effect.sync(() => {
          events.push("clear");
        }),
    });
    yield* service.update({ targetVersion: "1.2.0", continueRunningThreads: true });
    yield* service.commitDesktopUpdate("retry").pipe(Effect.exit);
    yield* service.commitDesktopUpdate("retry").pipe(Effect.exit);
    expect(events).toEqual(["prepare", "clear", "prepare", "clear"]);
  }),
);

it.effect("marks desktop threads only when the prepared update commits", () =>
  Effect.gen(function* () {
    const threadId = ThreadId.make("thread-running-desktop");
    const events: string[] = [];
    const commitError = new ServerSelfUpdateError({ reason: "install failed" });
    const selfUpdate = yield* ServerSelfUpdate.withRunningThreadContinuation({
      mode: "desktop",
      selfUpdate: {
        update: (_input, reportProgress = () => Effect.void) =>
          reportProgress("installing").pipe(
            Effect.as({
              targetVersion: "1.2.0",
              method: "desktop-app" as const,
              desktopUpdateToken: "desktop-token",
            }),
          ),
        commitDesktopUpdate: () =>
          Effect.sync(() => events.push("commit")).pipe(Effect.andThen(Effect.fail(commitError))),
      },
      prepare: Effect.sync(() => {
        events.push("prepare");
        return [threadId];
      }),
      clear: (threadIds) => Effect.sync(() => void events.push(`clear:${threadIds.join(",")}`)),
    });

    yield* selfUpdate.update({ targetVersion: "1.2.0", continueRunningThreads: true }, (stage) =>
      Effect.sync(() => void events.push(stage)),
    );
    expect(events).toEqual(["installing"]);
    expect(yield* selfUpdate.commitDesktopUpdate("desktop-token").pipe(Effect.flip)).toBe(
      commitError,
    );
    expect(events).toEqual(["installing", "prepare", "commit", `clear:${threadId}`]);
    expect(yield* selfUpdate.commitDesktopUpdate("desktop-token").pipe(Effect.flip)).toBe(
      commitError,
    );
    expect(events).toEqual([
      "installing",
      "prepare",
      "commit",
      `clear:${threadId}`,
      "prepare",
      "commit",
      `clear:${threadId}`,
    ]);
  }),
);

it.effect("keeps continuation markers after the desktop handoff is accepted", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const selfUpdate = yield* ServerSelfUpdate.withRunningThreadContinuation({
      mode: "desktop",
      selfUpdate: {
        update: () =>
          Effect.succeed({
            targetVersion: "1.2.0",
            method: "desktop-app" as const,
            desktopUpdateToken: "accepted-desktop-token",
          }),
        commitDesktopUpdate: (_requestId, onHandoffAccepted = () => Effect.void) =>
          onHandoffAccepted().pipe(Effect.andThen(Effect.interrupt)),
      },
      prepare: Effect.sync(() => {
        events.push("prepare");
        return [ThreadId.make("thread-accepted-desktop-handoff")];
      }),
      clear: () => Effect.sync(() => void events.push("clear")),
    });

    yield* selfUpdate.update({
      targetVersion: "1.2.0",
      continueRunningThreads: true,
    });
    const exit = yield* selfUpdate.commitDesktopUpdate("accepted-desktop-token").pipe(Effect.exit);

    expect(exit._tag).toBe("Failure");
    expect(events).toEqual(["prepare"]);
  }),
);

it.effect("clears continuation markers for mixed failure and interrupt causes", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    const commitError = new ServerSelfUpdateError({ reason: "install failed" });
    const selfUpdate = yield* ServerSelfUpdate.withRunningThreadContinuation({
      mode: "desktop",
      selfUpdate: {
        update: () =>
          Effect.succeed({
            targetVersion: "1.2.0",
            method: "desktop-app" as const,
            desktopUpdateToken: "failed-desktop-token",
          }),
        commitDesktopUpdate: (_requestId, onHandoffAccepted = () => Effect.void) =>
          onHandoffAccepted().pipe(
            Effect.andThen(
              Effect.failCause(
                Cause.fromReasons([Cause.makeFailReason(commitError), Cause.makeInterruptReason()]),
              ),
            ),
          ),
      },
      prepare: Effect.sync(() => [ThreadId.make("thread-failed-desktop-install")]),
      clear: () => Effect.sync(() => void events.push("clear")),
    });

    yield* selfUpdate.update({
      targetVersion: "1.2.0",
      continueRunningThreads: true,
    });
    const exit = yield* selfUpdate.commitDesktopUpdate("failed-desktop-token").pipe(Effect.exit);
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(Cause.hasInterrupts(exit.cause)).toBe(true);
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(false);
    }
    expect(events).toEqual(["clear"]);
  }),
);
