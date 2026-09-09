import { useEffect, useState } from "react";
import type { TalkRecording, TalkStatus } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { MicIcon, AudioLinesIcon, ChevronDownIcon } from "lucide-react";
import { fieldClass, RequestState, useTalkRequest } from "./shared";
import { TalkModelPanel } from "./TalkModelPanel";
import { TalkDictationPanel } from "./TalkDictationPanel";

export function TalkPanel() {
  const { run, busy: requestBusy, error } = useTalkRequest();
  const [modelBusy, setModelBusy] = useState(false);
  const [dictationBusy, setDictationBusy] = useState(false);
  const busy = requestBusy || modelBusy || dictationBusy;
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [visibleTranscripts, setVisibleTranscripts] = useState<Record<string, boolean>>({});
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
    if (result.recording?.transcript !== undefined) {
      const recording = result.recording;
      setTranscripts((previous) => ({ ...previous, [recording.id]: recording.transcript ?? "" }));
      setVisibleTranscripts((previous) => ({ ...previous, [recording.id]: true }));
    }
    if (request.operation === "recordings.delete") {
      setTranscripts((previous) => {
        const next = { ...previous };
        delete next[request.id];
        return next;
      });
      setVisibleTranscripts((previous) => {
        const next = { ...previous };
        delete next[request.id];
        return next;
      });
    }
    if (request.operation === "recordings.get") {
      if (result.recording?.transcript === undefined)
        setNotice(
          "No transcript is available for this recording. You can try transcription again.",
        );
      return;
    }
    await refresh();
  }
  return (
    <section
      id="office-meetings"
      aria-labelledby="office-meetings-heading"
      className="min-w-0 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="office-meetings-heading" className="flex items-center gap-2 text-lg font-semibold">
          <MicIcon className="size-5 text-muted-foreground" />
          Meetings
        </h2>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Record on this computer. Transcribe when you choose.
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
                  : "Open transcription setup to load a model."}
              </p>
              <fieldset
                className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/40 p-4 text-sm"
                disabled={busy || status.recording}
              >
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
                  <p className="w-full text-xs text-muted-foreground">
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
      <div className="space-y-3 border-t border-border pt-5">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <AudioLinesIcon className="size-4 text-muted-foreground" />
          Recordings <span className="text-muted-foreground">{recordings.length}</span>
        </h3>
        {recordings.length === 0 && !busy && !error && (
          <div className="rounded-lg bg-muted/30 px-5 py-8 text-center">
            <p className="text-sm font-medium">Your meetings will appear here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a recording above. Audio and transcripts stay on this computer.
            </p>
          </div>
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
            {(recording.status === "transcribed" || transcripts[recording.id] !== undefined) && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !status?.enabled}
                  aria-expanded={visibleTranscripts[recording.id] ?? false}
                  onClick={() => {
                    if (visibleTranscripts[recording.id])
                      setVisibleTranscripts((previous) => ({ ...previous, [recording.id]: false }));
                    else if (transcripts[recording.id] !== undefined)
                      setVisibleTranscripts((previous) => ({ ...previous, [recording.id]: true }));
                    else void act({ operation: "recordings.get", id: recording.id });
                  }}
                >
                  {visibleTranscripts[recording.id] ? "Hide transcript" : "View transcript"}
                </Button>
                {visibleTranscripts[recording.id] && (
                  <p className="mt-2 select-text whitespace-pre-wrap break-words text-sm">
                    {transcripts[recording.id] || "The transcript is empty."}
                  </p>
                )}
              </>
            )}
          </article>
        ))}
      </div>
      <details className="group border-t border-border pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>
            Transcription setup{" "}
            <span className="ml-2 font-normal text-muted-foreground">
              {status?.modelLoaded ? "Model loaded" : "Model not loaded"}
            </span>
          </span>
          <ChevronDownIcon className="size-4 shrink-0 group-open:rotate-180" />
        </summary>
        <TalkModelPanel
          status={status}
          disabled={requestBusy || dictationBusy}
          onStatusChange={setStatus}
          onBusyChange={setModelBusy}
        />
      </details>
      <TalkDictationPanel
        status={status}
        disabled={requestBusy || modelBusy}
        onStatusChange={setStatus}
        onBusyChange={setDictationBusy}
      />
    </section>
  );
}
