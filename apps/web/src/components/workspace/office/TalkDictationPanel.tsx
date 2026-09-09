import { useCallback, useEffect, useState } from "react";
import type { TalkResult, TalkStatus } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { RequestState, useTalkRequest } from "./shared";

type Dictations = NonNullable<Extract<TalkResult, { ok: true }>["dictations"]>;

export function TalkDictationPanel({
  status,
  disabled,
  onStatusChange,
}: {
  status: TalkStatus | undefined;
  disabled: boolean;
  onStatusChange: (status: TalkStatus) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { run, busy, error } = useTalkRequest();
  const [history, setHistory] = useState<Dictations>([]);
  const [loaded, setLoaded] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const refresh = useCallback(async () => {
    const current = await run({ operation: "status" });
    if (current?.status) onStatusChange(current.status);
    const result = await run({ operation: "dictation.history" });
    if (result?.dictations) {
      setHistory(result.dictations);
      setLoaded(true);
    }
    if (result?.status) onStatusChange(result.status);
  }, [run, onStatusChange]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible" && !disabled) void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, disabled]);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice("Dictation copied.");
    } catch {
      setCopyNotice("Could not copy. Select the text below and copy it manually.");
    }
  }
  const canEnable = status?.enabled && status.modelLoaded && status.capabilities.dictationDelivery;
  return (
    <section
      aria-labelledby="talk-dictation-heading"
      className="space-y-3 border-t border-border pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="talk-dictation-heading" className="text-sm font-medium">
          Dictation
        </h3>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || disabled}
          onClick={() => void refresh()}
        >
          Refresh dictation
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Hold Ctrl+Shift+Space to record your microphone. Release to transcribe locally and paste
        into the app where you started. Press Escape to cancel.
      </p>
      <RequestState busy={busy} error={error} />
      {!canEnable && (
        <p className="text-sm text-muted-foreground">
          Dictation is unavailable until it is enabled and Parakeet is ready.
        </p>
      )}
      {status?.dictation?.active && (
        <p role="status" className="text-sm">
          Dictation is active. Release Ctrl+Shift+Space to finish, or press Escape to cancel.
        </p>
      )}
      {status?.dictation?.lastError && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {status.dictation.lastError}
        </p>
      )}
      <h4 className="text-sm font-medium">Dictation history</h4>
      <p className="text-xs text-muted-foreground">
        History refreshes when you return to Pulse. If delivery fails, your text remains here to
        copy.
      </p>
      {copyNotice && (
        <p role="status" className="text-sm text-muted-foreground">
          {copyNotice}
        </p>
      )}
      {loaded && history.length === 0 && (
        <p className="text-sm text-muted-foreground">No dictation saved yet.</p>
      )}
      {history.map((item) => (
        <article key={item.id} className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {new Date(item.createdAt).toLocaleString()} ·{" "}
              {item.delivered ? "Delivered" : "Not delivered"}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={!item.text}
              onClick={() => void copy(item.text)}
            >
              Copy text
            </Button>
          </div>
          {item.error && <p className="text-sm text-destructive-foreground">{item.error}</p>}
          <p className="select-text whitespace-pre-wrap break-words text-sm">
            {item.text || "No text was produced."}
          </p>
        </article>
      ))}
    </section>
  );
}
