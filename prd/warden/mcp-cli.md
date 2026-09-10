# Warden MCP and CLI contract

Status: proposed, 2026-09-09. This is the coordinated `pulse-warden/v1` interface specification, not shipped commands or tools. Identical copies live at `prd/warden/mcp-cli.md` in Pulse and Pulse Go; change and validate them together. Go owns authorization/execution; adapters do not implement independent policy engines.

## MCP tool catalogue

All tools have closed, versioned JSON input/output schemas with bounded strings, enums and pagination. Require schema validation before dispatch. Derive tenant, principal and runtime identity from authenticated context, never a model-supplied identity. References are authority-qualified opaque IDs. Capabilities and current policy are rechecked on each call, even if tool discovery previously advertised support.

| Proposed tool             | Input                                                                                                                      | Structured result and authority                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `warden_capabilities`     | Optional credential reference                                                                                              | Supported operations and availability reasons for this caller/environment; no global vault inventory                                                 |
| `warden_credentials_list` | Optional provider/resource filter, cursor, limit                                                                           | Paginated authorized metadata only; no ciphertext, passwords, TOTP seeds or passkey private material                                                 |
| `warden_use_request`      | credentialRef, action, resource, taskRef, attemptRef, requestId; payload/payloadDigest only for a defined operation schema | useRef, normalized request digest, state, expiry and safe approval reference if pending; server validates task ownership and binds immutable payload |
| `warden_use_execute`      | useRef, requestId, expectedRequestDigest                                                                                   | Bounded adapter result plus receiptRef or operationRef; no arbitrary URL, shell command or secret-returning operation                                |
| `warden_use_status`       | useRef or operationRef                                                                                                     | Typed lifecycle, receipt reference and provider cleanup state, including outcome_unknown                                                             |
| `warden_use_revoke`       | useRef, optional bounded reason code                                                                                       | Revocation state for a caller-owned use or an explicitly authorized management action                                                                |
| `warden_receipts_list`    | Optional useRef/taskRef, cursor, limit                                                                                     | Allowlisted redacted receipts within caller visibility                                                                                               |

Agent-visible tools cannot approve their own requests, widen policies, enroll recovery devices, reveal/export vault items or rotate arbitrary credentials. Existing policies can authorize eligible work without a new prompt; models cannot manufacture standing authority. A dedicated browser sign-in capability uses the same grant flow only after the constrained-browser proof. No general `secret.get` exists.

Successful calls return a versioned object with `state`, `requestId`, applicable `useRef`/`operationRef`/`receiptRef`, bounded `data`, and a typed `error` when appropriate. Pending approval is a valid business state, not an executed action. Protocol/validation errors and business/tool execution errors remain distinguishable; never report domain denial as success. Secret-free compatibility text must agree with structured output. Error details never echo rejected secret-bearing input.

## MCP hosting and setup

Pulse-managed provider sessions reuse the server MCP registry, invocation context and supported toolkit registration. Add a separate Warden capability; possession of preview capability grants no Warden access. Go's existing MCP integration, where used, is another adapter to the same authority. No fork of the policy or grant store per transport.

Support local stdio through proposed `pulse-cli warden mcp serve --transport stdio`, and authenticated remote Streamable HTTP for clients that support it. Pin the supported MCP protocol/SDK version at implementation and test negotiation, lifecycle and cancellation according to that version. Do not imply that every provider supports both transports. Stdio stdout contains protocol messages only; diagnostics go to redacted stderr. HTTP validates intended audience, token scopes and configured origins; a provider API token is not an MCP authorization token and must not be passed through.

Operator CLI setup offers `pulse-cli warden mcp config --provider <name> --environment <id>` to print redacted configuration and `pulse-cli warden mcp doctor` to test discovery/auth/capabilities with a harmless read. Config generation does not imply installation. Applying registration changes requires explicit operator action, preserves unrelated entries, is idempotent and provides removal/recovery. No secrets are printed into config files, command arguments, URLs or repository state; use the existing protected identity reference/bootstrap path. Launching an untrusted worker must not inherit a broad management identity.

Codex, Claude, Cursor, Grok and OpenCode each require pinned setup/discovery/call/cancel/reconnect evidence or an explicit unsupported entry with recovery guidance. Manager client availability is separately negotiated. An enabled tool registration is not proof that Bitwarden/Vaultwarden supports protected delegation or unattended use.

HTTP or stdio disconnect/cancellation must terminate or reconcile the associated attempted operation and revoke its attempt-local authorization according to the same runtime policy. Closing a transport is not proof that an upstream side effect stopped. Preserve idempotency and return outcome_unknown if needed; query status before retry. Avoid persistent blocking calls while waiting for human approval; return the pending reference and resume explicitly.

