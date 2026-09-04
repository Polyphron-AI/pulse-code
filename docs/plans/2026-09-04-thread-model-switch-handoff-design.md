# Mid-thread model and provider switching design

## Goal

Let a user move a thread from one model to another at any point, including across providers, so that running out of usage on one subscription never strands the work. Same-provider changes stay in-session. Cross-provider changes settle the thread and continue it in a new, linked thread on the new provider with the conversation carried forward.

Companion research: `docs/research/mid-thread-model-switching.md`. Server plumbing builds on `docs/plans/2026-08-28-settled-thread-search-and-handoff-design.md`; this document extends that design with the model-switch entry point, the transcript digest, and the usage-limit trigger. Where the two disagree, this one wins.

## What the code already does

- **Model selection lives on the thread and on each turn.** `OrchestrationThread.modelSelection` is the default; `thread.turn.start.modelSelection` overrides per turn and `thread.meta.update.modelSelection` rewrites the default (`packages/contracts/src/orchestration.ts`).
- **Same-provider switching works in-session.** All five adapters report `sessionModelSwitch: "in-session"`. `ProviderCommandReactor.ensureSessionForThread` passes the new model on the next turn, or restarts the session with the existing resume cursor when the adapter needs it (`apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` around lines 650 to 720). Nothing changes here.
- **Cross-provider switching is rejected.** The same function refuses a turn when the requested instance has a different `driverKind` or `continuationIdentity.continuationKey` from the active session ("is bound to driver X and cannot switch to Y"). The web composer pre-empts this by locking the picker to the active session's instance (`ChatComposer.tsx`, `lockedProvider` and `lockedContinuationGroupKey`). Mobile reads the thread's instance the same way.
- **Create-then-turn from the server exists.** `ScheduleReactor` dispatches `thread.create` followed by `thread.turn.start` with `sessionMode: "fresh"`, and prefixes the prompt with a server-owned handoff block.
- **The transcript is queryable.** `projection_thread_messages` holds user and assistant text with `is_streaming`; `projection_turns.assistant_message_id` marks the final answer per turn; `projection_thread_activities` holds tool and approval summaries. `searchThreads` already selects the "settled" subset.
- **Usage exhaustion is partly known.** Codex `account/rateLimits` and Claude `rate_limit_event` are merged into `ServerProviderPlanUsage` (`apps/server/src/provider/planUsage.ts`) and shown on the Usage page. There is no typed "limit reached" turn failure; the error arrives as `session.lastError` text.
- **Capabilities gate features.** `ExecutionEnvironmentCapabilities` carries optional booleans; clients hide what the server does not advertise.
- **Provider-neutral text generation exists.** `TextGeneration` resolves an implementation by `modelSelection.instanceId` for titles, branch names, commits and PR bodies.

## Product decisions

### One picker, two outcomes

The composer model picker in a started thread is no longer locked to one provider. It lists every enabled instance. Selecting a model resolves to one of two paths, decided on the client from the same data the reactor uses:

- **Same continuation group** (same driver kind and continuation key): behaves exactly as today. The next turn uses the new model in-session. No confirmation.
- **Different continuation group**: opens the **Continue in new thread** sheet instead of changing the selection. The picker shows a small "new thread" marker next to those instances so the outcome is never a surprise.

Providers whose instance is disabled or unavailable stay hidden, as today.

### Continue in new thread is a handoff

Flow, from the user's side:

1. Pick a cross-provider model, or press **Continue with another provider** on a limit banner.
2. The sheet shows the destination model, the source thread title, a message count, and an editable **handoff** text. Optional **New objective** field (Amp pattern) that becomes the last paragraph.
3. Confirm. The source thread settles. A new thread opens on the destination provider with the handoff as its first user message, rendered as a collapsed **Continued from <source>** card. The agent starts working on it immediately.
4. The source thread's settled banner gains **Open continuation**. The destination header shows **Continued from <title>**, linking back.

Flow, from the server's side, reusing the 2026-08-28 RPC pair:

1. `orchestration.previewThreadHandoff({ threadId, destinationModelSelection })` builds the digest (below) and returns it with `basis`.
2. `orchestration.startThreadHandoff({ sourceThreadId, summary, modelSelection, projectId, runtimeMode, interactionMode, branch, worktreePath, settleSource: true })` dispatches `thread.settle` on the source (when the flag is set and the server has `threadSettlement`), then `thread.create` with `sourceThreadId`, then `thread.turn.start` with `sessionMode: "fresh"`. On turn failure it deletes the new thread, un-settles the source, and returns the error.

