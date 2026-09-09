import { useEffect, useState } from "react";
import type { TalkStatus } from "@t3tools/contracts";
import { TalkModelPanel } from "../workspace/office/TalkModelPanel";
import { TalkDictationPanel } from "../workspace/office/TalkDictationPanel";
import { RequestState, useTalkRequest } from "../workspace/office/shared";

export function DictationSettings() {
  const { run, busy, error } = useTalkRequest();
  const [status, setStatus] = useState<TalkStatus>();
  const [modelBusy, setModelBusy] = useState(false);
  const [dictationBusy, setDictationBusy] = useState(false);
  useEffect(() => {
    void run({ operation: "status" }).then((result) => {
      if (result?.status) setStatus(result.status);
    });
  }, [run]);
  async function act(request: Parameters<typeof run>[0]) {
    const result = await run(request);
    if (result?.status) setStatus(result.status);
  }
  return (
    <section
      id="dictation"
      className="mx-auto min-h-0 w-full max-w-3xl space-y-6 overflow-y-auto p-4 sm:p-6"
    >
      <div>
        <h1 className="text-xl font-semibold">Dictation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dictation and meeting transcription on this device.
        </p>
      </div>
      {!window.desktopBridge?.talkInvoke ? (
        <p className="text-sm text-muted-foreground">
          Local dictation and meeting audio capture are available in the Windows desktop app. Open
          Settings / Dictation on the device that will record. On mobile, use your keyboard's
          dictation.
        </p>
      ) : (
        <>
          <RequestState busy={busy} error={error} />
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="block font-medium">Enable dictation</span>
              <span className="mt-1 block text-muted-foreground">
                Use Parakeet for dictation and meeting transcripts.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Enable dictation"
              checked={status?.enabled ?? false}
              disabled={!status || busy || modelBusy || dictationBusy}
              onChange={(event) => void act({ operation: "enable", enabled: event.target.checked })}
            />
          </label>
          {!status?.workerAvailable && status && (
            <p className="text-sm text-muted-foreground">
              Install the Windows preview with audio capture to use dictation.
            </p>
          )}
          <TalkModelPanel
            status={status}
            disabled={busy || dictationBusy}
            onStatusChange={setStatus}
            onBusyChange={setModelBusy}
          />
          <section
            className="space-y-3 border-t border-border pt-4"
            aria-labelledby="meeting-default-heading"
          >
            <h2 id="meeting-default-heading" className="text-sm font-medium">
              Meeting capture
            </h2>
            <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
              Default for meetings
              <select
                className="rounded-md border border-input bg-background px-3 py-2"
                value={status?.everyMeeting ? "every" : "ask"}
                disabled={!status || busy}
                onChange={(event) =>
                  void act({
                    operation: "meetings.configure",
                    everyMeeting: event.target.value === "every",
                  })
                }
              >
                <option value="ask">Ask each time</option>
                <option value="every">Turn on for every meeting</option>
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              Choose audio sources in the meeting, then start recording. Saved audio waits for
              Parakeet and transcribes automatically when ready.
            </p>
            <p className="text-xs text-muted-foreground">
              Recordings stay on this computer. Open or delete them from Meetings. Meeting notes are
              separate from transcription.
            </p>
          </section>
          <TalkDictationPanel
            status={status}
            disabled={busy || modelBusy}
            onStatusChange={setStatus}
            onBusyChange={setDictationBusy}
          />
        </>
      )}
    </section>
  );
}
