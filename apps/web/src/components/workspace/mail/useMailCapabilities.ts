import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { usePrimaryEnvironmentId } from "../../../state/environments";
import { primaryEnvironmentIdAtom } from "../../../state/primaryEnvironment";
import { serverEnvironment } from "../../../state/server";

// The cached config can be an older server's, so Mail trusts a capability only once the
// server has answered, the way the Email settings page does.
const liveConfigAtom = Atom.make((get) => {
  const environmentId = get(primaryEnvironmentIdAtom);
  if (environmentId === null) return null;
  const projection = Option.getOrNull(
    AsyncResult.value(get(serverEnvironment.configProjection({ environmentId, input: {} }))),
  );
  return projection?.source === "live" ? projection.config : null;
}).pipe(Atom.withLabel("web-mail-live-config"));

/** What the primary environment offers Mail. Wave 1 Mail uses the primary environment only. */
export function useMailCapabilities() {
  const environmentId = usePrimaryEnvironmentId();
  const config = useAtomValue(liveConfigAtom);
  return {
    environmentId,
    ready: config !== null,
    mailRead: config?.pulseCapabilities?.mailRead === true,
    workspaceLinks: config?.pulseCapabilities?.workspaceLinks === true,
  };
}
