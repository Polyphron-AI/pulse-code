# Settled thread handoff and context estimate design

## Goal

Help a user recover useful work from an old thread without making resuming that thread the default.
The design adds two capabilities and one clarification:

- A settled thread can seed a new thread with a summary ("handoff") instead of being resumed.
- Thread rows can show the size of the context a cold resume would re-process, using token usage the
  server already receives. When there is no honest number, the row says **Context size unavailable**.
- Settled threads are already searchable on every surface. Search results and thread menus gain a
  settled marker and the handoff action; search scope itself does not change.

"Context size" means input tokens, not money and not subscription-plan usage. It does not claim that
a provider cache is warm or cold.

## What the code already does (and what this plan does not redo)

These facts changed the earlier draft and are the reason the scope below is smaller:

- **Settled threads are already in the live shell stream and already searched.** Settled is not
  archived: `projection_threads` only carries `settled_override` / `settled_at`, and the shell
  snapshot streams settled rows alongside active ones. Sidebar title search covers pinned, active,
  snoozed, and settled rows; the command palette's server content search (`searchThreads`) excludes
  only deleted and archived threads; mobile partitions settled rows from the same live shells. There
  is no settled-exclusion to opt out of.
- **"Settled" is a client-side derivation, not a server state.** `effectiveSettled` in
  `client-runtime/state/threadSettled.ts` combines the explicit override with pending approvals,
  session status, queued turns, PR state, and the client setting `sidebarAutoSettleAfterDays`. The
  server cannot filter search by "settled" without being handed client settings, so a
  `scope: "active" | "all"` search parameter is not implementable honestly. It is dropped.
- **Token usage already crosses orchestration.** Adapters emit `thread.token-usage.updated`
  (`ThreadTokenUsageSnapshot` in `contracts/providerRuntime.ts`, with `usedTokens`, `maxTokens`,
  `inputTokens`, `cachedInputTokens`, `last*` per-turn fields). Ingestion persists each one as a
  `context-window.updated` activity, and web already renders the latest one
  (`apps/web/src/lib/contextWindow.ts`). No transcript scan, adapter capability, or usage-cache path
  is needed for an estimate.
- **Server-side "create thread + fresh first turn" exists.** `ScheduleReactor` dispatches
  `thread.create` followed by `thread.turn.start` with `sessionMode: "fresh"`. The handoff reuses
  that path rather than adding a new decider command.
- **Provider-neutral one-shot generation exists.** `TextGeneration` (title, branch name, commit,
  PR body) is the service the summarizer extends. There is no separate "short-lived provider
  session" concept to invent.
- **Capability discovery is the descriptor, not RPC probing.** `ExecutionEnvironmentCapabilities`
  carries per-feature booleans (`threadSettlement`, `threadTitleRegeneration`, ...). Clients hide
  features when the flag is absent and never probe methods.

## Product decisions

### Search: mark settled results, do not change scope

No new search control, no new request field, no new setting. Instead:

- Search results (sidebar, command palette, mobile) render the same settled marker the shelf uses,
  derived on the client with `effectiveSettled` from the shell the result already joins against.
  The server match already returns `threadId`/`projectId`; clients own lifecycle presentation.
- Ranking is unchanged. If settled matches crowd out active ones in practice, demote them in the
  client ordering first; a server-side ranking change would need lifecycle it does not have.
- Settled results expose two actions: **Open thread** (no lifecycle change) and
  **Start new thread with summary**. Sending in the old thread remains the explicit resume path
  and keeps the current un-settle behavior.

Known gap, noted but out of scope: the web sidebar search is title-only while the command palette
searches content. Unifying them is a separate change and is not required for handoff.

### New thread with summary is a handoff, not a provider fork

The new thread has a new thread ID and a fresh provider session. It never reuses the source
thread's provider session, so behavior is identical across providers and no opaque provider state
leaks forward.

Flow:

