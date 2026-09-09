# Warden first read implementation design

Status: proposed engineering contract, 10 September 2026. This refines [MCP/CLI requirements](mcp-cli.md). D1 in the [decision register](decisions.md) determines first live provider; examples below use the existing Grafana read. They do not clear Beat's GitHub gate.

## One authority, three callers

A trusted Pulse environment derives thread/attempt/provider identity, calls the owning Go broker, and exposes bounded results through its MCP toolkit and client runtime. The CLI is another narrow caller. The human approval client uses a separate management identity. Browser return, TTY presence, a model-supplied principal or a grant reference establishes no authority.

Reuse the branch implementation of cmd/warden and internal/warden after review. The service boundary is separate from the normal API request transaction because GrantStore rejects ambient transactions. A reservation must commit before any provider request; no provider I/O occurs inside a tenant database transaction. Existing app-plane JWT/PAT/OAuth handlers remain unchanged until a scoped Warden exchange is designed and tested.

## Public request and identity contract

Proposed logical request input has only requestId, credentialRef, action, resource, taskRef, attemptRef and an operation-specific payload. For grafana.saved_query.read, payload is {queryRef, lookbackSeconds}; an operator-owned mapping fixes endpoint, datasource, environment selector and credential version. No URL, LogQL, token, tenant, principal, policy version, ready flag or approver can be supplied by an agent. Closed JSON schemas reject additional properties, overlong strings and fractional/out-of-range lookback.

All refs are opaque and authority-qualified. Verify task/attempt against the active authenticated Pulse invocation and approved workload, not merely the shape of an ID. Proposed string bound is 200 characters per identifier, UUID request IDs for new clients, lookback 60-3600 seconds in whole-minute increments for the branch HTTP adapter. More permissive internal primitive bounds do not widen the public contract.

The server computes SHA-256 over a canonical, versioned binding containing authenticated tenant/principal/workload/environment/runtime, thread/attempt, action/resource/query definition, credential/policy versions, lookback and approval expiry. Define canonical UTF-8 JSON and integer time units in one golden fixture set. Do not accept a caller digest as the canonical value. Execute requires the exact returned digest; a reused request ID with changed binding fails. Retries reuse the persisted original expiry and digest; they never recompute a new expiry to extend authority. Request deduplication uses the existing tenant/request unique key and additionally checks authenticated principal and all immutable fields.

Workload authentication reuses verified mTLS with pinned certificate fingerprint and stored immutable enrollment. Operator management certificates are separate and never passed into worker sessions. Rotation creates a new enrollment and revokes the old. For ordinary CLI users, existing login/device auth is only bootstrap: it must exchange through a narrow, authenticated environment service for an attempt-bound Warden identity. That exchange is not implemented at the baseline. Until proven, headless config/doctor reports action-required; no broad operator certificate is installed in a CLI profile. Stdio launch inherits only approved non-secret config and the dedicated protected workload identity channel.

## Adapter and state mapping

The branch service uses /v1/uses and useId. The PRD proposes /api/v1/warden and useRef. Keep the branch transport behind one adapter; do not advertise both as independent authorization APIs. Publish only the chosen version after conformance. Missing digest/metadata/receipts operations are explicit additions, not fields inferred from an unrelated response.

| Internal condition                       | Public execution state                        | Other metadata                                                    |
| ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| pending and usable                       | pending_approval                              | safe human approval reference                                     |
| ready and usable                         | ready                                         | normalized digest and effective expiry                            |
| running                                  | executing                                     | reservation committed, replay prohibited                          |
| succeeded or failed                      | same terminal state                           | durable receipt reference                                         |
| outcome_unknown or abandoned running use | outcome_unknown after reconciliation decision | never automatically reset to ready                                |
| revoked before reservation               | revoked                                       | authorization revoked                                             |
| expired before reservation               | expired                                       | authorization expired                                             |
| revoked/expired after reservation        | retain executing/terminal/unknown outcome     | authorization revoked/expired; do not imply provider cancellation |

