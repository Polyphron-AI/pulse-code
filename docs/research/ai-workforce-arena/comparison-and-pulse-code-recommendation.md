# AI workforce arena: comparison and Pulse Code recommendation

Research date: 2026-08-25  
Audience: Pulse Code product and engineering maintainers  
Decision: how Pulse should support an orchestrator with workers grouped by department

## Executive summary

The market is validating demand for software that looks like a business—managers, workers, departments, schedules, and shared tools—but not the claim that current agents reliably replace employees. The most credible deployments use agents as bounded junior operators inside a deterministic process. They monitor, research, extract, classify, test, reconcile, and draft. Humans or conventional software still own authority, validation, retries, and irreversible actions.

The central finding is:

> Copy the process topology, not the org-chart theatre.

Pulse Code is unusually well positioned to do this. It already has provider-neutral execution, typed WebSocket contracts, event-sourced orchestration, queue-backed reactors, receipts, checkpoints, remote connectivity, mobile approval/status surfaces, and a real Hermes provider. It should become the durable **work control plane** above provider sessions. Hermes and, after the planned ACP work, OMP are the strongest initial worker runtimes. Grok Bot, OpenClaw, CrewAI, LangGraph, MetaGPT, n8n, and Relevance AI provide useful product or architecture lessons, but none should replace Pulse’s canonical state.

The recommended first product is not a general autonomous company. It is a small, inspectable department work queue:

- two pilot departments;
- at most three worker templates each;
- read, analyze, draft, test, and prepare actions first;
- typed work orders and versioned artifact handoffs;
- durable approvals for consequential actions;
- per-task budgets, leases, retries, evidence, and receipts;
- one authoritative state machine owned by Pulse.

This is a meaningful scope expansion. The current [Scheduled Chats design](../../plans/2026-08-21-scheduled-chats-design.md) explicitly excludes a generic autonomous workflow engine. The workforce concept should therefore receive its own product goal and contract rather than being smuggled into Scheduled Chats or the [OMP provider work](../../plans/2026-08-24-omp-agent-provider-design.md).

## Arena result

Scores are interpretive, from 1 (poor) to 5 (strong). “Worker fit” asks whether the runtime belongs behind a Pulse provider boundary. “Control-plane fit” asks whether Pulse should delegate canonical work state to it. “Reference value” captures reusable UX or architecture lessons.

| Candidate                          | Core model                                                       | Evidence of useful business work                               | Recurring weakness                                                                         | Worker fit | Control-plane fit | Reference value | Recommended relationship         |
| ---------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------: | ----------------: | --------------: | -------------------------------- |
| [Grok Bot](01-grok-bot.md)         | Persistent cloud computers, bot roster, chief of staff           | QA, research, follow-up drafts, bounded browser tasks          | Forgotten schedules, expired approvals, shared-state corruption, browser instability, cost |          1 |                 1 |               4 | UX benchmark only                |
| [Pi / OMP](02-pi-and-oh-my-pi.md)  | Minimal agent plus extensible skills; OMP task hub and subagents | Coding, research, extraction, local/private specialist work    | Extension provenance, continuity, context/tool overhead                                    |          5 |                 2 |               5 | Planned ACP worker provider      |
| [Hermes](03-hermes-agent.md)       | Profiles, tools, delegation, scheduler, durable Kanban           | Monitoring, research, SME support, draft outreach, operations  | Prompt-level learning, human relay, deployment care                                        |          5 |                 2 |               5 | First worker-provider pilot      |
| [OpenClaw](04-openclaw.md)         | Self-hosted messaging gateway, workspaces, cron, routing         | Monitoring, briefs, overnight preparation, reconciliation prep | Browser brittleness, hallucinated business facts, unsafe actions, stalled teams            |          2 |                 2 |               4 | Optional channel bridge          |
| [CrewAI](05-crewai.md)             | Role-based crews plus explicit flows                             | Fast static-pipeline prototypes                                | Token overhead, autonomy loops, tracing and control-flow friction                          |          2 |                 2 |               3 | Vocabulary/prototyping reference |
| [LangGraph](06-langgraph.md)       | Stateful execution graph with checkpoints and interrupts         | Complex bounded workflows with branch/retry/HITL               | Modeling complexity; duplicate authority if embedded                                       |          2 |                 2 |               5 | Architecture reference           |
| [MetaGPT](07-metagpt.md)           | SOP-driven simulated software company                            | Artifact generation and lifecycle scaffolding                  | Handoff drift, correlated errors, role proliferation                                       |          1 |                 1 |               3 | Artifact/SOP reference           |
| [n8n](08-n8n.md)                   | Deterministic integration workflow with AI nodes                 | Triggers, connectors, validation, approved mutations           | Weak native conversational state; canvas sprawl; licensing                                 |          2 |                 1 |               4 | External integration target      |
| [Relevance AI](09-relevance-ai.md) | Proprietary visual AI workforce                                  | Sales research, enrichment, classification, drafts             | Customization, integration, determinism, closed control plane                              |          1 |                 1 |               4 | Competitive UX benchmark         |

