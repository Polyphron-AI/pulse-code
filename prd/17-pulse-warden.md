# Pulse Warden: passwords, passkeys and delegated access

Status: draft detailed specification based on confirmed product direction, 2026-09-07. The full capability remains planned. The [September 10 readiness packet](warden/readiness.md) records the merged Go foundation and unmerged integration work; this PRD is not release approval or proof of security.

Change record: [Warden CR](change-requests/CR-2026-09-07-pulse-warden.md). [Acceptance criteria](20-acceptance-criteria/pulse-warden.md), [surfaces](../sitemap/pulse-warden.md), [workflows](../workflows/pulse-warden.md), [ownership](../tool-flow/pulse-warden.md).

## Problem and outcome

Users need website sign-in, operational connections and agent access without copying reusable secrets between browsers, environments and task histories. Today Pulse's environment secret files and browser sessions do not provide a personal vault, delegated grants, passkey management or shared recovery.

Pulse Warden must show what a credential can access, who may use it, what is using it, and how to stop future use. People retain familiar password-manager workflows while Pulse gains its own commercially distributable clients over time.

| User               | Job                                           | Completion evidence                                                    |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| Individual         | Save, find and use a password or passkey      | Correct account on the correct origin, with storage authority visible  |
| Office operator    | Connect mail/calendar/CRM for permitted work  | Healthy credential binding and separately scoped actions               |
| Coding user        | Let an agent perform one authorised operation | Bounded result, receipt and ended access                               |
| Organisation admin | Govern shared credentials and devices         | Membership, use history, rotation and revocation state                 |
| Remote/mobile user | Approve use on the intended environment       | Exact environment/device/action binding; no accidental local operation |

## Confirmed direction and proposed detail

- Support both existing managers and Pulse-managed passwords/native passkeys. Existing-manager integration comes first.
- Bitwarden / Vaultwarden is the first integration target. Verify client and delegation paths separately.
- Full Pulse product branding and commercial use are required long term. Preserve required legal notices and applicable source obligations.
- The instruction to update the PRD authorises this specification work. Recovery choices, platform support and detailed rollout remain proposed release gates.

The August 30 Pulse Go Warden map established one broker and one management interface. This specification extends its scope to human vaults and trusted credential clients; it does not claim its read-only Beat proof or related CR was approved or delivered. Pulse Vault is the historical name.

## Ownership and scope

| Domain                              | Authority                                                                | What crosses the boundary                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Human vault using Vaultwarden       | Selected vault service plus trusted, user-unlocked clients               | Encrypted sync; selected credentials only within trusted credential use                                         |
| Server-managed customer integration | Pulse Go Warden, tenant-scoped                                           | Authenticated capability requests and bounded results; exceptional short-lived leases only to isolated runtimes |
| Task/run and browser execution      | Pulse Code/Office owning environment                                     | Task/attempt references, cancellation, host/document binding and receipts                                       |
| Existing external manager           | Its own clients and storage                                              | Explicit handoff initially; additional operations only after proof                                              |
| Machine bootstrap identities        | Existing environment store; orchestrator's OpenBao role remains separate | No customer-vault copies or personal-vault master unlock keys                                                   |

Pulse Go's corresponding authority is `prd/29-pulse-warden.md` in the separate `pulse-go` repository. Both PRDs use the same shared contract version, `pulse-warden/v1`, as a proposed design identifier, not a shipped wire protocol.

Existing [integration requirements](10-pulse-integrations.md) continue to govern integration secrets. The trusted user-unlocked client boundary here is a new credential class, not permission for ordinary web renderers or agents to retrieve integration secrets. Existing [distribution boundaries](11-product-line-and-distribution-boundary.md) remain intact: Warden's future extension/native-provider deliverables do not rename or fork official T3 clients.

### Storage modes

User-unlocked items support interactive password/passkey use and encrypted sync. Server-managed credentials support expressly delegated unattended work and are not zero-knowledge storage. Externally managed items retain their original authority. Switching modes requires an explicit reviewed transfer; never silently make a personal item decryptable by the server.

The selected Vaultwarden human backend supplies its own encrypted storage/sync. Do not duplicate its items in Pulse Go. The Go broker continues to govern machine capabilities; Vaultwarden is not a replacement for its grant model or Bitwarden Secrets Manager.