1. Client calls `orchestration.previewThreadHandoff({ threadId })`.
2. Server reads the source thread's persisted user messages and completed assistant final messages
   from projection tables (the same rows `searchThreads` treats as searchable: non-streaming, and
   assistant rows linked to a turn's `assistant_message_id`). Activities, approvals, tool payloads,
   and streaming fragments are excluded.
3. `TextGeneration.generateThreadHandoff` produces: objective, decisions, work completed, relevant
   paths, unresolved questions, suggested next action. It runs under the same policy as title
   generation (model selection passed in; see open question). Input is bounded server-side by a
   message count and character ceiling; when history exceeds the ceiling it keeps the most recent
   complete turns plus the first user message and tells the model what was omitted.
4. If generation fails, the preview returns `basis: "fallback"` with a deterministic summary built
   from title, latest user message, and latest completed final answer. The client shows it as
   editable text with a "generated summary unavailable" note. No thread exists yet.
5. Client shows the editable summary plus destination project, model, runtime mode, and checkout.
6. On confirm, client calls `orchestration.startThreadHandoff` with the edited text and destination.
   The server dispatches `thread.create` (with `sourceThreadId`) and `thread.turn.start`
   (`sessionMode: "fresh"`) back to back, exactly as `ScheduleReactor` does, and returns the new
   thread ID. Summarization happens only in the preview step; the start step never generates text.
7. Source stays settled. The destination shell carries `sourceThreadId` so every client can show
   **Continued from <thread>** and navigate back. `ThreadOrigin` stays `"user"`; origin describes
   who started the thread, not where its content came from, and overloading it would break the
   existing `schedule:<id>` parsing.

Why a server RPC rather than two client dispatches: if the client drops between `thread.create` and
`thread.turn.start`, an empty thread without provenance is left behind. The server pairing closes
that window without a new decider command. If the second dispatch fails, the server deletes the
thread it just created and returns the error.

Only history stored in Pulse Code is summarized. Provider-private context that never crossed
orchestration is out of scope and the UI must not imply otherwise.

## Context estimate

### What Pulse Code can and cannot know

Cache residency is opaque and changes between display and send. Pulse Code must not label a thread
"cold", predict cache expiry, or quote a billed amount.

What it can know: the size of the context window at the end of the last completed turn. That is a
fair proxy for the input a cold resume would re-process before compaction. The row label is
**Context ~N tokens**; the tooltip reads **Context size after the last turn. Actual usage depends on
provider compaction and cache state.**

### Source of truth

The latest `context-window.updated` activity per thread. Its `usedTokens` is the number shown;
`maxTokens`, when present, allows the existing context-window percentage the chat view already
renders. There is no new adapter capability and no `provider-preflight` basis: no current provider
exposes a pre-resume count, and adding a contract for a capability nobody implements is machinery
for its own sake. Providers that do not emit token usage simply have no activity and show
unavailable; that is the whole provider matrix.

### Projection and shell

Add to `projection_threads` nullable columns set by the projector when a `context-window.updated`
activity lands: `context_used_tokens`, `context_max_tokens`, `context_observed_at`. Reset them to
null when a turn starts with `sessionMode: "fresh"`, because the next request does not resume that
context.

Thread shell snapshot gains one optional field:

```ts
contextEstimate?: { usedTokens: number; maxTokens?: number; observedAt: string } | null;
```

Optional so newer clients decode older servers. Absent and `null` both render
**Context size unavailable**. No refresh RPC: the value updates when usage lands, which is the only
time it can change. No lazy per-row lookup, no transcript walk, no usage-scan cache.

Cost: three small columns and a few bytes per shell row. Acceptable against the shell payload.

## UI placement

Web and desktop share the web implementation; mobile uses the same contracts and client-runtime
selectors with native controls.

- Search results render the settled marker and, for settled rows, **Start new thread with summary**
  as the secondary action.
- Every thread action menu includes **Start new thread with summary** once the thread has at least
  one completed assistant message. Hidden when `capabilities.threadHandoff` is absent.
- Thread rows reserve no permanent extra line. Settled rows show **Context ~N tokens** in the row
  metadata because resume cost matters most there; active rows expose it in the action-menu detail
  (open question below).
- The settled-thread banner adds **New thread with summary** beside **Un-settle**.
- The destination thread's header shows **Continued from <title>** linking to the source.

Command palette, sidebar, and mobile use the same action labels. Settings gains no preference.

## Contracts and data flow

- `ExecutionEnvironmentCapabilities.threadHandoff: optionalKey(Boolean)`. Clients gate every
  handoff entry point on it.
- `orchestration.previewThreadHandoff` (request): input `{ threadId }`; output
  `{ summary: string; basis: "generated" | "fallback"; source: { threadId, title, projectId, messageCount, omittedMessageCount } }`.
  A request, not an event: previewing changes no durable state.
- `orchestration.startThreadHandoff` (request): input
  `{ sourceThreadId, previewedAt, summary, projectId, modelSelection, runtimeMode, interactionMode, branch, worktreePath }`;
  output `{ threadId }`. Server-side dispatch of `thread.create` + `thread.turn.start`.
- `thread.create` command and `OrchestrationThreadShell` gain optional `sourceThreadId`.
  `thread.created` event payload carries it; projector stores it on `projection_threads`.
- `OrchestrationThreadShell.contextEstimate` as above.
- `TextGeneration.generateThreadHandoff` with a matching prompt in `TextGenerationPrompts.ts`
  and one implementation per existing text-generation provider. Providers without text generation
  return the fallback path.

No change to `orchestration.searchThreads`.

## Failure and compatibility behavior

- Old servers: clients see no `threadHandoff` capability and hide the action. Old clients decode
  new shells because every new field is optional.
- Deleted source thread: preview and start fail with `EnvironmentResourceNotFoundError`. Archived
  source: rejected in this version; may be allowed later.
- Source becomes active while the preview is open: confirm still creates a fresh destination from
  the reviewed text. `previewedAt` is recorded on the link for diagnostics.
- `thread.turn.start` fails after `thread.create` succeeded: server deletes the new thread and
  returns the error; client shows it inline in the preview.
- Search failure in one environment does not discard matches from others (existing behavior).
- Context estimate never starts or resumes a provider session and never delays shell snapshots.

## Performance limits

- Search is unchanged: minimum query length, escaped `LIKE`, one match per thread, max 50.
- Handoff preview reads one thread's message rows with a server-side ceiling (start with 60
  messages / 60k characters, tune from real data). No unbounded reads over the wire.
