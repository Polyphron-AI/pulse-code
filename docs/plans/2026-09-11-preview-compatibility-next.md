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
