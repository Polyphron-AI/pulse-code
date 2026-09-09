# T3 correctness sync, 9 September 2026

The user approved staged T3 integration with three agents after the compatibility review. This first batch brings focused correctness and performance fixes into Pulse without adopting the larger provider, mobile, migration, or UI redesigns.

Pulse base: `f3d6b59b2`. Upstream stable target for source selection: T3 v0.0.40, `09e8de9c6`. This batch does not establish full v0.0.40 compatibility or advance the recorded baseline.

## Work and ownership

- [x] Review stable changes, overlap, migration collisions, and active Pulse work.
- [x] Select staged cherry-picks and minimal ports over a whole-branch merge.
- [x] Create a separate integration worktree and three agent worktrees.
- [ ] Verify focused baselines after dependency setup.
- [ ] Git agent: push destination safety, submodule setup, missing-worktree deletion, and worktree timeout.
- [ ] Replay agent: complete projection bootstrap replay, bounded routine history reads, and linear Codex input buffering.
- [ ] Claude agent: restrict metadata capabilities and preserve provider secrets on redacted saves.
- [ ] Coordinator: restore queries after connection interruption and retry credentials during an update restart.
- [ ] Review each agent's commits and resolve findings.
- [ ] Integrate and run focused tests, lint, and package-scoped typechecks.
- [ ] Record exact upstream provenance, adaptations, verification, and deferred work.
- [ ] Check all pre-existing modified files remain unchanged before local integration.

## Integration constraints

Preserve OMP isolation and lifecycle, scheduled Git policies, Pulse service endpoints, and current voice work. Never modify the live database or start test servers against it. No schema, package-version, or dependency upgrades belong to this batch. Do not push, open a PR, publish, or run browsers.

Selected upstream commits are `12c497083`, `be3da50e9`, `e6a109b9f`, `994372ba4`, `a6797b3b9`, `c034f51bb`, `702a6ade3`, `95834d68a`, `ac4f1a2b6`, `afa830980`, and `589a9d0e2`. A commit can be adapted or deferred if its dependencies exceed this batch. The final ledger must describe that honestly.

## Verification

Run only affected test files and package-scoped typechecks. Backend changes carry behavioral regressions. Use deterministic signals and worker drains for asynchronous tests. Exercise the shared reconnect state used by web, desktop, and mobile; no new IPC or protocol schema is expected. Git safety must retain scheduled-handoff semantics. Claude metadata restrictions must preserve model options and source-control context while preventing executable tool use. Test chunk framing and replay beyond a page boundary.

Native Windows test-infrastructure failures should be distinguished from application failures, with the smallest reproducible evidence and a supported runtime fallback where available. Do not weaken tests merely to obtain a pass.
