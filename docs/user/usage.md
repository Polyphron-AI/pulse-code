# Review usage

The Usage page combines Codex and Claude Code activity from your connected environments. It reads
the providers' local session history and shows API-equivalent token cost, processed tokens, cache
savings, provider shares, and model breakdowns. Subscription billing is separate from the raw token
cost shown here.

## Plan usage

When a Codex or Claude Code session reports subscription rate limits, the Usage page shows a
**Plan usage** section: your plan (such as Plus or Pro) with a meter per limit window — typically
the 5-hour window and the weekly window — including how much is used and when each resets. The
reading updates as agents work and reflects the provider's most recent report, so it can be a few
minutes old between turns. Other providers don't report plan limits, so they don't appear here.

## Cost history

The **Limits** view shows how much of each subscription window you have used on Codex and Claude
Code, per connected environment: the session and weekly windows, plus a per-model weekly window
such as Fable when your plan has one. Each window is a bar from the moment it opened to its reset,
filled by the share of quota spent; a thin line marks how far into the window you are, which is
also where even spending would have put the fill, and the icon beside the label says whether you
are ahead of, on, or under that pace. Hover a bar for the exact reset time. Limits refresh on the
provider health-check interval and update live while a turn runs. API-key accounts have no
subscription windows and say so; that includes a Claude Code that reaches Anthropic through a proxy
via `ANTHROPIC_AUTH_TOKEN`, since the CLI then treats itself as an API-key client.

If you pool accounts behind a CLIProxyAPI hub, **Add CLIProxyAPI hub** on the Limits view shows
every account the hub manages, each marked _via CLIProxyAPI_ so it is not mistaken for the provider
signed in on this machine. Enter the hub's URL and management key; the key is stored on the server
and never sent back to a client. Emails are blurred until clicked, as in provider settings.

Use **Past 24h** for an hourly chart covering the exact rolling 24-hour period. The **7 days**,
**30 days**, and **90 days** ranges use daily resolution. Cost and token toggles update both the
headline and chart, and refreshing rescans every connected environment.
