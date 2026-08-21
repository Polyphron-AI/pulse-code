# Product-line and distribution boundary

> Keep official T3 true to its upstream product while allowing Pulse Code to evolve as a distinct,
> downstream desktop product that can run beside it.

## Purpose

Define which repository and release system owns each product, where Pulse may diverge, and which
client surfaces must remain shared initially.

## Product relationship

- **T3 Code is upstream-owned.** The official T3 main repository is the sole product authority for
  T3 source, features, packaging, CI, release artifacts, and updates.
- **Pulse Code is downstream-owned.** Pulse maintains its own repository history, CI, desktop
  artifacts, signing, update channel, and release cadence.
- Pulse may selectively adopt features after they are released by T3. Upstream changes enter Pulse
  through explicit, reviewable pull requests from the configured `upstream` remote; syncing is never
  automatic and does not imply parity.
- Pulse may ship Pulse-only features. Those features do not enter official T3 unless they are
  independently accepted and released by the T3 project.
- Pulse CI builds Pulse artifacts only. It must not build or publish a modified T3 distribution from
  Pulse source, and the two products are not required to build from the same commit.

## Desktop boundary

The product identity boundary applies to packaged desktop applications on Windows, macOS, and Linux.
Pulse desktop must own identifiers that do not collide with official T3, including:

- application and bundle IDs;
- installation and application paths;
- user-data and cache directories;
- single-instance locks, OS app identifiers, and Linux desktop/WM identifiers;
- URL/deep-link protocols and protocol-handler registrations;
- Start-menu, desktop, Applications-folder, and launcher names;
- signing/notarization identities, update feeds, channels, artifact names, and release destinations.

Installing, launching, updating, or uninstalling Pulse must not replace, mutate, claim protocols
from, or delete an official T3 installation. Both applications must be able to run concurrently.

## First-run and import policy

- Pulse starts with fresh, Pulse-owned desktop state and must not automatically discover, migrate,
  copy, move, or delete T3 state.
- Import from T3 is a later, optional, explicit user action. It must preview the selected data, copy
  only supported categories into Pulse-owned state, leave the T3 source unchanged, and report
  partial failures.
- Compatibility aliases may be accepted only where they do not claim T3's OS-level identity or
  cause implicit state migration. They are not a substitute for separate desktop identity.

## Shared clients initially

Web and mobile remain shared clients initially. This decision does not create separate Pulse and T3
web or mobile packages, stores, URLs, identities, or release trains. Shared client code must remain
capability-aware so Pulse-only server or desktop features can be exposed without requiring feature
parity in T3.

Creating separate web or mobile product identities is a future scope change and requires a new
locked decision and change request.

## In scope

- A permanent Pulse desktop distribution for Windows, macOS, and Linux.
- Side-by-side installation and simultaneous execution with the official T3 desktop application.
- Selective upstream intake and Pulse-only feature development.
- Fresh Pulse state with an explicitly initiated import path added later.

## Out of scope

- Building or publishing T3 artifacts from the Pulse repository.
- Automatic upstream synchronization or mandatory feature parity.
- Automatic migration from, shared writable state with, or takeover of an existing T3 install.
- Separate Pulse web and mobile product identities in the initial boundary.

## Release gate

Pulse desktop is not ready for team-wide installation until focused package inspection and
side-by-side tests prove every desktop identity surface is isolated on Windows, macOS, and Linux.
The current use of T3 production app identifiers or legacy protocol/state takeover behavior is a
blocking spec-versus-code gap, even when the visible product name says Pulse Code.

## Cross-references

- Acceptance criteria: [Desktop product-line boundary](20-acceptance-criteria/desktop-product-line-boundary.md)
- Locked decisions: [Product decisions](../project/decisions.md)
- Gap register: [Known integration gaps](../project/known-gaps.md)
- Upstream intake boundary: the repository's configured `upstream` remote

## Open questions

- Which T3 data categories, if any, should the first explicit import tool support?
- What permanent Pulse bundle/application IDs, signing identities, and update endpoints will be
  assigned per desktop platform?

---

**Created:** 2026-08-21 . **Last opened:** 2026-08-21 . **Last edited:** 2026-08-21 . **Status:** approved-direction . **Owner:** Product . **Layer:** stable
