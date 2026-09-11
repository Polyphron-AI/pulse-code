# Upstream compatibility: first tranche

Approved scope: identity configuration, provider presentation, a settings contribution,
and a bounded composer extraction. This is a behavior-preserving first slice, not a
claim that the whole fork is compatible with an upstream release.

## Baseline

- Pulse source: `0662eb65014be8a08840f46dc5005754cf9a7767` (preview 20260910.8).
- Historical upstream review target: `09e8de9c655ae85410bf6b00446f272a01da81c7`.
- The prior integration inventory is evidence of review work, not a completed upstream baseline.
- Work is isolated from the dirty developer checkout. No live state or release changes.

## Design

1. Put product identity values in a dependency-free shared module consumed by build
   configuration and runtime branding. Preserve legacy identifiers and aliases.
2. Separate lightweight web provider presentation from settings schemas. Chat must
   not import settings schemas just to find an icon. Preserve provider ordering.
3. Extract messages-while-working settings into a component owning its selection,
   validation and reset behavior, using the existing settings search entry.
4. Extract dictation coordination from ChatComposer: busy state, send reason and
   transcript insertion policy. Keep existing capture lifecycle and keyboard guards.

No provider protocol, event schema, updater, migration, or persistent-agent changes
belong in this slice. No generic plugin registry is needed.

## Measurement and acceptance

Record changed hotspot lines and remaining duplicated definitions with Git diffs.
These are locality measures, not promised conflict or time savings. Run focused
identity, provider, settings and dictation tests, plus scoped static checks.

For the next real upstream import, record the upstream range, cleanly applied
commits / attempted commits, conflicting files and manual resolution hours. Compare
the same representative changes against this baseline and the refactored revision.
Break-even sync count is implementation hours divided by observed hours saved per
sync; leave it unknown until measured. Never advance an upstream baseline just
because source is equal or an inventory entry exists.
