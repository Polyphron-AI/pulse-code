# Calendar occurrence identity and range boundaries

Calendar and Meetings consume one environment-owned `WorkspaceCalendar` instance. It is provided
alongside workspace tools so MCP readers and WebSocket handlers share its state. The
`workspaceCalendar` capability is optional. It advertises bounded reads, invalidations and requested
read refresh, not a connected account or an event editor. Provider admission and the client views are separate work.

An occurrence ID belongs to the source tuple of connection, calendar, external event and original
occurrence key. A moved recurring instance keeps that key. Its current start, title and source
label never identify it. Cancellation retains the mapping as an unavailable tombstone; confirmed
ingestion restores the same ID. Calendar stores no note IDs. Relationships belong to WorkspaceLinks.

The mapping row also holds the latest schema-encoded normalized-input fingerprint and result revision. Identical
ingestion at the same source generation does not write or increment the revision. A changed input,
including cancellation or restoration, updates the row under a revision predicate in the page
transaction. This is current-state idempotence, not a historical request journal. No payload copy
accumulates per refresh, and no missing row is deleted when a page omits it.

The injected source resolver reads current availability, selection and generation. It must not
refresh providers. Without an adapter, reads report unavailable. Ingestion checks generation again
inside the transaction. Cursors bind the date bounds, display zone, page size and resolved source
selection generations and the owning service instance. A server restart invalidates continuations,
while occurrence IDs remain durable. A cursor from another environment or instance is rejected.

Timed overlap uses display-zone midnights converted by Effect DateTime. It must account for
23-hour and 25-hour days. All-day overlap compares Gregorian dates with an exclusive end.
Only range summaries populate the optional `source` tuple. Detail and agent-read schemas inherit
the optional field for compatibility, but their service responses omit it. It supports retaining
unavailable sources in a loaded range, not occurrence identity or access decisions.
Range reads fetch at most the requested limit plus one, selecting stored summaries without
descriptions. The range index seeks a row-value cursor and stops at the exclusive upper sort key.
Running UTF-8 byte accounting keeps pages within 64 KiB and retains continuations; details and text reads stay within
32,000 serialized bytes. Escaped attendee metadata can be shortened with its truncation flag while
keeping the description intact.

Migration 071 backfills a small source registry once and drops the unused timed/date indexes from 070. Requested reads enumerate at most 101 registry tuples and resolve at most 100, without scanning
occurrence history for sources. Excess sources or source-state metadata beyond 16,000 serialized
bytes set `incomplete`. A failed resolver marks that tuple unavailable and leaves other sources
readable. The account adapter must enumerate selected sources even before their first ingestion.

Zone decoding uses a bounded string pattern, including on native clients. Only server admission
checks Intl support and canonicalizes range and ingestion zones. An older client's zone database
must not reject metadata admitted by the server.

## Due references and invalidation

Due tasks retain task identity and calendar dates. One global TOOLS query uses inclusive bounds
`startOn` through the day before `endBefore`, with state all and limit 100. Null due dates are
excluded. Completion and due-date edits stay owned by TOOLS. They create no event or scheduled job.
Event and due continuations are independent. A cursor-only request skips TOOLS; a dueCursor-only
request selects no occurrence rows. Neither continuation repeats the other first page. A due cursor wraps the TOOLS cursor and, when byte
limits split a TOOLS page, a checked page fingerprint and offset. A changed TOOLS generation or
split-page fingerprint requires restarting from the first page. A range mismatch is invalid input.
`dueIncomplete` distinguishes unfinished or unavailable task results from event-source availability.
Older event-only payloads decode with empty due references and explicitly incomplete due results.

Calendar invalidations contain one nonnegative numeric value, merging committed calendar changes
with TOOLS invalidations. Each subscription emits one combined baseline, including zero. The
read-only TOOLS currentChange accessor seeds the task side without changing existing TOOLS stream
emissions. Calendar atoms consume the replay as a baseline, so mounting or reconnecting performs
one range read. Streams read no ranges and refresh no provider. Identical ingestion,
rolled-back pages and stale generations announce nothing. Account adapters call `invalidate` only
after committing availability or selection changes. Ingestion commits and announcement cannot be
separated by interruption. Refresh has read scope because it requests source reads, never provider
writes. Until the provider adapter lands, Refresh reads the saved range.

