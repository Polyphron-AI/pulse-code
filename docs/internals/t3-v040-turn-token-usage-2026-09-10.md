# V40 turn token usage

Source: `1587f248d`. The compatibility change adds optional normalized usage to `turn.completed` and `turn.aborted` runtime payloads.

`usageScope` is `main_agent`. Complete usage requires input and output totals. Partial and unavailable usage allow omitted totals. Counts are non-negative integers. Input includes cache reads and writes; reasoning is a subset of output. `hasSubagents` signals that the main-agent total may not describe all work.

Claude normalizes result counters and marks interrupted results partial. Missing cache counters contribute zero; invalid counters do not invent totals. Codex calculates turn deltas from cumulative counters, handles duplicate and late notifications, and resets its baseline after rollback. OpenCode collects owned assistant steps, deduplicates their parts, excludes child sessions, and marks unresolved totals partial.

Cursor, Grok, Antigravity and OMP retain their current optional-field omission. Their existing usage data remains available; omission does not mean zero usage. No client display or stored usage-ledger format changes are required by this additive runtime contract. Pulse's raw Claude/Codex usage, cost and plan fields remain intact.

The source ProviderService changes maintain analytics-only turn metadata and record a new analytics event. Those changes are excluded. Existing canonical forwarding carries the payload without conversion; a synthetic forwarding regression covers all three normalized states and legacy raw usage. No automatic analytics or feedback transmission is added.

Initial adapter verification passed 273 of 276 tests, including the new usage cases and all OpenCode cases. One existing malformed Claude rate-limit test exposed normalization before the missing-info guard; this batch moves the guard before normalization. Two existing Codex child-task tests exposed absent model metadata mapping and idle-child reactivation. The unchanged `mapCollabAgentEvent` block in baseline `6c729b2c7` contains both gaps; the token-usage patch does not modify that function. A separate lifecycle follow-up addresses them without weakening the existing tests.

Final batch checks: Claude 124 tests, OpenCode 108 tests, Codex 42 passing usage/other tests with the two documented lifecycle failures, ProviderService 47 tests, contracts 12 tests. Server and contracts typechecks and scoped lint pass. All fixtures are synthetic; no live provider calls or history were used.

## Codex lifecycle follow-up

The separate follow-up restores the missing child mapping from `49f6241dd` and its idle-status prerequisite `4e00471d1`. Model and effort are trimmed and included across child lifecycle/progress patches; metadata-only events do not change status. Parent interaction alone cannot prove that an idle child resumed. All 44 Codex adapter tests now pass, including the two unchanged regressions. The token-usage state and existing child identity/parent links remain intact.
