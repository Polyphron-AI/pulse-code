# Pulse feature delivery

Policy version: 2026-09-13.

This is the default workflow for Pulse features and upstream compatibility work.
Its purpose is to reduce repeated AI analysis and repair without weakening tests.
The current feature and evidence belong in the branch's authoritative JSON ledger.
This page owns the process; the ledger owns progress. Do not duplicate either.

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

Default to one Sol implementation owner for the complete feature. Astra makes
scope, dependency and compatibility decisions and performs final integration.
Use another Sol for a bounded review after the implementation is frozen. Parallel
implementation is justified only by independent domains with separate worktrees;
sequence shared contracts, settings and runtime changes. Do not add persistent
agents, background review loops or unrelated feature work.

Give each agent a short brief: objective, base revision, worktree, owned files,
invariants, acceptance cases, test commands and requested result. Link the ledger
instead of copying conversation history. On completion request only the commit,
test result, unresolved findings and next action. Check whether an agent is active
before sending work; use a follow-up task to restart an idle agent deliberately.

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

Update one active JSON record at meaningful checkpoints with the revision,
worktree, acceptance status, unresolved blockers, evidence and exact next action.
Keep optional improvements in a separate backlog. On pause, preserve dirty work
and record its location. Do not restart completed investigations on resume.

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
