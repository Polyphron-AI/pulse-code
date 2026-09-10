# V40 client durability and bulk updates

Reviewed sources: 7839140e5, 36c48a6b7, bfba77816, 9c96ac258, 252df7742.

Mobile now treats unreadable draft/outbox storage as a failed load, preventing writes and attachment cleanup from mistaking saved work for empty storage. A failed debounce remains pending for a later final flush; hydration retries merge saved content with current edits. Pulse's existing schema and model/workspace fields remain unchanged.

Typed transport failures retain queued tasks for retry. Server rejection and authorization failures retain their existing handling, including the bootstrap-deleted and editor compare-and-swap rules. Switching environments carries new-task content into an empty corresponding project draft, prefers repository identity, accepts Windows/POSIX basename fallback, and removes foreign upload ownership only from Pulse's file attachment variant. Existing images retain their data URL representation.

Settings Enter does not blur during IME composition. Shell stream chunks reduce in order and publish once per chunk; completion markers and HTTP snapshots keep their existing readiness semantics. Sidebar bulk replacements skip costly fades beyond 40 changed rows, while small changes retain movement. The drag result passed to memoized rows is stable.

The client batching change does not alter the wire format or require the server coalescer. It preserves all items delivered by that coalescer and the RPC client's bounded queue. Focused tests cover storage faults/recovery, transport tags, environment ownership, IME, shell buffer sizes, and sidebar fade bounds. Primary-agent integrated client verification remains separate.
