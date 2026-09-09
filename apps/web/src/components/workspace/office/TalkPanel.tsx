import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { TalkRecording, TalkStatus } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { MicIcon, AudioLinesIcon } from "lucide-react";
import { fieldClass, RequestState, useTalkRequest } from "./shared";

export function TalkPanel() {
  const { run, busy: requestBusy, error } = useTalkRequest();
  const busy = requestBusy;
  const [meetingEnabled, setMeetingEnabled] = useState(false);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [visibleTranscripts, setVisibleTranscripts] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<TalkStatus>();
  const [recordings, setRecordings] = useState<readonly TalkRecording[]>([]);
  const [title, setTitle] = useState("");
  const [microphone, setMicrophone] = useState(true);
  const [systemAudio, setSystemAudio] = useState(true);
  const [notice, setNotice] = useState("");
  const [removeId, setRemoveId] = useState<string>();
  async function refresh() {
    const result = await run({ operation: "status" });
    if (result?.status) setStatus(result.status);
    if (!result?.status?.workerAvailable || result.status.transcribingId) return;
    const list = await run({ operation: "recordings.list" });
    if (list?.recordings) setRecordings(list.recordings);
    if (list?.status) setStatus(list.status);
  }
  useEffect(() => {
    void refresh();
  }, [run]);
  useEffect(() => {
    if ((!status?.recording && !status?.pendingTranscriptions?.length) || busy || error) return;
    const timer = window.setTimeout(() => {
      void refresh();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [status, busy, error]);
  async function act(request: Parameters<typeof run>[0]) {
    setNotice("");
    const result = await run(request);
    if (!result) return;
    if (result.cancelled) {
      setNotice("Model selection cancelled. Your current model is unchanged.");
      return;
    }
    if (result.status) setStatus(result.status);
    if (request.operation === "recordings.stop") setMeetingEnabled(false);
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
        Record your microphone and meeting audio. Saved recordings transcribe when Parakeet is
        ready.
      </p>
      <RequestState busy={busy} error={error} />
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {status && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              to="/settings/dictation"
              className="text-muted-foreground underline underline-offset-4"
            >
              Dictation settings
            </Link>
            {!meetingEnabled && !status.everyMeeting && !status.recording ? (
              <>
                <Button variant="outline" disabled={busy} onClick={() => setMeetingEnabled(true)}>
                  Turn on for this meeting
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act({ operation: "meetings.configure", everyMeeting: true })}
                >
                  Turn on for every meeting
                </Button>
              </>
            ) : (
              <>
                <span>
                  Capture enabled{status.everyMeeting ? " for every meeting" : " for this meeting"}
                </span>
                <Button
                  variant="ghost"
                  disabled={busy || status.recording}
                  onClick={() => {
                    setMeetingEnabled(false);
                    if (status.everyMeeting)
                      void act({ operation: "meetings.configure", everyMeeting: false });
                  }}
                >
                  Turn off
                </Button>
              </>
            )}
          </div>
          {!status.workerAvailable && (
            <p className="text-sm text-muted-foreground">
              Meeting capture requires the Windows desktop build.
            </p>
          )}
          {(meetingEnabled || status.everyMeeting || status.recording) && (
            <>
              <p role="status" className="text-sm text-muted-foreground">
                {status.recording
                  ? "Recording audio. Stop to save."
                  : status.transcribingId
                    ? "Transcribing saved audio..."
                    : !status.modelLoaded
                      ? "Record now, transcribe when ready. Parakeet setup is in Dictation settings."
                      : "Ready to record."}
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
                      !status.workerAvailable ||
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
                        transcribeWhenReady: true,
                      })
                    }
                  >
                    {status.modelLoaded ? "Start recording" : "Record now, transcribe when ready"}
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}
      {status?.pendingTranscriptions?.length ? (
        <p role="status" className="text-sm text-muted-foreground">
          {status.transcribingId
            ? "Transcribing saved audio..."
            : "Transcription queued. Audio is saved on this device."}
        </p>
      ) : null}
      {(status?.transcriptionError || status?.preparationError) && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive-foreground">
            {status.transcriptionError || status.preparationError}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void act({ operation: "transcription.retry" })}
          >
            Retry transcription
          </Button>
        </div>
      )}
      <div className="space-y-3">
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
                disabled={busy || recording.status === "recording" || !recording.audioPath}
                onClick={() => void act({ operation: "recordings.open", id: recording.id })}
              >
                Open audio
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  !status?.modelLoaded ||
                  status?.recording ||
                  recording.status === "recording" ||
                  !recording.audioPath
                }
                onClick={() => void act({ operation: "recordings.transcribe", id: recording.id })}
              >
                {status?.pendingTranscriptions?.includes(recording.id)
                  ? "Waiting for transcription"
                  : "Transcribe locally"}
              </Button>
              {status?.pendingTranscriptions?.includes(recording.id) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || status.transcribingId === recording.id}
                  onClick={() => void act({ operation: "transcription.cancel", id: recording.id })}
                >
                  Keep audio only
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || recording.status === "recording"}
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
                  disabled={busy}
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
    </section>
  );
}
