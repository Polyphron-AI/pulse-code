# Pulse Warden acceptance criteria

Status: specified, not executed. Every scenario maps to [WAR requirements](../17-pulse-warden.md#functional-requirements). Use synthetic credentials, isolated state and allowlisted test destinations.

| Scenario | Given / when / then |
| --- | --- |
| AC-WAR-01 | Given a credential linked from Settings, task and department, when any entry opens it, then the same owning Warden detail/grants/receipts appear with no duplicate local detail authority. |
| AC-WAR-02 | Given a saved manager origin without an authenticated probe, when viewing status, then it is configured/unverified, not authenticated or unlocked; custody and owner are shown. |
| AC-WAR-03 | Given an installed manager, when the user selects a supported browser handoff, then the selected origin/client handles unlock/save/fill and no master password/session key reaches Pulse Go or chat. |
| AC-WAR-04 | Given a launched browser, when Pulse receives no verifiable completion, then it records handoff only; a user's completion report remains attributed and does not fabricate a credential audit event. |
| AC-WAR-05 | Given an old client or unproved manager capability, when delegation/fill is requested, then it returns unsupported with recovery guidance while status and unrelated connections remain usable. |
| AC-WAR-06 | Given identical email/project names across two tenants, when a consumer submits another tenant/environment reference, then authentication-bound membership rejects access without item enumeration. |
| AC-WAR-07 | Given a grant ID obtained from history, when a different runtime redeems it, then the authority rejects it; the owning runtime can request only its allowed action/resource. |
| AC-WAR-08 | Given an approved operation, when action/resource/payload/policy version changes or two consumers race its one-use budget, then stale use is denied and at most one reservation succeeds. |
| AC-WAR-09 | Given a canary secret, when connect/use/fail/export/checkpoint paths execute, then it is absent from logs, WebSocket metadata, task/event storage, model context and error outputs. |
| AC-WAR-10 | Given an active grant and upstream session, when cancellation/revoke commits, then new broker use fails and provider revocation is shown as pending/completed/unavailable accurately; retries preserve receipt correlation. |
| AC-WAR-11 | Given a synthetic CLI bridge profile, when an agent tries generic get/export, session inspection, host-file access, replay or cross-device use, then protected mode blocks each path; failed isolation prevents that capability from being advertised. |
| AC-WAR-12 | Given existing mailbox credentials, when migration succeeds, fails before reference cutover, or fails after a new secret is created, then account usability and references remain consistent and only verified superseded/orphan credentials are cleaned up. Send permission remains distinct from read. |
| AC-WAR-13 | Given an unlocked vault, when an item is generated/updated/deleted/restored/imported/exported, then ownership, duplicate preview, declared retention and explicit plaintext-export confirmation hold. A locked vault never reveals/copies values. |
| AC-WAR-14 | Given an approved fill, when the tab navigates or an untrusted iframe requests the same item, then fill is rejected; valid fill uses the selected account and never auto-submits. Never-save suppresses future save prompts for that site. |
| AC-WAR-15 | Given personal and delegated profiles, when a delegated run ends, then its configured cleanup occurs without deleting personal state; external browser cookies are not silently imported into the remote environment. |
| AC-WAR-16 | Given Pulse passkey registration/authentication, when challenge is replayed, RP/origin is wrong or required user verification is missing, then authentication fails; legitimate registration, removal and account recovery preserve access rules. |
| AC-WAR-17 | Given each supported native credential provider, when a site/app creates or uses a passkey, then RP/app association and user verification are enforced, cancellation is respected and production builds contain no virtual test authenticator. |
| AC-WAR-18 | Given a stored third-party passkey, when deleting it, then Pulse distinguishes local deletion from site unregister and exposes recovery implications; unsupported transfer is not reported as migrated. |
| AC-WAR-19 | Given two devices, concurrent encrypted edits and a backup, when lock, conflict, lost-device recovery and restore occur, then the declared custody policy holds, conflicts are not silently overwritten and server account reset alone cannot decrypt a user vault. |
| AC-WAR-20 | Given a removed member/offline device, when sync/recovery resumes, then it receives no new keys or grants; earlier copies are not described as erased, and required reusable credential rotation is visible. |
| AC-WAR-21 | Given a scheduled occurrence and uncertain provider write response, when retried, then a fresh eligible grant and reconciliation/idempotency avoid blind duplicate effects; a locked personal vault does not enable unattended work. |
| AC-WAR-22 | Given password-only approval, when TOTP/recovery-code use is attempted, then separate authorization is required and recovery material stays out of outputs. |
| AC-WAR-23 | Given a pinned commercial release candidate, when inspecting source/dependency inventory and emitted packages, then restricted modules/assets are excluded, required source/notices exist, and Pulse-owned IDs/signing/update links are used without relabeling copyleft code MIT. |
| AC-WAR-24 | Given large vault metadata/history and recording enabled, when browsing, syncing and signing in, then scoped pages/deltas stay within measured budgets and no decrypted vault payload reaches broad subscriptions, traces or recordings. |

## Cross-product contract fixtures

Run the same `pulse-warden/v1` binding fixtures against Go authority and Pulse consumer adapters: wrong tenant, wrong principal, wrong environment, request change, stale policy, expired/revoked grant, concurrent budget use, cancelled attempt, reconnect, provider timeout and uncertain write. These fixtures must agree on normalized operations, idempotency and redacted outcomes. A schema-only passing test is insufficient.

## Required evidence per release

- W1: exact Bitwarden and Vaultwarden client/server/browser versions; handoff/lock/cancel evidence, clearly separate from delegated use.
- W2/W3: focused Go RLS/key/grant tests and Pulse integration/mail lifecycle tests; typed receipt/cancellation proof; restore and orphan cleanup fixtures.
- W4: custody/recovery decision, origin/frame/navigation tests, encrypted-sync/restore evidence and captured-output canary checks.
- W5: Apple/Android native registration/assertion/cancel and Pulse relying-party tests; explicit unavailable matrix for other platforms.
- W6: restricted worker bypass tests, scheduled-write reconciliation, membership rotation, commercial licence/source/branding artifact inventory.

Entry points: Warden, Settings/Connections, relevant task/context links, command palette/keybindings if present. Clients: web, desktop, mobile, external extension and native providers according to negotiated capabilities. Providers: Codex, Claude, Cursor, Grok and OpenCode each get supported or unsupported conformance evidence. Modes: local, remote/relay, tunnel, multiple devices/environments and headless server operations.

## MCP and CLI acceptance

**ID:** AC-WAR-25 · **Requirements:** WAR-25

Given a scoped MCP session, when tools are listed/called with invalid schemas, foreign refs or self-approval attempts, then only authorized metadata/operations are exposed and invalid requests fail without secret leakage.

**ID:** AC-WAR-26 · **Requirements:** WAR-26

Given each supported provider and pinned transport, when configuration is previewed/applied/removed and doctor/discovery runs, then unrelated configuration survives, credentials stay protected and unsupported transport/auth is explicit.

**ID:** AC-WAR-27 · **Requirements:** WAR-27

Given two environments and the Pulse CLI, when context is absent, conflicting or explicitly selected, then ambiguous use fails and a valid command binds the selected authority/attempt without changing other CLI commands.

**ID:** AC-WAR-28 · **Requirements:** WAR-28

Given noninteractive execution, when approval/unlock is pending, a wait times out or an error occurs, then documented exit/reason and valid JSON/JSONL are produced promptly; no prompt, secret flag, token output or automatic approval is used.

**ID:** AC-WAR-29 · **Requirements:** WAR-29

Given one authorized immutable use through UI, CLI and MCP, when it is replayed/cancelled/reconnected or a provider write outcome is unknown, then at most the allowed effect occurs and all interfaces resolve consistent receipts; agents cannot use human approval credentials.

**ID:** AC-WAR-30 · **Requirements:** WAR-30

Given shared operation fixtures and each supported provider setup, when conformance runs, then normalized decisions/digests/effect counts agree across UI/CLI/MCP and all canary secrets remain absent from outputs, events and diagnostics.

Run through the public CLI/MCP/UI interfaces using the [shared contract](../warden/mcp-cli.md), not by calling the policy evaluator alone. Evidence must identify provider/client/protocol versions and skipped platforms.

**Created:** 2026-09-07 . **Last opened:** 2026-09-09 . **Last edited:** 2026-09-09 . **Status:** draft . **Owner:** Engineering / QA
