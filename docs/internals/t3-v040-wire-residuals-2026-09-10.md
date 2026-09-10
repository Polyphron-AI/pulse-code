# V40 wire residual fixes

The desktop automation status codec now uses the full runtime tab identifier rather than the public preview tab identifier, which is limited to 128 characters. Runtime identifiers include environment, thread, epoch and tab, so agent-created thread names could fail IPC result encoding. Source 2fbe31309 supplies the separate desktop codec and regression; the public limit remains unchanged.

Pulse shell subscriptions now explicitly opt in to schedule events with `schedules: true`. Older servers discard the optional unknown input field. Pulse clients send it for initial and resumed subscriptions, including the HTTP-authorized snapshot path.

Subscribers without that opt-in receive no schedule event variants. A schedule update produces an existing shell snapshot without schedules, advancing the cursor even when a replay contains only schedules. Replacement snapshots cover later events through their authoritative sequence, so a coalesced batch requires only one snapshot read. Existing project/thread events and synchronization controls retain their order. Live replacements pass through the same byte/item budget as other coalesced output; opt-in clients keep the original event path. Initial and forced-resync snapshots observe the same opt-in.

Focused tests cover long desktop runtime IDs; legacy input decoding; default, false and true schedule inputs across live/replay/resync; schedule-only cursor advancement; mixed event ordering; client resubscription opt-in; and replacement snapshot byte-budget failures. All use synthetic data and local test transports. This preserves Pulse scheduling on web, desktop and mobile while allowing V40 clients to decode its shell stream.
