# Pulse Warden surfaces

Authority: [Warden PRD](../prd/17-pulse-warden.md). All surfaces below are planned logical destinations; router paths remain implementation decisions. No route is claimed to exist.

| Surface ID             | View and actions                                                                 | Client / authority                                             |
| ---------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| warden-summary         | Credentials, active grants, health and recent redacted receipts; connect manager | Go-owned hierarchy rendered or linked by capable Pulse clients |
| warden-credential      | Storage mode, owner, scope, policies, use history, rotate/revoke                 | One authority-qualified credential identity                    |
| warden-grants          | Request, approval, consumer/attempt, expiry and revocation progress              | Go authority; approve/revoke only for eligible principal       |
| warden-receipts        | Allowlisted outcome and provider status, redacted export                         | Go audit linked to Pulse task receipts                         |
| warden-device-vault    | Unlock/lock, items, save/update, recovery, device/member controls                | Trusted Pulse credential client; later gate                    |
| warden-manager-handoff | Selected manager/server/device and explicit external sign-in                     | Existing Bitwarden client initially; no fabricated success     |
| warden-passkeys        | Separate Pulse account passkeys and third-party stored passkeys                  | Relying-party settings versus native provider                  |

Settings/Connections, Office account setup, tasks, departments and command palette entries link into the hierarchy with authority, credential/attempt and return context. Summary tiles are allowed; local credential-detail copies are not. Authorised mobile users can review supported metadata/approvals. Native fill/unlock requires native capability, not a normal WebSocket payload.

States: configured/unverified, locked, pending approval, active, expired, revoked, disconnected, reauthentication required, unsupported and provider unavailable. Each preserves the owning environment and supplies a valid return/cancel path. Disconnect does not claim deletion from an external vault; local passkey deletion does not claim site unregister.

Existing-manager handoff retains upstream branding. Future Pulse-distributed interfaces use Pulse assets/IDs with required legal notices; OS authentication sheets remain OS-owned.

## MCP and CLI entry points

Connection setup adds MCP configuration preview, provider support, doctor result and removal/recovery actions. Pending CLI/MCP requests link to the existing Warden approval detail with no bearer secret in the link. See [MCP/CLI contract](../prd/warden/mcp-cli.md).

**Created:** 2026-09-07 . **Last opened:** 2026-09-07 . **Last edited:** 2026-09-07 . **Status:** draft . **Owner:** Product
