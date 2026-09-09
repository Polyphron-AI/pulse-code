import * as Schema from "effect/Schema";
import { ProviderInstanceId } from "./providerInstance.ts";

export const ManagedSkillId = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,63}$/));
export const SkillSource = Schema.Union([
  Schema.Struct({ type: Schema.Literal("upload") }),
  Schema.Struct({
    type: Schema.Literal("github"),
    repository: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)),
    ref: Schema.String.check(Schema.isMaxLength(200)),
    directory: Schema.String.check(Schema.isMaxLength(500)),
  }),
]);
export type SkillSource = typeof SkillSource.Type;
export const ManagedSkill = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  source: SkillSource,
  defaultProviders: Schema.Array(ProviderInstanceId),
  autoUpdate: Schema.Boolean,
  revision: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  commit: Schema.optionalKey(Schema.String),
  updatedAt: Schema.String,
  checkedAt: Schema.String,
  error: Schema.optionalKey(Schema.String),
});
export type ManagedSkill = typeof ManagedSkill.Type;
export const ManagedSkills = Schema.Record(ManagedSkillId, ManagedSkill);
export const ThreadSkillOverrides = Schema.Record(
  Schema.String,
  Schema.Record(ManagedSkillId, Schema.NullOr(Schema.Boolean)),
);
export const SkillUploadFile = Schema.Struct({
  path: Schema.String.check(Schema.isMaxLength(500)),
  base64: Schema.String.check(Schema.isMaxLength(1_400_000)),
});
export type SkillUploadFile = typeof SkillUploadFile.Type;
export const ManagedSkillOperation = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("import"),
    id: ManagedSkillId,
    source: SkillSource,
    files: Schema.optionalKey(Schema.Array(SkillUploadFile).check(Schema.isMaxLength(128))),
  }),
  Schema.Struct({
    type: Schema.Literal("configure"),
    id: ManagedSkillId,
    defaultProviders: Schema.Array(ProviderInstanceId),
    autoUpdate: Schema.Boolean,
  }),
  Schema.Struct({ type: Schema.Literals(["sync", "remove"]), id: ManagedSkillId }),
]);
export type ManagedSkillOperation = typeof ManagedSkillOperation.Type;
export function isManagedSkillEnabled(
  skill: ManagedSkill,
  provider: string,
  override?: boolean | null,
) {
  return override ?? skill.defaultProviders.some((id) => id === provider);
}
