# Saved-query read binding v1

Status: validation and canonical serialization implemented and adopted by the opt-in [Grafana runtime](grafana-runtime.md). This document specifies the shared request binding; the runtime document records approval, policy, execution, MCP/CLI and migration behavior with its remaining release gates. See [MCP/CLI requirements](mcp-cli.md) and the [branch reconciliation](reconciliation-2026-09-10.md).

## Inputs and ownership

[Request schema](schemas/read-v1.schema.json) defines the seven required caller fields. Payload contains only queryRef and lookbackSeconds. Every field is required; omission, null and extra properties fail. References use `urn:pulse:<authority>:<kind>:<id>`, where authority and ID are 1-64 ASCII letters, digits, dots, underscores or hyphens. The kind is specific to its field. No Unicode normalization or case folding occurs. UUIDs are lowercase, non-nil UUID shapes with version 1-8 and RFC variant bits.

The [authority schema](schemas/read-authority-v1.schema.json) is an internal binding contract. The trusted runtime supplies tenant, principal, workload, environment, runtime and thread after authentication. The broker supplies the reviewed policy, credential and query versions and expiry. Never decode this object from an agent request. Valid syntax proves no ownership: runtime code must resolve every reference, bind task/attempt to the actual active turn and enforce selected authority, tenant, environment and current policy. A well-formed foreign reference changes the digest; only authorization can deny its use.

Lookback is 60-3600 seconds in whole-minute increments. Expiry is an integer Unix timestamp in seconds, between 1 and 253402300799. Checking whether expiry is in the future belongs to runtime authorization. Version and runtime identifiers use the same 1-64 ASCII token grammar; this grammar does not advertise provider support.

JSON numbers follow binary64 value semantics in both implementations. Equivalent numeric spellings such as 60, 60.0 and 6e1 produce the same value and digest. Decimal spellings rounded to an allowed binary64 integer normalize to that integer. Fractions that remain nonintegral, nonfinite values and values outside the range fail. All accepted integers are exactly representable.

## Canonical bytes and digest

Construct one JSON array in this exact order:

| Position | Value                                                                 |
| -------- | --------------------------------------------------------------------- |
| 0        | Literal `pulse-warden/read-v1`                                        |
| 1-6      | requestId, credentialRef, action, resource, taskRef, attemptRef       |
| 7-8      | payload.queryRef, payload.lookbackSeconds                             |
| 9-14     | tenantId, principalId, workloadId, environmentRef, runtime, threadRef |
| 15-18    | policyVersion, credentialVersion, queryVersion, expiresAt             |

Serialize the validated values as compact JSON with no whitespace or trailing newline. Integer numbers use base-10 integer notation. Encode as UTF-8 without a byte-order mark; SHA-256 produces a lowercase 64-character hexadecimal digest. The ASCII grammar removes Unicode and JSON escaping ambiguities. Object insertion order is irrelevant because the canonical representation is an ordered array. This is a versioned Warden encoding, not a general JSON canonicalization algorithm.

Request ID and all identity/version/expiry fields are bound. The digest is neither a signature nor a bearer credential. Execute must compare against the persisted server-computed binding and recheck current authorization. Retries reuse the original expiry and digest; they cannot extend a grant by recomputing expiry. Changes to grammar, field meaning, order or normalization require a new binding version and reviewed fixtures.

## Implementations and transport boundary

Pulse exports WardenReadRequest, WardenReadAuthority, decodeWardenReadRequest and canonicalWardenReadBinding from its contracts package. Hashing remains in the consuming runtime so contracts stay usable by web and mobile. Use the sanitized decoding wrapper at public boundaries; raw schema diagnostics can contain submitted values.

Go exposes ParseReadRequest, CanonicalReadRequest and ReadRequestDigest in internal/warden. ParseReadRequest accepts at most 8192 bytes of UTF-8 JSON, rejects duplicate or incorrectly cased keys and trailing data, and returns a generic error without submitted data. Canonical serialization revalidates both Go structs, so direct construction cannot bypass the grammar.

The TypeScript API accepts decoded values, not raw JSON text. Future HTTP/MCP adapters must enforce body limits and reject duplicate keys before ordinary JSON parsing loses that information. Neither implementation is wired into an active broker handler in this increment. The request's attemptRef is still untrusted until an adapter compares it with a trusted turn identity.

## Reproducible checks

[Shared fixtures](fixtures/read-v1.json) contain 19 independently hashed bindings and 40 rejected request values. Positive variants change every mutable request field and every authority field. Negative cases cover injected identity, raw token and expression fields, unknown properties, missing/null required fields, primitive roots, wrong reference kinds, Unicode, invalid UUIDs and invalid time values. Authority mutation means a different binding, not a policy decision.

Run the repository's focused Go or TypeScript contract test. Independently install jsonschema==4.23.0 into an isolated Python tooling environment and run `python prd/warden/validate-read-v1.py`. The script checks both Draft 2020-12 schemas, acceptance/rejection and Python-derived canonical bytes/digests. Both repositories must carry byte-identical schemas, fixtures, validator and this document.

Allow/deny/pending decisions, status and receipt envelopes, authorization changes, concurrent redemption and UI/CLI/MCP parity still need broker and adapter fixtures. This increment does not complete the broader task T3 or the end-to-end release gate.
