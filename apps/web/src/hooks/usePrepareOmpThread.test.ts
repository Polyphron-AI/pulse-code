import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import { applyNewThreadComposerSeed } from "./newThreadComposerSeed";

const draftId = "draft-omp" as DraftId;
const modelSelection = {
  instanceId: ProviderInstanceId.make("omp_product"),
  model: "anthropic/claude-sonnet",
};

describe("applyNewThreadComposerSeed", () => {
  it("pins the exact instance and seeds an empty draft before navigation", () => {
    const setModelSelection = vi.fn();
    const setPrompt = vi.fn();
    const store = {
      getComposerDraft: vi.fn(() => null),
      setModelSelection,
      setPrompt,
    } as unknown as Parameters<typeof applyNewThreadComposerSeed>[0]["store"];

    expect(
      applyNewThreadComposerSeed({
        store,
        draftId,
        seed: { modelSelection, prompt: "Senior crew brief" },
      }),
    ).toBe(true);
    expect(setModelSelection).toHaveBeenCalledWith(draftId, modelSelection, {
      replaceOptions: true,
    });
    expect(setPrompt).toHaveBeenCalledWith(draftId, "Senior crew brief");
  });

  it("never overwrites content added while the draft opens", () => {
    const setModelSelection = vi.fn();
    const setPrompt = vi.fn();
    const store = {
      getComposerDraft: vi.fn(() => ({ prompt: "My existing task" })),
      setModelSelection,
      setPrompt,
    } as unknown as Parameters<typeof applyNewThreadComposerSeed>[0]["store"];

    expect(
      applyNewThreadComposerSeed({
        store,
        draftId,
        seed: { modelSelection, prompt: "Replacement" },
      }),
    ).toBe(false);
    expect(setModelSelection).not.toHaveBeenCalled();
    expect(setPrompt).not.toHaveBeenCalled();
  });
});
