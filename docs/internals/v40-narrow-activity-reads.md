# V40 narrow internal activity reads

Source `b17cc3d1b` is adapted to Pulse's existing windowed snapshots and user-input lifecycle SQL. Internal thread detail callers can request no activities or specific activity kinds. SQL filters kinds before applying the bounded limit and decoding payloads. Public snapshots keep their existing activity and pinned lifecycle behavior.

Checkpoint and provider command reactors omit unused activities. Runtime ingestion requests task activities only for task-title fallback. Pulse compaction inference explicitly requests context-window updates and prior compaction boundaries, preserving its existing token-count fallback. Shell summary refresh reads only user-input lifecycle activities through the existing repository method. Rollback and approval recovery retain their broader reads because they use that history.

Validation: 132 focused snapshot, projection pipeline, runtime ingestion and checkpoint tests pass; server types pass. The malformed unrelated activity fixtures prove filtering happens before decoding. The pre-existing compaction token test covers Pulse's inference behavior. Scoped lint has only two existing prefer-set-has advisories.

The separate ProviderCommandReactor empty-history compaction test initially failed at its activity assertion both with and without the new filtered read. Worker drain alone does not establish that the subscribed domain stream has enqueued the dispatched intent. A separate test-only follow-up acquires a domain subscription before dispatch, waits for the persisted compaction failure event, then drains the worker. The original assertion now passes without sleeps or polling; production behavior is unchanged. No live providers or runtime clients were launched.
