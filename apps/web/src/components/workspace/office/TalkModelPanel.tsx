import { useCallback, useEffect, useState } from "react";
import type { TalkModelStatus, TalkRequest, TalkStatus } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { RequestState, useTalkRequest } from "./shared";

function gigabytes(bytes: number) {
  return `${(bytes / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 1 })} GiB`;
}
function megabytes(bytes: number) {
  return `${(bytes / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
}

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
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    const result = await run({ operation: "models.status" });
    if (result?.model) setModel(result.model);
    if (result?.status) onStatusChange(result.status);
  }, [run, onStatusChange]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (model?.state !== "downloading" || busy || disabled || error) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [model?.state, busy, disabled, error, refresh]);
  async function act(request: TalkRequest) {
    onBusyChange(true);
    setNotice("");
    try {
      const result = await run(request);
      if (!result) return;
      if (result.model) setModel(result.model);
      if (result.status) onStatusChange(result.status);
      if (result.cancelled)
        setNotice("Model selection cancelled. Your current model is unchanged.");
      if (request.operation === "models.remove") setConfirmRemove(false);
      await refresh();
    } finally {
      onBusyChange(false);
    }
  }
  const downloading = model?.state === "downloading";
  const installed = model?.state === "installed";
  const canRemove = installed && !status?.modelLoaded && !status?.recording;
  const progress =
    model && model.totalBytes > 0
      ? Math.min(100, Math.max(0, (model.downloadedBytes / model.totalBytes) * 100))
      : 0;
  return (
    <section aria-labelledby="talk-model-heading" className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="talk-model-heading" className="text-sm font-medium">
          Local transcription · Parakeet
        </h3>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || disabled}
          onClick={() => void refresh()}
        >
          Refresh model status
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {installed
          ? "Parakeet transcribes on your computer. Load it when you need it."
          : "Download Parakeet (670 MB) for local transcription. Downloading does not start recording or load the model."}
      </p>
      <RequestState busy={busy && !downloading} error={error} />
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {model && (
        <>
          {downloading ? (
            <div className="space-y-2">
              <label htmlFor="talk-model-progress" className="block text-sm">
                Downloading Parakeet · {Math.floor(progress)}%
              </label>
              <progress
                id="talk-model-progress"
                className="h-2 w-full accent-primary"
                max={100}
                value={progress}
              />
              <p className="break-words text-xs text-muted-foreground">
                {megabytes(model.downloadedBytes)} of {megabytes(model.totalBytes)}
                {model.currentFile ? ` · ${model.currentFile}` : ""}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || disabled}
                onClick={() => void act({ operation: "models.cancel" })}
              >
                Cancel download
              </Button>
            </div>
          ) : (
            <>
              {model.state === "cancelled" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Download cancelled. You can retry when ready.
                </p>
              )}
              {model.error && (
                <p role="alert" className="text-sm text-destructive-foreground">
                  {model.error}
                </p>
              )}
              {installed ? (
                <>
                  <p role="status" className="text-sm">
                    Parakeet is installed.
                    {status?.modelLoaded
                      ? " A transcription model is loaded."
                      : " Load Parakeet to use it for local transcription."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={
                        busy || disabled || !status?.enabled || !status.running || status.recording
                      }
                      onClick={() => void act({ operation: "models.load" })}
                    >
                      Load Parakeet
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || disabled || !canRemove}
                      onClick={() => setConfirmRemove(true)}
                    >
                      Remove download
                    </Button>
                  </div>
                  {!status?.enabled && (
                    <p className="text-xs text-muted-foreground">
                      Enable local Talk above before loading the model.
                    </p>
                  )}
                  {status?.modelLoaded && (
                    <p className="text-xs text-muted-foreground">
                      Disable Talk to unload the current model before removing the download.
                    </p>
                  )}
                  {confirmRemove && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      Remove downloaded Parakeet files? Your recordings stay on this computer.
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy || disabled || !canRemove}
                        onClick={() => void act({ operation: "models.remove" })}
                      >
                        Confirm removal
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>
                        Keep model
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <Button
                  disabled={busy || disabled}
                  onClick={() => void act({ operation: "models.download", consent: true })}
                >
                  {model.state === "error" || model.state === "cancelled"
                    ? "Retry Parakeet download"
                    : "Download Parakeet"}
                </Button>
              )}
            </>
          )}
        </>
      )}
      {model && (
        <details className="text-sm">
          <summary className="cursor-pointer rounded-md py-2 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Model details and storage
          </summary>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="break-words">{model.modelId}</dd>
            <dt className="text-muted-foreground">Download size</dt>
            <dd>
              {megabytes(model.totalBytes)} · {model.totalBytes.toLocaleString()} bytes
            </dd>
            <dt className="text-muted-foreground">License</dt>
            <dd>{model.license}</dd>
            <dt className="text-muted-foreground">Revision</dt>
            <dd className="break-all">{model.revision}</dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="break-all">
              {model.sourceUrl.startsWith("https://") ? (
                <a
                  className="underline underline-offset-4"
                  href={model.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {model.sourceUrl}
                </a>
              ) : (
                model.sourceUrl
              )}
            </dd>
            <dt className="text-muted-foreground">Available memory</dt>
            <dd>
              {gigabytes(model.memory.freeBytes)} of {gigabytes(model.memory.totalBytes)}
            </dd>
            <dt className="text-muted-foreground">Free disk space</dt>
            <dd>
              {model.disk.freeBytes === null ? "Unavailable" : gigabytes(model.disk.freeBytes)}
            </dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            Memory and disk values are from the latest status check.
          </p>
        </details>
      )}
      <Button
        variant="outline"
        disabled={
          busy ||
          disabled ||
          !status?.enabled ||
          !status.workerAvailable ||
          status.recording ||
          downloading
        }
        onClick={() => void act({ operation: "model.choose" })}
      >
        Choose installed model folder
      </Button>
    </section>
  );
}
