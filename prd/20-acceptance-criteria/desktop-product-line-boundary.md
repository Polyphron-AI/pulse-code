# Desktop product-line boundary acceptance criteria

> Define the deterministic release contract for Pulse as a downstream product and an independently
> installable desktop application.

## upstream-t3-remains-authoritative

**Given** a feature or release belongs to official T3 Code
**When** it is built, published, or updated
**Then** its source and release authority is the official T3 main repository, not the Pulse
repository.

## pulse-selectively-adopts-upstream

**Given** T3 has released a feature that Pulse may want
**When** Pulse adopts it
**Then** the change enters Pulse through an explicit reviewed pull request from `upstream`, and
Pulse is not required to adopt unrelated T3 changes or match an upstream commit.

## pulse-may-diverge

**Given** a Pulse-only feature is approved
**When** Pulse releases it
**Then** Pulse CI builds only Pulse artifacts, and official T3 remains unchanged unless its own
maintainers independently accept and release that feature.

## desktop-installs-side-by-side

**Given** official T3 is already installed on Windows, macOS, or Linux
**When** the same user installs Pulse
**Then** both applications remain installed under distinct application IDs, paths, shortcuts,
protocols, user-data roots, signing/update identities, and artifact names.

## desktop-runs-concurrently

**Given** official T3 and Pulse are both installed
**When** the user launches both applications
**Then** each acquires its own single-instance lock, opens its own window and server state, and
neither redirects activation to, terminates, or mutates the other.

## lifecycle-actions-are-isolated

**Given** both products are installed
**When** Pulse is installed, updated, repaired, or uninstalled
**Then** official T3 binaries, state, shortcuts, protocol registrations, and update configuration
remain unchanged; the reciprocal condition holds for T3 lifecycle actions.

## pulse-starts-fresh

**Given** T3 already has user state on the machine and Pulse has never run
**When** Pulse starts for the first time
**Then** Pulse creates only Pulse-owned state and does not automatically read-write, migrate, copy,
move, or delete T3 state.

## import-is-explicit-and-nondestructive

**Given** a future Pulse import tool supports a T3 data category
**When** the user explicitly selects and confirms an import
**Then** Pulse previews the selection, copies supported data into Pulse-owned state, leaves T3 state
unchanged, and reports unsupported items and partial failures.

## web-and-mobile-remain-shared

**Given** the initial product-line boundary is in effect
**When** web or mobile clients are built and released
**Then** they remain shared clients rather than separate Pulse/T3 product distributions, and use
capability checks for Pulse-only server or desktop behavior.

## release-proof-covers-every-desktop-platform

**Given** a Pulse desktop build is proposed for team-wide installation
**When** release readiness is evaluated
**Then** package inspection plus install, simultaneous-launch, update, and uninstall tests prove the
identity and state-isolation cases above on Windows, macOS, and Linux.

## Cross-references

- PRD: [Product-line and distribution boundary](../11-product-line-and-distribution-boundary.md)
- Decisions: [Product decisions](../../project/decisions.md)
- Gap register: [Known integration gaps](../../project/known-gaps.md)

## Open questions

- Exact platform-specific identifiers and importable data categories remain pending implementation
  planning; they must conform to this contract rather than reopen it silently.

---

**Created:** 2026-08-21 . **Last opened:** 2026-08-21 . **Last edited:** 2026-08-21 . **Status:** approved-direction . **Owner:** Product . **Layer:** tactical
