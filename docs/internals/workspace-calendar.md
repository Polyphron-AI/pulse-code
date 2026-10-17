# Calendar occurrence identity and range boundaries

Calendar and Meetings consume one environment-owned `WorkspaceCalendar` instance. It is provided
alongside workspace tools so later MCP readers and WebSocket handlers share its state. The
`workspaceCalendar` capability is optional. It advertises bounded range and detail reads, not a
connected account or an event editor. Provider admission and the client views are separate work.

An occurrence ID belongs to the source tuple of connection, calendar, external event and original
occurrence key. A moved recurring instance keeps that key. Its current start, title and source
label never identify it. Cancellation retains the mapping as an unavailable tombstone; confirmed
ingestion restores the same ID. Calendar stores no note IDs. Relationships belong to WorkspaceLinks.

The mapping row also holds the latest normalized-input fingerprint and result revision. Identical
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
Range reads fetch at most the requested limit plus one, selecting stored summaries without
descriptions. Pages shrink at 64 KiB and retain a continuation; details and text reads stay within
32,000 serialized bytes. Escaped attendee metadata can be shortened with its truncation flag while
keeping the description intact.

Source discovery is capped at 101 stored source tuples and resolves at most 100. Excess sources or
source-state metadata beyond 16,000 serialized bytes set `incomplete`. The account adapter must
retain that admission limit or provide bounded selected-source enumeration before expanding it.

Phone delivery follows D24 through responsive web. These contracts require neither Buffer nor
TextEncoder and add no React Native screens. Native, real-account and remote-device acceptance
remain separate from service tests. Change streams and client atoms belong to W6-T1b; this service
starts no timer or background refresh.
