import type { ModelSelection } from "@t3tools/contracts";

import {
  composerDraftHasUserContent,
  type DraftId,
  useComposerDraftStore,
} from "../composerDraftStore";

export interface NewThreadComposerSeed {
  readonly modelSelection: ModelSelection;
  readonly prompt: string;
}

type ComposerSeedStore = Pick<
  ReturnType<typeof useComposerDraftStore.getState>,
  "getComposerDraft" | "setModelSelection" | "setPrompt"
>;

/**
 * Seed a still-empty draft before it becomes visible. A concurrent writer wins:
 * once any user-authored composer content exists, this helper performs no writes.
 */
export function applyNewThreadComposerSeed(input: {
  readonly store: ComposerSeedStore;
  readonly draftId: DraftId;
  readonly seed: NewThreadComposerSeed;
}): boolean {
  if (composerDraftHasUserContent(input.store.getComposerDraft(input.draftId))) {
    return false;
  }

  input.store.setModelSelection(input.draftId, input.seed.modelSelection, {
    replaceOptions: true,
  });
  if (input.seed.prompt.trim().length > 0) {
    input.store.setPrompt(input.draftId, input.seed.prompt);
  }
  return true;
}
