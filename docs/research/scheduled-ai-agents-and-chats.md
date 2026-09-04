# Scheduled AI agents and chats: market research and Pulse Code recommendation

Research date: 2026-09-03
Audience: Pulse Code product and engineering maintainers
Decision: how scheduling should work from any thread and across web, desktop, and mobile

Execution package:

- [Native scheduling design](../plans/2026-09-04-native-scheduling-design.md)
- [Phase 1 implementation plan: scheduled follow-ups](../../project/plans/P-2026-09-04-scheduled-followups.md)
- [Phase 2 implementation plan: calendar recurrence and scheduler board](../../project/plans/P-2026-09-04-calendar-scheduler-board.md)
- [Change request](../../prd/change-requests/CR-2026-09-04-native-scheduling.md)

## Executive summary

The proposed feature makes sense, with one important ownership decision: **Pulse Code should own the schedule and invoke the selected provider when it fires**. OpenAI scheduling can be one compatible provider experience, but it cannot be Pulse's scheduler. Pulse needs one durable, provider-neutral record that works with Codex, Claude, Cursor, Grok, and OpenCode; survives disconnected clients; and is visible from every surface.

The market has converged on four expectations:

1. Create a schedule conversationally or from a structured editor.
2. Choose whether it runs once or repeats, with calendar-aware recurrence.
3. Choose where the result goes: back to the current thread or into a standalone scheduled chat.
4. Manage schedules and every run from a global board with visible state, history, and controls.

Pulse already has much of the hard foundation: server-owned event-sourced schedules, a reactor, persistent schedule threads, run-now/pause/resume/delete actions, occurrence state, time budgets, web and mobile settings, and a Scheduled section in project navigation. The next product step should extend this system rather than add another scheduler.

For the example request, “tomorrow, 4 September 2026, at 08:00 South Africa time, retry the Takealot onboarding course,” the ideal result is a **one-off scheduled follow-up attached to the current thread**, stored with the IANA timezone `Africa/Johannesburg`. At 08:00, Pulse should add the instruction to this thread and resume its useful context. The completed one-off should remain in history for audit and easy duplication.

The label **Scheduled follow-up** fits thread-attached work. Keep **Scheduled chat** for independent jobs. “Soft schedule” sounds like the time or delivery is approximate, which is the opposite of the reliability users expect.

## What other products do

