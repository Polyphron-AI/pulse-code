# MCP end-to-end integration

Implement the approved behavior in `docs/internals/pulse-next-mcp-behavior.md`.
Finish this feature before starting another launch feature.

## Boundaries

Pulse owns connection configuration, selection, pre-send decisions and UI in its
existing `mcp` modules. T3 retains provider routing, authentication, session
continuation, tool approval and tool activity. Do not introduce a generic plugin
framework, a second OAuth flow or a proxy for provider-native MCP execution.

Codex is the first verified execution adapter. Its native MCP startup status can
gate prompt submission. Other providers must report unsupported managed selection
until their per-session application and readiness behavior is implemented and
tested. Provider-native connections remain untouched.

## Sequence

1. Implement provider preparation and typed Pulse RPCs, frozen selection and
   server-enforced checks. Apply Codex configuration per session, never globally.
   Preserve continuation when selection changes and reject changes during a turn.
2. Add the composer picker after Skills, draft/default/override selection, and
   a pre-send pause with Retry, Manage connections and Continue without it.
   Continue excludes only failed connections for that turn. Preserve the draft.
3. Review the combined feature and test first send, next-turn changes, independent
   threads, failure/retry/exclusion, stale UI operations and unsupported providers.
   Use an isolated real browser with a mock provider, never paid model calls.
4. Add focused update gates and user documentation. Record evidence and remaining
   physical/packaged acceptance in the JSON ledger. Keep layered commits.

Root sequences contracts and integration. Sol implements the server/provider
domain in its own worktree; independent presentation work may follow once the
contract is frozen. No stable/develop changes, push or deployment in this batch.