Revocation before reservation takes precedence over expiry. Neither overrides a recorded terminal execution outcome. HTTP loss/cancel triggers best-effort attempt revoke and bounded status reconciliation. Keep request and receipt correlations even when output was lost. Replay does not reexecute and does not reconstruct a lost log body; return terminal metadata with resultUnavailable instead.

## Persistence and transaction plan

| Existing/candidate store                | Reuse and required review                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| warden_uses                             | Reuse as grant/use store. Add normalized digest and approval provenance only through a reviewed additive migration; no second warden_grants table |
| Branch tenant-key and credential tables | Reuse envelope versioning and same-tenant constraints after branch review; dedicated authenticated non-recorded secret ingress                    |
| Branch workload table                   | Reuse immutable enrollment, certificate pin, permitted thread/query and version fields; no implicit tenant mapping                                |
| Branch audit table                      | Extend allowlisted denial, approval, policy and terminal events with cursor pagination; never persist log content or secret-bearing headers       |
| Query definitions                       | Operator-owned immutable version/hash; not user-submitted executable expressions                                                                  |

Main has 000032_warden_uses. The infrastructure branch reconciles prior schema history and numbers Warden migrations 34-37. T1 must inspect both base/deployment migration histories and establish one compatible chain before selecting any next migration number. Never rename an applied migration or apply a down migration to resolve a numbering collision. Planning does not touch a live database.

Authorization checks current enrollment, membership, project/resource, policy and credential/query versions immediately before reservation, then checks cancellation/revocation before credential access. Use fresh tenant transactions with app-role RLS. A process crash after committed reservation remains non-replayable. Invalidated policies prevent the next execution; an in-flight read can finish and retains a truthful outcome. Root keys remain outside the database, protected by operator custody; tenant envelopes do not protect against a compromised privileged broker.

## Minimal API additions

- capabilities and credential metadata: selected caller visibility, default page 50/max100, no global inventory.
- request/execute/status/revoke: versioned envelopes, immutable digest, authority-qualified refs and normalized status/error mapping.
- approve/deny: separate trusted human context, reviewed request digest and durable approver provenance.
- receipts list: allowlisted metadata with deterministic cursor, query authorization on every call.
- config/doctor: preview/apply/remove with stable entry ownership and recovery; no tokens in files/argv/URLs.

A successful status query of a pending request returns CLI exit0; an execute blocked on approval returns3. Preserve existing CLI exit meanings and use the shared proposed Warden-only mapping. MCP protocol errors remain separate from valid pending business state and denied execution. Go SDK v1.7.0 is the inspected baseline; pin negotiated protocol/SDK and each provider's actual transport support at implementation.

## Test and release boundary

First fixtures exercise request/approve/execute/status/revoke over HTTP, then the same behavior through CLI and Pulse MCP, using synthetic credentials and a TLS provider fixture. Assert denied/expired/revoked/changed-digest/replayed/cross-tenant/cross-environment/wrong-attempt/unknown outcomes, concurrent redemption and absence of canaries. Test canonical hashes across Go and TypeScript. Run real PostgreSQL RLS and independent connection/process reservation tests before enabling a workload.

Client proof covers Settings and task entry points, command palette/keybinding decision, web/local web/desktop/mobile status and approval, local/remote/tunnel environments and all five provider adapters. Unsupported capabilities stay visible with recovery. No full UI, Office migration, password/passkey or production-read completion is inferred from this first contract proof.

## Provider result sensitivity

Grafana log content may itself contain sensitive application data. Credential redaction does not prove arbitrary logs are secret-free. The first fixture uses synthetic log data; before live agent access, approve the saved query and data classification, define permitted output fields/redaction and test canaries in provider responses. Do not claim protection against all unknown secrets from a token replacement filter.
