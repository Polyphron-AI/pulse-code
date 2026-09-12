import type { EnvironmentAssistant } from "@t3tools/client-runtime/state/assistants";
import { AssistantId, EnvironmentId, ThreadId, assistantThreadOrigin } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildAssistantThreadListEntry } from "./assistant-entry.logic";

const environmentId = EnvironmentId.make("environment-1");
const assistantId = AssistantId.make("assistant-1");
const threadId = ThreadId.make("thread-1");

function assistant(overrides: Partial<EnvironmentAssistant> = {}): EnvironmentAssistant {
  return {
    id: assistantId,
    environmentId,
    name: "Luna",
    avatar: null,
    modelSelection: null,
    instructions: "",
    threadId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildAssistantThreadListEntry", () => {
  it("points at the desktop app when the environment has no assistant", () => {
    const entry = buildAssistantThreadListEntry({ assistant: null, threads: [] });
    expect(entry).toEqual({
      name: "Luna",
      avatar: "L",
      environmentId: null,
      threadId: null,
      canReset: false,
      subtitle: "Start Luna on the desktop app",
    });
  });

  it("has nothing to open or reset before the first conversation", () => {
    const entry = buildAssistantThreadListEntry({ assistant: assistant(), threads: [] });
    expect(entry.threadId).toBeNull();
    expect(entry.canReset).toBe(false);
    expect(entry.subtitle).toBe("No conversation yet");
  });

  it("opens the bound thread and allows reset", () => {
    const entry = buildAssistantThreadListEntry({
      assistant: assistant({ threadId, name: "Nova", avatar: "🌙" }),
      threads: [],
    });
    expect(entry).toMatchObject({
      name: "Nova",
      avatar: "🌙",
      environmentId,
      threadId,
      canReset: true,
    });
  });

  it("falls back to the thread origin within the same environment", () => {
    const origin = assistantThreadOrigin(assistantId);
    expect(
      buildAssistantThreadListEntry({
        assistant: assistant(),
        threads: [{ id: threadId, environmentId, origin }],
      }).threadId,
    ).toBe(threadId);
    expect(
      buildAssistantThreadListEntry({
        assistant: assistant(),
        threads: [{ id: threadId, environmentId: EnvironmentId.make("other"), origin }],
      }).threadId,
    ).toBeNull();
  });
});
