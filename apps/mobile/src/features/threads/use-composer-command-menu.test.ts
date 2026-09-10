import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../state/use-composer-path-search", () => ({
  useComposerPathSearch: () => ({ entries: [], isPending: false }),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { refreshProviders: Symbol("refreshProviders") },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn(),
}));

import { composerSelectionAtEnd } from "./use-composer-command-menu";

describe("composerSelectionAtEnd", () => {
  it("resets a changed draft owner to the new draft end", () => {
    expect(composerSelectionAtEnd("queued task 🧪")).toEqual({ start: 14, end: 14 });
  });
});

import { ProviderDriverKind } from "@t3tools/contracts";
import {
  buildComposerSlashCommandItems,
  resolveComposerCommandSelection,
} from "./use-composer-command-menu";

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
