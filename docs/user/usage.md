# Review usage

The Usage page combines Codex, Claude Code, and Grok Build activity from your selected environments. Cost and
Tokens show API-equivalent token costs, processed tokens, cache savings, and model breakdowns.
Subscription billing is separate from the token cost shown here.

Grok costs use the provider's reported amount when available, or model token rates otherwise.
Grok session logs are read from GROK_HOME, falling back to ~/.grok. Only usage update logs are
scanned. Older connected environments still contribute their Codex and Claude totals.

## Cost history

Use Past 24h for an hourly chart covering the rolling 24-hour period. The 7 days, 30 days, and
90 days ranges use daily resolution. Refresh rescans the selected environments. Plan usage retains
the provider's latest session-reported subscription meters, including how much is used and when
windows reset. These readings can be a few minutes old between turns.

## Subscription limits

Open Limits to see remaining quota across accounts and environments. Accounts shared by multiple
environments are counted once. Expand a pool to review its accounts, limit windows, reset times,
and reporting environments. Pace indicators compare spending with elapsed time in each window.
Providers without subscription windows explain why limits are unavailable.

In a thread, enter /usage-limits to open a local limits panel without starting an agent turn.
The command is offered when limits are available. If the message includes attachments or other
content, it is sent to the provider normally. A provider's own command remains available when
Pulse does not supply the local command.

## Usage providers and reset credits

In Settings > Providers > Usage providers, choose the environment that should connect to a
CLIProxyAPI hub, then add its URL and management key. Keys stay on that environment's server and
are not returned to clients. Remove a source from the same settings section when it is no longer
needed. Source management requires a server that supports usage providers.

When an account offers reset credits, Limits shows the available credits and their expiry.
Consuming a credit requires confirmation. Hub-managed accounts redeem through their configured
hub; other supported accounts redeem through their provider. The result reports any warning,
and refreshed limits appear after the provider responds.
