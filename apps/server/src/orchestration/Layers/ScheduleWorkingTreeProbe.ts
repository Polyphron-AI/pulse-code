/**
 * Live ScheduleWorkingTreeProbe: answers "is this project's working tree
 * dirty?" via the same GitVcsDriver plumbing checkpointing and source-control
 * status use — no raw child_process. Probe failures (not a repo, git missing,
 * transient error) degrade to "not dirty" with a warning so a broken probe
 * never stalls every schedule.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { GitVcsDriver } from "../../vcs/GitVcsDriver.ts";
import { ScheduleWorkingTreeProbe } from "../Services/ScheduleWorkingTreeProbe.ts";

export const ScheduleWorkingTreeProbeLive = Layer.effect(
  ScheduleWorkingTreeProbe,
  Effect.gen(function* () {
    const git = yield* GitVcsDriver;
    return {
      isDirty: (workspaceRoot: string) =>
        git.statusDetailsLocal(workspaceRoot).pipe(
          Effect.map((details) => details.isRepo && details.hasWorkingTreeChanges),
          Effect.catch((error) =>
            Effect.logWarning("schedule.working-tree-probe-failed", {
              workspaceRoot,
              error,
            }).pipe(Effect.map(() => false)),
          ),
        ),
    };
  }),
);
