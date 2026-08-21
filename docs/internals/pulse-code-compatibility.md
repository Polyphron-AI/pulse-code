# Pulse Code compatibility contract

Pulse Code is an independent downstream desktop product. Official T3 Code remains owned and
released from the upstream T3 repository. A Pulse release may selectively adopt an upstream T3
change, keep a Pulse-only feature, or omit an upstream feature; Pulse and T3 desktop releases are
not required to come from the same commit.

Web and mobile remain shared clients initially. Their established identities and source-level
compatibility aliases stay in place where they do not claim official T3 desktop operating-system,
installation, updater, protocol, credential, or state ownership.

## Independent desktop identity

Pulse desktop must install and run beside official T3 without either product updating, launching,
locking, or reading the other's desktop state.

| Surface                                       | Pulse desktop value                                        | Boundary                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Production application and macOS bundle ID    | `ai.polyphron.pulsecode`                                   | Never use the official T3 `com.t3tools.t3code` identity.                                                |
| Development application ID                    | `ai.polyphron.pulsecode.dev`                               | Keeps development registration separate from both products.                                             |
| URL schemes                                   | `pulsecode`, `pulsecode-dev`                               | Pulse registers and handles Pulse schemes only.                                                         |
| Windows executable and app identity           | `pulsecode`, app user model `ai.polyphron.pulsecode`       | Pulse owns its shortcuts, processes, protocol registration, and uninstall entry.                        |
| Linux executable, desktop entry, and WM class | `pulsecode`, `pulsecode.desktop`, `pulsecode`              | Pulse does not claim `t3code` or `t3code.desktop`.                                                      |
| Linux OAuth handler                           | `pulsecode-url-handler.desktop`                            | Claims only the active Pulse scheme.                                                                    |
| Pulse Code home                               | `~/.pulsecode`                                             | Production state lives below `~/.pulsecode/userdata`; development state lives below `~/.pulsecode/dev`. |
| Electron user data                            | Platform app-data directory `pulsecode` or `pulsecode-dev` | Pulse does not probe for or adopt a T3 user-data directory.                                             |
| Release artifacts                             | `Pulse-Code-*` from `Polyphron-AI/pulse-code`              | Pulse updates and installers must never target an official T3 package coordinate.                       |

Desktop identity inputs use the canonical `PULSE_CODE_*` names. A `T3CODE_*` fallback must not be
added when it could redirect Pulse into T3 state or cause Pulse to claim a T3 operating-system
identity.

Official T3 identifiers may still appear in source history, tests of wire compatibility, mobile
configuration, or shared server contracts. Their presence does not authorize Pulse desktop to
register or reuse them.

## Fresh installation and future import

A Pulse desktop installation starts fresh by default. It does not automatically discover, read,
move, rename, merge, or delete an official T3 desktop installation or its state.

A future import tool is optional. If implemented, it must be a user-invoked, explicit, selective,
copy-only operation. The tool must show its source and destination, preserve the source unchanged,
allow cancellation before writing, and report what was copied. Import is not an installer step,
upgrade migration, compatibility fallback, or prerequisite for opening Pulse.

## Shared web, mobile, and source compatibility

The following established values remain because web, mobile, server, and repository source are
shared initially. They are not desktop package identities.

