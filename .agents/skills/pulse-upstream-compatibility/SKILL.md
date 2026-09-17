---
name: pulse-upstream-compatibility
description: Import or assess an upstream T3 release in the Pulse fork using focused compatibility checks. Use for T3 update imports and Pulse regression investigations, not ordinary feature work or browser testing.
---

# Pulse upstream compatibility

Use the repository's delivery policy as the authority. This skill routes the task;
it does not maintain a second test catalog or workflow.

For a new import or changed policy, read the **Upstream compatibility updates**
section of [the delivery playbook](../../../docs/operations/pulse-feature-delivery.md)
and the `active` block in `docs/internals/pulse-next-migration.json`. For a
continuation under the same policy, start from `active.nextAction` and load only
its referenced evidence and affected code.

Use [the updater runbook](../../../docs/operations/pulse-next-updates.md) for
available commands and automation limits. Run deterministic checks before agent
investigation. Select additional checks from changes to Pulse integration
behavior, including interactions that merge without conflicts. Keep discovered
Pulse regressions in `scripts/pulse-updates/features.mjs`.

Do not chase upstream coverage, launch a default review team, or reread passing
logs. Investigate exceptions, reuse valid receipts, and distinguish code failures
from dependency or fixture failures. Follow the playbook's review selection and
existing browser, installation and publication permissions.

Return the pinned revisions, applied changes, passing and failing checks,
remaining limitations and evidence location. Record task-bounded usage when
available; label estimated cost separately from actual charges.
