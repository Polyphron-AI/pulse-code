# Warden feasibility evidence

Inspected 10 September 2026. Documentation evidence, code inspection, synthetic tests and live compatibility are separate evidence classes. This file contains no live compatibility pass.

## Manager and client paths

| Candidate                   | Evidence and decision                                                                                     | Runtime proof still required                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Vaultwarden 1.37.2          | Release API identifies 1.37.2; its release note requires this update for clients 2026.8.0+                | Artifact digest, isolated server bootstrap, client login/unlock/sync and upgrade rollback                   |
| Bitwarden browser 2026.8.0  | Published client release; proposed first external-browser candidate                                       | Record exact Chrome/Edge and OS build, extension artifact/version, selected endpoint and each scenario      |
| Bitwarden CLI 2026.8.0      | Optional later adapter candidate, never direct agent access                                               | Dedicated synthetic account/profile, unlock boundary, logout/revoke and host isolation                      |
| Pulse Electron 41.5.0       | Pinned in inspected desktop package; arbitrary Chrome extension compatibility is not promised by Electron | Separate embedded-fill feasibility; do not treat browser extension installation as solved                   |
| Android credential provider | Android documents provider integration on Android 14+                                                     | Select stable dependency/OS matrix; package identity, system invocation, UV, cancellation and RP validation |
| Apple credential provider   | AuthenticationServices provides the credential-provider extension entry point                             | Apple build host, entitlement/signing review, supported OS matrix and native tests                          |

Bitwarden's Public API manages organization administration; its vault-management HTTP interface is supplied by local CLI serve. CLI unlock yields a vault decryption session used by item commands. Neither path demonstrates provider-enforced single-item delegation. Our first manager integration is human handoff; the machine broker remains separate.

Electron supports only part of the Chrome extension API. Use the installed external browser initially. Future Pulse clients are independently packaged deliverables; official Bitwarden UI remains visibly Bitwarden during handoff.

## Synthetic manager protocol

1. Pin server image digest, browser/extension versions, OS build and origin; create an isolated account and synthetic login only.
2. Connect a selected Vaultwarden origin, lock/unlock, save then update a login, select between two accounts and fill without submit.
3. Visit a lookalike origin and cross-origin frame; verify no unintended fill. Navigate before fill and check document rebinding.
4. Cancel, logout, disconnect network, reconnect and return to Pulse. Record handoff states; a return or Done click never proves login.
5. Inspect synthetic canaries across Pulse logs/events/tool results and capture output. Keep the manager's own unlock outside agent transcripts.
6. Record pass/fail/unsupported per capability, with version tuple and fixture command. Runtime reports must come from the test harness; never hand-author a passing receipt.

Passkey, mobile and embedded-browser compatibility require their own runs. None inherits a pass from external-browser password fill.

## Component reuse inventory

| Component                            | Candidate revision                | Proposed use                          | Clearance status                                                                                                |
| ------------------------------------ | --------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Vaultwarden server                   | 1.37.2                            | Separate human-vault service          | AGPL source/notice and distribution obligations require inventory; not blanket clearance                        |
| Bitwarden browser/CLI                | browser-v2026.8.0 / cli-v2026.8.0 | User-installed handoff first          | No binary rebundling in first handoff; file-level GPL/restricted-module distinction still required before reuse |
| Bitwarden SDK/mobile/web-vault       | Not selected                      | Potential later implementation inputs | No copying or bundling approved by this packet                                                                  |
| Pulse-owned extension/native clients | New deliverables                  | Long-term Pulse branding              | Package IDs, signing, updates, legal assets and cryptographic implementation still need design                  |

Inventory output must list path/artifact, revision/digest, license identifier, copyright owner, notices, source distribution method, modifications and inclusion/exclusion decision. Separate-process architecture does not itself settle combined-work licensing questions. Preserve legal notices even when product branding changes.

## Primary sources

- [Vaultwarden 1.37.2 release](https://github.com/dani-garcia/vaultwarden/releases/tag/1.37.2) and [pinned license](https://github.com/dani-garcia/vaultwarden/blob/1.37.2/LICENSE.txt).
- [Bitwarden browser release](https://github.com/bitwarden/clients/releases/tag/browser-v2026.8.0), [CLI release](https://github.com/bitwarden/clients/releases/tag/cli-v2026.8.0), [CLI documentation](https://bitwarden.com/help/cli/) and [API distinction](https://bitwarden.com/help/bitwarden-apis/).
- [Bitwarden restricted-module license at browser revision](https://github.com/bitwarden/clients/blob/browser-v2026.8.0/LICENSE_BITWARDEN.txt). The pinned LICENSE_GPL.txt was verified through the GitHub contents API as GPL version 3. Root license files do not settle coverage of individual modules.
- [Electron extension support](https://www.electronjs.org/docs/latest/api/extensions).
- [Android provider integration](https://developer.android.com/identity/sign-in/credential-provider).
- [Apple credential-provider controller](https://developer.apple.com/documentation/authenticationservices/ascredentialproviderviewcontroller). Documentation availability is not a platform test.
