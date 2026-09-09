# Pulse Warden workflows

Authority: [requirements](../prd/17-pulse-warden.md), [acceptance](../prd/20-acceptance-criteria/pulse-warden.md). These describe planned behavior.

## J-WAR-01: connect and use an existing manager

User selects Bitwarden-hosted/self-hosted or Vaultwarden, server origin and device. Pulse records configured/unverified metadata. User opens the target in the selected supported external browser; the installed manager handles unlock, account selection, save and fill. Pulse records observable handoff state only. Cancel returns to the initiating task/connection. Disconnect removes the association, not the external vault. External browser sessions never silently migrate to a remote/embedded browser.

## J-WAR-02: request and end delegated use

Authenticated environment requests a normalized action/resource for a task attempt. Go binds tenant/principal, evaluates policy and returns pending/denied/approved. Eligible user reviews the exact request when required. At execution Go rechecks version, scope, revocation and atomic budget; a trusted adapter performs the bounded operation. Pulse receives result and receipt. Cancel/failure/completion ends access and records provider revocation progress. Replay, stale approval or changed payload fails closed. A grant reference alone cannot authorize redemption.

## J-WAR-03: migrate an Office connection

User selects Warden-backed storage and sees custody/action scopes. Adapter writes the new secret through the non-recorded channel and verifies it before account-reference cutover. Failure preserves the old usable reference or a clear recoverable state. Reconciliation deletes only verified unreferenced/superseded secret versions. Reconnect refreshes authorization; disconnect ends grants and records upstream removal status. Email send/calendar invitation/CRM write keep their existing action authorization.

## J-WAR-04: save and fill a Pulse-managed item

After personal custody/recovery gates pass, user unlocks a trusted device vault. Save proposal binds actual origin/frame/account and encrypts only confirmed fields. Existing items can update, cancel or opt into never-save. Fill rechecks tab/document/origin and delivers selected fields without submit. Navigation, lock or permission loss cancels. Personal/delegated browser profiles remain separate and captures exclude credential data.

## J-WAR-05: manage passkeys and recover access

Pulse login uses relying-party registration and public records. Third-party passkeys use an installed or future native provider with legitimate user verification. User can label/delete a stored item, separately manage it at the website, and see portability limitations. Lost-device recovery follows the declared key policy, excludes revoked devices/grants and tests access restoration before claiming success. Server password reset cannot silently decrypt personal ciphertext.

## J-WAR-06: share, schedule and revoke

Owner grants eligible members access and distributes permitted keys. Unattended work uses a separate server-managed identity with fresh per-occurrence grants; password permission does not include TOTP/recovery codes. Uncertain writes reconcile before retry. Membership/device removal prevents future access but cannot erase offline copies; necessary provider credential rotation is explicit. History remains redacted and subject to declared retention.

## MCP and CLI entry points

Operator previews provider MCP configuration, explicitly registers it, runs harmless doctor/discovery, requests an operation, reviews pending approval in trusted human context, executes and checks receipts. Noninteractive CLI returns action-required rather than prompting. Cancel/reconnect uses the same grant state. See [MCP/CLI contract](../prd/warden/mcp-cli.md).

**Created:** 2026-09-07 . **Last opened:** 2026-09-07 . **Last edited:** 2026-09-07 . **Status:** draft . **Owner:** Product / Engineering
