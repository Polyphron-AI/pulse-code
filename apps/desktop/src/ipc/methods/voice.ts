import {
  DesktopVoiceDevices,
  DesktopVoiceMeetingStarted,
  DesktopVoiceMeetingStopped,
  DesktopVoiceState,
  DesktopVoiceTranscribeInput,
  DesktopVoiceTranscript,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopVoice from "../../voice/DesktopVoice.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

class VoiceIpcUnauthorizedSenderError extends Schema.TaggedError<VoiceIpcUnauthorizedSenderError>()(
  "VoiceIpcUnauthorizedSenderError",
  {},
) {
  override get message(): string {
    return "Voice request was rejected.";
  }
}

// Microphone and meeting capture are only for the main app window.
const ensureTrustedVoiceSender = Effect.fn("desktop.ipc.voice.ensureTrustedSender")(function* (
  event: DesktopIpc.DesktopIpcInvokeEvent | undefined,
) {
  const main = yield* (yield* ElectronWindow.ElectronWindow).main;
  if (event === undefined || Option.isNone(main) || main.value.webContents.id !== event.sender.id) {
    return yield* new VoiceIpcUnauthorizedSenderError();
  }
});

export const getVoiceState = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_VOICE_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopVoiceState,
  handler: Effect.fn("desktop.ipc.voice.getState")(function* () {
    return yield* (yield* DesktopVoice.DesktopVoice).state;
  }),
});

export const listVoiceDevices = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.LIST_VOICE_DEVICES_CHANNEL,
  payload: Schema.Void,
  result: DesktopVoiceDevices,
  handler: Effect.fn("desktop.ipc.voice.listDevices")(function* (_, event) {
    yield* ensureTrustedVoiceSender(event);
    return yield* (yield* DesktopVoice.DesktopVoice).listDevices;
  }),
});

export const transcribeVoice = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.TRANSCRIBE_VOICE_CHANNEL,
  payload: DesktopVoiceTranscribeInput,
  result: DesktopVoiceTranscript,
  handler: Effect.fn("desktop.ipc.voice.transcribe")(function* (input, event) {
    yield* ensureTrustedVoiceSender(event);
    return yield* (yield* DesktopVoice.DesktopVoice).transcribe(input);
  }),
});

export const startVoiceMeeting = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.START_VOICE_MEETING_CHANNEL,
  payload: Schema.Void,
  result: DesktopVoiceMeetingStarted,
  handler: Effect.fn("desktop.ipc.voice.startMeeting")(function* (_, event) {
    yield* ensureTrustedVoiceSender(event);
    return yield* (yield* DesktopVoice.DesktopVoice).startMeeting;
  }),
});

export const stopVoiceMeeting = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.STOP_VOICE_MEETING_CHANNEL,
  payload: Schema.Void,
  result: DesktopVoiceMeetingStopped,
  handler: Effect.fn("desktop.ipc.voice.stopMeeting")(function* (_, event) {
    yield* ensureTrustedVoiceSender(event);
    return yield* (yield* DesktopVoice.DesktopVoice).stopMeeting;
  }),
});
