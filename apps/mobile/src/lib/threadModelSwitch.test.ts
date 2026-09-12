import { describe, expect, it } from "vite-plus/test";

import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";

import {
  classifyThreadModelPick,
  resolveComposerProviderGroups,
  resolveModelSelectionLabel,
  type ThreadModelSwitchProviderInfo,
} from "./threadModelSwitch";
import type { ProviderGroup } from "./modelOptions";

function selection(instanceId: string, model: string): ModelSelection {
  return { instanceId: ProviderInstanceId.make(instanceId), model };
}

function provider(input: {
  readonly instanceId: string;
  readonly groupKey?: string;
  readonly requiresNewThreadForModelChange?: boolean;
}): ThreadModelSwitchProviderInfo {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    continuation: input.groupKey ? { groupKey: input.groupKey } : undefined,
    requiresNewThreadForModelChange: input.requiresNewThreadForModelChange,
  };
}

describe("classifyThreadModelPick", () => {
  it("always selects when the thread has no started session", () => {
    expect(
      classifyThreadModelPick({
        hasStartedSession: false,
        current: selection("claudeAgent", "opus"),
        candidate: selection("codex", "gpt-5.4"),
        providers: [],
      }),
    ).toBe("select");
  });

  it("selects when the candidate is the current model", () => {
    expect(
      classifyThreadModelPick({
        hasStartedSession: true,
        current: selection("claudeAgent", "opus"),
        candidate: selection("claudeAgent", "opus"),
        providers: [provider({ instanceId: "claudeAgent" })],
      }),
    ).toBe("select");
  });

  it("selects a different model on the same instance by default", () => {
    expect(
      classifyThreadModelPick({
        hasStartedSession: true,
        current: selection("claudeAgent", "opus"),
        candidate: selection("claudeAgent", "sonnet"),
        providers: [provider({ instanceId: "claudeAgent" })],
      }),
    ).toBe("select");
  });

  it("switches on the same instance when it requires a new thread for model changes", () => {
    expect(
      classifyThreadModelPick({
        hasStartedSession: true,
        current: selection("grok", "grok-4"),
        candidate: selection("grok", "grok-4-fast"),
        providers: [provider({ instanceId: "grok", requiresNewThreadForModelChange: true })],
      }),
    ).toBe("switch");
  });

  it("selects across instances that share a continuation group", () => {
    expect(
      classifyThreadModelPick({
        hasStartedSession: true,
        current: selection("codex", "gpt-5.4"),
        candidate: selection("codex-fast", "gpt-5.4-fast"),
        providers: [
          provider({ instanceId: "codex", groupKey: "codex-family" }),
          provider({ instanceId: "codex-fast", groupKey: "codex-family" }),
        ],
      }),
    ).toBe("select");
  });

  it("switches across instances outside the continuation group", () => {
    expect(
      classifyThreadModelPick({
        hasStartedSession: true,
        current: selection("claudeAgent", "opus"),
        candidate: selection("codex", "gpt-5.4"),
        providers: [
          provider({ instanceId: "claudeAgent", groupKey: "claude-family" }),
          provider({ instanceId: "codex", groupKey: "codex-family" }),
        ],
      }),
    ).toBe("switch");
  });

  it("switches across instances with no continuation metadata", () => {
    expect(
      classifyThreadModelPick({
        hasStartedSession: true,
        current: selection("claudeAgent", "opus"),
        candidate: selection("codex", "gpt-5.4"),
        providers: [provider({ instanceId: "claudeAgent" }), provider({ instanceId: "codex" })],
      }),
    ).toBe("switch");
  });

  it("switches into a same-group instance that itself requires a new thread", () => {
    expect(
      classifyThreadModelPick({
        hasStartedSession: true,
        current: selection("codex", "gpt-5.4"),
        candidate: selection("codex-fast", "gpt-5.4-fast"),
        providers: [
          provider({ instanceId: "codex", groupKey: "codex-family" }),
          provider({
            instanceId: "codex-fast",
            groupKey: "codex-family",
            requiresNewThreadForModelChange: true,
          }),
        ],
      }),
    ).toBe("switch");
  });
});

const CLAUDE_GROUP: ProviderGroup = {
  providerKey: "claudeAgent",
  providerLabel: "Claude Code",
  models: [],
};
const CODEX_GROUP: ProviderGroup = {
  providerKey: "codex",
  providerLabel: "Codex",
  models: [],
};

describe("resolveComposerProviderGroups", () => {
  it("offers every group before a session has started", () => {
    expect(
      resolveComposerProviderGroups({
        capabilityEnabled: false,
        hasStartedSession: false,
        providerGroups: [CLAUDE_GROUP, CODEX_GROUP],
        currentInstanceId: "claudeAgent",
      }),
    ).toEqual([CLAUDE_GROUP, CODEX_GROUP]);
  });

  it("pins to the current instance once a session exists without the capability", () => {
    expect(
      resolveComposerProviderGroups({
        capabilityEnabled: false,
        hasStartedSession: true,
        providerGroups: [CLAUDE_GROUP, CODEX_GROUP],
        currentInstanceId: "claudeAgent",
      }),
    ).toEqual([CLAUDE_GROUP]);
  });

  it("offers every group once a session exists with the capability on", () => {
    expect(
      resolveComposerProviderGroups({
        capabilityEnabled: true,
        hasStartedSession: true,
        providerGroups: [CLAUDE_GROUP, CODEX_GROUP],
        currentInstanceId: "claudeAgent",
      }),
    ).toEqual([CLAUDE_GROUP, CODEX_GROUP]);
  });
});

describe("resolveModelSelectionLabel", () => {
  const providers = [
    {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      driver: "claudeAgent",
      displayName: "Claude Code",
      models: [{ slug: "opus", name: "Opus" }],
    },
  ];

  it("labels a known provider and model", () => {
    expect(resolveModelSelectionLabel(providers as never, selection("claudeAgent", "opus"))).toBe(
      "Claude Code / Opus",
    );
  });

  it("falls back to raw ids for an unknown provider or model", () => {
    expect(resolveModelSelectionLabel(providers as never, selection("codex", "gpt-5.4"))).toBe(
      "codex / gpt-5.4",
    );
    expect(resolveModelSelectionLabel(providers as never, selection("claudeAgent", "haiku"))).toBe(
      "Claude Code / haiku",
    );
  });

  it("labels a null selection as none", () => {
    expect(resolveModelSelectionLabel(providers as never, null)).toBe("none");
  });
});
