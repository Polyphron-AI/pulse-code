import { Sparkles } from "lucide-react";

import { openAssistantPanel } from "~/components/AssistantPanel";
import { assistantPanelHeader } from "~/components/AssistantPanel.logic";
import { Button } from "~/components/ui/button";
import { useAssistant } from "~/hooks/useAssistants";

/**
 * Assistants surface. The assistant is a persistent panel rather than a
 * per-thread tab, so this tab exists only to send you there.
 */
export function AssistantsPanel() {
  const header = assistantPanelHeader(useAssistant());

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Sparkles aria-hidden className="size-6 text-muted-foreground/60" />
      <p className="text-sm font-medium">{header.name} lives in her own panel</p>
      <p className="max-w-64 text-xs text-muted-foreground">
        {header.name} keeps one conversation for this environment, so she stays open next to
        whatever thread you are in. She reads and proposes, and never edits or runs anything.
      </p>
      <Button size="sm" data-testid="assistants-tab-open-panel" onClick={openAssistantPanel}>
        Open {header.name}
      </Button>
    </div>
  );
}
