import {
  runAtomCommand,
  squashAtomCommandFailure,
  type AtomCommand,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { MicIcon, SquareIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "../components/ui/button";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { getNativeParakeet } from "../voice/nativeParakeet";
import { MeetingRecorder, type SavedMeetingSession } from "./meetingRecorder";
import { meetingEnvironment } from "./meetingsState";

async function run<W, A, E>(command: AtomCommand<W, A, E>, input: W): Promise<A> {
  const result: AtomCommandResult<A, E> = await runAtomCommand(appAtomRegistry, command, input, {
    reportFailure: false,
  });
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

let recorder: MeetingRecorder | null | undefined;

const SESSION_KEY = "pulse:meeting-recorder-session";

// sessionStorage outlives a reload of this window, which is exactly what resume needs.
const sessionStore = {
  load: (): SavedMeetingSession | null => {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SavedMeetingSession) : null;
    } catch {
      return null;
    }
  },
  save: (session: SavedMeetingSession | null) => {
    try {
      if (session) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Without storage a reload loses the session; recording still works.
    }
  },
};

/**
 * One recorder per page, outside React, so a meeting keeps recording and saving while the user
 * navigates elsewhere. Null where the desktop has no voice engine.
 */
function getDesktopMeetingRecorder(): MeetingRecorder | null {
  if (recorder !== undefined) return recorder;
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  const { getVoiceState, startVoiceMeeting, stopVoiceMeeting, onVoiceEvent } = bridge ?? {};
  if (!getVoiceState || !startVoiceMeeting || !stopVoiceMeeting || !onVoiceEvent) {
    return (recorder = null);
  }
  recorder = new MeetingRecorder({
    desktop: {
      activeSessionId: async () => (await getVoiceState()).meetingSessionId,
      start: startVoiceMeeting,
      stop: stopVoiceMeeting,
      onEvent: onVoiceEvent,
    },
    server: {
      // No title, so the server names the meeting from its summary.
      create: async (environmentId, startedAt) =>
        (await run(meetingEnvironment.create, { environmentId, input: { startedAt } })).id,
      append: async (environmentId, id, segments) => {
        await run(meetingEnvironment.appendSegments, { environmentId, input: { id, segments } });
      },
      finish: async (environmentId, id, endedAt, durationMs) => {
        await run(meetingEnvironment.finish, {
          environmentId,
          input: { id, endedAt, durationMs },
        });
      },
      remove: async (environmentId, id) => {
        await run(meetingEnvironment.delete, { environmentId, input: { id } });
      },
    },
    store: sessionStore,
    now: () => new Date(),
  });
  void recorder.resume();
  return recorder;
}

const idleState = { phase: "idle" } as const;
const noSubscription = () => () => undefined;

/** Desktop meeting recording controls. Recording always saves to the environment shown. */
export function MeetingRecorderSlot({
  environmentId,
}: {
  readonly environmentId: EnvironmentId | null;
}) {
  const instance = getDesktopMeetingRecorder();
  const native = getNativeParakeet();
  const engine = useSyncExternalStore(native.subscribe, native.getStatus);
  const state = useSyncExternalStore(
    instance?.subscribe ?? noSubscription,
    instance?.getSnapshot ?? (() => idleState),
  );
  // An active session keeps its controls even if the engine status flickers.
  if (!instance || (engine !== "available" && state.phase === "idle")) return null;

  if (state.phase === "recording" || state.phase === "stopping") {
    const detail =
      state.phase === "stopping"
        ? "Saving…"
        : state.syncError
          ? `Not saved yet: ${state.syncError}`
          : `Recording · ${String(state.segmentCount)} segments`;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-xs text-muted-foreground" role="status">
          {detail}
        </span>
        <Button
          size="sm"
          variant="destructive-outline"
          disabled={state.phase === "stopping"}
          onClick={() => void instance.stop()}
        >
          <SquareIcon />
          Stop
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {state.phase === "error" ? (
        <span className="truncate text-xs text-error-foreground" role="alert">
          {state.message}
        </span>
      ) : null}
      {state.phase === "error" && state.unsaved ? (
        <>
          <Button size="sm" variant="outline" onClick={() => void instance.retry()}>
            Retry save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => instance.discard()}>
            Discard
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={environmentId === null || state.phase === "starting"}
          onClick={() => {
            if (environmentId !== null) void instance.start(environmentId);
          }}
        >
          <MicIcon />
          {state.phase === "starting" ? "Starting…" : "Record meeting"}
        </Button>
      )}
    </div>
  );
}
