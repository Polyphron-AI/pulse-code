---
id: CR-2026-08-22-document-link-durability
status: proposed
impact: additive
author: Claude Opus 5 (Claude Code)
created_at: 2026-08-22
files_touched:
  - prd/README.md
  - prd/14-document-link-durability.md
  - project/state/shards/roadmap.yaml
baseline_sha: d4ec0aaf3
implementation_sha: null
approval_tag: null
related_crs:
  - CR-2026-08-21-mobile-file-link-actions
---

# CR-2026-08-22-document-link-durability

## Summary

Make a chat link to a project document openable for as long as the document
exists, on a phone connected over a tunnel or relay, by treating the link as a
reference that is re-resolved and re-streamed on every tap rather than as a URL
with a lifetime.

## What changed (human-readable)

- `prd/README.md` — adds the document-link durability requirement to the set.
- `prd/14-document-link-durability.md` — records the durable-reference model, the
  any-document capability with its bounds, distinguishable failure states,
  remote-aware presentation, and truthful actions.
- `project/state/shards/roadmap.yaml` — adds `R-2026-08-22-document-link-durability`
  as an active Now item under T1, continuing the file-link work rather than
  claiming a new slot.

## Relationship to CR-2026-08-21-mobile-file-link-actions

This reopens one line in that CR's roadmap item. `R-2026-08-21-mobile-file-link-actions`
listed "persistent downloads or offline queues" as a rabbit hole, and that stays
ruled out — this CR adds no storage and no queue. What it adds is durability by
re-resolution, which is the opposite trade: nothing is kept, so nothing can go
stale or need sweeping. The two-action menu that CR shipped is kept and made
type-aware.

## Locked decisions touched

- The server remains the filesystem and capability boundary. Unchanged.
- Orchestration stays pure and the complexity stays at the adapter boundary. This
  work touches the asset capability and one mobile helper; no orchestration event,
  command, or projection changes.
- Web, desktop, and Files-tab behavior does not change.
- New: a download capability is exact-path only and never addresses a dot-prefixed
  path segment. This is a tightening relative to the existing preview capability,
  which permits sibling traversal within a directory.

## Evidence

- User direction (2026-08-22 session): document links must still open days later,
  re-streaming the original if needed, and must be presented for a phone connected
  over a tunnel. The user selected re-resolution over a durable artifact store.
- Repository evidence: the capability gate rejects every non-browser-previewable
  type (`apps/server/src/assets/AssetAccess.ts:212`,
  `packages/shared/src/filePreview.ts:1`), so most document links cannot be served
  today; mobile collapses all causes into one alert
  (`apps/mobile/src/features/threads/ThreadFeed.tsx:1449`).
- Dependency evidence: progress and cancellation already exist on the download
  call mobile makes (`DownloadOptions.onProgress` and `signal` in
  expo-file-system 56.0.8); every connection mode already carries an
  `httpBaseUrl`, and the asset route needs no bearer header.
- Rejected alternative: serving the version as of the message's turn from the
  checkpoint ref, because checkpoint capture excludes gitignored paths
  (`apps/server/src/vcs/GitVcsDriver.ts:737`) and would therefore miss generated
  reports and exports.

## Sign-off required

- [ ] Product owner design approval
- [ ] Product owner implementation review
- [ ] Baseline seal after the human-initiated commit

## Linked gaps

- None new. Integrated simulator validation remains optional and requires explicit
  user approval under repository policy.

## History

- 2026-08-22 design drafted and proposed after the user specified durable document
  links and tunnel-aware presentation.

---

**Created:** 2026-08-22 . **Status:** proposed . **Owner:** Product
