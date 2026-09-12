import { describe, expect, it } from "vite-plus/test";

import {
  ASSISTANT_ALLOWED_TOOLS_UNSUPPORTED_DRIVERS,
  ASSISTANT_READ_ONLY_TOOLS,
  ASSISTANT_THREAD_ALLOWED_TOOLS,
  assistantIdFromThreadOrigin,
  assistantReadOnlyTools,
  assistantSystemPrompt,
  assistantThreadOrigin,
  isAssistantThreadOrigin,
} from "./assistant.ts";
import { AssistantId, ManagerId } from "./baseSchemas.ts";
import { isManagerThreadOrigin, managerThreadOrigin } from "./manager.ts";

const assistantId = AssistantId.make("assistant-1");

describe("assistant thread origins", () => {
  it("round-trips an assistant id through its origin", () => {
    const origin = assistantThreadOrigin(assistantId);
    expect(origin).toBe("assistant:assistant-1");
    expect(isAssistantThreadOrigin(origin)).toBe(true);
    expect(assistantIdFromThreadOrigin(origin)).toBe(assistantId);
  });

  it("does not claim user or manager origins", () => {
    const managerOrigin = managerThreadOrigin(ManagerId.make("manager-1"));
    expect(isAssistantThreadOrigin("user")).toBe(false);
    expect(isAssistantThreadOrigin(managerOrigin)).toBe(false);
    expect(assistantIdFromThreadOrigin("user")).toBeNull();
    expect(assistantIdFromThreadOrigin(managerOrigin)).toBeNull();
  });

  it("leaves the manager origin helper unaffected", () => {
    expect(isManagerThreadOrigin(assistantThreadOrigin(assistantId))).toBe(false);
  });
});

describe("assistant read-only tools", () => {
  it("never lists a write, edit, or shell tool", () => {
    const forbidden = /^(write|edit|multiedit|bash|shell|patch|apply_patch|notebookedit)$/i;
    for (const tools of Object.values(ASSISTANT_READ_ONLY_TOOLS)) {
      for (const tool of tools) {
        expect(forbidden.test(tool)).toBe(false);
      }
    }
  });

  it("answers per driver, and null for drivers with no allow-list", () => {
    expect(assistantReadOnlyTools("claudeAgent")).toContain("Read");
    expect(assistantReadOnlyTools("opencode")).toContain("read");
    for (const driver of ASSISTANT_ALLOWED_TOOLS_UNSUPPORTED_DRIVERS) {
      expect(assistantReadOnlyTools(driver)).toBeNull();
    }
  });

  it("unions every driver's names for the thread-level list", () => {
    expect(ASSISTANT_THREAD_ALLOWED_TOOLS).toContain("Read");
    expect(ASSISTANT_THREAD_ALLOWED_TOOLS).toContain("read");
    expect(new Set(ASSISTANT_THREAD_ALLOWED_TOOLS).size).toBe(
      ASSISTANT_THREAD_ALLOWED_TOOLS.length,
    );
  });
});

describe("assistantSystemPrompt", () => {
  it("names the assistant and states the read-only limit", () => {
    const prompt = assistantSystemPrompt({ name: "Luna", instructions: "" });
    expect(prompt).toContain("You are Luna, the Pulse assistant.");
    expect(prompt).toContain("read-only tools");
  });

  it("appends instructions when there are any", () => {
    expect(assistantSystemPrompt({ name: "Luna", instructions: "  Be terse.  " })).toContain(
      "Be terse.",
    );
    expect(assistantSystemPrompt({ name: "Luna", instructions: "   " })).not.toContain("\n\n");
  });
});
