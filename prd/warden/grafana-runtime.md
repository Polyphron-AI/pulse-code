# Grafana-first Warden runtime integration

Status: opt-in developer integration; synthetic proof under review. This implements the first saved-query read across Pulse Code/Office's server, Pulse MCP, the Go CLI and Go Warden. It does not enable a deployment, connect a live vault, or complete browser password/passkey support.

## Implemented path

| Concern               | Implementation                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Historical migrations | Preserved SQL plus an explicit loader overlay reconciles fresh, integration32, project32, Warden32 and deployed37 histories; unsupported shapes fail; ambiguous rollback refuses before mutation.                                                            |
| Trusted turn          | Pulse creates an attempt before provider sendTurn and aborts it on replacement, completion, cancellation or session revocation. Warden is a separate default-disabled permission, rechecked at every call.                                                   |
| Bound request         | Closed saved-query metadata binds credential/resource/query/task/attempt, trusted identity, reviewed versions and original expiry into the shared digest. Replayed request IDs retain the original use; changed bindings fail.                               |
| Approval              | A separate mTLS operator reviews the persisted request/authority, then approves or denies its exact digest. Actual principal and decision time are recorded atomically. No agent tool approves itself.                                                       |
| Execution             | The broker rechecks current authority and versions, commits one reservation before credential/provider I/O, and persists terminal outcome. A repeated execution returns metadata rather than repeating Grafana.                                              |
| Pulse and MCP         | The existing infrastructure client uses protected mTLS, bounded output and explicit request/execute/status/revoke/receipts tools. Every follow-up is bound to the original resource; a different catalog target cannot resume the use.                       |
| CLI                   | pulse-cli warden calls Pulse MCP with a separate Warden-only session token delivered through a protected file. Commands cover capabilities, request, execute, status, revoke, receipts and MCP config/doctor/stdio. Missing context returns action-required. |
| Client control        | Settings > Integrations has a searchable, reversible Warden switch with individual reset and restore-default support. Tool results flow through existing thread history on web, desktop and mobile.                                                          |

A configured saved query is not permission by itself. The broker owns current policy and credential custody; Pulse adds its selected environment/target/thread checks. Enrollment and policy checks precede reservation in separate database transactions; changes between those steps are not atomically excluded. The workload certificate is a trust boundary for the Pulse environment's attempt assertion, not an independent hardware or process attestation.

## Lifecycle and recovery

Pending approval is a valid business result. Request and execute return pending_approval with CLI exit 3; status returns a valid pending record with exit 0. Invalid credentials and mismatched digest/scope remain authorization failures. Approval does not execute the read.

Status and receipts use the same resource/attempt binding as execute. While the turn remains active, reconnect and query status before retrying. After the turn ends, the operator review endpoint is the reconciliation path. A terminal execution outcome survives revocation or expiry; those events cannot imply that a provider call was undone. A lost response does not justify creating a replacement request automatically.

Known pending uses receive bounded best-effort revocation when their attempt ends. An unknown response without a use reference still needs operator reconciliation by request ID; cleanup failure is not proof of cancellation. There is no automatic recovery that resets a reserved use to ready. A crash after reservation or failed terminal persistence can leave status executing indefinitely. Operators must reconcile that outcome; a replacement read needs a new explicit decision.

## Custody and provider scope

The protected Pulse server holds the broker workload certificate; its independent operator certificate stays outside agent/CLI handoff. CLI files contain only a provider-scoped Warden token and Pulse endpoint, use restrictive file modes and are removed on session cleanup. Windows parent-directory ACL verification remains an operator prerequisite.

Codex, Claude, Cursor, Grok and locally managed OpenCode receive a path-only CLI handoff. External OpenCode is unsupported for this local handoff. Reused provider processes share one session identity: a delayed call from that same process cannot be distinguished from a call during its current trusted turn. Do not claim per-process isolation between turns.

The first operation is Loki over an operator-owned dev/prod saved query and a 1-60 minute window. Metrics, tracing, arbitrary query expressions and writes are outside this operation. Application logs may contain sensitive data even after credential redaction; live saved-query/data classification must be approved separately.

## Evidence and remaining gates

Focused tests cover canonical request/digest behavior, mTLS, wrong tenant/workload/resource/attempt, changed membership/enrollment/credential, pending/deny/expiry/revoke, concurrent duplicate requests, atomic audit rollback and non-replay. The connected cross-repository test runs the real Pulse MCP toolkit and HTTP transport, Go CLI SDK, native mTLS client, Go broker and synthetic Grafana; it independently recomputes the operator-review digest and counts provider effects.

The migration matrix and runtime RLS/reservation proof require a disposable PostgreSQL environment explicitly. A skipped test is not evidence. The cross-repository test similarly requires explicit Go repository/toolchain paths. See each repository's focused tests and PR evidence for the exact commands and outcomes at the reviewed commit.

Release gates remain: browser screenshot verification, live five-provider setup/discovery/cancel/reconnect, remote/tunnel and multi-device proof, Windows ACL review, independent restore/key-recovery exercise and an explicitly scoped live Grafana read. CLI config currently previews registration; it does not install provider settings. General standalone-user device bootstrap, use-wait notifications and a dedicated human approval UI are follow-up capabilities, not supplied by the provider-session CLI handoff.

Vaultwarden/Bitwarden manager delegation, Pulse-managed password storage, browser autofill and native passkeys keep their separate feasibility and implementation gates. Beat/GitHub remains the separately gated follow-up chosen by the owner.