Default destination checkout is the source thread's branch and worktree, so the new provider continues in the same working tree. The user can change it in the sheet.

### The handoff digest: verbatim first, summary only for the gap

Stacked summaries lose work (Amp) and a bare summary is not "the same history" that users expect. The digest is therefore structured:

```
[Continued from "<source title>" on <provider/model>. The following is the visible
conversation so far; tool output and provider-private reasoning are not included.]

## Conversation
User: <message 1, verbatim>
Assistant: <final answer 1, verbatim>
...
[<N> earlier messages omitted. Summary of the omitted part:]
<generated summary of the omitted middle, or nothing when nothing was omitted>
...
User: <latest message, verbatim>
Assistant: <latest final answer, verbatim>

## Files touched in this thread
<paths from checkpoint diffs, most recent first, capped>

## Next
<user's "New objective" text, or "Continue from where the conversation left off.">
```

Rules:

- Sources are `projection_thread_messages` rows that are not streaming, with assistant rows restricted to each turn's `assistant_message_id`. Activities, approvals, tool payloads and attachments are excluded. Image attachments are listed by name only.
- Ceiling: start at 60 messages and 60k characters, tune from real data. When over the ceiling, keep the first user message and the most recent complete turns verbatim, and summarize the middle with `TextGeneration.generateThreadHandoff`.
- The summary, when needed, is generated by the **destination** instance. The source provider may be the one that just ran out of usage. If the destination has no text-generation implementation or the call fails, the digest ships with `basis: "fallback"` and a one-line note in place of the summary. The flow never blocks on generation.
- File list comes from `projection_turns.checkpoint_files_json` for the source thread, deduplicated, capped at 40 paths.
- The preamble line names the source provider so the new model knows another model wrote what precedes it (Codex compaction pattern).

### Usage-limit entry point

Two signals, one action:

- **Plan window exhausted.** When `ServerProviderPlanUsage` for the thread's instance has any window at `usedPercent >= 100` whose `resetsAt` is in the future, the composer shows a banner: **<Provider> usage limit reached. Resets <relative time>. Continue with another provider?** with the switch action. Codex and Claude emit this today; other providers never show it.
- **Turn failed on a limit.** Adapters already surface the failure as `session.lastError`. Add one typed field, `lastErrorKind: "usage-limit" | "other"`, set at the adapter boundary from provider-native signals (Claude `rate_limit_event` with a hard limit, Codex rate-limit error payloads, HTTP 429 shapes the drivers already parse). The existing error banner gains the same action when the kind is `usage-limit`. Classification lives in each adapter, not in orchestration, and unknown text stays `"other"`.

No automatic switching. The user chooses the destination every time, matching Codex's and Claude Code's warnings and avoiding Copilot's silent downgrade complaints.

### Reverse path

The source stays intact and settled. **Un-settle** and sending in it resumes the original provider session as today. The destination is an ordinary thread; deleting it does not touch the source. There is nothing to "switch back" beyond starting another handoff the other way.

## Surfaces

- **Web and desktop.** Model picker (`ProviderModelPicker`, `ChatComposer`) drops the continuation lock and marks cross-group instances. New `ContinueInNewThreadSheet` reused by the picker, the settled banner, the limit banner, the thread action menu, and the command palette (**Continue thread with another provider**). Handoff card renderer for the first message when `handoff` is set. **Continued from** header link.
- **Mobile.** `ThreadComposer` model picker gets the same marker and sheet with native controls; the same client-runtime selector decides same-group versus cross-group. Settled and limit banners gain the action.
- **Providers.** Digest generation is a `TextGeneration` method with one implementation per provider that already generates titles; others return the fallback. Limit classification is one function per adapter; Cursor, Grok and OpenCode may return `"other"` for everything in v1.
- **Connection modes.** All work is server-side RPC, so remote and tunnel clients behave the same. Multi-environment: the destination project must be in the same environment as the source; the sheet does not offer cross-environment moves.
- **Docs.** `docs/user/composer.md` gains a "Switching models and providers" section. `docs/user/usage.md` documents the limit banner. `docs/internals/glossary.md` gains **Handoff** and **Continuation group**.

