import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { connectionAtomRuntime } from "../connection/runtime";
export const meetingNotesSubscription = createEnvironmentRpcSubscriptionAtomFamily(
  connectionAtomRuntime,
  { label: "environment-data:meeting-notes", tag: WS_METHODS.meetingNotesSubscribe, idleTtlMs: 0 },
);
export const saveMeetingNote = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:meeting-notes:save",
  tag: WS_METHODS.meetingNotesSave,
});
