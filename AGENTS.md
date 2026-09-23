# Pulse Code agent entry

Pulse Code serves web, desktop, and mobile clients through a WebSocket server.
Read [CLAUDE.md](CLAUDE.md) for task-specific architecture and commands, and
`docs/internals/glossary.md` only when terminology or event flow matters.

- Protect the developer's running instance. Never kill a process by a matched
  name or path. Stop only a PID you started or one whose port and working
  directory you verified. Never start a test server against live
  `~/.t3/userdata` or write to that database.
- Keep development single-origin. Do not set `VITE_HTTP_URL` or
  `VITE_WS_URL` for dev; remote clients rely on the proxy routes.
- Check affected entry points, clients, providers, wire contracts, connection
  modes, reverse states, and docs. Shared client logic belongs in
  `packages/client-runtime`; wire schemas belong in `packages/contracts`.
- Use the smallest focused test, lint, and typecheck commands for the affected
  area. Do not run repository-wide checks unless requested. Backend changes
  need focused behavior tests; asynchronous tests wait for typed receipts.
- Keep `.repos/` read-only. For Effect work, read
  `.repos/effect-smol/LLMS.md` before editing. Use worktree-local `.t3`
  test state, copied through a consistent database snapshot when live data
  is needed.
- A PR needs an explicit request. For user-visible client verification, follow
  the client-specific procedure in `CLAUDE.md`.
- For a Pulse feature, use `docs/operations/pulse-feature-delivery.md` and
  the active block of `docs/internals/pulse-next-migration.json`. On resume,
  read the active block's `nextAction` before loading the full playbook again.
  Upstream imports also use `.agents/skills/pulse-upstream-compatibility/SKILL.md`.
- Keep scratch plans and research notes untracked. Put durable user guidance in
  `docs/user/`, cross-component decisions in `docs/internals/`, and operator
  procedures in `docs/operations/` only when the task changes them.
- Product Ops Ponytail is `full` by default for coding: trace the real flow,
  reuse existing code, fix shared causes, and retain security, accessibility,
  data-loss handling, and required checks. A user level switch takes priority.

Load detailed server setup, data seeding, PR, and architecture instructions
only when that branch of work applies. Avoid reading the whole manual each turn.
