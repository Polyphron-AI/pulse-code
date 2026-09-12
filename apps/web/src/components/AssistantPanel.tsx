import { XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import ChatView from "~/components/ChatView";
import {
  assistantPanelBody,
  assistantPanelHeader,
  assistantRenameValue,
  canSendAssistantMessage,
} from "~/components/AssistantPanel.logic";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { useAssistant, useAssistantActions } from "~/hooks/useAssistants";
import { useThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { cn } from "~/lib/utils";

/**
 * Open state for the Luna panel. It lives outside React so the sidebar row,
 * the right-panel Assistants tab, and the command palette can all reach it
 * without threading props through the whole chat route.
 */
let panelOpen = false;
const panelListeners = new Set<() => void>();

function emitPanelChange() {
  for (const listener of panelListeners) listener();
}

export function setAssistantPanelOpen(open: boolean) {
  if (panelOpen === open) return;
  panelOpen = open;
  emitPanelChange();
}

export function openAssistantPanel() {
  setAssistantPanelOpen(true);
}

export function toggleAssistantPanel() {
  setAssistantPanelOpen(!panelOpen);
}

export function useAssistantPanelOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      panelListeners.add(listener);
      return () => panelListeners.delete(listener);
    },
    () => panelOpen,
    () => false,
  );
}

/**
 * The persistent assistant surface. Luna keeps one conversation per
 * environment, so the panel is a header plus either that thread or the
 * first-message composer.
 */
export function AssistantPanel() {
  const open = useAssistantPanelOpen();
  const environmentId = usePrimaryEnvironmentId();
  const assistant = useAssistant();
  const threads = useThreadShells();
  const { renameAssistant, resetAssistant, sendMessage } = useAssistantActions();

  const header = assistantPanelHeader(assistant);
  const body = assistantPanelBody({ assistant, threads });

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(header.name);
  const [messageDraft, setMessageDraft] = useState("");
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!renaming) setNameDraft(header.name);
  }, [header.name, renaming]);

  useEffect(() => {
    if (open && body.kind === "empty") composerRef.current?.focus();
  }, [body.kind, open]);

  const commitRename = useCallback(async () => {
    setRenaming(false);
    const next = assistantRenameValue(nameDraft, header.name);
    if (next === null || assistant === null) return;
    await renameAssistant(assistant, next);
  }, [assistant, header.name, nameDraft, renameAssistant]);

  const handleReset = useCallback(async () => {
    if (assistant === null) return;
    await resetAssistant(assistant);
    setMessageDraft("");
  }, [assistant, resetAssistant]);

  const handleSend = useCallback(async () => {
    if (environmentId === null || sending) return;
    if (!canSendAssistantMessage(messageDraft)) return;
    setSending(true);
    const sent = await sendMessage(
      { environmentId, assistantId: assistant?.id ?? null },
      messageDraft.trim(),
    );
    setSending(false);
    if (sent) setMessageDraft("");
  }, [assistant, environmentId, messageDraft, sendMessage, sending]);

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      void handleSend();
    },
    [handleSend],
  );

  if (!open) return null;

  return (
    <aside
      data-testid="assistant-panel"
      aria-label={header.name}
      className="flex h-full w-96 shrink-0 flex-col border-l border-border bg-background"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary"
        >
          {header.avatar}
        </span>
        {renaming ? (
          <input
            autoFocus
            value={nameDraft}
            aria-label="Assistant name"
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename();
              if (event.key === "Escape") {
                setNameDraft(header.name);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-border bg-transparent px-1 py-0.5 text-sm"
          />
        ) : (
          <button
            type="button"
            data-testid="assistant-panel-rename"
            disabled={assistant === null}
            onClick={() => setRenaming(true)}
            className={cn(
              "min-w-0 flex-1 truncate text-left text-sm font-medium",
              assistant === null && "cursor-default",
            )}
          >
            {header.name}
          </button>
        )}
        <Button
          variant="ghost"
          size="sm"
          data-testid="assistant-panel-reset"
          disabled={!header.canReset}
          onClick={() => void handleReset()}
        >
          Reset
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close assistant panel"
          onClick={() => setAssistantPanelOpen(false)}
        >
          <XIcon className="size-4" aria-hidden />
        </Button>
      </div>
      {body.kind === "thread" ? (
        <div className="min-h-0 flex-1">
          <ChatView
            environmentId={body.environmentId}
            threadId={body.threadId}
            routeKind="server"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <p className="text-sm font-medium">Ask {header.name} anything</p>
          <p className="text-xs text-muted-foreground">
            {header.name} reads your projects and answers questions. She proposes work, and never
            edits or runs anything herself.
          </p>
          <Textarea
            ref={composerRef}
            rows={4}
            value={messageDraft}
            placeholder={`Message ${header.name}`}
            aria-label={`Message ${header.name}`}
            data-testid="assistant-panel-composer"
            onChange={(event) => setMessageDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
          />
          <Button
            className="self-end"
            data-testid="assistant-panel-send"
            disabled={sending || environmentId === null || !canSendAssistantMessage(messageDraft)}
            onClick={() => void handleSend()}
          >
            Send
          </Button>
        </div>
      )}
    </aside>
  );
}
