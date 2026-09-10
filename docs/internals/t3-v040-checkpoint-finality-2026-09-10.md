# V40 checkpoint finality

Adapted source 7a089b2b2 and e0adcc8a2. Capture happens on terminal provider events, including tracked or active aborted turns. Interim diff placeholders retain their assistant message identity but cannot freeze the checkpoint before later edits arrive. SQL, pure server, and shared client projections preserve interrupted turn state independently of checkpoint readiness.

Pulse retains provider rollback capability gates. Its additional PullRequestService refresh now shares the separate status worker: both remote refresh paths are outside checkpoint capture. Worker drains include status refresh completion for deterministic tests and shutdown remains scoped.

Verification uses synthetic repositories and typed receipts. Tests cover late edits after interim diffs for completion and abort, ignored untracked aborts, final file capture while PR refresh is blocked, and server/client projection states. No real provider, browser, or live user state was used.

The separate slow-client queue budget/coalescer audit remains open (108f295cc and prerequisite 7e4ce3bbb); this batch does not claim that work is complete.
