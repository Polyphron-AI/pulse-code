import { useCallback, useEffect, useState } from "react";
import type { TalkModelStatus, TalkRequest, TalkStatus } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { RequestState, useTalkRequest } from "./shared";

export function TalkModelPanel({
  status,
  disabled,
  onStatusChange,
  onBusyChange,
}: {
  status: TalkStatus | undefined;
  disabled: boolean;
  onStatusChange: (status: TalkStatus) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { run, busy, error } = useTalkRequest();
  const [model, setModel] = useState<TalkModelStatus>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const refresh = useCallback(async () => {
    const result = await run({ operation: "models.status" });
    if (result?.model) setModel(result.model);
    const current = await run({ operation: "status" });
    if (current?.status) onStatusChange(current.status);
  }, [run, onStatusChange]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (
      busy ||
      disabled ||
      error ||
      (model?.state !== "downloading" &&
        !(
          model?.state === "installed" &&
          status?.enabled &&
          !status.modelLoaded &&
          !status.preparationError
        ))
    )
      return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [model, status, busy, disabled, error, refresh]);
  async function act(request: TalkRequest) {
    onBusyChange(true);
    try {
      await run(request);
      setConfirmRemove(false);
      await refresh();
    } finally {
      onBusyChange(false);
    }
  }
  const downloading = model?.state === "downloading";
  const installed = model?.state === "installed";
  const pending = status?.enabled && !status.modelLoaded;
  const progress =
    model && model.totalBytes > 0
      ? Math.min(100, Math.max(0, (model.downloadedBytes / model.totalBytes) * 100))
      : 0;
  return (
    <section
      className="space-y-3 border-t border-border pt-4"
      aria-labelledby="speech-model-heading"
    >
      <h2 id="speech-model-heading" className="text-sm font-medium">
        Speech model
      </h2>
      <p role="status" className="text-sm">
        {status?.modelLoaded
          ? "Parakeet: Ready on this device"
          : downloading
            ? `Enabled: Downloading Parakeet... ${Math.floor(progress)}%`
            : installed && pending
              ? "Enabled: Preparing Parakeet..."
              : pending
                ? "Enabled: Waiting for Parakeet download"
                : installed
                  ? "Parakeet is installed"
                  : "Parakeet is not downloaded"}
      </p>
      {pending && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked disabled />
          Dictation enabled: unavailable until Parakeet is ready
        </label>
      )}
      <RequestState busy={busy && !downloading} error={error} />
      {(model?.error || status?.preparationError) && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {model?.error || status?.preparationError}
        </p>
      )}
      {downloading ? (
        <>
          <progress
            aria-label="Parakeet download"
            className="h-2 w-full accent-primary"
            value={progress}
            max={100}
          />
          <Button
            variant="outline"
            disabled={busy || disabled}
            onClick={() => void act({ operation: "models.cancel" })}
          >
            Cancel download
          </Button>
        </>
      ) : !installed ? (
        <>
          <p className="text-sm text-muted-foreground">
            Download Parakeet to use dictation and meeting transcription.{" "}
            {model ? `${Math.ceil(model.totalBytes / 1000000)} MB.` : ""} Audio is processed on this
            device.
          </p>
          <Button
            disabled={busy || disabled}
            onClick={() => void act({ operation: "models.download", consent: true })}
          >
            {model?.state === "error" || model?.state === "cancelled"
              ? "Retry download"
              : "Download Parakeet"}
          </Button>
        </>
      ) : status?.preparationError ? (
        <Button
          disabled={busy || disabled}
          onClick={() => void act({ operation: "transcription.retry" })}
        >
          Retry preparation
        </Button>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Model details and storage
        </summary>
        <div className="mt-3 space-y-3">
          <p className="break-words text-xs text-muted-foreground">
            {model?.modelId} / {model?.license}
          </p>
          <Button
            variant="outline"
            disabled={busy || disabled || status?.recording || downloading}
            onClick={() => void act({ operation: "model.choose" })}
          >
            Choose installed model folder
          </Button>
          {installed && (
            <Button
              variant="outline"
              disabled={busy || disabled || status?.recording}
              onClick={() => setConfirmRemove(true)}
            >
              Remove download
            </Button>
          )}
          {confirmRemove && (
            <div className="space-y-2">
              <p>Remove Parakeet... Your recordings and enabled preference stay saved.</p>
              <Button
                variant="destructive"
                disabled={busy || disabled}
                onClick={() => void act({ operation: "models.remove" })}
              >
                Remove Parakeet
              </Button>
              <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep model
              </Button>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
