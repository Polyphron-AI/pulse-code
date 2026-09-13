import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";

export const PulseSkillId = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,63}$/));
export const PulseSkillRevision = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
export const PulseSkillSelection = Schema.Struct({
  id: PulseSkillId,
  revision: PulseSkillRevision,
});
export type PulseSkillSelection = typeof PulseSkillSelection.Type;
export const PulseSkillSelectionList = Schema.Array(PulseSkillSelection)
  .check(Schema.isMaxLength(32))
  .check(
    Schema.makeFilter(
      (selections) =>
        new Set(selections.map((selection) => selection.id)).size === selections.length ||
        "Managed skill selections must use unique ids.",
    ),
  );
export type PulseSkillSelectionList = typeof PulseSkillSelectionList.Type;
const Policy = Schema.Literals(["pinned", "keep-updated"]);
const GitHubSource = Schema.Struct({
  type: Schema.Literal("github"),
  repository: Schema.String.check(Schema.isMaxLength(200)),
  ref: Schema.String.check(Schema.isMaxLength(200)),
  directory: Schema.String.check(Schema.isMaxLength(1024)),
});
export const PulseSkillRecord = Schema.Struct({
  id: PulseSkillId,
  name: Schema.String,
  description: Schema.String,
  revision: PulseSkillRevision,
  source: Schema.Union([Schema.Struct({ type: Schema.Literal("upload") }), GitHubSource]),
  updatePolicy: Policy,
  resolvedCommit: Schema.optional(Schema.String),
  invocation: Schema.Struct({
    userInvocationOnly: Schema.optional(Schema.Literal(true)),
    userInvocable: Schema.optional(Schema.Literal(false)),
  }),
  updatedAt: Schema.String,
  checkedAt: Schema.String,
  error: Schema.optional(Schema.String),
});

export type PulseSkillRecord = typeof PulseSkillRecord.Type;

export const PulseSkillMutation = Schema.Union([
  Schema.Struct({
    operation: Schema.Literal("import-upload"),
    id: PulseSkillId,
    files: Schema.Array(
      Schema.Struct({
        path: Schema.String.check(Schema.isMaxLength(1024)),
        base64: Schema.String.check(Schema.isMaxLength(1_398_104)),
      }),
    ).check(Schema.isMaxLength(128)),
  }),
  Schema.Struct({
    operation: Schema.Literal("import-github"),
    id: PulseSkillId,
    source: GitHubSource,
    updatePolicy: Policy,
  }),
  Schema.Struct({
    operation: Schema.Literal("link-github"),
    id: PulseSkillId,
    source: GitHubSource,
    updatePolicy: Schema.optional(Policy),
  }),
  Schema.Struct({ operation: Schema.Literal("set-policy"), id: PulseSkillId, policy: Policy }),
  Schema.Struct({ operation: Schema.Literal("sync"), id: PulseSkillId }),
  Schema.Struct({ operation: Schema.Literal("remove"), id: PulseSkillId }),
]);
export type PulseSkillMutation = typeof PulseSkillMutation.Type;

export class PulseSkillsError extends Schema.TaggedError<PulseSkillsError>()("PulseSkillsError", {
  message: Schema.String,
}) {}

export const PULSE_SKILLS_METHODS = {
  pulseSkillsList: "pulse.skills.list",
  pulseSkillsMutate: "pulse.skills.mutate",
} as const;

export const PulseSkillsRpcs = [
  Rpc.make(PULSE_SKILLS_METHODS.pulseSkillsList, {
    payload: Schema.Struct({}),
    success: Schema.Array(PulseSkillRecord),
    error: Schema.Union([PulseSkillsError, EnvironmentAuthorizationError]),
  }),
  Rpc.make(PULSE_SKILLS_METHODS.pulseSkillsMutate, {
    payload: PulseSkillMutation,
    success: Schema.Array(PulseSkillRecord),
    error: Schema.Union([PulseSkillsError, EnvironmentAuthorizationError]),
  }),
] as const;
