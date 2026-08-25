import type { ScheduleHandoffGitPolicy } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class ScheduleHandoffGitError extends Schema.TaggedErrorClass<ScheduleHandoffGitError>()(
  "ScheduleHandoffGitError",
  {
    workspaceRoot: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Scheduled handoff Git policy failed in '${this.workspaceRoot}': ${this.detail}`;
  }
}

export interface ScheduleHandoffGitInput {
  readonly workspaceRoot: string;
  readonly handoffRelativePath: string;
  readonly handoffPathTemplate: string;
  readonly policy: ScheduleHandoffGitPolicy;
}

export interface ScheduleHandoffGitShape {
  readonly apply: (input: ScheduleHandoffGitInput) => Effect.Effect<void, ScheduleHandoffGitError>;
}

export class ScheduleHandoffGit extends Context.Service<
  ScheduleHandoffGit,
  ScheduleHandoffGitShape
>()("t3/orchestration/Services/ScheduleHandoffGit") {}
