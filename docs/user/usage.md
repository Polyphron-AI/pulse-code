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

When a thread stops because the provider reported a usage or rate limit, the error banner on the
thread offers **Switch model**. It opens the same handoff flow as the model picker, so you can keep
working in the same thread on another provider while the limit window resets. See
[Switching models mid-thread](./composer.md#switching-models-mid-thread).

## Cost history

Use **Past 24h** for an hourly chart covering the exact rolling 24-hour period. The **7 days**,
**30 days**, and **90 days** ranges use daily resolution. Cost and token toggles update both the
headline and chart, and refreshing rescans every connected environment.

## Usage in the thread

You don't have to leave the thread to see where you stand. When the provider you're about to send
to has reported subscription limits, a small ring sits next to the context window meter in the
composer. It fills to whichever limit window is closest to its cap, and turns red once that window
reaches 90 percent. Hover it for the full breakdown: your plan, every window with how much is used
and when it resets, and how long ago the provider last reported.

On mobile, the same reading appears as a compact control in the expanded composer toolbar, showing
the busiest window and its percentage. Tap it for the full list.

For providers billed per token rather than by subscription, the context window popover adds a
**Session cost** line: what this thread has run up so far, at API rates. It keeps counting across
model handoffs and restarts, because that is money already spent. Threads on a subscription plan
don't show it, since you aren't billed per token there.
