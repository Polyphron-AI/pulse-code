import { describe, expect, it, vi } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

vi.mock("../../state/use-composer-path-search", () => ({
  useComposerPathSearch: () => ({ entries: [], isPending: false }),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { refreshProviders: Symbol("refreshProviders") },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn(),
}));

import {
  buildComposerSlashCommandItems,
  composerSelectionAtEnd,
  resolveComposerCommandSelection,
} from "./use-composer-command-menu";

describe("composerSelectionAtEnd", () => {
  it("resets a changed draft owner to the new draft end", () => {
    expect(composerSelectionAtEnd("queued task 🧪")).toEqual({ start: 14, end: 14 });
  });
});

describe("usage limits command ownership", () => {
  const input = {
    query: "usage",
    atMessageStart: true,
    hasThread: false,
    allowInteractionMode: true,
    selectedProviderStatus: {
      driver: ProviderDriverKind.make("codex"),
      slashCommands: [{ name: "usage-limits", description: "Usage limits" }],
    },
  };
  it("keeps provider commands in new drafts when Pulse does not own them", () => {
    expect(
      buildComposerSlashCommandItems({ ...input, offersUsageLimits: false }).map(
        (item) => item.label,
      ),
    ).toEqual(["/usage-limits"]);
  });
  it("offers the local panel only inside a thread", () => {
    expect(buildComposerSlashCommandItems({ ...input, offersUsageLimits: true })).toEqual([]);
    expect(
      buildComposerSlashCommandItems({ ...input, offersUsageLimits: true, hasThread: true }).map(
        (item) => item.label,
      ),
    ).toEqual(["/usage-limits"]);
  });
  it("does not expand provider commands inside message text", () => {
    expect(buildComposerSlashCommandItems({ ...input, atMessageStart: false })).toEqual([]);
  });
  it("leaves provider command selection as text", () => {
    const item = buildComposerSlashCommandItems(input)[0]!;
    expect(
      resolveComposerCommandSelection({
        draftMessage: "/usage",
        trigger: { rangeStart: 0, rangeEnd: 6 },
        item,
        allowInteractionMode: true,
      }),
    ).toEqual({ text: "/usage-limits ", cursor: 14, interactionMode: null });
  });
});

describe("mobile slash commands", () => {
  const antigravity = {
    driver: ProviderDriverKind.make("antigravity"),
    showInteractionModeToggle: false,
    slashCommands: [{ name: "plan", description: "Plan with Antigravity" }],
  };

  it.each([false, true])(
    "keeps native /plan with legacy mode enabled=%s",
    (allowInteractionMode) => {
      const items = buildComposerSlashCommandItems({
        query: "pl",
        atMessageStart: true,
        hasThread: true,
        allowInteractionMode,
        selectedProviderStatus: antigravity,
      });

      expect(items).toHaveLength(1);
      expect(items[0]?.type).toBe("provider-slash-command");
      const item = items[0];
      if (!item) throw new Error("Expected the native plan command");
      expect(
        resolveComposerCommandSelection({
          draftMessage: "/pl",
          trigger: { rangeStart: 0, rangeEnd: 3 },
          item,
          allowInteractionMode,
        }),
      ).toEqual({ text: "/plan ", cursor: 6, interactionMode: null });
    },
  );

  it("does not offer a native command inside the message", () => {
    expect(
      buildComposerSlashCommandItems({
        query: "plan",
        atMessageStart: false,
        hasThread: false,
        allowInteractionMode: true,
        selectedProviderStatus: antigravity,
      }),
    ).toEqual([]);
  });

  it("still applies the T3 plan command for supported providers", () => {
    const items = buildComposerSlashCommandItems({
      query: "plan",
      atMessageStart: true,
      hasThread: true,
      allowInteractionMode: true,
      selectedProviderStatus: {
        driver: ProviderDriverKind.make("codex"),
        slashCommands: [],
      },
    });
    const item = items[0];
    if (!item) throw new Error("Expected the T3 plan command");
    expect(
      resolveComposerCommandSelection({
        draftMessage: "/plan",
        trigger: { rangeStart: 0, rangeEnd: 5 },
        item,
        allowInteractionMode: true,
      }),
    ).toEqual({ text: "", cursor: 0, interactionMode: "plan" });

    // A provider switch can invalidate an open menu before a tap arrives.
    expect(
      resolveComposerCommandSelection({
        draftMessage: "/plan",
        trigger: { rangeStart: 0, rangeEnd: 5 },
        item,
        allowInteractionMode: false,
      }),
    ).toEqual({ text: "/plan ", cursor: 6, interactionMode: null });
  });
});
