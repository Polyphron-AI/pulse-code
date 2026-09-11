# Preview compatibility follow-up

Scope approved: repair release-script checks; consolidate Pulse settings schema,
defaults and search contributions; consolidate desktop identity and release values.
All work stays on the preview branch. No main/stable changes or upstream replay.

Use explicit, typed contributions instead of a dynamic plugin registry. Preserve
flat settings keys, defaults, patch omission, search order, app IDs, protocol
aliases, preview data isolation and release-channel behavior.

Verification: scripts typecheck and targeted packaging tests; contract decoding
and patch tests; settings search/UI tests; shared identity and desktop tests.
No repo-wide local checks, provider turns or live database access.

## Delivered and verified

- Scripts project includes its existing Office imports and uses its existing Schema
  JSON encoder for release receipts/configuration. Its typecheck now passes.
- Five local Pulse settings are composed into the existing flat schema and patch.
  Defaults stay in their owning module. Web search contributions reference typed
  setting keys while retaining their IDs, labels and catalog positions.
- Runtime and packager share desktop app IDs, preview storage names, protocol
  aliases, executable/artifact names and release classification. Repository/feed
  overrides remain environment-driven; no new default update endpoint is added.
- 199 focused tests pass: 99 contracts, 25 web settings/search, 10 shared identity,
  10 desktop identity/environment, 55 release/packaging/mobile configuration.
- Scripts, contracts, shared, web, desktop and mobile typechecks pass. Existing
  Effect suggestions are not errors. Targeted lint and whitespace checks pass.

The design skills kept the changes to explicit composition points rather than a
dynamic extension framework. There is no wire-format, settings behavior or default
change. Mac/Linux packaging identity is covered by tests, not new native builds.
Remote/provider behavior is unchanged; no runtime session was started.

No main/stable promotion, installer publication or upstream replay is part of this
follow-up. It establishes a checked preview source for the next validation run.
