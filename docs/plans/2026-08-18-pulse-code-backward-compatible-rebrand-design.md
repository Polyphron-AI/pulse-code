# Pulse Code backward-compatible rebrand

## Goal

Rename every user-visible T3 Code surface to Pulse Code while preserving complete backward
compatibility for existing web, desktop, mobile, CLI, relay, authentication, deep-link, storage,
update, and linked-environment clients.

Pulse Code is the canonical identity for new builds and documentation. Legacy T3 identifiers are
compatibility contracts: they remain accepted indefinitely unless a separately approved removal
plan proves that no supported client or persisted installation depends on them.

## Compatibility invariants

An existing installation must be able to upgrade without losing its Clerk account, saved
connections, linked environments, settings, provider credentials, session history, or local server
state. An older supported mobile or web client must still be able to connect to an updated Pulse
Code environment and relay. Existing deep links, OAuth redirects, update channels, pairing URLs,
and background services must continue resolving.

The migration must not create a new App Store or Play Store application. The production iOS bundle
identifier and Android package name remain `com.t3tools.t3code`. The existing Clerk application,
relay deployment, environment IDs, and cryptographic trust roots remain authoritative.

## Identity model

Identifiers fall into three classes.

### Canonical Pulse identifiers

New user-visible copy, product names, documentation, generated release names, client labels, and
newly persisted presentation metadata use Pulse Code. New aliases may use `pulse-code`,
`pulsecode`, `PULSE_CODE_*`, or `@pulse-code/*` where changing them does not alter an immutable
platform identity.

### Dual-read compatibility identifiers

Renamable runtime identifiers use a dual-read, canonical-write policy. Readers accept both Pulse
and legacy T3 spellings; writers prefer Pulse. This applies to URL schemes, environment variables,
configuration fields, local-storage keys, secure-storage keys, relay client IDs, JWT audiences and
templates, service names, command aliases, data-directory discovery, and serialized schema fields.

Where persisted state is involved, migration is copy-forward and idempotent: read the Pulse key,
fall back to the T3 key, validate it, write the Pulse key, and retain the T3 value while old clients
remain supported. Account switches and sign-out must clear both namespaces.

### Immutable legacy identifiers

Platform and deployment identifiers that define update continuity or trust remain unchanged even
though they contain T3 branding. This includes mobile bundle/package IDs, current App Store and
Play records, existing Clerk instance IDs and user IDs, production signing identities, deployed
relay database keys, environment IDs, and existing update-project identifiers. They are documented
as invisible compatibility identifiers rather than exposed as product branding.

## Connection and authentication behavior

Clerk must allow both legacy and Pulse redirect schemes before any client begins emitting the new
scheme. Desktop and mobile clients register both schemes during the transition. The same Clerk
instance and linked user IDs are retained.

The relay accepts legacy and Pulse client IDs, audiences, and token types, normalizes them to one
internal client kind, and applies identical scope policy. New clients emit Pulse identifiers only
after the deployed relay accepts them. Environment servers continue accepting proofs created for
supported older clients. Token passthrough or cross-audience acceptance is not introduced; each
accepted alias maps to the same explicitly configured resource identity.

Wire schemas, HTTP paths, WebSocket method names, pairing payloads, and environment descriptors
remain backward compatible. Internal TypeScript package namespaces may be migrated mechanically,
but this must not change serialized tags or public wire values without a compatibility decoder.

## Local and mobile state

Desktop continues discovering existing `t3code` and legacy display-name data directories before
creating Pulse paths. Server home configuration accepts both `PULSE_CODE_HOME` and `T3CODE_HOME`,
with an explicit and tested precedence rule. Background-service discovery recognizes both service
names and never installs a duplicate over an existing T3 service.

Mobile migrates saved connections, device identity, relay registration, recent-thread shortcuts,
DPoP material, connection catalogs, and Clerk token storage without erasing legacy keys. Because
the bundle/package identifiers remain unchanged, the operating-system secure-storage container is
preserved. Push and live-activity registrations remain valid; if any presentation-level client ID
changes, the client re-registers idempotently under the same account and device identity.

## Rollout order

1. Add compatibility readers, alias acceptance, migration helpers, and focused tests while T3
   remains the visible name.
2. Deploy relay and authentication configuration that accepts both identity families.
3. Ship bridge releases to mobile, desktop, web, and server with dual-read behavior.
4. Change canonical writes and all user-visible branding to Pulse Code.
5. Rename the local repository directory after scripts and documentation no longer assume its old
   basename.
6. Keep legacy acceptance for every supported historical client. Any future removal is a separate,
   telemetry-backed breaking-change project.

## Verification

Focused tests must prove both directions of compatibility:

- an old mobile identity authenticates through the updated relay and connects to a Pulse server;
- a Pulse client discovers and connects to an environment linked before the rename;
- legacy and Pulse deep links complete OAuth and pairing;
- legacy storage and data directories migrate without losing or duplicating state;
- sign-out, account switching, revocation, and cleanup cover both namespaces;
- update metadata continues targeting the existing installed applications;
- all visible web, desktop, mobile, server, CLI, documentation, and release copy says Pulse Code;
- wire-schema fixtures from supported T3 releases still decode and authorize correctly.

## Non-goals

This rebrand does not create new store listings, a new Clerk tenant, new user identities, a new relay
database, or a new environment protocol. It does not remove legacy compatibility aliases. Visual
identity and replacement artwork may be developed separately; this design governs naming and
runtime compatibility.
