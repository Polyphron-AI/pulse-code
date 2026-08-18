# Pulse Code compatibility contract

Pulse Code is the canonical product name. Identifiers inherited from T3 Code are not an alternate
brand; they are compatibility contracts for installed applications, stored credentials, linked
environments, release upgrades, and automation. Do not remove or rename a value in this document
without a separately approved, telemetry-backed breaking-change plan.

## Immutable platform identity

These values deliberately retain `t3`/`t3code`. Changing any of them would create a new app,
disconnect an existing security container, or break an installed-client upgrade path.

| Surface                               | Compatibility value                                                                                                 | Why it remains                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| iOS production bundle                 | `com.t3tools.t3code`                                                                                                | Preserves the App Store record, keychain container, push topic, and in-place upgrades.                                    |
| Android production package            | `com.t3tools.t3code`                                                                                                | Preserves the Play Store record, app data, and in-place upgrades.                                                         |
| Dev/preview mobile bundles            | `com.t3tools.t3code.dev`, `com.t3tools.t3code.preview`                                                              | Preserves installed internal builds and signing entitlements.                                                             |
| Widget bundle suffix                  | `.widgets` on the existing bundle ID                                                                                | Preserves widget and Live Activity entitlements.                                                                          |
| Expo project                          | slug `t3-code`, owner `pingdotgg`, project `d763fcb8-d37c-41ea-a773-b54a0ab4a454`                                   | Preserves EAS Update and build continuity.                                                                                |
| Expo update URL                       | `https://u.expo.dev/d763fcb8-d37c-41ea-a773-b54a0ab4a454`                                                           | Keeps installed native builds on their update stream.                                                                     |
| Clerk relying-party domain            | `clerk.t3.codes`                                                                                                    | Preserves the existing Clerk application, users, passkeys, and native SSO trust.                                          |
| Desktop application ID                | `com.t3tools.t3code` (`.dev` for development)                                                                       | Preserves Windows app identity, macOS signing/passkeys, and installed upgrades.                                           |
| Linux WM class and main desktop entry | `t3code` / `t3code.desktop`                                                                                         | Preserves launcher pinning and upgrade ownership.                                                                         |
| Desktop executable                    | `t3code`                                                                                                            | Preserves existing shortcuts, package scripts, and updater behavior.                                                      |
| Server data root                      | `~/.t3`                                                                                                             | Prevents creation of a second empty instance and retains accounts, projects, secrets, and history.                        |
| Project file                          | `t3.json`                                                                                                           | Keeps existing repositories readable by old and new clients.                                                              |
| npm package                           | `t3`                                                                                                                | Preserves `npx t3`, installed automation, and the published update channel.                                               |
| Internal package scope                | `@t3tools/*`                                                                                                        | Avoids a monorepo-wide package and lockfile ABI break unrelated to visible branding.                                      |
| Background service unit               | `t3code.service`                                                                                                    | Ensures upgrades manage the existing service instead of installing a duplicate.                                           |
| Relay JWT template/audience/type      | `t3-relay`, `t3-code-relay`, `t3-relay-dpop-access+jwt`                                                             | Keeps already-issued and older-client tokens within the existing trust boundary.                                          |
| Relay deployment/database identifiers | Existing `t3-code-*` resource names and persisted IDs                                                               | Preserves deployed state, ownership, and migrations.                                                                      |
| GitHub/store/package coordinates      | Canonical `Polyphron-AI/pulse-code`; legacy `Polyphron-AI/t3code` redirect; existing store, Winget/Homebrew/AUR IDs | The repository redirect preserves old links; package IDs remain until their registries support an equally safe migration. |

Keeping these values does not expose T3 Code as the product name. New labels, window titles,
installer copy, settings, help text, and documentation say Pulse Code.

## Dual-name runtime aliases

Pulse names are canonical for new configuration and links. Both forms are accepted indefinitely
for supported clients.

| Surface                                   | Canonical                                         | Supported legacy alias                           | Behavior                                                                             |
| ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Mobile/desktop URL schemes                | `pulsecode`, `pulsecode-dev`, `pulsecode-preview` | `t3code`, `t3code-dev`, `t3code-preview`         | Both are registered and routed to the same app.                                      |
| Relay mobile client ID                    | `pulse-mobile`                                    | `t3-mobile`                                      | Same mobile scope policy.                                                            |
| Relay web client ID                       | `pulse-web`                                       | `t3-web`                                         | Same web scope policy.                                                               |
| CLI binaries                              | `pulse`, `pulse-code`                             | `t3`                                             | All invoke the same entry point. The npm package remains `t3`.                       |
| Server/desktop environment                | `PULSE_CODE_*`                                    | corresponding `T3CODE_*`                         | Pulse takes precedence; T3 remains a fallback.                                       |
| Web relay environment                     | `VITE_PULSE_CODE_RELAY_URL`                       | `VITE_T3CODE_RELAY_URL`                          | Pulse takes precedence.                                                              |
| Desktop data directory for fresh installs | `pulsecode` / `pulsecode-dev`                     | `t3code`, `T3 Code (Alpha)`, and dev equivalents | Existing legacy data wins; fresh installs create the Pulse directory.                |
| Linux OAuth handler file                  | `pulsecode-url-handler.desktop`                   | legacy scheme MIME ownership                     | The new handler claims both schemes without replacing the main legacy desktop entry. |

When introducing another `PULSE_CODE_*` setting, add the matching `T3CODE_*` fallback and a
precedence test in the same change.

## Mobile state migration

The OS application identity is unchanged, so the secure-storage/keychain container remains the
same. Renamed keys use canonical-read, legacy-fallback, copy-forward, and compatibility-write
behavior. Sign-out and account switching clear both names.

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

SQLite tables, connection descriptor tags, DPoP keys, environment IDs, Clerk session material, APNs
device tokens, RPC methods, pairing payloads, and serialized wire schemas are not renamed. Updated
clients re-register device presentation metadata idempotently without changing the underlying
device/account identity. Existing web `t3code:*` local-storage and IndexedDB database names remain
stable so browser profiles and desktop renderer data are not split; those names are invisible
storage identities, not displayed branding.

## Release order and removal policy

The relay must accept Pulse and T3 client IDs before clients emit Pulse IDs. Clerk must allow Pulse
and T3 callback schemes before updated desktop/mobile builds ship. Release manifests may point to
new `Pulse-Code-*` artifact filenames, but existing application IDs, updater ownership, channels,
and legacy manifest decoding remain unchanged.

Compatibility aliases have no automatic sunset. Removal requires evidence that no supported
installed client, stored state, external registry, or deployment still depends on the value, plus a
separate migration and rollback plan.