| Surface                                   | Established compatibility value                                                   | Why it remains                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| iOS production bundle                     | `com.t3tools.t3code`                                                              | Preserves the existing App Store record, keychain container, push topic, and in-place upgrades. |
| Android production package                | `com.t3tools.t3code`                                                              | Preserves the existing Play Store record, app data, and in-place upgrades.                      |
| Dev/preview mobile bundles                | `com.t3tools.t3code.dev`, `com.t3tools.t3code.preview`                            | Preserves installed internal builds and signing entitlements.                                   |
| Widget bundle suffix                      | `.widgets` on the existing mobile bundle ID                                       | Preserves widget and Live Activity entitlements.                                                |
| Expo project                              | slug `t3-code`, owner `pingdotgg`, project `d763fcb8-d37c-41ea-a773-b54a0ab4a454` | Preserves EAS Update and build continuity.                                                      |
| Expo update URL                           | `https://u.expo.dev/d763fcb8-d37c-41ea-a773-b54a0ab4a454`                         | Keeps installed native builds on their update stream.                                           |
| Clerk relying-party domain                | `clerk.t3.codes`                                                                  | Preserves the shared Clerk application, users, mobile credentials, and web trust.               |
| Project file                              | `t3.json`                                                                         | Keeps existing repositories readable by old and new clients.                                    |
| npm package and CLI entry                 | `t3` / `npx t3`                                                                   | Preserves shared server automation and the published server channel.                            |
| Internal package scope                    | `@t3tools/*`                                                                      | Avoids a source-only monorepo and lockfile break.                                               |
| Background service unit                   | `t3code.service`                                                                  | Preserves the existing shared server-service upgrade path; it is not the desktop app identity.  |
| Relay JWT template/audience/type          | `t3-relay`, `t3-code-relay`, `t3-relay-dpop-access+jwt`                           | Keeps issued tokens and supported clients within the existing trust boundary.                   |
| Relay deployment and database identifiers | Existing `t3-code-*` resource names and persisted IDs                             | Preserves deployed state and migrations.                                                        |
| Web browser storage                       | Existing `t3code:*` local-storage and IndexedDB names                             | Prevents shared web profiles and renderer data from splitting.                                  |

Pulse names are canonical for new shared configuration and presentation. Supported server, web, and
mobile aliases remain where documented: `PULSE_CODE_*` may accept a corresponding `T3CODE_*`
fallback, `VITE_PULSE_CODE_RELAY_URL` may accept `VITE_T3CODE_RELAY_URL`, relay client IDs retain
their supported aliases, and the legacy `t3` CLI continues to invoke the shared server entry point.
These aliases must not be reused to weaken the desktop identity boundary above.

SQLite tables, connection descriptor tags, DPoP keys, environment IDs, Clerk session material,
APNs device tokens, RPC methods, pairing payloads, and serialized wire schemas are not renamed
solely for the Pulse desktop split.

## Mobile state migration

The mobile operating-system identity is unchanged, so its secure-storage and keychain containers
remain the same. Renamed keys use canonical-read, legacy-fallback, copy-forward, and
compatibility-write behavior. Sign-out and account switching clear both names.

| Data                            | Canonical key                            | Legacy key(s)                                        |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Connection catalog              | `pulsecode.connection-catalog.v1`        | `t3code.connection-catalog.v1`, `t3code.connections` |
| Connection list                 | `pulsecode.connections`                  | `t3code.connections`                                 |
| Device identity                 | `pulsecode.agent-awareness.device-id`    | `t3code.agent-awareness.device-id`                   |
| Push/Live Activity registration | `pulsecode.agent-awareness.registration` | `t3code.agent-awareness.registration`                |
| Recent-thread shortcuts         | `pulsecode.recent-thread-shortcuts`      | `t3code.recent-thread-shortcuts`                     |
| Managed relay access tokens     | `pulsecode.cloud.relay-access-tokens`    | `t3code.cloud.relay-access-tokens`                   |
| DPoP proof key                  | `pulsecode.cloud.dpop-proof-key`         | `t3code.cloud.dpop-proof-key`                        |
| Preferences compatibility copy  | `pulsecode.preferences` and `.fallback`  | `t3code.preferences` and `.fallback`                 |

Updated clients re-register device presentation metadata idempotently without changing the
underlying device or account identity.

## Upstream adoption and release gates

Changes intended for official T3 must be made and released in the upstream T3 repository. Pulse may
then adopt those changes selectively through a reviewable downstream change. Pulse-only work is not
backported to T3 implicitly, and protecting upstream fidelity takes priority over keeping both
desktop products feature-identical.

A Windows Pulse candidate may be distributed manually after its package metadata, launch, protocol,
state, uninstall, and side-by-side behavior have been verified. Team-wide macOS and Linux releases
remain gated on equivalent per-platform packaging, signing, launch, protocol, state, updater, and
side-by-side evidence.

Shared compatibility aliases have no automatic sunset. Removing one requires evidence that no
supported shared client, stored state, automation, or deployment depends on it, plus a separate
migration and rollback plan. This removal policy does not apply to official T3 desktop identities:
Pulse desktop is prohibited from claiming those identities rather than temporarily aliasing them.
