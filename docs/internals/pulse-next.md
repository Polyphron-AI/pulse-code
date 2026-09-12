# Pulse Next: upstream-first Pulse Code

Pulse Next is a local migration experiment, not a new published product or a
replacement for a working Pulse installation. The user approved starting from
T3 revision `09e8de9c655ae85410bf6b00446f272a01da81c7` and bundling the Pulse
behavior to carry across. This explicit migration record is retained for
cross-session handoff; it is not an upstream implementation-plan convention.

The authoritative candidate inventory is `pulse-next-migration.json` beside this
document. Its entries describe desired behavior and evidence to inspect, not
features already ported or a blanket instruction to cherry-pick source commits.

## Ownership

Keep T3-owned modules at upstream paths and preserve their existing interfaces.
Port Pulse behavior through existing composition where possible. Introduce a
small Pulse-owned module only when it removes a recurring repair or makes an
important Pulse behavior testable through its interface. Do not duplicate the
T3 application, replace every shared file, or build a generic plugin registry.

Runtime providers remain providers. Agent roles remain thread policies. Keep
orchestration's decider/projector/reactor meanings and pure decision logic.
Carry Pulse policy and tests, not old implementations of fixes already inherited
from the upstream baseline. A source file or PRD is evidence, not proof of a
completed, accepted feature.

## Safety before execution or distribution

This branch initially still contains upstream product identifiers and defaults.
Do not install, publish, deploy or launch it against a real home directory. The
first implementation bundle must establish isolated Pulse desktop identity,
protocols, state, credentials and update ownership. Use a disposable worktree home
for later tests. Do not silently discover or migrate T3 or Pulse user data.

Do not replay migrations into live state. Design a versioned, explicit copy-only
import with fixture tests before any data migration. Preserve web/desktop/mobile
and local/remote/relay/tunnel contracts; do not assume identical platform IDs or
storage keys are safe merely because they occur in an older source snapshot.

No source publication, signing, updater destination change, outbound work-system
mutation or automatic agent activation is authorized by this experiment. Role and
schedule migration must preserve explicit opt-in, cancellation, visibility and
usage accounting. Never enable persistent agents as a side effect of import.

## Migration sequence and comparison

1. Pin the upstream baseline and Pulse source snapshots. Record unfinished and
   uncommitted work separately; do not silently select one divergent branch.
2. Establish identity and state isolation, then prove focused baseline checks.
3. Agree the coding-only launch scope in the manifest: Luna, Argo, watchdog,
   SOP cookbook, skills, MCP and dictation. Orca and OMP are excluded. The earlier
   PR-filter pilot is deferred. Architecture approval and visual comparison come
   before runtime ports. The paused old PR import remains comparison evidence,
   not a reviewed implementation to copy wholesale.
4. Port further bundles in dependency order. Add Pulse preservation tests before
   restoring implementation. Keep upstream imports and Pulse changes separate.
5. Review the combined result across affected clients, providers and connection
   modes. Record source revision, code revision, checks and acceptance gaps.
6. Rehearse a later upstream update against the slice and compare manual conflict
   files, repeated repairs, Pulse diff size, review rework and elapsed effort.

Retain the current Pulse branch until the candidate demonstrates required behavior
and a lower update burden. A clean upstream starting tree proves ancestry, not
runtime acceptance, migration safety or future compatibility. No speed-up is
claimed before a like-for-like experiment.

## Resuming

Read the manifest, verify the named revisions and working trees, then select the
next bundle whose dependencies are satisfied. Update only observed state and
record the next action before pausing. JSON owns migration status; this document
owns architectural constraints. Existing T3-disposition ledgers remain historical
evidence on their recorded branches and must not be marked complete by this fork.
