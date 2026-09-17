# Pulse feature delivery

Policy version: 2026-09-17.

This is the default workflow for Pulse features and upstream compatibility work.
Its purpose is to reduce repeated AI analysis and repair without weakening tests.
The current feature and evidence belong in the branch's authoritative JSON ledger.
This page owns the process; the ledger owns progress. Do not duplicate either.

## Resuming work

Most turns on a Pulse thread continue a feature that is already designed. On a
continuation turn such as "proceed", read only the ledger's `active` block and the
code it points at. Do not re-read this playbook, `AGENTS.md` beyond its safety
rules, or any skill unless `active.policyVersion` differs from the version above
or the user changes scope. Start from `active.nextAction`; do not re-derive it.

Load a skill only when the turn needs a decision the ledger does not record: a
new design choice, a browser or device verification, or finishing a branch. A
skill read that ends in "the design is already settled" was wasted; check the
ledger first.

## Upstream compatibility updates

Protect Pulse behavior with a stable compatibility suite and checks selected from
the upstream diff. Near-total upstream coverage is not the goal. Keep Pulse
customizations at clear integration points when this reduces recurring conflicts;
do not refactor unrelated code as part of an import.

Start each new import from freshly fetched `origin/develop` in an isolated
worktree. Resolve the latest stable upstream release unless the user selects
another ref, and record its exact commit. Preserve Pulse branding and version
lineage. A clean Git merge is not evidence of behavioral compatibility.

### Routine checks and exceptions

Use deterministic commands for release detection, source preparation, dependency
installation, tests, typechecks, builds and result collection. The existing
commands and their implementation limits are in
[the updater runbook](pulse-next-updates.md). The scheduled updater currently
detects releases and prepares source only; this policy does not make it a complete
automated acceptance or installation pipeline.

- Run the maintained Pulse suite in `scripts/pulse-updates/features.mjs` for an
  imported candidate. Keep regressions for actual Pulse defects in that manifest.
- Compare the upstream diff with Pulse-owned code and its callers, contracts,
  provider adapters and dependencies. Overlapping behavior needs inspection even
  when files merge cleanly. Add focused checks for affected integration points;
  do not automatically run or expand the upstream-wide suite.
- Check the lockfile, runtime and installed dependencies before treating failures
  as regressions. Reuse a valid baseline receipt, or reproduce a suspected failure
  on the unchanged Pulse base with the same supported environment. Label failures
  as introduced, pre-existing, environment-related or unresolved. Never fix the
  live checkout's dependencies just to obtain a baseline.
- Use scoped typechecks and the relevant build to catch integration failures that
  tests miss. Browser, real-provider, native-device and packaged-app evidence stay
  separate and retain their existing authorization requirements.

For an update with complete passing checks and no changed Pulse integration
behavior, collect the report without a default agent review. Missing test
selection, a new upstream interaction, a conflict or a failed check is an
exception requiring investigation. Unknown impact must not be labelled low risk.
Inspect only the relevant diff, callers and failure excerpts. Do not make an
agent repeatedly poll a long-running command or reload successful logs.

Use the active agent for a small exception. A larger repair may justify one
implementation owner and one bounded review of the frozen Pulse integration
changes. Do not review every upstream-only file. Report findings together, fix
the batch, then inspect changed portions and rerun affected checks. This selection
rule overrides the default feature-wide review and delegation below for upstream
imports; it does not waive correctness checks.

### Tests, reuse and completion

Test observable Pulse contracts rather than copied upstream internals or a
coverage percentage. Cover persisted state and cross-feature transitions at the
affected boundary: changed settings, queued work, retry, cancel, restoration,
navigation and provider differences. Test interacting features together where
their combination changes behavior. Passing isolated feature tests is insufficient
for a new interaction.

Reuse results only when their source, transitive dependencies, lockfile, runtime,
configuration and fixtures remain applicable. After a repair, rerun affected
checks and assemble one report from the fresh and still-valid receipts. Record
the revisions behind each result. Do not rebuild for documentation-only changes.

The report names the Pulse base and upstream commit, applied changes, test counts,
check outcomes, unresolved findings and untested surfaces. Missing suites,
timeouts and runner failures are failures, not passes. Passing development checks
does not authorize merging, publishing or replacing the installed application.
Preserve any authorization the user has already given for those actions.

Keep logs and scratch files ignored. Record continuation state in the Pulse
ledger. If usage telemetry exists, report task-bounded main-agent and delegated
usage separately, including cached input; do not sum repeated cumulative counters
or add reasoning tokens again when they are included in output. Distinguish a
verified charge from an API-rate estimate and name the rate and service tier.
When telemetry is absent, say so instead of estimating from messages or elapsed
time. Minimize repeated context and tool turns, not meaningful test execution.

## Before implementation

Read the active ledger record and relevant code, not the whole history. Define
one usable feature and its supported scope. Record an acceptance checklist before
coding, marking each applicable, unsupported with a reason, or not applicable:

- First use, subsequent turns, reload and draft-to-thread promotion.
- Success, failure, retry, cancel, deselect/reset, and changed settings.
- Rapid changes, navigation/unmount, concurrent threads and queued turns.
- Web, compact/mobile web, desktop and older/native clients; provider differences.
- Local and remote environments, worktrees, authentication and permissions.
- Session reuse, process ownership, cleanup, and unchanged upstream behavior.

Separate completion blockers from optional polish. An unsupported case must be
explicit and consistent with the approved scope. Do not silently defer a required
case. Extract a Pulse boundary only when it isolates important behavior for tests
or removes recurring upstream conflicts. Avoid a general extension framework.