### Non-goals

- Rewriting cryptography, cloning proprietary Bitwarden modules or removing licence notices.
- Treating ordinary CLI vault unlock as a provider-issued, single-item grant.
- Automatic login submission, personal vault export, cookie transfer, or unattended use inferred from connecting a manager.
- Universal passkey portability, stock extension compatibility in Electron, or protection from a same-user unrestricted agent without a demonstrated isolation boundary.
- Mandatory hosted signup for existing local Pulse Code connections, automatic tenant mapping by email, or expansion of Scheduled Chats authority.
- Replacing third-party identity/role administration, bypassing user verification, or implementing all providers in the first release.

## Functional requirements

Each requirement has a matching `AC-WAR-NN` scenario. Go-owned operations have complementary `WG-*` requirements in its §29; the ownership document records the common contract.

| ID     | Requirement                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAR-01 | Present one Warden management hierarchy: summary, credential, grants and receipts. Connections, tasks and departments link into it; do not create competing detail records.                                                                             |
| WAR-02 | Show storage mode, owner, tenant where applicable, environment/device and supported capabilities. Configured, authenticated, unlocked and verified healthy are distinct states.                                                                         |
| WAR-03 | First deliver an explicit handoff to the installed Bitwarden client using the selected Bitwarden-hosted/self-hosted/Vaultwarden origin. No master password or vault session enters Pulse Go.                                                            |
| WAR-04 | Record handoff requested/cancelled/returned and user-reported completion honestly. Browser launch alone cannot establish successful sign-in, credential identity or grant completion.                                                                   |
| WAR-05 | Negotiate metadata, handoff, vault-read, embedded-fill, passkey, delegated and unattended capabilities independently. Unsupported clients retain status/recovery access and cannot activate an unproved capability.                                     |
| WAR-06 | Bind Go tenant membership to authenticated Pulse environment and runtime principals. Context links, matching names/email and pairing transport do not widen permission.                                                                                 |
| WAR-07 | Request credential use with a named action, normalized resource, requester and task/attempt. Grant references alone are not bearer authorization. Return typed pending/denied/locked/expired/revoked/unsupported/error states.                          |
| WAR-08 | Bind approvals to operation/resource, payload digest where needed, policy version and consumer. Recheck immediately before use; atomically reserve duration/use budgets.                                                                                |
| WAR-09 | Keep reusable secrets out of prompts, tool arguments/results, events, ordinary WebSockets, task payloads, logs, exports and checkpoints. Secret ingress uses a separate authenticated, non-recorded channel.                                            |
| WAR-10 | Cancel, expire and revoke grants on run termination, policy invalidation or disconnect. Distinguish broker denial from provider token/session revocation pending, completed or unavailable.                                                             |
| WAR-11 | Optional CLI bridge runs in dedicated state and a proved worker-isolation boundary. Never expose generic `bw`, `BW_SESSION`, unrestricted list/get/export or the master password to an agent.                                                           |
| WAR-12 | Office connections resolve credentials through a replaceable binding; read/send/write actions remain distinct. Migration verifies new storage before reference cutover and reconciles superseded/orphan secrets without touching unrelated credentials. |
| WAR-13 | Personal vault supports create/generate/save/update/search/reveal/copy/delete/restore and explicit previewed import/export. Unlock, site scope and owner remain explicit; plaintext exports receive deliberate confirmation.                            |
| WAR-14 | Desktop/extension save and fill bind to actual origin, frame, tab, document generation, account and profile. Recheck after navigation; support save/update/never-save and fill without automatic submit.                                                |
| WAR-15 | Keep personal browser profiles separate from delegated profiles. Scope authenticated-session control independently; document current same-user automation limitations and prohibit protected-mode claims without bypass tests.                          |
| WAR-16 | Passkey sign-in to Pulse is a relying-party feature with public-key records, replay-resistant registration/authentication, credential removal and account recovery. It is independent of storing third-party passkeys.                                  |
| WAR-17 | Pulse-native passkey providers perform legitimate registration/assertion and user verification using supported OS APIs. Never use virtual test authenticators in production or equate agent approval with user verification.                            |
| WAR-18 | Deleting a stored passkey and unregistering it at its website are separate actions. Portability, shared identity and device-bound limitations are visible; preserve a recoverable access path.                                                          |
| WAR-19 | Define key custody, device enrollment, locking, encrypted sync, conflict resolution, backup/restore and recovery before real personal secrets. Login reset does not imply decryption recovery.                                                          |
| WAR-20 | Shared vault membership distributes only authorized keys; transfer/removal/rotation are explicit. Offline revocation cannot erase prior copies; recovery must not resurrect devices or grants.                                                          |
| WAR-21 | Scheduled operations use dedicated server-managed identities and fresh per-occurrence grants. Handle uncertain writes through reconciliation/idempotency; personal vault unlock is never assumed.                                                       |
| WAR-22 | TOTP seeds and recovery codes are separately scoped items/capabilities. Permission to use a password does not automatically authorize its second factor or reveal recovery material.                                                                    |
| WAR-23 | Make Pulse-distributed UI, extension/native identities, packaging and updates independently brandable. Licence-audit exact dependencies, exclude restricted modules, retain required notices/source offers and never relabel GPL/AGPL code MIT.         |
| WAR-24 | Use bounded metadata pages, delta sync and scoped subscriptions. Do not broadcast vault data; use allowlisted audit fields and record no secret-bearing diagnostic/capture payload.                                                                     |

