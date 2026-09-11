import { useMemo, useState } from "react";
import { voiceCapture } from "./voiceCapture";
import { dictationSendDisabledReason } from "./composerDictation";

/** Coordinates desktop dictation with the shared voice capture submit guard. */
export function useComposerDictation() {
  const [busy, onBusyChange] = useState(false);
  return useMemo(
    () => ({
      busy,
      onBusyChange,
      sendDisabledReason: (reason: string | null) => dictationSendDisabledReason(busy, reason),
      isCaptureActive: () => !["idle", "error"].includes(voiceCapture.getSnapshot().phase),
    }),
    [busy],
  );
}
