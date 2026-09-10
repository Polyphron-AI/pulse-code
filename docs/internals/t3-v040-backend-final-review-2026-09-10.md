# Bounded backend review at b50173ab8

Source d8bc6831c fixes the confirmed legacy script menu crash. Existing IDs remain editable/removable; only newly introduced IDs in project.meta.update are validated. Web shortcut helpers return null for unsupported legacy IDs instead of throwing while rendering. Desktop wraps the same web controls. Native mobile scripts already use their saved ID directly and do not construct shortcut commands, so no native change is needed.

The remaining reviewed candidates are distinct:

- 6a2608292: Claude assistant snapshots can precede task_started; authoritative subagent model metadata is now retained in a bounded pending map and consumed on task registration. Synthetic tests cover snapshot-first ordering, emitted start/progress metadata, preserved effort, and oldest-entry eviction at 64 entries. The test uses the existing synthetic model capability fixture instead of assuming a historical model catalog entry.
- b17cc3d1b: the existing durable request lookup covers only part of the optimization. Internal reactor thread-detail reads still load general activity payloads and shell summary refresh reads all activities. Add filtered/empty activity reads and narrow lifecycle queries in a separate performance batch.
- fc262f1a2: automatic thread title generation still attempts once, then logs failures. Source retries twice with exponential delays while retaining the user-title guard. This is reliability follow-up, not a wire decoder gap.
- 6349a0e68: Antigravity session/new -32603 after authentication previously reported sign-in failure. The distinct safe session/model initialization diagnostic is integrated in a6b99dcd3 with 14 focused tests. This diagnostic correction does not establish real-provider authentication acceptance.

Audited closures: settlement policy matches the fixed target byte-for-byte; Pulse's historical model and settlement migrations remain deliberate adaptations. Desktop runtime ID and schedule subscription incompatibilities are fixed. Attachment cleanup occurs after command commit; replay preflight and projected live buffer budgets are present. Real installer, provider-login and native media acceptance remain separate evidence requirements. Analytics destinations and mutable upstream-main model catalogs are intentionally excluded.