## Shared operation contract

The logical operations are `requestUse`, `approveUse`, `executeUse`, `revokeUse` and `getUseStatus`. Management of connections, policies, rotation and personal sync is separate. HTTP route names and transport versions are implementation decisions; these names are not existing APIs.

Request binding includes credential reference, tenant, authenticated consumer/environment, acting principal, task/attempt reference, action, normalized resource, request ID and payload digest when needed. The authority derives identity from authentication, never from untrusted payload claims. Approvals include the matching request digest, policy version and expiry. Results contain bounded allowed data and a receipt reference, never a general secret-returning result.

Proposed shared lifecycle labels are `pending_approval`, `ready`, `executing`, `succeeded`, `failed`, `denied`, `expired`, `revoked` and `outcome_unknown`. Availability reasons include `locked`, `unsupported`, `external_action_required`, `reauthentication_required` and `provider_unavailable`. Runtime leases are not durable event payloads. Provider revocation has its own pending/completed/unavailable status. Persist correlation and idempotency state so retries do not repeat writes after an uncertain response. A changed request needs a new approval unless a standing policy explicitly covers it.

Proposed cross-product defaults are one execution within five minutes, bounded by the shortest approval/policy/grant validity, and metadata/receipt pages of 50 with a maximum of 100. These are reviewable safety/performance defaults, not measured targets or permission to lengthen existing grants. Adapter payload, timeout and concurrency limits require implementation evidence.

## Security and reliability requirements

Go owns per-tenant server key envelopes, associated-data identity binding and resumable key rotation. A root-key/process compromise can still expose multiple tenants; do not claim per-tenant keys alone solve that problem. Client vault encryption and server-managed encryption have distinct custody and recovery promises.

Browser tools currently expose powerful evaluation/capture paths. A password must reach the target page, so transcript filtering alone cannot provide isolation. Protected delegation requires constraints on debugging, JavaScript evaluation, cookie extraction, network capture and host file/process access. Existing trusted local coding mode remains accurately labeled.

New capabilities must work across local, remote/relay and tunnel connections without baked origins or secret transport through a relay. Headless environments can execute supported server operations; a phone approves the owning environment's work, not an accidental local browser. Offline behavior must be explicit and must not reuse revoked grants.

## Delivery gates

| Gate | Scope and required proof                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| W0   | Exact upstream/client/SDK licence inventory, permitted reuse and Pulse branding plan; no runtime readiness implied               |
| W1   | Existing Bitwarden/Vaultwarden browser handoff on pinned versions; truthful status, lock/cancel and no secret ingress            |
| W2   | Go tenant/grant/key lifecycle plus one read-only provider operation; identity, RLS, expiry, concurrent use and receipts          |
| W3   | Pulse runtime and one Office connection binding; cancelled runs and failed/superseded credential migration reconciled            |
| W4   | Personal vault custody/recovery resolved; encrypted CRUD/sync and tested embedded/extension save/fill                            |
| W5   | Pulse relying-party passkey login; independent native-provider Apple/Android proofs and declared desktop compatibility           |
| W6   | Constrained agent sign-in, scheduled/write operations, human sharing, recovery exercise and full brandable distribution evidence |

