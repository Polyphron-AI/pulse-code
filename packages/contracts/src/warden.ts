import { Schema } from "effect";

export const WARDEN_READ_BINDING_VERSION = "pulse-warden/read-v1";
const uuid = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![\s\S])/,
  ),
);
const token = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._-]{1,64}(?![\s\S])/));
const reference = (kind: string) =>
  Schema.String.check(
    Schema.isPattern(
      new RegExp(`^urn:pulse:[A-Za-z0-9._-]{1,64}:${kind}:[A-Za-z0-9._-]{1,64}(?![\\s\\S])`),
    ),
  );
const strict = { parseOptions: { onExcessProperty: "error" as const } };

/** Metadata only. Resolvers must authenticate and authorize every reference. */
export const WardenReadRequest = Schema.Struct({
  requestId: uuid,
  credentialRef: reference("credential"),
  action: Schema.Literal("grafana.saved_query.read"),
  resource: reference("resource"),
  taskRef: reference("task"),
  attemptRef: reference("attempt"),
  payload: Schema.Struct({
    queryRef: reference("query"),
    lookbackSeconds: Schema.Int.check(
      Schema.isBetween({ minimum: 60, maximum: 3600 }),
      Schema.isMultipleOf(60),
    ),
  }).annotate(strict),
}).annotate(strict);
export type WardenReadRequest = typeof WardenReadRequest.Type;

/** Supplied by the authenticated runtime and broker, never by the agent payload. */
export const WardenReadAuthority = Schema.Struct({
  tenantId: uuid,
  principalId: uuid,
  workloadId: uuid,
  environmentRef: reference("environment"),
  runtime: token,
  threadRef: reference("thread"),
  policyVersion: token,
  credentialVersion: token,
  queryVersion: token,
  expiresAt: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 253402300799 })),
}).annotate(strict);
export type WardenReadAuthority = typeof WardenReadAuthority.Type;

const decodeRequest = Schema.decodeUnknownSync(WardenReadRequest);
const decodeAuthority = Schema.decodeUnknownSync(WardenReadAuthority);

/** Keeps submitted values out of public validation errors. */
export function decodeWardenReadRequest(input: unknown): WardenReadRequest {
  try {
    return decodeRequest(input);
  } catch {
    throw new Error("Invalid Warden read request");
  }
}

/** UTF-8 encode this string and hash with SHA-256 outside the contracts package. */
export function canonicalWardenReadBinding(requestInput: unknown, authorityInput: unknown): string {
  const request = decodeWardenReadRequest(requestInput);
  let authority: WardenReadAuthority;
  try {
    authority = decodeAuthority(authorityInput);
  } catch {
    throw new Error("Invalid Warden read authority");
  }
  return JSON.stringify([
    WARDEN_READ_BINDING_VERSION,
    request.requestId,
    request.credentialRef,
    request.action,
    request.resource,
    request.taskRef,
    request.attemptRef,
    request.payload.queryRef,
    request.payload.lookbackSeconds,
    authority.tenantId,
    authority.principalId,
    authority.workloadId,
    authority.environmentRef,
    authority.runtime,
    authority.threadRef,
    authority.policyVersion,
    authority.credentialVersion,
    authority.queryVersion,
    authority.expiresAt,
  ]);
}
