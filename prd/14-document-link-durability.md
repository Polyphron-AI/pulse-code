# Durable document links

Status: proposed (see CR-2026-08-22-document-link-durability)
Design authority: `docs/plans/2026-08-22-document-link-durability-design.md`

## Problem

A chat link to a project document is only usable in the minutes after it is
written. The asset capability refuses every type except browser documents and
images, so links to reports, spreadsheets, and archives cannot be served at all.
When an open does fail, mobile reports one message for every cause, so a user
reading a five-day-old thread on a phone cannot tell a deleted document from a
broken app. Nothing about the link tells the user what tapping it will pull over a
tunnelled or metered connection.

## Scope

- <a id=durable-reference></a>**Durable reference.** A document link is a thread
  plus a workspace-relative path. Opening it re-resolves the capability and
  re-streams the file from the environment on every tap, with no dependence on a
  cached copy, a previously minted URL, or a retained server-side artifact.
- <a id=any-document></a>**Any project document.** A download capability may be
  issued for any regular file inside the thread's canonical workspace root, not
  only browser-previewable types.
- <a id=bounded-capability></a>**Bounded capability.** A download capability
  addresses one exact path, can never reach a sibling, and is never issued for a
  path whose segments begin with a dot.
- <a id=honest-state></a>**Honest state.** A document that is no longer in the
  project, a disconnected environment, a device with no app for the type, a
  cancelled transfer, and a failed transfer are each reported distinctly.
- <a id=remote-aware-presentation></a>**Remote-aware presentation.** Before a
  transfer starts the user sees the document name and, for large documents, its
  size; during a transfer they see progress and can cancel it.
- <a id=truthful-actions></a>**Truthful actions.** An open action is offered only
  when it leads somewhere usable: the built-in preview is not offered for
  documents the viewer cannot render.
- <a id=every-connection></a>**Every connection.** Local, remote/relay, and tunnel
  connections all open documents through the prepared connection's HTTP base URL
  and the signed asset route.

## Non-goals

A server-side artifact store, retention windows or garbage collection, serving a
document as of a past turn, offline download queues, download management UI beyond
progress and cancel, and changes to web, desktop, the Files tab, or provider
adapters. Document iconography is wanted but sequenced separately: the icon
pipeline already accepts repo-authored symbols, and the work is gated on a
regeneration step that only runs on macOS
(`G-2026-08-22-icon-regeneration-macos-only`).

## Constraints

Additive contracts only: existing asset callers keep their behavior without
changes. No capability may address a path outside the thread's workspace root.
Temporary copies belong in the operating-system-managed cache and are never
reused across opens.

---

**Created:** 2026-08-22 . **Status:** proposed . **Owner:** Product