## What is actually working

### 1. Read-heavy work with a reviewable artifact

The strongest recurring examples are research briefs, document extraction, lead/account research, inbox classification, QA reports, monitoring alerts, and reconciliation preparation. The output can be checked before it changes the world. Pi users report document and database research; Hermes operators report recurring monitoring and SME research; OpenClaw users report overnight briefs and investigation; Grok Bot users report web QA and bounded follow-up support.

### 2. One bounded worker before a team

Users who report durable value commonly recommend one small workflow made “boringly reliable.” By contrast, six-bot departments and orchestrator-plus-worker swarms exhibit forgotten tasks, loops, duplicated work, or human-relay overhead. Multiple agents help when work is genuinely parallel or when context must be isolated. They do not help merely because the business has an org chart.

### 3. Deterministic scaffolding around model judgment

[ClawsBench](https://clawsbench.benchflow.ai/) is the most decision-useful quantitative evidence found. In 7,224 main trials covering Gmail, Slack, Calendar, Docs, and Drive, unscaffolded agents achieved only 0–8% task success. Skills plus a strong meta-prompt raised results to 39–63%, but leading configurations still made unsafe actions in 7–23% of trials; multi-service tasks were harder and less safe. Scaffolding—not the employee persona—is doing much of the work.

The production pattern is therefore:

1. deterministic trigger and task creation;
2. scoped model interpretation or generation;
3. schema and policy validation;
4. explicit approval if consequences are material;
5. idempotent execution;
6. receipt, evidence, and recovery path.

### 4. Explicit artifacts beat shared conversation

MetaGPT’s most durable idea is standardized handoff artifacts. Hermes users independently converge on shared workspaces, work-order files, Kanban, and evidence. OpenClaw users reach for shared memory files when chat handoffs fail. The next step is to make those artifacts typed, versioned, and owned—not merely shared Markdown that any worker can overwrite.

### 5. Human intervention works when it is a state, not a notification

The Grok Bot brokerage report is a near-perfect counterexample: approval cards expired, the bot forgot the pending action, and work silently died. An approval must be a durable work state with an owner, reason, proposed effect, expiry policy, and resume path. Pulse’s mobile **Needs input / Working / Completed** model already provides a useful surface ([mobile agents](../../user/mobile-agents.md)); it needs a durable domain object behind it.

## Why the “AI company” attempts fail

### Personas are mistaken for capabilities

“Director of Operations” communicates an expectation to a human but does not create authority rules, task leases, scheduling guarantees, or competence. The system needs a capability manifest and policy, not a backstory.

### Agent chat becomes the database

Schedules, promises, task ownership, and policy are placed in conversation or memory. Models summarize, forget, or reinterpret them. Canonical state must live outside the model context.

### Multiple workers share mutable surfaces

The brokerage team repeatedly rebuilt a shared Sheet and erased progress. This is a concurrency-control failure. Work needs explicit ownership, optimistic versions, idempotency keys, and append-only evidence where possible.

### Manager agents amplify uncertainty

A manager model can propose decomposition and synthesize results. It cannot be the only component enforcing completion. Each additional conversational handoff adds latency, cost, and another opportunity to drop a constraint.

### Browser automation is treated like an API

Browser sessions reset, sites change, logins expire, and rendered state can be ambiguous. Browser work is essential where no API exists, but should have stronger evidence capture, bounded retries, and lower authority.

### Long-lived memory is confused with learning

Forum reports across Hermes, Pi, Grok Bot, and OpenClaw describe style drift, forgotten rules, or memory packages created to repair continuity. “Self-improvement” that only edits prompt text is advisory. Enforced behavior belongs in tools, schemas, policies, and tests.

### Cost is not attached to a business unit of work

Quota exhaustion becomes surprising when cost is shown per chat or plan rather than per work order and accepted outcome. A department system needs a budget, reservation, actual cost, and stop policy for every task.

## Recommended Pulse Code product model

Pulse should describe the product as **department work queues with accountable AI operators**, not employee replacement. The organization metaphor remains useful in the UI, while the underlying model stays small and rigorous.

```text
Human / API / schedule
          │
          ▼
   Pulse Work Order ──────── durable state, policy, budget, evidence
          │
     deterministic dispatch
          │
   ┌──────┴─────────┐
   ▼                ▼
Hermes worker    OMP worker       other provider workers later
   │                │
   └──── artifacts + activities + proposed effects ────┐
                                                        ▼
                                         validation / approval / receipt
                                                        │
                                                        ▼
                                           next work order or completion
```

### Department

A department is a policy and context boundary, not a chat room. It should define:

- name and purpose;
- allowed worker templates and providers;
- scoped projects, repositories, knowledge, and integrations;
- tool and credential capabilities;
- default model/effort and cost budget;
- approval policy by action risk;
- concurrency and scheduling limits;
- artifact schemas and retention rules.

Examples: Research, Engineering, Customer Operations, Finance Preparation. Avoid pretending “Finance” is safe merely because the worker has a finance title.

### Worker template

A worker is an execution template, usually instantiated as a fresh provider session per work order:

- provider and profile;
- instructions and skills;
- allowed tools;
- input/output schema;
- context sources;
- model and budget limits;
- acceptance checks;
- optional continuity key when persistent memory is actually required.

Fresh sessions reduce context contamination. Continuity should be an explicit choice backed by versioned artifacts, not the default consequence of keeping a chat alive.

### Work order

The minimum durable entity should include:

| Field                               | Purpose                                                                |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `workOrderId` and idempotency key   | Prevent duplicate execution and external effects                       |
| department and worker template      | Resolve policy and execution configuration                             |
| objective and acceptance criteria   | Separate intent from evidence of completion                            |
| typed inputs and expected artifacts | Make handoffs inspectable                                              |
| dependencies                        | Prevent conversational guessing about readiness                        |
| risk class and proposed effects     | Select approval and validation policy                                  |
| lease, heartbeat, and attempt       | Detect abandoned or duplicated work                                    |
| retry and cost budget               | Bound loops and spend                                                  |
| status and reason                   | Explain queued, running, blocked, approval, failed, or completed state |
| activities, artifacts, and receipts | Support audit, remote UI, and replay                                   |

Completion should be decided by Pulse after required receipts and validations land, not asserted by a worker’s final message.

### Orchestrator

The orchestrator should primarily be a deterministic decider and dispatcher. A planner model may propose subtasks, owners, and dependencies, but those proposals become typed commands subject to policy. This preserves the useful intelligence of a manager agent without making its conversation the scheduler.

### Handoffs

Departments should exchange immutable or versioned artifacts and new work orders. Raw agent-to-agent chat can remain an optional activity stream, never the only record of responsibility. For shared mutable integrations, use optimistic versions and typed mutation tools, following the pattern already documented for [Pulse Issues](../../internals/issues-integration.md).

## Why this fits Pulse Code

Pulse’s [architecture](../../internals/overview.md) already separates provider adapters from durable orchestration and uses commands, events, projections, queue-backed workers, receipts, and checkpoints. The proposed feature extends that language rather than replacing it.

Existing assets map cleanly:

- **Provider neutrality:** Hermes is present today; OMP has a shaped ACP provider plan; Codex, Claude, Cursor, Grok, and OpenCode remain possible workers.
- **Remote ready:** the server owns canonical state, while web, desktop, and mobile can observe and intervene.
- **Multi-surface approvals:** mobile already groups agents by needs-input, working, and completed state.
- **Typed integrations:** Pulse Issues demonstrates server-owned credentials, capability gates, optimistic versions, and separated read/write tools.
- **Checkpoints:** code workers already produce recoverable repository state.
- **Open core:** the work-order contract and provider boundary can remain inspectable and forkable.

The main architectural trap is dual ownership. OMP’s Agent Hub, Hermes Kanban, OpenClaw sessions, n8n executions, or a LangGraph checkpoint may exist within or alongside a run, but Pulse must decide which state is canonical and how external state maps to a Pulse receipt.

## Recommended adoption order

### Phase 0: validate the domain

Write a focused product goal and contracts before UI work. Reconcile it explicitly with Scheduled Chats’ non-goal. Define `Department`, `WorkerTemplate`, `WorkOrder`, `Artifact`, `Approval`, and `WorkReceipt` in product language.

### Phase 1: two-department pilot

Use **Research** and **Engineering** because Pulse can inspect their outputs and already understands repository work.

- Research worker: collect cited evidence, extract documents, compare alternatives, produce a Markdown artifact.
- Engineering worker: implement or review a bounded repository change and return checkpoint/test receipts.
- Start with Hermes; add OMP when its provider integration is complete.
- Limit each department to three templates and total fan-out to a small fixed number.
- No autonomous customer messages, payments, production deploys, or destructive mutations.

### Phase 2: durable operations

Add leases, attempts, retry policy, cost reservation, approval inbox, dependency-aware dispatch, artifact validation, and event-history replay. Make cancellation and compensation first-class reverse states.

### Phase 3: integration boundary

Expose a narrow work-order API/MCP surface so n8n, OpenClaw, or customer systems can submit tasks and receive signed status events without becoming the source of truth.

### Phase 4: business departments

Pilot Customer Operations or Sales Preparation with read/draft permissions. Introduce CRM writes and outbound messages only after idempotency, non-expiring approvals, sandbox evaluation, and rollback/reconciliation behavior meet the success gates below.

## Success gates

Do not judge the pilot by how convincingly workers speak. Measure operational outcomes:

| Metric                                       | Initial gate                                                      |
| -------------------------------------------- | ----------------------------------------------------------------- |
| Accepted artifact rate                       | At least 80% on a fixed, low-risk evaluation set                  |
| Unapproved consequential actions             | Zero                                                              |
| Duplicate external effects                   | Zero                                                              |
| Lost or silently abandoned work orders       | Zero                                                              |
| Recovery after provider/process interruption | 100% reaches resumed or explicit failed state                     |
| Evidence completeness                        | Every accepted result links required artifacts/receipts           |
| Human correction time                        | Lower than performing the baseline task manually                  |
| Cost predictability                          | Actual cost stays within the per-order budget or stops explicitly |
| Cross-device state agreement                 | Web, desktop, and mobile show the same canonical status           |

ClawsBench’s 7–23% unsafe-action range for leading scaffolded configurations is a warning that “mostly works” is not an adequate launch bar for unreviewed side effects.

## Easy-win backlog

Ranked by value, reversibility, and fit with Pulse:

1. Repository research and evidence-backed technical brief.
2. Test-plan generation and non-mutating QA runs.
3. Issue triage and proposed labels/owners for approval.
4. Dependency, release-note, or security monitoring with alerts.
5. Document extraction into a typed artifact.
6. Daily project or department briefing from canonical events.
7. Draft customer or sales response with cited account context.
8. CRM mutation only after durable approval and version checks.

## Decisions to make next

1. Is the product goal a coding-team feature first, or a general business-work control plane from day one?
2. Does a work order live inside an existing thread, create a thread, or reference multiple provider threads?
3. Which artifacts become first-class contracts versus ordinary files?
4. How are provider-internal subagents projected without flooding clients or websocket payloads?
5. Which action classes always require approval, and which can earn greater autonomy through evaluation?
6. How should cost reservations work across providers with different accounting and quota semantics?
7. Is a department environment-local, project-local, or shareable across projects?

## Caveats

- Most forum reports are anonymous, self-selected, and impossible to reproduce. Concrete modest examples were weighted above dramatic revenue claims.
- Products in this arena are changing quickly; capabilities and pricing should be rechecked before implementation or procurement.
- Benchmarks model a subset of office work and cannot establish safety in a particular customer environment.
- This research evaluates product and architecture fit. It is not a security threat model, licensing opinion, or implementation estimate.
- “PI” was interpreted as Pi/Oh My Pi. If the intended product was Inflection Pi, it belongs in a companion/communication comparison rather than this agent-orchestration arena.
