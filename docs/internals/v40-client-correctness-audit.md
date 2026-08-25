# V40 client correctness audit

Reviewed integrator `f99c0975c` against target `09e8de9c655ae85410bf6b00446f272a01da81c7`. The disposition inventory was assessed at an older head; its pending labels alone do not establish missing behavior.

## Completed bounded corrections

- `421088c27`: shared thread search decoded JSON and schema values synchronously. Invalid or oversized queries could throw during atom evaluation. Invalid keys now produce no remote content matches, retaining local title search. Six focused tests pass, with client-runtime types and changed-file lint passing. The typecheck emits an existing Effect suggestion in relay discovery.
- `d2042d288`: file autosave did not track confirmed revisions. Closing a saved file could write its old contents again after another editor changed the file. Confirmed revisions now prevent redundant writes; retired coordinators reject changes.
- `b01771c23`: the preview memoized a coordinator that effect cleanup disposed. Effect replay then reused it. The extracted hook creates a fresh coordinator on setup and makes retired file callbacks inert. Both autosave suites pass, 17 tests total, with web types and changed-file lint passing. The merge omitted an unrelated browser-file preference constant absent from Pulse's preview implementation.

Search applies to web, desktop, and mobile through client-runtime. Autosave applies to the editable web file panel and its desktop wrapper, including environment-owned remote writes. Mobile uses a separate file viewer. No new provider or wire contracts are required. Browser and emulator verification remain with the primary integrator.

## Remaining reviewed candidates

- `bd16b86d5` is now adapted: snapshot-loader and protocol defects show a bounded diagnostic that buffered values and connection notifications cannot erase. Ordinary transport loss remains recoverable, and diagnostics clear only when a real subscription retry begins. Pulse HTTP bootstrap, old-server pagination fallback, pending-task retry identity, and retained stream lifetime remain. Earlier retention `d7cf8aaa8` and warm-live resume `f87ecf0cc` are separate, unported changes. Validation passed 23 RPC/diagnostic tests and 19 existing sync/atom/pending-task retry cases, plus client-runtime types and changed-file lint.
- `082e6ea52` is now adapted with Windows path follow-up `617edab65` and drive/reference-link normalization prerequisite `a09f92171`. Contracts advertise optional reveal support; backend discovery checks the actual launcher and web file menus use explicit owning environments. Remote and unresolved connections suppress host shell actions. Pulse media preview, downloads, PR behavior, editor discovery cache, and default browser handling remain. Mobile has separate file actions and receives only additive optional config fields. Validation: 127 web markdown/link/remote/label tests, 14 launcher tests, and two focused server discovery tests pass. Nine POSIX filesystem fixtures are skipped on Windows; the synthetic PowerShell recorder joins its child explicitly. Web/server types pass after the frozen lockfile install. Changed-file lint has one unchanged PR array-index-key warning. No real file manager or browser was opened.
- `6cf0c6ea5`: native application/browser work-log icons need coordinated asset resolution, Codex runtime event metadata, shared presentation, web, and mobile. It is larger than a UI-only port.
- `e7deb2aaf`: inline assistant citations are absent as a contract and composer node. Its 49-file scope includes provider prompt expansion, persistence, terminal selection, web editing, and mobile display. Include cancellation follow-up `fe07ffe7c` when scheduling this batch; preserve Pulse citation-free drafts and attachment ownership.

Token usage/pricing, environment metadata/themes, and image-dimension metadata were excluded because other agents own them. This audit does not claim full V40 compatibility.