- Estimate has zero read cost at snapshot time; it is a column.

## Verification

Server tests: preview output shape and exclusions (streaming, non-final assistant, activities);
ceiling and omission reporting; fallback when generation fails; start dispatches create + fresh turn
atomically and rolls back on turn failure; `sourceThreadId` persisted and projected; deleted and
archived source rejection; `contextEstimate` set on `context-window.updated` and reset on fresh
turn. Contract tests pin backward decoding for every optional field.

Web and mobile logic tests: settled marker on results, both actions, capability gating, editable
confirmation payload, available versus unavailable estimate labels, **Continued from** rendering.

One integrated web pass and one mobile pass follow implementation only with explicit browser or
simulator approval. Remote verification uses a separate test environment and confirms no message
bodies beyond the preview response cross the wire.

## Out of scope

- Any change to search scope or a settled toggle (already searched; not a server state).
- Predicting cache warmth, quoting money, or subscription usage.
- Provider-preflight token counts; revisit only when a provider protocol exposes one.
- Searching provider-private conversations Pulse Code never imported.
- Background settling, archiving, deleting, or summarizing.
- Copying the source worktree into a new checkout.
- Unifying sidebar title search with palette content search.

## Open questions

- Summarizer model: destination project default (recommended, matches how title generation picks
  its model) versus the source thread's model. A cheap override in the preview is a possible later
  addition, not part of v1.
- Active rows: show `Context ~N` inline or only in the action menu? Recommendation: menu only, to
  keep the sidebar quiet; settled rows inline.
- Should the handoff text go through the visible first user message (recommended: honest, editable,
  searchable) or through `ThreadTurnStartBootstrap` as hidden context? Visible for v1.

## Revision notes (2026-08-28)

Reviewed against the codebase. Removed: `searchThreads.scope`, the "Include settled threads"
control, the `resumeEstimate` adapter capability and `estimateResumeInput` method, the
`provider-preflight` basis, the cursor-digest estimate projection, `refreshResumeEstimate`, the
`thread.handoff.start` decider command, and "RPC capability discovery" (replaced by the existing
`ExecutionEnvironmentCapabilities` flag). Reasons are in "What the code already does".

---

**Created:** 2026-08-28 . **Last opened:** 2026-08-28 . **Last edited:** 2026-08-28 . **Status:** draft (revised) . **Owner:** Product . **Layer:** tactical
