import { useEffect, useState } from "react";
import type { TalkRecording, TalkStatus } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { fieldClass, RequestState, useTalkRequest } from "./shared";
import { TalkModelPanel } from "./TalkModelPanel";

export function TalkPanel() {
  const { run, busy: requestBusy, error } = useTalkRequest();
  const [modelBusy, setModelBusy] = useState(false);
  const busy = requestBusy || modelBusy;
  const [status, setStatus] = useState<TalkStatus>();
  const [recordings, setRecordings] = useState<readonly TalkRecording[]>([]);
  const [title, setTitle] = useState("");
  const [microphone, setMicrophone] = useState(true);
  const [systemAudio, setSystemAudio] = useState(false);
  const [notice, setNotice] = useState("");
  const [removeId, setRemoveId] = useState<string>();
  async function refresh() {
    const result = await run({ operation: "status" });
    if (result?.status) setStatus(result.status);
    if (!result?.status?.enabled) return;
    const list = await run({ operation: "recordings.list" });
    if (list?.recordings) setRecordings(list.recordings);
    if (list?.status) setStatus(list.status);
  }
  useEffect(() => {
    void refresh();
  }, [run]);
  useEffect(() => {
    if (!status?.recording || busy || error) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [status?.recording, busy, error]);
  async function act(request: Parameters<typeof run>[0]) {
    setNotice("");
    const result = await run(request);
    if (!result) return;
    if (result.cancelled) {
      setNotice("Model selection cancelled. Your current model is unchanged.");
      return;
    }
    if (result.status) setStatus(result.status);
    await refresh();
  }
  return (
    <Card id="office-meetings" className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Meetings · Pulse Talk</h2>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Record selected audio sources locally, up to 5 minutes per recording. Transcription runs
        only when requested. Recording always starts with your action.
      </p>
      <RequestState busy={busy} error={error} />
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {status && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={status.enabled}
              disabled={busy || status.recording}
              onChange={(event) => void act({ operation: "enable", enabled: event.target.checked })}
            />
            Enable local Talk
          </label>
          {!status.workerAvailable && (
            <p className="text-sm text-muted-foreground">
              The Talk worker is unavailable. Install a desktop build that includes Talk.
            </p>
          )}
          {status.enabled && (
            <>
              <p role="status" className="text-sm">
                {status.recording
                  ? "Recording is active. Stop to save the audio."
                  : status.running
                    ? "Talk is ready."
                    : "Talk is stopped."}{" "}
                {status.modelLoaded
                  ? "Transcription model loaded."
                  : "Choose an installed model to transcribe."}
              </p>
              <fieldset className="space-y-2 text-sm" disabled={busy || status.recording}>
                <legend className="mb-2 font-medium">Audio sources</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={microphone}
                    disabled={!status.capabilities.microphone}
                    onChange={(event) => setMicrophone(event.target.checked)}
                  />
                  Microphone
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={systemAudio && status.capabilities.systemAudio}
                    disabled={!status.capabilities.systemAudio}
                    onChange={(event) => setSystemAudio(event.target.checked)}
                  />
                  Computer audio
                </label>
                {!status.capabilities.systemAudio && (
                  <p className="text-muted-foreground">
                    Computer audio is unavailable on this installation.
                  </p>
                )}
              </fieldset>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 space-y-1 text-sm">
                  Recording title
                  <input
                    className={fieldClass}
                    value={title}
                    maxLength={200}
                    disabled={busy || status.recording}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Untitled meeting"
                  />
                </label>
                {status.recording ? (
                  <Button
                    disabled={busy}
                    variant="destructive"
                    onClick={() => void act({ operation: "recordings.stop" })}
                  >
                    Stop and save
                  </Button>
                ) : (
                  <Button
                    disabled={
                      busy ||
                      !status.running ||
                      !(
                        (microphone && status.capabilities.microphone) ||
                        (systemAudio && status.capabilities.systemAudio)
                      )
                    }
                    onClick={() =>
                      void act({
                        operation: "recordings.start",
                        title: title.trim() || "Untitled meeting",
                        microphone: microphone && status.capabilities.microphone,
                        systemAudio: systemAudio && status.capabilities.systemAudio,
                      })
                    }
                  >
                    Start recording
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
      <TalkModelPanel
        status={status}
        disabled={requestBusy}
        onStatusChange={setStatus}
        onBusyChange={setModelBusy}
      />
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Local recordings</h3>
        {recordings.length === 0 && !busy && (
          <p className="text-sm text-muted-foreground">No recordings saved yet.</p>
        )}
        {recordings.map((recording) => (
          <article key={recording.id} className="space-y-2 border-t border-border pt-3">
            <div className="text-sm font-medium">{recording.title}</div>
            <p className="text-xs text-muted-foreground">
              {new Date(recording.startedAt).toLocaleString()} ·{" "}
              {Math.round(recording.durationSeconds)} seconds · {recording.status}
            </p>
            {recording.sources && (
              <p className="text-xs text-muted-foreground">
                Sources:{" "}
                {[
                  recording.sources.microphone && "Microphone",
                  recording.sources.systemAudio && "Computer audio",
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            {recording.recovered && (
              <p className="text-sm text-muted-foreground">
                Recovered after an interruption. The audio may be incomplete.
              </p>
            )}
            {recording.error && (
              <p role="alert" className="text-sm text-destructive-foreground">
                {recording.error.message}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  !status?.enabled ||
                  recording.status === "recording" ||
                  !recording.audioPath
                }
                onClick={() => void act({ operation: "recordings.open", id: recording.id })}
              >
                Open audio
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  !status?.enabled ||
                  !status.modelLoaded ||
                  status.recording ||
                  recording.status === "recording" ||
                  !recording.audioPath
                }
                onClick={() => void act({ operation: "recordings.transcribe", id: recording.id })}
              >
                Transcribe locally
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !status?.enabled || recording.status === "recording"}
                onClick={() => setRemoveId(recording.id)}
              >
                Delete
              </Button>
            </div>
            {removeId === recording.id && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                Delete this recording and transcript?
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setRemoveId(undefined);
                    void act({ operation: "recordings.delete", id: recording.id });
                  }}
                >
                  Delete recording
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRemoveId(undefined)}>
                  Keep
                </Button>
              </div>
            )}
            {recording.transcript && (
              <details>
                <summary className="cursor-pointer text-sm">Transcript</summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {recording.transcript}
                </p>
              </details>
            )}
          </article>
        ))}
      </div>
    </Card>
  );
}
