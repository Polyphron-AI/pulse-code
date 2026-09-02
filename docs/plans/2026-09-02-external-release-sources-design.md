# External release source links

## Goal

Give Pulse Code one checked-in record of the official OMP and Orca release sources and the
Polyphron-AI forks used for downstream review. A future scheduled workflow should be able to read
the same record without changing how Pulse builds or starts either application.

## Decision

Create public GitHub forks at `Polyphron-AI/oh-my-pi` and `Polyphron-AI/orca`. Keep the official
repositories as the release authorities and the organization forks as porting targets.

Do not add either project as a submodule, subtree, package dependency, or Pulse repository remote.
Pulse launches a user-installed OMP binary and does not compile Orca. Coupling either source tree to
the Pulse checkout would add weight without improving release detection.

## Checked-in registry

The registry records, for each project:

- the official GitHub repository and release page;
- the Polyphron-AI fork;
- how Pulse currently uses the project;
- the latest tag observed when the registry was updated;
- whether that tag has compatibility evidence.

The observed tag is a monitoring cursor, not a compatibility claim. Compatibility remains
unverified until a maintainer records evidence from the relevant Pulse provider or workspace tests.

## Release check

A local command reads the registry and queries the official GitHub `releases/latest` endpoint. It
prints the observed and current tags and can emit JSON for CI. By default, the command is read-only
and exits successfully even when a new release exists. A future workflow can use
`--fail-on-update` to turn a changed tag or a failed request into a non-zero result, then open a
review issue or pull request.

GitHub forks do not publish copies of upstream GitHub Releases. Monitoring therefore queries the
official repositories directly. Fork synchronization is a separate, deliberate operation so an
upstream source change cannot enter Pulse without review.

## Pulse scheduled task

Pulse Code Scheduled chats owns the cadence and run history. A committed Markdown task owns the
monitoring instructions. The saved schedule prompt points to
`tasks/upstream-release-monitoring.md`, so instruction changes remain reviewable and the next run
uses the latest committed version.

This is intentionally a prompt-to-file convention, not a new task-file parser. It uses the
existing project-scoped scheduler, provider session, status UI, mobile controls, and handoff
history. The task runs the release checker in read-only mode and reports one of `NO_CHANGE`,
`REVIEW_REQUIRED`, or `MONITOR_ERROR`. It cannot advance a release cursor, sync a fork, or open a
porting change.

## Boundaries

- OMP is a first-party Pulse provider. A new OMP release should trigger provider discovery, ACP,
  model catalog, cancellation, approval, credential-boundary, and update-path checks.
- Orca is currently a design reference for the Pulse ORCA workspace. A new Orca release should
  trigger review of relevant workspace, worktree, run, gate, diff, remote-state, and OMP behavior.
- Neither fork receives Pulse credentials. Pulse Connect keys are not provider credentials.
- No schedule is activated by this change. Cadence remains environment state controlled from
  Scheduled chats. No issue creation, automatic merge, or automatic deployment is added.