Existing-manager integration precedes release of Pulse-managed passwords/native passkeys. Each gate decomposes into small implementation tasks only when its dependencies are evidenced. Historical Beat read-only prerequisites remain unresolved until checked against their actual CR and branch; no arbitrary write rollout is implied by this PRD.

### Open release decisions

| ID       | Decision                                                                                | Blocks                                                                     |
| -------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Q-WAR-01 | Personal recovery method, organisation escrow disclosure and device-loss policy         | Real-secret W4                                                             |
| Q-WAR-02 | Offline cache limits and whether a separate standalone local authority is in scope      | Offline personal vault release; existing local integrations stay supported |
| Q-WAR-03 | Exact browser/OS/client versions, Electron feasibility and enforceable worker isolation | Corresponding W1/W4/W5/W6 claims                                           |
| Q-WAR-04 | Upstream revisions, code/assets/SDK reuse, distribution and source-offer arrangement    | Reused-code build and commercial distribution                              |
| Q-WAR-05 | Credential audit retention, deletion/restore retention and recovery material custody    | Production audit/personal vault release                                    |

## Measurement and verification

Measure supported sign-in and operation success by declared platform/mode, incorrect-account/origin attempts blocked, grant denial/expiry/revocation latency, migration/restore success, and p95 interactive latency/sync bytes. Record denominators and failures. Baselines and latency budgets are TBD from synthetic fixtures and a consented pilot; they are not invented business targets.

Release fixtures require zero cross-tenant access, replayed unauthorized writes and secret-bearing transcript/log/event/capture outputs. Validate focused tests through public interfaces with deterministic clocks and typed receipts, real Postgres RLS for Go, and synthetic vault data. UI/OS proofs need explicit authorized browser/native testing. No repo-wide checks are required by this spec update.

## MCP and CLI integration

[Shared MCP/CLI contract](warden/mcp-cli.md) specifies tool and command names, schemas, authentication, provider setup, output/exit behavior and conformance. Proposed changes are tracked by [September 9 CR](change-requests/CR-2026-09-09-warden-mcp-cli.md).

**WAR-25.** Expose a versioned Warden MCP catalogue with closed input/output schemas and credential-free metadata, use request/execute/status/revoke and receipts; agents cannot approve themselves or fetch raw secrets.

**WAR-26.** Support authenticated MCP transport and provider-session registration with separate Warden capability, redacted configuration preview, harmless doctor, reversible setup and explicit unsupported-provider states.

**WAR-27.** Deliver Pulse-facing Warden commands in existing pulse-cli with explicit authority/environment selection, safe existing auth and request/execute/status/wait/revoke/receipt operations; bw remains an internal optional adapter.

**WAR-28.** Specify CLI table/json/jsonl output, stable Warden exit/reason mapping, bounded waits and noninteractive action-required returns; no secret flags, stdout diagnostics or implicit approval.

**WAR-29.** Unify UI, MCP and CLI policy, immutable approval binding, idempotency, cancellation/reconnect and outcome reconciliation; human management approval requires independently authenticated trusted context.

**WAR-30.** Require provider setup/transport and UI/CLI/MCP conformance tests before claiming delivery, including cross-tenant denial, replay, expiry, one-use races and secret-free capture.

These are mandatory deliverables of W3 for one brokered read, not optional consequences of the Bitwarden CLI bridge. Later fill/passkey/write capability remains gated.

## Source and status

Authoring source: [cross-product review](../docs/research/pulse-warden-review-2026-09-07.md), including primary Bitwarden, Vaultwarden, OS and licence references. Current-code evidence includes `ServerSecretStore`, integration lifecycle contracts, `PreviewAutomationBroker` and the unmerged `pulse-mail` secret adapter. None is a completed Warden implementation. The external Go PRD owns tenant-side acceptance and this PRD owns Pulse client/environment acceptance.

**Created:** 2026-09-07 . **Last opened:** 2026-09-09 . **Last edited:** 2026-09-09 . **Status:** draft . **Owner:** Product / Engineering