## Contracts

- `ExecutionEnvironmentCapabilities.threadHandoff: optionalKey(Boolean)`.
- `ExecutionEnvironmentCapabilities.threadHandoffFromPicker: optionalKey(Boolean)` is not needed; the picker path is a client behavior over `threadHandoff`.
- `orchestration.previewThreadHandoff` input gains `destinationModelSelection`; output as in the 2026-08-28 design plus `files: string[]`.
- `orchestration.startThreadHandoff` input gains `settleSource: boolean`.
- `thread.create` command, `ThreadCreatedPayload`, `OrchestrationThread`, `OrchestrationThreadShell`: optional `sourceThreadId`.
- `OrchestrationMessage`: optional `handoff: { sourceThreadId }` set on the destination's first user message so clients render the card. Text stays plain so search and older clients still work.
- `OrchestrationSession.lastErrorKind: optional("usage-limit" | "other")`.
- `ServerProvider` continuation identity is already on the wire as `continuationGroupKey`; the client selector reuses it.

Every new field is optional so old clients decode new servers and new clients hide the feature on old servers.

## Failure and edge behavior

- Destination provider unavailable or disabled: the picker never offers it.
- Turn start fails after create: server deletes the new thread, reverts the settle, returns the error; the sheet shows it inline.
- Source thread is mid-turn: the sheet warns that the running turn will be interrupted on settle, and the server dispatches `thread.turn.interrupt` first.
- Source has no completed assistant message: the digest is just the user messages; still allowed, because the usage limit can hit on the first turn.
- Same instance, different model, adapter needs a restart: unchanged, existing in-session path.
- Client and server disagree on group membership (version skew): the server check remains the source of truth and returns the existing "cannot switch" error; the client then offers the sheet.

## Performance

- Preview reads one thread's message rows once, bounded by the ceiling. No transcript walks at snapshot time.
- The handoff card renders collapsed by default; the full digest is not laid out until expanded.
- No polling. The limit banner derives from data already in the provider snapshot and session state.
- The picker gains one boolean per instance; no extra wire traffic.

## Verification

Server tests: digest construction and ceiling (verbatim head and tail, summarized middle, omission count); exclusions (streaming, non-final assistant, activities); destination-provider generation and fallback; atomic settle plus create plus fresh turn with rollback; `sourceThreadId` persisted and projected; `lastErrorKind` classification per adapter fixture; capability flag advertised. Contract tests pin decoding of every optional field from older payloads.

Client logic tests: same-group versus cross-group resolution from `continuationGroupKey`; sheet payload; card rendering; banner conditions for exhausted windows and `usage-limit` errors; capability gating on web and mobile.

One integrated web pass and one mobile pass after implementation, with explicit approval before any browser or simulator use.

## Out of scope

- Replaying provider-native sessions across providers. Not possible through CLIs.
- Automatic fallback without user confirmation.
- Carrying tool payloads, sub-agent transcripts, or reasoning.
- Cross-environment continuation.
- Copying or re-creating worktrees; the destination reuses the source checkout by default.
- Predicting cache warmth or quoting cost.

## Open questions

- Should the handoff card be the visible first message (recommended, honest and searchable) or hidden bootstrap context? Recommendation stands from the 2026-08-28 design: visible.
- Should **Continue in new thread** also be offered for same-provider switches when the thread is very long, as a "fresh start" option? Not in v1; the in-session path is what users expect there.
- Default ceiling numbers need real data from a seeded worktree database before implementation.

## Implementation order

1. Contracts and capability flag.
2. Digest builder and `generateThreadHandoff` in `TextGeneration` with Claude and Codex implementations and the deterministic fallback.
3. Preview and start RPCs, settle plus create plus turn, rollback, tests.
4. Web: picker unlock and marker, sheet, card, header link, banners.
5. Mobile parity.
6. `lastErrorKind` classification in Claude and Codex adapters, limit banner.
7. User docs and glossary.

---

**Created:** 2026-09-04 . **Status:** draft . **Owner:** Product . **Layer:** tactical . **Supersedes in part:** 2026-08-28 settled thread handoff design (server plumbing retained, entry points and digest replaced)
