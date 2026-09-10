# V40 provider lifecycle residual review

Reviewed sources 01f3e50ec and 940e8233c against integrated b21f8875e.

## OpenCode approvals and stop (01f3e50ec)

Backend/runtime semantics are covered: bounded startup logs with continuously drained pipes, native permission defaults, cancellable inventory probes, retryable replies, automatic replies outside event handling, reconnect cleanup, confirmed stop, native task progress, and stale abort guards. The integrated opencodeRuntime.ts matches source 01f3e50ec exactly. Later adapter changes preserve Pulse usage accounting, queued turns, provider identity and rollback behavior.

Web and mobile delegate unknown/legacy approvals to shared pendingRequests.ts, which supplies actionable fallback controls and excludes token refresh/native input requests. Pulse retains its existing work-log row layout; upstream's unused grouped action-count helper is not required by that layout. No additional lifecycle wire/schema incompatibility was found for this source.

## Claude usage pauses (940e8233c)

Pause notices, per-turn deduplication, overage exemptions, bounded reset waits and normalized account limits were already present. The driver supplies a shared scoped-name reference, and normalized Limits buckets already use it. One residual call passed an empty name object to the warning formatter, so a probed model window still appeared as generic ?7-day model? in its pause notice. The correction passes the same current name used by the Limits update. Allowed/rejected synthetic events verify both the bucket name and the presence or absence of a pause notice. Pulse raw rate-limit events and usage charts remain intact.

## Separate identity dependency

The audit also found the item.updated projection missing runtime itemId as toolCallId (source b2e2ccfdb), despite started/completed projections retaining it. This is a separate coalescing/lifecycle dependency and is tracked for its own focused correction.
