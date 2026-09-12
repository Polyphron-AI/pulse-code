import { memo } from "react";

import { toggleAssistantPanel, useAssistantPanelOpen } from "~/components/AssistantPanel";
import { assistantPanelHeader } from "~/components/AssistantPanel.logic";
import { useAssistant } from "~/hooks/useAssistants";
import { cn } from "~/lib/utils";

/**
 * The permanent way into the assistant panel. The row is always here, even
 * before the record exists, because the first message is what creates it.
 */
export const SidebarAssistantEntry = memo(function SidebarAssistantEntry() {
  const assistant = useAssistant();
  const open = useAssistantPanelOpen();
  const header = assistantPanelHeader(assistant);

  return (
    <button
      type="button"
      data-testid="sidebar-assistant-entry"
      aria-pressed={open}
      aria-label={`Open ${header.name}`}
      onClick={toggleAssistantPanel}
      className={cn(
        "mb-1 flex min-h-8 w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
        open
          ? "bg-sidebar-row-active text-sidebar-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-row-hover",
      )}
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-medium text-primary"
      >
        {header.avatar}
      </span>
      <span className="min-w-0 flex-1 truncate">{header.name}</span>
    </button>
  );
});