| Product                                                                                                                                                       | Creation and trigger model                                                                                             | Context and execution                                                                                                                                                                                                  | Management and controls                                                                                                                                                                   | Lesson for Pulse                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OpenAI scheduled tasks](https://learn.chatgpt.com/docs/automations)                                                                                          | Natural-language creation in chat; one-time and recurring schedules; calendar recurrence uses RFC 5545 RRULE           | An in-chat task returns to that chat with its context; a standalone task creates a new chat per run. Cloud work can run unattended, while local project/worktree tasks depend on the computer and app being available. | Scheduled board with active, paused, and completed tasks; recent runs; unread results; edit, pause, and delete                                                                            | Treat “when” and “where” as separate choices. Support both current-thread and standalone destinations.                                                                  |
| [OpenAI Tasks help](https://help.openai.com/en/articles/10291617)                                                                                             | Create one-time or recurring tasks by asking ChatGPT                                                                   | Notifications can be delivered when a task completes                                                                                                                                                                   | Central Tasks page; edit cadence, pause, or delete; active-task limits depend on plan                                                                                                     | Creation from conversation needs a durable management surface and capacity feedback.                                                                                    |
| [Cursor Automations](https://prod.cursor.com/docs/cloud-agent/automations)                                                                                    | Natural-language setup through `/automate`, templates, UI presets, or cron; scheduled and event-driven triggers        | Cloud agents can work in one or more repositories and use integrations, MCP tools, memory, and computer use                                                                                                            | Private or team-visible automation ownership; configurable instructions, tools, repositories, and delays                                                                                  | A slash command should open the same underlying schedule model as the UI. Repository and permission scope belong on each schedule.                                      |
| [Claude Code scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks)                                                                                | `/loop` for recurring work, natural-language one-time reminders, and cron tools                                        | Tasks are tied to a live or resumable session. Claude queues due work until the current turn finishes; local timezone, expiry, and missed-run rules are documented.                                                    | List and delete tasks from the session                                                                                                                                                    | Session-local loops are useful for active supervision, but a product scheduler also needs durable server ownership. Document queueing, expiry, and missed-run behavior. |
| [GitHub Copilot coding agent automations](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automations)                                   | Hourly, daily, and weekly repository schedules                                                                         | Each run starts a cloud coding-agent session with repository context and controlled tools                                                                                                                              | Repository and user views; run now, edit, disable, delete, and linked session history                                                                                                     | A schedule is also an execution policy: repository, tools, permissions, identity, and budget matter.                                                                    |
| [GitHub Copilot CLI scheduling](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/schedule-prompts)                                 | `/every` for recurring prompts and `/after` for one-time prompts                                                       | Session-scoped; durable operation requires an external scheduler                                                                                                                                                       | Scheduled prompts are tagged and can be listed or deleted                                                                                                                                 | `/schedule` should be convenient, but Pulse's server must remain the durable source of truth.                                                                           |
| [Devin scheduled sessions](https://docs.devin.ai/fr/product-guides/scheduled-sessions) and [Automations](https://docs.devin.ai/fr/product-guides/automations) | Composer prefill, settings editor, or natural-language automation generation; once, presets, cron, and RRULE schedules | An automation can start a new session or send a message to an existing long-lived session; repository, playbook, network, and integrations are configurable                                                            | Enable/disable, invocation limits, per-run compute budget, activity history, skipped status, session links, and errors                                                                    | Existing-session versus new-session is a first-class destination. Preserve one-off records and expose skipped runs and resource limits.                                 |
| [Zapier Agents](https://help.zapier.com/hc/en-us/articles/45394909914381-Set-up-your-agent-s-trigger)                                                         | On-demand, scheduled, app-event, Zap, and MCP triggers                                                                 | Published agents execute through connected applications                                                                                                                                                                | Activity history; schedules can use [hourly through annual custom intervals](https://help.zapier.com/hc/en-us/articles/8496288648461-Schedule-Zap-workflows-to-run-at-specific-intervals) | Design the trigger union so event triggers can be added later, while shipping time triggers first.                                                                      |
| [OpenClaw automations](https://github.com/openclaw/openclaw/blob/main/docs/cli/cron.md)                                                                       | Gateway-owned schedules through CLI/API; recurring and one-off jobs                                                    | Can run an agent job or a deterministic command, target an agent/session, and deliver to chat or webhook                                                                                                               | Operator authorization; list, inspect status and runs, update, remove, and run now                                                                                                        | Do not spend model tokens when a deterministic action is enough. Agent schedule tools should call the Pulse server, never OS cron.                                      |

### Where the market agrees

#### Natural language plus a deterministic editor

OpenAI, Cursor, Claude, and Devin all let a user express scheduling intent in conversation. Cursor and Devin also turn that intent into editable configuration. The durable object is structured even when the input is natural language.

Pulse should follow the same pattern:

- “Schedule this for tomorrow at 8” and `/schedule tomorrow 8am` open a populated review card.
- If the user did not specify recurrence, ask **Once or repeat?**
- If they did specify it, do not ask the same question again.
- Show the resolved date, local time, timezone, destination, instruction, and next run before saving.
- Let the user edit the same fields later on the scheduler board.

Natural-language parsing must produce a proposal, not become the authoritative representation. The stored trigger should be typed and deterministic.

#### Two useful continuity modes

OpenAI distinguishes in-chat tasks from standalone tasks. Devin distinguishes messaging an existing session from starting a new one. This matches two different user intentions:

- **Scheduled follow-up:** continue an existing piece of work in its thread, such as retrying onboarding, checking a deployment, or revisiting a blocked pull request.
- **Scheduled chat:** start an independent recurring run, such as a daily report, weekly dependency review, or quarterly audit.

Pulse should ask for this choice only when context does not make it obvious. Invoking `/schedule` inside a thread should default to **this thread**. Creating from the scheduler board should default to **new scheduled chat**.

#### Calendar recurrence, not only elapsed intervals

Users describe schedules as “every Monday at 09:00,” “the first business day,” “quarterly,” or “on 4 September.” A duration such as every 90 minutes is different from a calendar schedule. OpenAI and Devin use RRULE for calendar recurrence, while developer-focused tools also expose cron.

Pulse should use a small typed trigger union:

```ts
type ScheduleTrigger =
  | { type: "once"; at: string; timezone: string }
  | {
      type: "recurring";
      rrule: string;
      dtstart: string;
      timezone: string;
    };
```

The UI can offer plain presets for daily, weekdays, weekly, monthly, quarterly, and annual schedules, plus an advanced recurrence editor. RRULE should be the canonical calendar format because it represents monthly and quarterly rules without inventing interval approximations. Existing minute/hour/day/week intervals can migrate or remain a compatibility input that resolves into the new trigger model.

#### A scheduler is also a reliability product

Public issue reports consistently ask for explicit behavior when the host sleeps, a job overlaps, a run fails, or the scheduler restarts:

- [Codex users request a remote execution target, same-chat or standalone choices, central run history, and explicit retry, overlap, pause, and missed-run semantics](https://github.com/openai/codex/issues/34946).
- [A Codex request for native session scheduling calls out reminders, monitoring loops, follow-ups, and self-paced work](https://github.com/openai/codex/issues/25466).
- [Another request asks for a visible catch-up policy with run latest, skip, or run all, plus history that distinguishes caught-up work](https://github.com/openai/codex/issues/24327).
- [Users report recurring tasks becoming paused unexpectedly](https://github.com/openai/codex/issues/38350) and [one-off tasks disappearing without a useful error](https://github.com/openai/codex/issues/19742).
- Four OpenClaw issue reports illustrate unattended scheduler failures: [missed runs after restart](https://github.com/openclaw/openclaw/issues/11047), [duplicate runs after restart](https://github.com/openclaw/openclaw/issues/42640), [deletion that reports success while execution continues](https://github.com/openclaw/openclaw/issues/28715), and [jobs missing from the dashboard](https://github.com/openclaw/openclaw/issues/51871).
- [A Hermes Agent report describes adjacent jobs being silently skipped by a serial scheduler](https://github.com/NousResearch/hermes-agent/issues/9086).

These reports are anecdotal rather than prevalence data, but they agree on the acceptance criteria: the product must never silently lose, duplicate, or hide scheduled work.

## What users schedule

Official examples and public user discussions cluster into six groups.

| Use case                  | Examples                                                                                                                    | Needed behavior                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Follow up on active work  | Retry a blocked onboarding flow; check a deployment; watch CI or a pull request; remind the agent after a rate limit clears | Current-thread destination, one-off time, context continuity, cancel/reschedule              |
| Monitoring and triage     | Check production errors, Sentry, Datadog, inboxes, Slack, support queues, issues, or pull requests                          | Recurrence, no-change result, deduplication, notification, cheap/read-only mode              |
| Maintenance               | Dependency updates, flaky-test review, stale branch cleanup, documentation drift, feature-flag cleanup                      | Repository scope, worktree policy, draft pull requests, time/spend limit, overlap policy     |
| Briefs and reports        | Morning summary, weekly status, release notes, analytics digest, quarterly review                                           | Calendar recurrence, source integrations, standalone thread, unread result, retained history |
| Research and surveillance | Track competitors, regulations, security advisories, CVEs, or changes to a source                                           | Web/tool permissions, citations, change detection, notification only when material           |
| Personal operations       | Reminders, calendar or mail summaries, recurring planning, learning prompts                                                 | One-off and recurrence, timezone clarity, privacy, mobile delivery                           |

The official catalogs from [OpenAI](https://learn.chatgpt.com/docs/automations), [Cursor](https://prod.cursor.com/help/ai-features/automations), [GitHub](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automations), and [Devin](https://docs.devin.ai/fr/product-guides/automations) cover the same broad set: deployment and pull-request follow-up, code maintenance, monitoring, triage, research, reports, and recurring summaries.

Public discussions add two useful signals:

- Users commonly describe supervised loops such as pull-request babysitting and morning summaries in response to [Claude Code's `/loop` release](https://www.reddit.com/r/ClaudeCode/comments/1rn94wp/claude_code_just_shipped_loop_schedule_recurring/).
- Users are more comfortable beginning with read-heavy work, reports, research, monitoring, and draft outputs than unrestricted mutations, as illustrated by this [discussion of trust limits for scheduled agent work](https://www.reddit.com/r/ClaudeAI/comments/1u6ab7d/scheduled_tasks_routines_whats_actually_holding/).

Reddit discussions are directional anecdotes. They support product safeguards, but they should not be treated as market-size evidence.

## Product requirements derived from the evidence

### One canonical schedule model

```ts
type ScheduledWork = {
  id: ScheduleId;
  title: string;
  instruction: string;
  trigger: ScheduleTrigger;
  destination:
    | { type: "thread"; threadId: ThreadId }
    | { type: "scheduledThread"; projectId: ProjectId }
    | { type: "projectSet"; projectIds: ReadonlyArray<ProjectId> };
  execution: {
    modelSelection: ModelSelection;
    contextMode: "resume" | "fresh";
    maxRunMinutes: number;
  };
  misfirePolicy: "runLatest" | "skip";
  overlapPolicy: "defer" | "skip";
  status: "active" | "paused" | "completed";
};
```

This is illustrative rather than a final contract. The essential separation is:

- **trigger:** when Pulse should act;
- **destination:** which durable conversation or project receives the turn;
- **execution:** how the provider session and limits are selected;
- **delivery:** how the user learns that the run finished;
- **policy:** what happens on missed, overlapping, failed, and unauthorized runs.

Keep event triggers out of the first delivery, but model `trigger` as a discriminated union so app events can be added without replacing the schedule domain.

### Creation from any thread

Use one command path for every entry point:

1. Natural language such as “remind me in this thread tomorrow at 8.”
2. `/schedule` in the composer and command palette.
3. A clock action in the thread overflow menu.
4. **New schedule** on the scheduler board.

All four should create the same draft and dispatch the same typed orchestration command after review. Web, desktop, and mobile should share parsing and contract logic through `packages/client-runtime` where practical.

The agent-facing path should be a first-party Pulse MCP scheduling tool. All providers already have an MCP integration boundary, so this keeps natural-language schedule creation provider-neutral. The tool should call the Pulse server and return the schedule ID and normalized next run. It must not create OS cron entries.

Creation should require clear user scheduling intent. If an agent merely recommends a later action, it can present a schedule proposal. A public report of an assistant [creating a self-modifying cron job without consent](https://www.reddit.com/r/AI_Agents/comments/1refxlw/my_ai_assistant_scheduled_a_cron_job_to_modify/) shows why an agent should not silently grant itself future execution.

### The once-or-repeat question

Ask **“Should this run once or repeat?”** only when the user's wording leaves it open.

- “Tomorrow at 08:00” resolves to once.
- “Every weekday at 08:00” resolves to repeat.
- “Schedule this at 08:00” needs the follow-up.

For repeat, offer Daily, Weekdays, Weekly, Monthly, Quarterly, and Custom. Always show the next occurrence as an absolute local date and time before saving. For ambiguous dates such as “04/09,” show the resolved long-form date.

### Scheduler board

Evolve the existing Scheduled view into the system-wide control surface. Do not build a second board in Settings.

The default table or list should show:

| Field                        | Reason                                                  |
| ---------------------------- | ------------------------------------------------------- |
| Name and instruction summary | Identify the job without opening it                     |
| Once or recurrence           | Distinguish completed reminders from ongoing jobs       |
| Next run in local time       | Make timezone resolution visible                        |
| Destination                  | Current thread, scheduled chat, project, or project set |
| State                        | Active, running, paused, completed, failed, or delayed  |
| Last result                  | No change, completed, failed, skipped, or cancelled     |
| Host availability            | Explain why local work cannot run yet                   |
| Limits                       | Run time and later spend/invocation budget              |

Controls should include Run now, open thread, edit, pause/resume, duplicate, and delete. Completed one-offs should stay visible under **Completed** instead of disappearing. Each detail view should show immutable run records with scheduled time, actual start time, trigger source, completion state, skip/failure reason, linked thread/turn, and checkpoint or output.

Useful filters are All, Active, Paused, Completed, and Needs attention, plus environment/project and cadence. Show an unread marker when a run has a new result. The sidebar count should continue to mean active schedules, while the board can separately show failures that need attention.

### Reliability semantics

Pulse should publish and enforce these defaults:

- **Durability:** the server owns schedules; clients may disconnect.
- **Timezone:** store an IANA timezone and display the next exact local occurrence. Define daylight-saving behavior through the recurrence library.
- **Missed run:** run only the latest missed occurrence by default. Offer Skip as an advanced choice. Avoid “run all” initially because unattended backlogs can create surprising cost and mutations.
- **Overlap:** recurring jobs skip with a visible run record; one-off follow-ups defer until the attached thread is idle.
- **Idempotency:** derive one occurrence key per scheduled instant and refuse a second start for the same key.
- **Restart:** rebuilding projections cannot duplicate or erase pending work.
- **Pause and delete:** command success means future dispatch is impossible; in-flight cancellation is a separate explicit operation.
- **Failure:** retain the run record and reason. Auto-pause after repeated failures is acceptable only when the threshold, reason, and recovery action are visible and the user is notified.
- **Health:** show the scheduler heartbeat and flag an active schedule whose expected run has not started within a tolerance window.

### Guardrails for unattended agents

The products with mature automation surfaces expose more than a timer. Pulse should retain or add:

- maximum run time, which Pulse already supports;
- provider/model selection and authentication checks;
- per-schedule tool, network, and repository scope;
- local/worktree execution policy;
- spend or invocation caps;
- read-only or draft-output templates for common monitoring jobs;
- notification routing;
- clear schedule owner and creator;
- a checkpoint and reviewable diff for code changes.

A [Cursor user request for per-run time or cost limits](https://forum.cursor.com/t/time-or-cost-limit-for-automations/162483) supports adding spend protection after the native scheduling flow is complete.

## Pulse Code compatibility assessment

### Already compatible

The shipped system already provides a strong base:

- [Schedule contracts](../../packages/contracts/src/schedule.ts) define event-sourced schedules and occurrence state.
- [ScheduleReactor](../../apps/server/src/orchestration/Layers/ScheduleReactor.ts) runs on the host server, so web and mobile clients do not need to stay connected.
- Schedules use ordinary threads and turns, preserving the existing history and checkpoint model.
- The server supports run now, pause, resume, delete, catch-up, overlap skips, failure state, authentication/model checks, and per-run time limits.
- [Web schedule settings](../../apps/web/src/components/settings/ScheduledChatsSettings.tsx), mobile settings, and the Projects/Scheduled navigation expose schedules on multiple surfaces.
- [User documentation](../user/scheduled-chats.md) already describes remote ownership and operational states.

This means the proposed feature is an extension of Scheduled Chats, not a separate subsystem.

### Gaps to close

| Gap                     | Current behavior                                     | Required behavior                                                                        |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| One-off trigger         | Interval schedules only                              | Exact `once.at`, retained as Completed after the run                                     |
| Calendar recurrence     | Minutes, hours, days, or weeks                       | Monthly, quarterly, annual, weekday, and custom RRULE recurrence                         |
| Existing-thread target  | A schedule owns its generated persistent thread      | Option to attach a schedule to any existing thread                                       |
| Provider continuity     | Scheduled turns force `sessionMode: "fresh"`         | Thread follow-ups may resume context; standalone recurring jobs can remain fresh         |
| Conversational creation | Settings forms                                       | Pulse MCP schedule tool plus natural language from any provider                          |
| Slash command           | No `/schedule` composer command                      | `/schedule` opens or populates the shared draft flow on web and mobile                   |
| Global management       | Existing settings and Scheduled navigation           | One board with one-offs, recurring jobs, completed history, host health, and run details |
| Misfire policy          | Catch-up behavior is implementation-defined to users | Visible Run latest/Skip choice and a caught-up run reason                                |
| Notifications           | Results live in threads/settings                     | Unread result and optional system/push notification                                      |
| Cost control            | Time limits                                          | Later add spend and invocation caps                                                      |

The most consequential technical change is context. The current schedule reactor explicitly starts every scheduled turn with `sessionMode: "fresh"`. That is correct for a bounded recurring report, but it does not satisfy “come back to this exact task tomorrow.” The contract should make `resume` versus `fresh` an intentional execution choice rather than an incidental property of all schedules.

## Recommended delivery sequence

### Phase 1: native scheduled follow-ups

- Add an exact one-off trigger.
- Add an existing-thread destination.
- Add `/schedule`, thread overflow action, and a shared review card.
- Ask once or repeat only when recurrence is ambiguous.
- Add Completed one-offs and exact next-run time to the existing Scheduled board.
- Add a first-party MCP schedule proposal/create tool available to every provider adapter.
- Preserve explicit occurrence history for missed, skipped, failed, and completed runs.

This phase directly supports the Takealot example and supplies the smallest complete vertical slice.

### Phase 2: full calendar recurrence

- Add RRULE recurrence with daily, weekday, weekly, monthly, quarterly, and annual presets.
- Migrate or project legacy elapsed intervals.
- Add edit and duplicate flows across web and mobile.
- Add unread results and push/system notifications.
- Publish catch-up, overlap, timezone, and auto-pause behavior in user docs.

### Phase 3: unattended-agent controls

- Add per-schedule tool/network/repository policy.
- Add spend and invocation budgets.
- Add scheduler health and expected-run alerts.
- Add reusable templates for monitoring, maintenance, reports, and research.
- Consider event triggers and deterministic command jobs as separate trigger/action types.

## Delivery estimate

These are planning estimates for one engineer already familiar with the orchestration stack. They
include focused contract, server, client-runtime, web, and mobile verification, but exclude release
lead time, store review, and work on event triggers.

| Delivery | Focus                                                                                         | Engineering estimate | Main uncertainty                                                                 |
| -------- | --------------------------------------------------------------------------------------------- | -------------------: | -------------------------------------------------------------------------------- |
| Phase 1  | One-off triggers, current-thread follow-ups, `/schedule`, agent schedule proposal/create tool |  18–26 focused hours | Provider-session resume behavior and mixed-version command handling              |
| Phase 2  | RRULE recurrence, paginated run history, global board, completed one-offs, notifications      |  22–34 focused hours | Calendar edge cases, cross-environment board loading, mobile information density |
| Phase 3  | Tool/network scopes, spend caps, health alerts, templates, event-trigger seam                 |  28–45 focused hours | Provider-specific usage accounting and authorization policy                      |

The first two phases form the complete native scheduling product. Budget roughly **40–60 focused
engineering hours**, followed by one release-candidate pass across web, desktop, iOS, Android,
local, and remote connections. Phase 3 should remain a separate investment decision.

## Product acceptance criteria

The feature is ready when these statements are true:

1. From any thread on web or mobile, a user can say or type `/schedule` and create a one-off or recurring schedule without leaving the conversation.
2. The confirmation shows the full date, time, timezone, recurrence, instruction, destination, and next run.
3. A thread follow-up returns to the same durable thread and uses the selected context mode.
4. A standalone schedule runs in its own schedule-owned thread.
5. The server executes while all clients are disconnected and reports when its host was unavailable.
6. Every due instant produces either one started run or one visible skipped/deferred record; never silence and never duplicates.
7. The global Scheduled board shows active, running, paused, completed, failed, and delayed work across environments the client can access.
8. The user can run now, edit, pause/resume, duplicate, delete, and open the linked thread from the board.
9. Web, desktop, and mobile render the same canonical schedule state over the existing contracts.
10. Codex, Claude, Cursor, Grok, and OpenCode can all request schedules through the same Pulse-owned capability, subject to the same authorization rules.

## Decision

Build scheduling as a native Pulse Code orchestration capability with conversational and `/schedule` entry points. Represent one-time and recurring triggers explicitly, make current-thread versus standalone execution a first-class destination, and evolve the existing Scheduled view into the global board.

For the first release, optimize for scheduled follow-ups and dependable visibility. The user value comes from confidently returning to work at the right time; advanced workflow automation can follow after the scheduler proves that it never silently loses a job.
