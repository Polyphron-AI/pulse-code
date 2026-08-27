# Pulse project actions

Pulse Code can query project Reports through its running server without sending
Pulse credentials to the CLI process or an agent.

## Run an action

Start Pulse Code's server, connect the project to Pulse in project settings,
then send one JSON request on stdin:

```bash
printf '%s' '{"protocol_version":1,"request_id":"reports-1","action":"bugs.list"}' \
  | pulse issues action --input -
```

The initial Pulse Code adapter supports `bugs.list`. The server resolves the
saved project mapping and applies a 30-day default. It returns bounded pages
with an opaque cursor. This version does not accept a custom `lookback_days` or
an all-history request.

Every response repeats `protocol_version`, `request_id`, and `action`, includes
`ok`, and contains exactly one of `data`, `selection_required`, or `error`.
Offline servers return `transport_unavailable`. Older servers that lack the RPC
return `capability_unavailable`. Unknown actions and unsupported parameters
return typed errors.

## Project scope

Pulse Code owns the mapping between the current directory and its Pulse
project. Change the mapping in project settings to change scope. The CLI does
not create a second `.pulse/config.json` binding for this transport.

If the mapping is missing or stale, fix it in project settings and retry the
same request. Do not add Pulse tokens to JSON input, project files, prompts, or
shell history.

## Direct terminal fallback

Codex, Claude Code, and bare terminals can use the direct PulseGo adapter:

```bash
printf '%s' '{"protocol_version":1,"request_id":"tickets-1","action":"tickets.list"}' \
  | pulse-cli agent action --input -
```

That adapter owns its project selection in the repository's
`.pulse/config.json`. Pulse Code keeps its existing server mapping as the
authority for the Pulse Code transport.

**Created:** 2026-08-27 . **Last opened:** 2026-08-27 . **Last edited:** 2026-08-27 . **Status:** stable . **Owner:** Pulse Code
