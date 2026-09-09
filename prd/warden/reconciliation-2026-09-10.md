# Warden branch reconciliation, 10 September 2026

The branch audit identified reusable code and two blockers to direct runtime adoption. No database or deployment was changed during this audit. Baselines below are inspected commits, not claims about the current deployed revision.

## Pulse Go

The inspected main is `4ed85bf936f1ac915af37f4963e6a92ef625dc79` (foundation PR 66). It contains envelope encryption, grants, the saved-query Grafana reader and broker primitives. The local infrastructure branch reaches `4a7748887d92abb27e236652ac69f546b48daf6a`; the inspected remote feature branch is only `5bef935`. Local commits 8c994bf, c0e301c and 4a77488 therefore need explicit adoption review rather than assuming the remote branch contains them.

The reusable 8c994bf implementation adds immutable credential storage, verified mTLS enrollment, tenant/principal/project/thread/query scoping, separate operator roles, HTTP, audit and cmd/warden. Retain those boundaries and extend the existing use store.

**Migration blocker:** main contains both 000032_integration_connections and 000032_warden_uses. The infrastructure branch uses 000032_project_file_versions, 000033_reconcile_main_develop and Warden migrations 34-37. Its 32/33 sequence follows the develop reconciliation at `0ef28467a6697c051efa11bb56efb70430bbebe1`. Migration 34 creates warden_uses unconditionally, so that sequence is not a demonstrated upgrade for a database which already applied Warden as migration 32.

Do not blindly cherry-pick that migration chain, rename an applied migration, delete migration records, or run a down migration. Before selecting any new migration number, capture the applied version/checksum/table inventory for each supported deployment history and prove fresh install plus integration-32, project-version-32/33 and Warden-32 upgrades on disposable PostgreSQL. Restore and app-role RLS evidence must accompany the chosen reconciliation.

A local saved report at `F:/Dev Ops/tmp/warden-full-migration-evidence/result.json` reports a fresh disposable PostgreSQL 18 chain to version 37 on 9 September, with an app role lacking superuser/BYPASSRLS and forced RLS on five tables. This audit did not repeat that database test. A fresh-chain report does not establish compatibility with all applied histories, and branch deployment notes do not prove the current deployed state.

The branch HTTP request accepts requestId, threadId, attemptId, queryId and lookbackMinutes; execute accepts thread/attempt. It still needs the new binding digest, qualified references, current-policy checks, trusted attempt exchange, persisted actual approver provenance, denial/metadata/receipt endpoints and status mapping. Audit write/effect ordering also needs transaction and failure tests. The existing CLI has no Warden commands or MCP host.

## Pulse Code and Office

The inspected develop is `699181cb9288fbdeeb4e9f98933ada77c43ade05`. Infrastructure feature `0ca7151b101a88f45eb2cd9cc1ae7892b31386e1` and preview `08087447775db3a6d9a41531d2fc697fef4e500f` contain equivalent Warden changes: feature commits 2e5ce622e/0ca7151b appear in preview as 922c1db20/13e8fbee3. They were not in the inspected develop. Adopt the relevant infrastructure changes without importing unrelated preview Office, Talk and download work.

Reuse apps/server/src/infrastructure/WardenBroker.ts: verified HTTPS mTLS, redirects disabled, bounded one-MiB responses, timeout/cancellation, sanitized references and no automatic execute retries. Reuse the operator-owned v2 catalog's absolute certificate/key/CA references and selected environment/thread/query bounds. Keep tokenEnv fallback removed; file ACL/custody remains an operational proof, not something the catalog parser enforces.

**Turn-identity blocker:** brokerAttemptId hashes environment, provider instance, provider session and credential issuance time. That is a provider-session identity, not an actual turn attempt. McpInvocationScope currently carries preview capability, and ProviderService.prepareMcpSession issues built-in credentials only through enableAgentBrowserAccess. Infrastructure handlers do not require a Warden-specific capability. Do not relabel the session hash as an attempt or take an agent-supplied attempt as trusted.

Derive a trusted attempt across the provider sendTurn lifecycle, including the interval before an adapter supplies its turn ID. Bind it into invocation context and revoke/reconcile it on completion, cancellation and disconnect. Add Warden capability issuance and checks independently of browser/preview access, and make an explicit support decision for Codex, Claude, Cursor, Grok and OpenCode.

The existing query toolkit generates a fresh request UUID on each invocation and treats pending approval as unavailable. It needs a resumable use reference, persisted original request/digest/expiry, status and receipt handling, plus truthful idempotency annotations. Reuse its HTTP client and toolkit registration instead of introducing parallel infrastructure clients or reviving the test-only legacy Grafana MCP implementation.

## Safe integration order

1. Land the shared [request binding contract](read-v1.md) without runtime or migration side effects.
2. Resolve the Go migration matrix and adopt the reusable runtime branch under focused PostgreSQL upgrade/RLS tests.
3. Establish trusted Pulse turn identity and Warden capability issuance/checks before exposing use execution to agents.
4. Add immutable approval provenance, current-policy validation, status/receipt semantics and narrow CLI identity bootstrap.
5. Wire Pulse, CLI and MCP to the same broker; prove allow, deny, pending/resume, wrong attempt, replay, expiry/revoke and unknown outcomes with synthetic Grafana data.

T1 and T2 now have audit findings and explicit adoption prerequisites. The request-contract increment addresses part of T3; policy/status response fixtures and the remaining runtime tasks are still open. Beat/GitHub, browser password storage, Vaultwarden delegation and native passkeys retain their separate gates.
