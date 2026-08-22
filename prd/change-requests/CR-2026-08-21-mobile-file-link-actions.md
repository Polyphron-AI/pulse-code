---
id: CR-2026-08-21-mobile-file-link-actions
status: approved-for-build
impact: additive
author: Codex GPT-5.6
created_at: 2026-08-21
files_touched:
  - prd/README.md
  - prd/13-mobile-file-link-actions.md
  - project/state/shards/roadmap.yaml
baseline_sha: 3d98e215e
implementation_sha: null
approval_tag: user-approved-design-2026-08-21
related_crs: []
---

# CR-2026-08-21-mobile-file-link-actions

## Summary

Give mobile chat file hyperlinks an explicit Preview in Pulse Code / Open with
choice, using the existing signed workspace-file asset transport for the latter.

## What changed (human-readable)

- `prd/README.md` — adds the mobile file-link requirement to the set.
- `prd/13-mobile-file-link-actions.md` — records the interaction, remote-safety,
  failure, and unchanged-surface requirements.
- `project/state/shards/roadmap.yaml` — records the bounded mobile reliability
  fix as an active Now item.

## Locked decisions touched

- The server remains the filesystem and capability boundary.
- The Files tab keeps its direct built-in preview behavior.
- Web and desktop behavior does not change.

## Evidence

- User direction (2026-08-21 session): the current built-in viewer often does not
  activate from a hyperlink; the user selected a two-action menu and approved the
  design.
- Repository evidence: mobile already recognizes workspace-file markdown links,
  navigates them to `ThreadFile`, and consumes signed workspace-file asset URLs.
- Dependency evidence: the mobile package already includes `expo-file-system`
  and `expo-sharing`.

## Sign-off required

- [ ] Product owner implementation review
- [ ] Baseline seal after the human-initiated commit

## Linked gaps

- None. Integrated simulator validation remains optional and requires explicit
  user approval under repository policy.

## History

- 2026-08-21 design approved and build requested by the user.

---

**Created:** 2026-08-21 . **Status:** approved for build . **Owner:** Product
