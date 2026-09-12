import {
  ASSISTANT_THREAD_ALLOWED_TOOLS,
  AssistantId,
  CommandId,
  DEFAULT_ASSISTANT_NAME,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  assistantThreadOrigin,
  type OrchestrationCommand,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = "2026-01-01T00:00:00.000Z";
const projectId = ProjectId.make("project-a");
const assistantId = AssistantId.make("assistant-1");
const threadId = ThreadId.make("assistant-thread-1");

const cmd = (value: string) => CommandId.make(value);

const decideAndApply = Effect.fn("decideAndApply")(function* (
  readModel: OrchestrationReadModel,
  command: OrchestrationCommand,
) {
  const decided = yield* decideOrchestrationCommand({ command, readModel });
  const events = Array.isArray(decided) ? decided : [decided];
  let model = readModel;
  let sequence = readModel.snapshotSequence;
  for (const event of events) {
    sequence += 1;
    model = yield* projectEvent(model, { ...event, sequence });
  }
  return model;
});

const createAssistantCommand = {
  type: "assistant.create",
  commandId: cmd("cmd-assistant-create"),
  assistantId,
  createdAt: now,
} satisfies OrchestrationCommand;

const seedProject = Effect.fn("seedProject")(function* () {
  return yield* decideAndApply(createEmptyReadModel(now), {
    type: "project.create",
    commandId: cmd("cmd-project"),
    projectId,
    title: "Project A",
    workspaceRoot: "/tmp/project-a",
    createdAt: now,
  });
});

const seedAssistant = Effect.fn("seedAssistant")(function* () {
  return yield* decideAndApply(yield* seedProject(), createAssistantCommand);
});

/** Create and bind the assistant's thread the way the reactor does. */
const seedBoundThread = Effect.fn("seedBoundThread")(function* () {
  let model = yield* seedAssistant();
  model = yield* decideAndApply(model, {
    type: "thread.create",
    commandId: cmd("cmd-thread-create"),
    threadId,
    projectId,
    title: "Luna",
    modelSelection: {
      instanceId: ProviderInstanceId.make("instance-1"),
      model: "claude-sonnet-4-5",
    },
    branch: null,
    worktreePath: null,
    runtimeMode: "approval-required",
    interactionMode: "default",
    origin: assistantThreadOrigin(assistantId),
    allowedTools: ASSISTANT_THREAD_ALLOWED_TOOLS,
    createdAt: now,
  });
  return yield* decideAndApply(model, {
    type: "assistant.thread.bind",
    commandId: cmd("cmd-thread-bind"),
    assistantId,
    threadId,
  });
});

it.layer(NodeServices.layer)("decider assistant", (it) => {
  it.effect("creates the assistant with Luna as the default name", () =>
    Effect.gen(function* () {
      const model = yield* seedAssistant();
      expect(model.assistants).toHaveLength(1);
      expect(model.assistants?.[0]).toMatchObject({
        id: assistantId,
        name: DEFAULT_ASSISTANT_NAME,
        avatar: null,
        modelSelection: null,
        instructions: "",
        threadId: null,
      });
    }),
  );

  it.effect("refuses a second assistant in the environment", () =>
    Effect.gen(function* () {
      const seeded = yield* seedAssistant();
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            ...createAssistantCommand,
            commandId: cmd("cmd-second"),
            assistantId: AssistantId.make("assistant-2"),
          },
          readModel: seeded,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("updates only the fields it was given", () =>
    Effect.gen(function* () {
      const seeded = yield* seedAssistant();
      const model = yield* decideAndApply(seeded, {
        type: "assistant.update",
        commandId: cmd("cmd-update"),
        assistantId,
        name: "Nova",
        instructions: "Be terse.",
      });
      expect(model.assistants?.[0]).toMatchObject({
        name: "Nova",
        instructions: "Be terse.",
        avatar: null,
      });
    }),
  );

  it.effect("rejects an empty name", () =>
    Effect.gen(function* () {
      const seeded = yield* seedAssistant();
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "assistant.update",
            commandId: cmd("cmd-empty-name"),
            assistantId,
            name: "   ",
          },
          readModel: seeded,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("binds a thread that carries the assistant origin", () =>
    Effect.gen(function* () {
      const model = yield* seedBoundThread();
      expect(model.assistants?.[0]?.threadId).toBe(threadId);
      const thread = model.threads.find((entry) => entry.id === threadId);
      expect(thread?.allowedTools).toEqual(ASSISTANT_THREAD_ALLOWED_TOOLS);
    }),
  );

  it.effect("refuses to bind a thread that is not the assistant's", () =>
    Effect.gen(function* () {
      let model = yield* seedAssistant();
      const otherThread = ThreadId.make("thread-user");
      model = yield* decideAndApply(model, {
        type: "thread.create",
        commandId: cmd("cmd-user-thread"),
        threadId: otherThread,
        projectId,
        title: "Some work",
        modelSelection: {
          instanceId: ProviderInstanceId.make("instance-1"),
          model: "claude-sonnet-4-5",
        },
        branch: null,
        worktreePath: null,
        runtimeMode: "approval-required",
        interactionMode: "default",
        createdAt: now,
      });
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "assistant.thread.bind",
            commandId: cmd("cmd-bad-bind"),
            assistantId,
            threadId: otherThread,
          },
          readModel: model,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("reset archives the bound thread and clears the binding", () =>
    Effect.gen(function* () {
      const seeded = yield* seedBoundThread();
      const model = yield* decideAndApply(seeded, {
        type: "assistant.reset",
        commandId: cmd("cmd-reset"),
        assistantId,
      });
      expect(model.assistants?.[0]?.threadId).toBeNull();
      expect(model.threads.find((entry) => entry.id === threadId)?.archivedAt).not.toBeNull();
    }),
  );

  it.effect("a message requests work rather than doing it", () =>
    Effect.gen(function* () {
      const seeded = yield* seedAssistant();
      const decided = yield* decideOrchestrationCommand({
        command: {
          type: "assistant.message",
          commandId: cmd("cmd-message"),
          assistantId,
          text: "What changed today?",
        },
        readModel: seeded,
      });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events.map((event) => event.type)).toEqual(["assistant.message-requested"]);
    }),
  );

  it.effect("rejects a blank message", () =>
    Effect.gen(function* () {
      const seeded = yield* seedAssistant();
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "assistant.message",
            commandId: cmd("cmd-blank"),
            assistantId,
            text: "   ",
          },
          readModel: seeded,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("refuses a message for an assistant that does not exist", () =>
    Effect.gen(function* () {
      const model = yield* seedProject();
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "assistant.message",
            commandId: cmd("cmd-no-assistant"),
            assistantId,
            text: "Hello",
          },
          readModel: model,
        }),
      );
      expect(failure._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );
});
