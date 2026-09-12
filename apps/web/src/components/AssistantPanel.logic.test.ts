import { AssistantId, EnvironmentId, ThreadId, assistantThreadOrigin } from "@t3tools/contracts";
import type { EnvironmentAssistant } from "@t3tools/client-runtime/state/assistants";
import { describe, expect, it } from "vite-plus/test";

import {
  assistantPanelBody,
  assistantPanelHeader,
  assistantRenameValue,
  canSendAssistantMessage,
} from "./AssistantPanel.logic";

const environmentId = EnvironmentId.make("environment-1");
const otherEnvironmentId = EnvironmentId.make("environment-2");
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

describe("assistantPanelHeader", () => {
  it("labels an absent assistant as Luna with reset disabled", () => {
    expect(assistantPanelHeader(null)).toEqual({ name: "Luna", avatar: "L", canReset: false });
  });

  it("enables reset once a thread is bound", () => {
    expect(assistantPanelHeader(assistant({ name: "Nova", avatar: "🌙", threadId }))).toEqual({
      name: "Nova",
      avatar: "🌙",
      canReset: true,
    });
  });
});

describe("assistantPanelBody", () => {
  it("shows the empty state without an assistant or a thread", () => {
    expect(assistantPanelBody({ assistant: null, threads: [] })).toEqual({ kind: "empty" });
    expect(assistantPanelBody({ assistant: assistant(), threads: [] })).toEqual({ kind: "empty" });
  });

  it("shows the bound thread", () => {
    expect(assistantPanelBody({ assistant: assistant({ threadId }), threads: [] })).toEqual({
      kind: "thread",
      environmentId,
      threadId,
    });
  });

  it("finds the thread by origin, ignoring other environments", () => {
    const origin = assistantThreadOrigin(assistantId);
    expect(
      assistantPanelBody({
        assistant: assistant(),
        threads: [{ id: threadId, environmentId: otherEnvironmentId, origin }],
      }),
    ).toEqual({ kind: "empty" });
    expect(
      assistantPanelBody({
        assistant: assistant(),
        threads: [{ id: threadId, environmentId, origin }],
      }),
    ).toEqual({ kind: "thread", environmentId, threadId });
  });
});

describe("composer and rename guards", () => {
  it("refuses blank messages", () => {
    expect(canSendAssistantMessage("  ")).toBe(false);
    expect(canSendAssistantMessage(" hi ")).toBe(true);
  });

  it("only renames on a real change", () => {
    expect(assistantRenameValue("  ", "Luna")).toBeNull();
    expect(assistantRenameValue(" Luna ", "Luna")).toBeNull();
    expect(assistantRenameValue(" Nova ", "Luna")).toBe("Nova");
  });
});
