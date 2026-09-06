import { createMailEnvironmentAtoms } from "@t3tools/client-runtime/state/mail";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { connectionAtomRuntime } from "../connection/runtime";
import { mobilePreferencesAtom } from "./preferences";

/** Mail stays on its owning server, including when mobile connects through a relay. */
export const mailEnvironment = createMailEnvironmentAtoms(connectionAtomRuntime);

export function useMailAlphaEnabled() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  return AsyncResult.isSuccess(preferences) && preferences.value.mailAlphaEnabled === true;
}