Calendar and Meetings share the web `workspaceCalendar` binding on `connectionAtomRuntime`. Atoms
normalize range fields and zone case, capture the environment, and revalidate saved metadata on
changes or reconnect. Source selection belongs to the environment resolver; selection changes
invalidate these queries and invalidate server cursors. A server without the optional capability
produces a successful unavailable state without calling missing endpoints.
The selected URL day also survives other workspace destinations so returning through the sidebar,
palette or history restores the same day. Outside Calendar and Meetings it has no query effect.

`loadMore` is explicit and separate for events and due tasks. It deduplicates IDs across requested
pages. Each invalidation re-reads both sides up to their previously loaded depth, stopping at
exhaustion. The shared change counter cannot prove either side untouched, so an equal first page
does not permit continuation reuse. A cursor conflict restarts the same bounded replay from page 1;
invalid input remains an error. In-flight commands with the same environment and normalized range
share work. A late continuation cannot reopen hidden listeners or overwrite a newer first page.
If Load more succeeds during a refresh, the refresh replays the latest admitted depth before
publishing. A continuation arriving after a newer first page reports a retryable conflict.
A recoverable continuation failure keeps only the bounded unread tail after the last freshly read
sort key for that side and
marks it incomplete, without an unusable continuation cursor. Known unselected or removed source
tuples are still excluded. Rows omitted inside the freshly read healthy prefix stay deleted. Authorization,
not-found, invalid-input and transport failures remain errors. Waiting and failed first-page reads
keep every loaded page visible through the previous-success value without hiding the failure.
Queries and streams use zero idle TTL so their last unmount releases subscriptions immediately.
Partial refreshes replace healthy sources. Only rows with an explicit source tuple whose new state
is unavailable or disconnected can be retained, after fresh rows within the loaded cap. Unselected,
removed and unknown sources are not retained. Older servers may omit the optional tuple, so their
partial pages show fresh rows only. Merged results sort by start and occurrence ID.
The 30-second stale threshold controls requested mount freshness only. No elapsed clock triggers a
request and no hidden consumer retains a provider listener. A failed configuration check stops
invalidation signals; mounted range/detail reads still surface that failure. A silent change stream
is never evidence of an empty calendar.

Phone delivery follows D24 through responsive web and the shared desktop UI. Contracts and
client-runtime atoms use no DOM, Buffer or TextEncoder, and outbound zones need no host ICU lookup.
No React Native screens are added. Native adoption should reuse `createWorkspaceCalendarAtoms`,
including explicit paging and capability absence. Native, real-account, packaged, relay/tunnel and
physical second-device acceptance remain separate from focused service and shared-runtime tests.

Calendar references open through the shared web and desktop opener and resolve only the selected
ID before selecting its day in the environment's display timezone. Opening and resource project
selection create no grants. The selected detail mounts the shared zero-idle-TTL detail atom;
closing it or leaving the route releases that consumer. T4 consumes the same binding for Agenda.

The MCP reader must resolveLinked for its calling thread/project before accessing Calendar. It
calls read for that exact occurrence only, with UTF-8-safe offsets and no range, source discovery
or provider refresh. Calendar not-found maps to the existing WorkspaceLinksError not-found; other
Calendar failures map to unavailable through Schema.is. The service reserves space inside its
32,000-byte read bound for the MCP key/type envelope. Turn context uses the existing snapshot title
and calendar-event label within the shared 30-item, 4,096-byte budget. It reads no Calendar bodies.
All provider adapters consume that common pre-adapter path; MCP availability still depends on the
provider's advertised capability.

Rendered Calendar/Meetings workflows and user guidance remain the W6-T4/T5/T9 integration gate.

Week uses a shared wall-time axis, with a repeated-hour slot on fold weeks and a shaded missing
interval on ordinary days. A spring gap leaves a shaded skipped interval. Splitting segments at
these boundaries preserves actual duration while keeping every column aligned with the single
gutter. Only starts in a repeated local interval show GMT offsets. The sticky day strip and untimed band share
one horizontal scroller and gutter with the timed columns. Coarse hit areas grow into free space,
clamped at adjacent intervals and day boundaries, without changing event height or overlap packing.
Week cards flatten the accepted Agenda white overlay against the background so grid lines cannot
show through. The picker imports only en-GB by subpath, treats Date as local field storage and uses
the display-zone clock for today. It creates no refresh timer.
