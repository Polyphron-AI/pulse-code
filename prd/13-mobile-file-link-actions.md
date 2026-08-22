# Mobile file-link actions

Status: approved for implementation (see CR-2026-08-21-mobile-file-link-actions)
Design authority: `docs/plans/2026-08-21-mobile-file-link-actions-design.md`

## Problem

The built-in mobile file viewer does not always activate when a user taps a
workspace-file hyperlink in chat. The direct navigation is a one-way interaction
with no reliable fallback for opening generated artifacts in another app.

## Scope

- <a id=choice></a>**Explicit choice.** Tapping a recognized workspace-file
  hyperlink in mobile chat shows Preview in Pulse Code and Open with actions.
- <a id=preview></a>**Preserved preview.** Preview in Pulse Code uses the
  existing thread-file route and preserves linked line targeting.
- <a id=open-with></a>**Remote-safe Open with.** Open with obtains an
  authenticated workspace-file capability, streams the file to temporary mobile
  storage under a safe original filename, and invokes the native chooser.
- <a id=failure></a>**Honest failure.** Disconnected environments, unavailable
  files, invalid asset URLs, download failures, and unavailable native sharing
  produce a visible error without navigating away from chat.
- <a id=unchanged-surfaces></a>**Scoped surface.** External links, web/desktop
  behavior, and direct Files-tab navigation remain unchanged.

## Non-goals

Download progress UI, persistent download management, offline file queues, a new
server endpoint, or changes to provider adapters.

## Constraints

Local, remote/relay, and tunnel environments must all use the existing signed
asset route. Mobile must not construct a request for a file outside the thread's
workspace. Temporary files belong in the operating-system-managed cache.

---

**Created:** 2026-08-21 . **Status:** approved . **Owner:** Product
