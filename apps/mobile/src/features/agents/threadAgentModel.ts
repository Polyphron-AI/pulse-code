import { useMemo } from "react";

import type { OrchestrationThread, OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  deriveAgentPanelModel,
  emptyAgentPanelModel,
  foldSubagentActivities,
  type AgentPanelModel,
} from "@t3tools/client-runtime/state/subagentRuntime";

/**
 * Mobile's view of the thread's subagents. Folds the SAME persisted
 * activities web folds, so the two surfaces cannot disagree about who is
 * running; nothing new crosses the wire.
 *
 * Memoized on the activity array's identity: thread state replaces the array
 * only when activities actually change, so a re-render from unrelated thread
 * updates never re-folds.
 */
export function useThreadAgentPanelModel(
  activities: ReadonlyArray<OrchestrationThreadActivity> | null | undefined,
  /** False when the session is gone: orphaned agents read as interrupted. */
  sessionLive: boolean,
): AgentPanelModel {
  return useMemo(() => {
    if (!activities || activities.length === 0) {
      return emptyAgentPanelModel();
    }
    return deriveAgentPanelModel({
      agents: foldSubagentActivities(activities, { sessionLive }),
    });
  }, [activities, sessionLive]);
}

/**
 * Same rule as web's derivePhase: a stopped/interrupted/errored session is
 * dead, so agents still marked running are really interrupted.
 */
export function isAgentSessionLive(session: OrchestrationThread["session"] | null): boolean {
  if (!session) {
    return false;
  }
  return (
    session.status !== "stopped" && session.status !== "interrupted" && session.status !== "error"
  );
}
