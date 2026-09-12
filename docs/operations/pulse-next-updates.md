# Pulse Next upstream release checks

The local updater uses no AI. A Windows scheduled task checks GitHub's latest stable
T3 release hourly while the registered user is logged in. This is polling, not an
instant release webhook. It does not run when the machine is off. There are no
provider calls, automatic repairs, pushes, publications or host installations.

## Current limit

Release detection and isolated source preparation are implemented. The full build,
VM installation and packaged-app acceptance pipeline is **not implemented**. The
candidate command deliberately fails its release gate. Never advertise its output
as verified or point an installed application's updater at it.

Pulse launch functionality is not yet integrated. Existing packaging still uses
T3's application identity. Before enabling installation, provide a distinct Pulse
identity/update feed and a disposable VM runner with synthetic state, no host
credentials, and tests for skills, MCP, dictation, settings preservation and
old-client integration. Build the combined application there, install the actual
artifact, then test it. Do not rerun T3's entire suite. Do not use live model calls
for deterministic acceptance checks. Signing and upgrade/recovery need their own
proof. Data migrations can prevent safe application-only rollback.

## Run locally

Requires Node 24, Git and Task. The Node entry point also works without Task.

```powershell
task upstream:check
task upstream:prepare
task upstream:candidate
task upstream:status
task upstream:test
task upstream:features
```

`upstream:features` runs the integrated skills store, library, RPC bridge and
contracts tests, RPC authorization and targeted WebSocket tests, MCP preflight and
connection persistence, dictation lifecycle, browser capture, Groq and Parakeet
adapter suites. Prepared source
worktrees under `.t3` are excluded from host test discovery.
Missing suites, runner failures and timeouts block its
result. Logs and the platform/revision-stamped report live in
`.t3/upstream-updates/features/`. Passing these module tests is not a release gate
pass: real provider/UI integration and packaged-app tests remain required. No
microphone, external provider or model API is used by these fixture-based suites.

Only committed changes enter a candidate. The ledger's `upstreamBase` must be an
ancestor of both the checked-out Pulse commit and the upstream release. An older
or unrelated release stops preparation. The script creates a detached worktree,
then applies the exact Pulse tree delta using a three-way patch. It never runs
dependency lifecycle scripts or the candidate application on the host.

Results live under `.t3/upstream-updates/`. Candidate keys include the GitHub release
ID/tag, Pulse commit and upstream base. Completed preparation or conflict results
are reused; a new Pulse commit creates a new candidate. Conflicts remain available
for inspection. No failed worktree is silently deleted or repaired. Transient
preparation failures are also retained and require operator investigation.

`status.json` records the most recent check, including failures. A lock excludes
overlapping CLI and scheduled runs. If the machine terminates a run, inspect the
PID in `run.lock` and confirm it is no longer running before removing that exact
lock file. A stale lock blocks work rather than risking concurrent mutation.

## Automatic Windows check

Run from the checkout you intend to retain. The registration pins its absolute
Node and script paths; moving the checkout or removing that Node installation
requires re-registration. Do not switch this checkout to an unrelated branch.

```powershell
powershell -NoProfile -File scripts/pulse-updates/schedule.ps1 -Action Install
powershell -NoProfile -File scripts/pulse-updates/schedule.ps1 -Action Status
powershell -NoProfile -File scripts/pulse-updates/schedule.ps1 -Action Disable
powershell -NoProfile -File scripts/pulse-updates/schedule.ps1 -Action Enable
powershell -NoProfile -File scripts/pulse-updates/schedule.ps1 -Action Remove
```

Registration refuses to overwrite an existing task. It uses the current user's
interactive logon, limited privileges, no saved password, a 15-minute execution
limit and no overlapping instances. A blocked candidate exits nonzero. This does
not mean an installed application was changed or needs rollback.

References: [GitHub release API](https://docs.github.com/en/rest/releases/releases),
[Windows task triggers](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger),
[Task guide](https://taskfile.dev/docs/guide).
