# Desktop in-app update and rollback

Status: accepted (maintainer directed build 2026-08-22)

## Problem

The desktop app can update itself forward, but a bad release is a one-way door.
A user who installs an update that breaks their workflow has no way back short
of hunting down an old installer on GitHub. Worse, if the broken part is the
renderer or the bundled server, the Settings UI that owns updates may not load
at all, so the person most affected by a bad update is the one least able to
act on it.

## Scope

- <a id=rollback-choice></a>**Rollback choice.** From Settings → About the user
  can pick any offered previous version, confirm, and have the app download it
  and restart into it. Projects, threads, and settings are kept.
- <a id=crash-proof-path></a>**Crash-proof path.** Rolling back to the most
  recent previous version and installing an already-downloaded update are both
  reachable from the native application menu, handled entirely by the main
  process, so they survive a renderer or backend that cannot start. As long as
  Pulse Code launches, rollback is reachable.
- <a id=data-safety-floor></a>**Data-safety floor.** Rollback never offers a
  version older than the app's minimum compatible version, so a downgrade can
  never land on a build that predates the current install identity or cannot
  read the current data.
- <a id=channel-integrity></a>**Channel integrity.** Rollback only offers
  versions from the user's current update channel, and a pending rollback is
  cancelled by a fresh update check, a channel switch, or a failed check — the
  normal update feed is always restored.
- <a id=deliberate-install></a>**Deliberate install.** A rollback downloads in
  the background and the app keeps running until the user explicitly confirms
  the install, exactly like a forward update.

## Non-goals

Pre-update database snapshots and restore (a candidate follow-up slice, not
required for rollback between schema-compatible versions), rollback for the
mobile app (the stores own its versions) or for CLI-launched servers
(`npx t3@<version>` already is the rollback), differential downgrade downloads,
and any change to how forward updates are discovered or installed.

## Constraints

Rollback uses the same electron-updater install path as a forward update — no
second installer mechanism. The GitHub releases feed is the only version
source. The version floor is a compile-time constant raised deliberately when
a release changes data or identity in a way an older build cannot tolerate.

---

**Created:** 2026-08-22 . **Status:** accepted . **Owner:** Product
