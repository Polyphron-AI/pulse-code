# Pulse Warden implementation ownership

Authority: [PRD](../prd/17-pulse-warden.md), [acceptance](../prd/20-acceptance-criteria/pulse-warden.md). Proposed paths are explicitly labeled; existing files are extension points, not Warden implementations.

| Owner                      | Existing/proposed module                                                     | Responsibility                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Pulse Go                   | Proposed `internal/warden`, existing crypto and RLS migration infrastructure | Tenant-scoped policies, grants, server key envelopes, bounded provider operations and audit                             |
| Vaultwarden                | Separately deployed selected human vault                                     | Client-encrypted item storage and sync; no assumed machine-grant API                                                    |
| Server                     | Existing `apps/server/src/integrations`, proposed `apps/server/src/warden`   | Reuse connection metadata/lifecycle; add authenticated grant consumer and cancellation                                  |
| Contracts                  | Proposed `packages/contracts/src/warden.ts`                                  | Secret-free binding/state/receipt schemas and additive capabilities                                                     |
| Shared client              | Proposed `packages/client-runtime/src/warden`                                | Status, supported actions and authority-qualified deep links                                                            |
| Desktop                    | Existing `apps/desktop/src/preview/BrowserSession.ts`, preview manager       | Explicit profile/account isolation and trusted non-recorded save/fill channel                                           |
| Automation                 | Existing `apps/server/src/mcp/PreviewAutomationBroker.ts`                    | Host/session routing plus tab/document/origin/account/operation binding; constrained mode requires additional isolation |
| Office mail                | Unmerged `.worktrees/pulse-mail` `MailEngine` / `MailSecretAccess`           | Replaceable credential binding, verified reference cutover and orphan cleanup                                           |
| Web/mobile                 | Existing settings/connections and native modules                             | Management/approval UI; native secret use negotiated separately from ordinary client transport                          |
| Extension/native providers | New standalone deliverables, package paths not yet chosen                    | Pulse-owned branding, signing/update identity, external autofill and native passkey operations                          |

The existing `ServerSecretStore` holds raw bytes with filesystem protection. Do not expose arbitrary names through new APIs or call it an encrypted vault. Machine bootstrap identity stays there under existing release constraints; customer delegation is resolved via Warden. OpenBao remains the orchestrator's distinct identity store.

## Cross-repository contract

Proposed logical contract version: `pulse-warden/v1`. Operations: requestUse, approveUse, executeUse, revokeUse, getUseStatus. Go is authority; Pulse is consumer. Requests bind authenticated tenant/principal/environment/runtime, credential, task/attempt, normalized action/resource, request ID and payload digest. Policy version, expiry and use budget bind approval. General results contain bounded allowed data and redacted receipt references. No raw-secret endpoint is exposed to agents.

Go acceptance must validate RLS and identity from authentication. Pulse acceptance must validate caller/attempt binding, cancellation, capability skew and all capture paths. Maintain a shared fixture set for replay, stale approval, changed payload, cross-tenant requests, concurrency and provider timeout. Stable IDs include the owning authority; numeric project IDs do not become cross-product identities.

Secret ingress and ephemeral runtime use bypass ordinary command/event persistence. Deciders handle secret-free lifecycle facts; queue-backed reactors perform allowed side effects and emit typed receipts. Persistent grant/idempotency state belongs to the authority. No event or retry queue stores a reusable token.

## Provider and connection decisions

Codex, Claude, Cursor, Grok and OpenCode each consume supported brokered tools or report unsupported. Provider subscription login remains provider-owned. Existing-manager handoff is not a delegation adapter. A local CLI bridge is optional until same-user worker access is demonstrably isolated; its session has broader authority than Pulse's selected-item filter.

Local/remote/tunnel clients authorize the selected environment. Personal browser state, provider-issued sessions and remote browser cookies are not interchangeable. Disconnect, lock, grant revoke and provider revoke are different operations with distinct outcomes. Receipt subscriptions are bounded; vault contents do not become globally broadcast client state.

## Commercial implementation gate

Before copying code, pin upstream revisions and audit source/assets/SDK/dependency licences. Separate processes do not automatically resolve all combined-work obligations. Build Pulse-owned clients or licence-compliant forks; exclude restricted commercial modules. Keep mandatory notices/source access and preserve upstream MIT notices for Pulse Code. Future native extension identity and domain associations need passkey/autofill tests after rebranding.

## Evidence still needed

Per-tenant encryption and grant implementation; pinned Bitwarden/Vaultwarden compatibility; recovery policy; optional CLI isolation; Electron/native provider support; mailbox superseded/orphan secret reconciliation; production key restore; licence-cleared component inventory. No endpoint state is changed to complete by this PRD update.

## MCP and CLI entry points

MCP toolkit/registry/invocation context owns session-scoped Warden tools. Go cmd/cli owns pulse-cli warden commands; both consume the same broker. [MCP/CLI contract](../prd/warden/mcp-cli.md) defines setup, schema, output and cancellation; no agent-callable approval or secret lookup.

**Created:** 2026-09-07 . **Last opened:** 2026-09-07 . **Last edited:** 2026-09-07 . **Status:** draft . **Owner:** Engineering

## September 10 implementation evidence

The [readiness packet](../prd/warden/readiness.md) supersedes the blanket not-built interpretation of this historical ownership map. Go internal/warden now has a merged primitive foundation; credential/workload/HTTP and Pulse infrastructure client code exist on separate branches. Reconcile them before adding modules or choosing migration numbers. Full Warden MCP/CLI and personal-vault/native capabilities remain incomplete.
