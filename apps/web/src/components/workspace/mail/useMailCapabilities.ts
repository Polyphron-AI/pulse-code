import type { EnvironmentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { usePrimaryEnvironmentId } from "../../../state/environments";
import { serverEnvironment } from "../../../state/server";

// The cached config can be an older server's, so Mail trusts a capability only once the
// server has answered, the way the Email settings page does.
const liveConfigAtom = Atom.family((environmentId: EnvironmentId | null) =>
  Atom.make((get) => {
    if (environmentId === null) return null;
    const projection = Option.getOrNull(
      AsyncResult.value(get(serverEnvironment.configProjection({ environmentId, input: {} }))),
    );
    return projection?.source === "live" ? projection.config : null;
  }).pipe(Atom.withLabel("web-mail-live-config")),
);

/** What the primary environment offers Mail. Wave 1 Mail uses the primary environment only. */
export function useMailCapabilities(targetEnvironmentId?: EnvironmentId) {
  const primary = usePrimaryEnvironmentId();
  const environmentId = targetEnvironmentId ?? primary;
  const config = useAtomValue(liveConfigAtom(environmentId));
  return {
    environmentId,
    ready: config !== null,
    workspaceTasksV2: config?.pulseCapabilities?.workspaceTasksV2 === true,
    workspaceTools: config?.pulseCapabilities?.workspaceTools === true,
    driveRead: config?.pulseCapabilities?.driveRead === true,
    telegramRead: config?.pulseCapabilities?.telegramRead === true,
    mailReply: config?.pulseCapabilities?.mailReply === true,
    mailConversations: config?.pulseCapabilities?.mailConversations === true,
    mailRead: config?.pulseCapabilities?.mailRead === true,
    workspaceLinks: config?.pulseCapabilities?.workspaceLinks === true,
    workspaceSuggestions: config?.pulseCapabilities?.workspaceSuggestions === true,
    textGenerationSelection: config?.settings.textGenerationModelSelection,
    workspaceItemContext: config?.pulseCapabilities?.workspaceItemContext === true,
  };
}