## Ownership and implementation

For new feature implementation, default to one Sol implementation owner. Astra makes
scope, dependency and compatibility decisions and performs final integration.
Use another Sol for a bounded review after the implementation is frozen. Parallel
implementation is justified only by independent domains with separate worktrees;
sequence shared contracts, settings and runtime changes. Do not add persistent
agents, background review loops or unrelated feature work.

### Codex agent hygiene

These rules come from the 2026-09-10 usage investigation, where four spawned
agents and their automatic reviewers ran for 13 to 25 hours against compacted
contexts of about 125k tokens and produced the largest Codex bill on record.

- At most three spawned agents per feature, each with one bounded task.
- An agent that has reported is finished. Close it. Do not send a follow-up task
  to an idle agent unless the ledger names that task as the next action.
- Never spawn a replacement for a finished or stopped agent. Reassess first.
- No agent may spawn agents of its own.
- No background review loops. Review is one Sol pass on a frozen revision.
- Before spawning, confirm the task is independent of every other running agent's
  owned files. If it is not, it is sequential work for the owner.

### Codex configuration for Pulse threads

Pulse threads run through the user's Codex home config. The settings below are
the expected baseline; record any deliberate deviation in the ledger.

- `approvals_reviewer = "none"`. With `auto_review`, Codex spawns a guardian per
  worker that re-reads the worker's context on every shell call. Guardians were
  about 254M of 306M automatic-review tokens on 2026-09-10. Use `auto_review`
  only for an unattended run the user explicitly asks for.
- `model_reasoning_effort = "low"` for Sol implementation and review. Astra
  decides scope and integration and may use higher effort for that turn.
- `approval_policy = "on-request"` with `sandbox_mode = "workspace-write"`.
- Keep global skills and plugins to the set Pulse work uses. Every enabled entry
  loads its description into each session. The repo `.codex/config.toml` adds
  only project MCP servers; it does not override these home settings.

### Briefs and reports

Give each agent a brief in this shape and nothing longer:

```text
Objective: <one sentence>
Base: <revision> in <worktree path>, branch <name>
Owned files: <paths or globs>; do not touch anything else
Invariants: <one line per rule that must stay true>
Acceptance: <ledger record id> cases <numbers>
Verify: <exact test and typecheck commands>
Report: commit, test counts, unresolved findings, next action
```

Link the ledger instead of copying conversation history. The completion report
is those four report items only. No narrative, no file inventories, no restated
plan. Check whether an agent is active before sending work.

Keep layered commits. A commit is a recovery point, not an automatic review or
full-build gate. Continue the same feature until its agreed acceptance is met.

## Verification and review

Before using browser results to judge the app, prove the isolated fixture works:
pairing, actual workspace paths, deterministic provider responses, observable
receipts and separate compact/expanded navigation. Reuse the test environment.
Do not spend paid model tokens or contact real MCP services for synthetic tests.
Browser permissions and repository safety rules still apply.

During implementation run the smallest relevant tests. Freeze a revision once the
whole flow works. Review the entire checklist in one pass and report all findings
together, with severity, evidence and an acceptance test. Fix the batch of real
blockers, then review the changed portions and affected checklist entries. New
evidence may require another pass; never suppress a real finding to meet a quota.
If findings repeatedly reopen the design, stop patching and revise the boundary
or missing acceptance case before continuing.

Run one final combined feature check, relevant typechecks and a production build
when applicable. Record revision, commands, outcome and evidence location. Reuse
valid results when their inputs have not changed; invalidate affected results
after edits. Do not repeat full builds for documentation or unrelated changes.
CI owns repo-wide checks unless the user requests them.

Browser success requires persisted state and a provider receipt, not a cleared
composer or optimistic message. Verify failure recovery and immediate reload.
Keep synthetic, physical-device and packaged-app evidence distinct.

## Output and handoff

Save verbose diagnostics in an ignored local log. Return exit status, test counts
and the relevant error excerpt, not asset inventories, complete WebSocket frames
or repeated successful output. Redact credentials. Expand output only to answer a
specific diagnostic question. Keep user updates concise and meaningful.

Update the ledger's `active` block at meaningful checkpoints with the revision,
worktree, acceptance status, unresolved blockers, evidence and exact next action.
It is the first key in the file and the only part a continuation turn reads, so
keep it under about forty lines. Detailed evidence and history live in the later
keys; when a feature completes, move its record out of `active` into history in
the same commit. Keep optional improvements in a separate backlog. On pause,
preserve dirty work and record its location. Do not restart completed
investigations on resume.

Measure actual token usage only when telemetry is available. Otherwise record
review/fix rounds, repeated builds and fixture reruns as proxies, with reasons.
Compare completed features of similar scope; do not invent savings percentages
or optimize away checks that protect correctness.

## Adoption across branches

This policy applies to Pulse Code, Pulse Next and upstream-import batches. New
branches inherit it from `develop`. Before resuming an older branch, import the
documentation-only policy commit or read this playbook from `origin/develop` and
record the policy version in that branch's ledger. Do not merge application code
just to obtain instructions. Never reset or rewrite another thread's worktree.
Running agents must receive a short policy handoff; repository changes alone do
not reload their existing context. This policy does not authorize restarting them.

Pulse Next uses `docs/internals/pulse-next-migration.json`. Other branches should
reuse their existing ledger; if none exists, create one small JSON active-work
record with feature, owner, revision, acceptance cases, evidence, blockers and next
action. Do not copy Pulse Next's implementation status into an unrelated branch.
