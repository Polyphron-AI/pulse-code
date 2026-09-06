import * as Schema from "effect/Schema";
import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { MailMessageRef } from "./mail.ts";

const Label = TrimmedNonEmptyString.check(Schema.isMaxLength(500));
const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(512));
export const MailPerson = Schema.Struct({
  id: Id,
  address: Label,
  name: Label,
  state: Schema.Literals(["candidate", "confirmed", "dismissed"]),
  revision: NonNegativeInt,
});
export type MailPerson = typeof MailPerson.Type;
export const MailEvidence = Schema.Struct({
  ref: MailMessageRef,
  subject: Schema.String,
  date: Schema.NullOr(Schema.String),
  excerpt: Schema.String.check(Schema.isMaxLength(1500)),
});
export const MailWorkState = Schema.Literals(["suggested", "open", "waiting", "done", "dismissed"]);
export const MailWork = Schema.Struct({
  id: Id,
  personId: Id,
  title: Label,
  kind: Schema.Literals(["task", "feedback"]),
  state: MailWorkState,
  dueDate: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
  evidence: MailEvidence,
  revision: NonNegativeInt,
  origin: Schema.Literals(["user", "luna"]),
});
export type MailWork = typeof MailWork.Type;
export const MailConnection = Schema.Struct({
  id: Id,
  fromPersonId: Id,
  toPersonId: Id,
  type: Schema.Literals(["introduced", "mentioned", "escalated_to"]),
  state: Schema.Literals(["suggested", "confirmed", "dismissed"]),
  evidence: MailEvidence,
  revision: NonNegativeInt,
});
export type MailConnection = typeof MailConnection.Type;
export const MailPeopleState = Schema.Struct({
  people: Schema.Array(MailPerson),
  work: Schema.Array(MailWork),
  connections: Schema.Array(MailConnection),
  scans: Schema.Record(Schema.String, Schema.String),
  sources: Schema.Array(
    Schema.Struct({ id: Id, evidence: MailEvidence, personIds: Schema.Array(Id) }),
  ),
});
export const MailPeopleContextInput = Schema.Struct({
  accountId: Id,
  ref: Schema.optional(MailMessageRef),
});
export type MailPeopleContextInput = typeof MailPeopleContextInput.Type;
export const MailPeopleContext = Schema.Struct({
  people: Schema.Array(MailPerson),
  work: Schema.Array(MailWork),
  connections: Schema.Array(MailConnection),
  discoveryAvailable: Schema.Boolean,
  truncated: Schema.Boolean,
  recent: Schema.Array(Schema.Struct({ personId: Id, evidence: MailEvidence })),
});
export const MailPersonReviewInput = Schema.Struct({
  id: Id,
  revision: NonNegativeInt,
  name: Label,
  state: Schema.Literals(["confirmed", "dismissed", "candidate"]),
});
export type MailPersonReviewInput = typeof MailPersonReviewInput.Type;
export const MailWorkSaveInput = Schema.Struct({
  id: Schema.optional(Id),
  personId: Id,
  revision: NonNegativeInt,
  title: Label,
  kind: Schema.Literals(["task", "feedback"]),
  state: MailWorkState,
  dueDate: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
  ref: MailMessageRef,
});
export type MailWorkSaveInput = typeof MailWorkSaveInput.Type;
export const MailConnectionReviewInput = Schema.Struct({
  id: Id,
  revision: NonNegativeInt,
  state: Schema.Literals(["confirmed", "dismissed", "suggested"]),
});
export type MailConnectionReviewInput = typeof MailConnectionReviewInput.Type;

/** Model output uses canonical IDs; evidence is checked against the supplied message. */
export const MailDiscoveryResult = Schema.Struct({
  work: Schema.Array(
    Schema.Struct({
      personId: Id,
      title: Label,
      kind: Schema.Literals(["task", "feedback"]),
      excerpt: Label,
    }),
  ).check(Schema.isMaxLength(12)),
  connections: Schema.Array(
    Schema.Struct({
      fromPersonId: Id,
      toPersonId: Id,
      type: Schema.Literals(["introduced", "mentioned", "escalated_to"]),
      excerpt: Label,
    }),
  ).check(Schema.isMaxLength(12)),
});
export type MailDiscoveryResult = typeof MailDiscoveryResult.Type;
