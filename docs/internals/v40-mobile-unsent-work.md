# V40 mobile unsent work

Sources: c0bf35466, 8e129a0df, e1230d603, 5b68b2c8e. Base: cd04470cd.

Draft rows share the pending-task list slot. Independent draft IDs allow several drafts per project; legacy project-scoped keys migrate on hydration with project metadata, content, chosen models and share receipts retained. Empty draft stamps stay in memory while the composer is bound and do not create visible rows.

Every task submission persists to the outbox before its composer clears. Connected submissions open a temporary thread shell with the original command/message/thread identity; offline submissions return to the list. The drain performs uploads and creation. Pending follow-ups remain in the feed and acknowledgements bridge the interval before server projection. Pending edits acquire delivery ownership and persist the composer before compare-and-swap removal.

Creation failure restores a separately keyed draft and exposes Edit task. The thread displays preparation or failure within Pulse's existing composer overlay, preserving keyboard/inset behavior rather than importing upstream floating-control or dictation layout prerequisites. Existing native image data URLs and file upload ownership are retained. Shared timing uses requestedAt during provider startup and rejects stale active-turn timing; unrelated duration formatting was not imported.

The existing storage read-failure guards, retry identity, provider capability checks, usage panels, compaction, media visibility and environment ownership are retained. Cloud archives and the upstream background attachment-upload subsystem were not prerequisites for this adaptation and were not added. Web and desktop draft behavior is unchanged; shared timing is covered by focused tests.

Verification uses synthetic draft migration, storage recovery, multi-draft retargeting, pending-row deduplication, queue edit/CAS, creation outcome and timing tests, plus mobile type checking. Integrated native verification remains with the primary agent.

## Follow-up: queued visibility, image readers, and branch navigation

- `d6aa179ad`: existing-thread outbox work now has a row indicator, stays in the legacy recent list, and keeps settled threads in the active list and reorder plan. Pulse pin and snooze behavior remains intact. Queue membership uses environment-scoped thread keys; delivery returns settled threads to their shelf.
- `c4353bc6b`: file-backed image records are accepted by the real draft and outbox decoders. Preview and asynchronous inline preparation retain their files, rebase owned iOS paths, preserve MIME types, and respect cancellation. Existing image writers still emit inline bytes, and Pulse keeps its existing version-4 outbox writes. The upstream background upload queue and cloud draft archive are not introduced. Pulse file upload ownership and outbox compare-and-swap guards remain in place.
- `7dda0b1c0`: both mobile list styles can start a new task on an existing thread's branch. The route waits for checkout before opening the composer, serializes replaced checkout requests, and guards native dismissal while checkout is pending. Failed checkout does not expose a sendable composer. Existing worktrees do not switch the shared project checkout. The branch picker retains Pulse's rule to persist successful checkout selection even if its sheet was dismissed while the operation ran.

Focused proof: 90 list/reorder tests, 144 image/persistence/outbox tests, and 20 branch/context/start-turn tests pass. Mobile typechecking passes. The branch fixtures disable automatic line-ending conversion in their own temporary Git repositories. Native route interactions remain for the primary agent's integrated check.
