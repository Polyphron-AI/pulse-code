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

## First slice delivered

| Hotspot                        | Baseline lines | Refactored lines | Net reduction |
| ------------------------------ | -------------: | ---------------: | ------------: |
| Mobile app configuration       |            386 |              375 |            11 |
| Web provider settings metadata |            114 |               63 |            51 |
| Chat provider icon utilities   |             75 |               56 |            19 |
| SettingsPanels                 |           3163 |             3119 |            44 |
| ChatComposer                   |           4369 |             4361 |             8 |

Reproduce with `node scripts/measure-upstream-locality.mjs`. Total: 133 lines
removed from these files, with extracted implementation retained in focused modules.
The web icon map and settings presentation now share one definition. Chat does not
import provider settings schemas. Dictation send text has one definition instead
of three inline copies.

Server driver registration remains unchanged: it already has an explicit static
registry and only one Pulse-only entry (OMP). A wrapper around that entry would
not yet justify another abstraction. Settings schema/default/search contribution
composition and identity values outside runtime branding/mobile builds remain
follow-up work. No upstream baseline has been advanced.

Focused verification: web settings, provider presentation, branding and dictation;
shared identity values; desktop environment branding; mobile Expo configuration.
Web, desktop and mobile package typechecks pass. Desktop reports existing Effect
suggestions, not errors. Targeted lint and whitespace checks pass.

Surface review: web and desktop share the extracted settings/composer paths; mobile
changes only build identity composition. No provider behavior, wire contracts,
remote connection behavior, keybindings, reset semantics or capture lifecycle was
changed. No live database, background agent, release or browser was started.

Actual merge-conflict reduction, resolution hours saved and break-even sync count
remain unmeasured. This slice establishes locality and regression coverage for a
future matched upstream replay; it does not demonstrate a compatibility percentage.