Source references: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) and [MCP tools](https://modelcontextprotocol.io/specification/draft/server/tools). These inform the design; the exact supported revision remains an implementation compatibility gate.

## Pulse CLI catalogue

Extend the existing Go `cmd/cli` binary named `pulse-cli`; do not create a second credential CLI or rename existing commands. `bw` is the optional internal manager bridge, not the Pulse-facing interface.

| Proposed command after `pulse-cli warden`                                                        | Contract                                                                                                                                     |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `capabilities`, `credentials list`, `credentials show <ref>`                                     | Authorized metadata, storage mode and health; no secret reveal                                                                               |
| `use request --credential <ref> --action <action> --resource <ref> --task <ref> --attempt <ref>` | Validate required identity/context, bind request ID and supported operation payload; return pending/ready/denied                             |
| `use execute <use-ref>`                                                                          | Execute the approved immutable request once; supplied expected digest must match                                                             |
| `use status <use-ref>`, `use wait <use-ref> --timeout <duration>`                                | Status or bounded server-notification wait; timeout never implicitly re-executes or approves                                                 |
| `use revoke <use-ref>`, `receipts list --use <use-ref>`                                          | End permitted access and inspect redacted outcomes                                                                                           |
| `use approve <use-ref>`, `use deny <use-ref>`                                                    | Human management mode only: authenticated eligible approver, exact request review and explicit confirmation; not exported as agent MCP tools |
| `mcp config`, `mcp doctor`, `mcp serve`                                                          | Configuration preview, harmless connection proof and local stdio lifecycle                                                                   |

Use explicit `--environment` and authority/tenant selection when context is ambiguous. A configured default is allowed only if its binding is displayed in human mode and included in structured output. Fail on conflicting flags rather than choosing silently. Reuse existing login/device authorization where available; headless users get a safe authorization instruction, not a password prompt captured by an agent.

Reuse `--format table|json|jsonl`; TTY defaults and existing command exit meanings stay compatible. Structured status includes version, selected authority/environment, requestId and lifecycle state. stdout is parsable data only; stderr carries redacted diagnostics. Support bounded pagination and deterministic schema validation. No passwords, API tokens, master unlock material or TOTP seeds are accepted as command-line flags; any future management secret ingress uses a separate reviewed non-recorded channel.

Proposed Warden-only exit mapping retains existing 0 success, 1 operational/config failure, 2 invalid arguments, 4 authentication failure, 5 not found and 7 partial failure. Add 3 for action required, including pending human approval or unlock; 6 for policy denial/expired/revoked use; 8 for unsupported capability; 9 for wait timeout or unresolved outcome. Structured reason distinguishes each case. `use status` returning a valid pending record succeeds with 0; `use execute` blocked on approval returns 3 and must not claim execution. Audit these additional values against current CLI contracts before implementation; do not change existing subcommands.

Automation never auto-launches a browser, hangs for an interactive prompt, auto-approves with `--yes`, or exports a secret on failure. Human approve/deny requires an independent trusted approval context: a terminal label or `isatty` check is not proof of a human. Reuse a verified UI/device approval step where CLI identity alone cannot establish separation from the agent. Ctrl-C follows request cancellation policy and prints any resumable reference without claiming a remote write was undone.

## Ownership and release conformance

Go `cmd/cli` owns CLI formatting, argument parsing and auth selection; Go Warden owns grants and receipts. Pulse server MCP toolkit/registry/invocation context owns provider-session routing and capability checks. Shared TypeScript contracts and Go API definitions use the same operation fixtures. CLI stdin/stdout adapters never become an alternative secret store.

Required fixtures compare UI, CLI and MCP for the same authenticated principal, operation and policy: allow, deny, pending, invalidated approval, cross-tenant/environment access, wrong attempt, tampered payload, duplicate request ID, concurrent one-use redemption, expiry, revoke, disconnect/cancel, unsupported client and provider outcome_unknown. Expected decision, normalized digest, effect count and receipt correlations must agree; presentation alone may differ.

Protocol tests cover closed schemas, tool discovery/auth skew, pagination, stdout framing, structured/error agreement and credential canaries in all outputs. Setup tests cover each provider's config preview/apply/remove, preserving unrelated entries and never embedding tokens. CLI tests cover every exit code, noninteractive pending return, bounded wait, safe SIGINT/reconnect and secret-free help/errors. Release cannot claim MCP or CLI complete from a schema-only test or a working `bw` invocation.

Deliver with the broker/Pulse runtime gate for one read-only operation: shared schemas/fixtures, Go CLI adapter, Pulse MCP toolkit, registration/doctor, then integrated UI/CLI/MCP conformance. Personal-vault fill, native passkeys and unattended writes retain their later gates. All actions remain subject to existing custody, commercial licensing and isolation constraints.

**Created:** 2026-09-09 . **Last opened:** 2026-09-09 . **Last edited:** 2026-09-09 . **Status:** proposed . **Owner:** Product / Engineering
