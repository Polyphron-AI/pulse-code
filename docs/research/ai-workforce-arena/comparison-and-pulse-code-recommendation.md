# AI workforce arena: comparison and Pulse Code recommendation

Research date: 2026-08-25  
Audience: Pulse Code product and engineering maintainers  
Decision: how Pulse should support an orchestrator with workers grouped by department

## Executive summary

The market validates demand for software that looks like a business—managers, workers, departments, schedules, and shared tools—but not the claim that current agents reliably replace employees. Credible deployments use agents as bounded junior operators inside deterministic processes. They monitor, research, extract, classify, test, reconcile, and draft. Humans or conventional software retain authority over validation, retries, and irreversible actions.

The central finding is:

> Copy the process topology, not the org-chart theatre.

Pulse Code should become the durable **work control plane** above provider sessions. It already has provider-neutral execution, typed contracts, event-sourced orchestration, queue-backed reactors, receipts, checkpoints, remote connectivity, mobile status/approval surfaces, and a Hermes provider. Hermes is the best initial worker runtime; OMP is the strongest next candidate after its planned ACP integration.

The first product should be a small inspectable department work queue:

- two pilot departments;
- no more than three worker templates each;
- read, analyze, draft, test, and prepare actions first;
- typed work orders and versioned artifact handoffs;
- durable approvals for consequential actions;
- per-task budgets, leases, retries, evidence, and receipts;
- one authoritative state machine owned by Pulse.

This exceeds the current [Scheduled Chats design](../../plans/2026-08-21-scheduled-chats-design.md), which explicitly excludes a generic autonomous workflow engine. It needs its own product goal and contracts rather than an accidental expansion of Scheduled Chats or the [OMP provider design](../../plans/2026-08-24-omp-agent-provider-design.md).

## Arena result

Scores run from 1 (poor) to 5 (strong). “Worker fit” means suitability behind a Pulse provider boundary. “Control-plane fit” asks whether Pulse should delegate canonical state. “Reference value” captures reusable UX or architecture lessons.

| Candidate                          | Core model                                             | What works                                            | Recurring weakness                                                    | Worker fit | Control-plane fit | Reference value | Relationship             |
| ---------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------- | ---------: | ----------------: | --------------: | ------------------------ |
| [Grok Bot](01-grok-bot.md)         | Persistent cloud computers, bot roster, chief of staff | QA, research, follow-up drafts, bounded browser work  | Forgotten schedules, expired approvals, shared-state corruption, cost |          1 |                 1 |               4 | UX benchmark             |
| [Pi / OMP](02-pi-and-oh-my-pi.md)  | Minimal agent; OMP task hub and subagents              | Coding, research, extraction, private specialist work | Extension provenance, continuity, tool/context overhead               |          5 |                 2 |               5 | Planned ACP provider     |
| [Hermes](03-hermes-agent.md)       | Profiles, tools, scheduler, durable Kanban             | Monitoring, research, SME support, operations         | Prompt-level learning, human relay, deployment care                   |          5 |                 2 |               5 | First worker pilot       |
| [OpenClaw](04-openclaw.md)         | Messaging gateway, workspaces, cron, routing           | Monitoring, briefs, overnight preparation             | Brittle browser, hallucinated facts, unsafe effects, stalled teams    |          2 |                 2 |               4 | Optional channel bridge  |
| [CrewAI](05-crewai.md)             | Role-based crews plus flows                            | Fast static-pipeline prototypes                       | Token overhead, loops, tracing/control friction                       |          2 |                 2 |               3 | Vocabulary reference     |
| [LangGraph](06-langgraph.md)       | Stateful graph, checkpoints, interrupts                | Branch/retry/HITL workflows                           | Modeling complexity and duplicate authority                           |          2 |                 2 |               5 | Architecture reference   |
| [MetaGPT](07-metagpt.md)           | SOP-driven simulated company                           | Artifact and lifecycle scaffolding                    | Handoff drift, correlated errors, role proliferation                  |          1 |                 1 |               3 | Artifact/SOP reference   |
| [n8n](08-n8n.md)                   | Deterministic integration flow with AI nodes           | Triggers, connectors, validation, approved mutations  | State placement, canvas sprawl, licensing                             |          2 |                 1 |               4 | External integration     |
| [Relevance AI](09-relevance-ai.md) | Proprietary visual workforce                           | Sales research, enrichment, classification, drafts    | Customization, integrations, closed control plane                     |          1 |                 1 |               4 | Competitive UX benchmark |

## What is actually working

### Read-heavy work with reviewable output

The strongest examples are research briefs, document extraction, lead/account research, inbox classification, QA reports, monitoring alerts, and reconciliation preparation. The output can be checked before it changes the world.

### One bounded worker before a team

Durable-value reports recommend making one small workflow “boringly reliable.” Six-bot departments and orchestrator/worker swarms show forgotten tasks, duplicate work, loops, or human-relay overhead. Multiple agents help when work is genuinely parallel or context must be isolated—not because the business has an org chart.

### Deterministic scaffolding around model judgment

[ClawsBench](https://clawsbench.benchflow.ai/) is the strongest quantitative evidence found. Across 7,224 trials covering Gmail, Slack, Calendar, Docs, and Drive, unscaffolded agents achieved 0–8% task success. Skills plus a strong meta-prompt raised results to 39–63%, but leading configurations still produced unsafe actions in 7–23% of trials. Multi-service work was harder and less safe.

The production pattern is:

1. deterministic trigger and task creation;
2. scoped model interpretation or generation;
3. schema and policy validation;
4. explicit approval when consequences are material;
5. idempotent execution;
6. receipt, evidence, and recovery.

### Explicit artifacts beat shared conversation

MetaGPT formalizes artifact handoffs. Hermes users converge on workspaces, work orders, and Kanban. OpenClaw users reach for shared files when chat handoffs fail. Pulse should make these artifacts typed, versioned, and owned rather than allowing every worker to overwrite shared prose or spreadsheets.

### Human intervention must be durable state

The Grok Bot brokerage case is the counterexample: approval cards expired, pending actions were forgotten, and work died. An approval needs an owner, reason, proposed effect, expiry policy, and resume path. Pulse’s mobile **Needs input / Working / Completed** presentation is a useful surface ([mobile agents](../../user/mobile-agents.md)); it needs a durable business object behind it.

## Why AI-company attempts fail

- **Personas are mistaken for capabilities.** “Director of Operations” does not create authorization, scheduling guarantees, or competence.
- **Chat becomes the database.** Schedules, promises, ownership, and policy are stored in context that models summarize or forget.
- **Workers share mutable surfaces.** Shared Sheets and CRMs are changed without ownership, optimistic versions, or idempotency.
- **Manager agents amplify uncertainty.** They can propose decomposition, but another probabilistic hop does not enforce completion.
- **Browser automation is treated like an API.** Sessions reset, sites change, logins expire, and clicks are ambiguous.
- **Memory is confused with learning.** Prompt-level lessons are advisory; enforced behavior belongs in tools, schemas, policies, and tests.
- **Cost is detached from business output.** Quota per plan/chat obscures cost per accepted work order.

## Recommended Pulse model

Describe the feature as **department work queues with accountable AI operators**, not employee replacement.

```text
Human / API / schedule
          │
          ▼
   Pulse Work Order ─── durable state, policy, budget, evidence
          │
     deterministic dispatch
          │
   ┌──────┴─────────┐
   ▼                ▼
Hermes worker    OMP worker       other providers later
   │                │
   └── artifacts + activities + proposed effects ──┐
                                                    ▼
                                     validation / approval / receipt
                                                    │
                                                    ▼
                                       next work order or completion
```

### Department

A department is a policy/context boundary, not a chat room. It defines purpose, allowed worker templates/providers, scoped projects and knowledge, tool/credential capabilities, model and cost defaults, approval policy, concurrency limits, and artifact schemas.

### Worker template

A worker template defines provider/profile, instructions, skills, allowed tools, input/output schema, context sources, budget, and acceptance checks. Prefer a fresh session per work order; continuity is an explicit option backed by versioned artifacts.

### Work order

| Field                               | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| ID and idempotency key              | Prevent duplicate execution and effects                       |
| Department and worker template      | Resolve policy and configuration                              |
| Objective and acceptance criteria   | Separate intent from completion evidence                      |
| Typed inputs and expected artifacts | Make handoffs inspectable                                     |
| Dependencies                        | Prevent conversational guessing about readiness               |
| Risk class and proposed effects     | Select approval policy                                        |
| Lease, heartbeat, and attempt       | Detect abandoned or duplicate work                            |
| Retry and cost budget               | Bound loops and spend                                         |
| Status and reason                   | Explain queued, running, blocked, approval, failed, completed |
| Activities, artifacts, receipts     | Support audit, remote UI, and replay                          |

Pulse decides completion after validations and receipts; a worker’s final message is not authoritative.

### Orchestrator and handoffs

The orchestrator is primarily a deterministic decider/dispatcher. A planner model may propose subtasks and dependencies, but proposals become typed commands subject to policy. Departments exchange versioned artifacts and new work orders. Raw agent chat may be visible but is never the only record of responsibility. Shared mutations should use optimistic versions and typed tools, following [Pulse Issues](../../internals/issues-integration.md).

## Why this fits Pulse

Pulse’s [architecture](../../internals/overview.md) already separates provider adapters from durable orchestration and uses commands, events, projections, queue-backed workers, receipts, and checkpoints.

- **Provider neutrality:** Hermes exists now; OMP has a shaped ACP plan.
- **Remote ready:** the server owns canonical state while web, desktop, and mobile observe/intervene.
- **Multi-surface approvals:** mobile already groups needs-input, working, and completed states.
- **Typed integrations:** Pulse Issues demonstrates server credentials, capability gates, optimistic versions, and separate read/write tools.
- **Checkpoints:** code workers already produce recoverable repository state.
- **Open core:** contracts and provider boundaries remain inspectable and forkable.

The architectural trap is dual ownership. OMP Agent Hub, Hermes Kanban, OpenClaw sessions, n8n runs, or LangGraph checkpoints may exist within a run, but Pulse decides which state is canonical and how external state becomes a receipt.

## Adoption order

### Phase 0: define the domain

Create a focused product goal and contracts for `Department`, `WorkerTemplate`, `WorkOrder`, `Artifact`, `Approval`, and `WorkReceipt`. Reconcile the scope explicitly with Scheduled Chats.

### Phase 1: two-department pilot

Use Research and Engineering because their outputs are inspectable:

- Research: cited evidence, extraction, comparison, Markdown artifact.
- Engineering: bounded change/review with checkpoint and test receipts.
- Start with Hermes; add OMP after provider integration.
- Limit fan-out and prohibit autonomous messages, payments, production deployments, or destructive actions.

### Phase 2: durable operations

Add leases, attempts, retry policy, cost reservation, approval inbox, dependency dispatch, artifact validation, event replay, cancellation, and compensation.

### Phase 3: integration boundary

Expose a narrow API/MCP surface so n8n, OpenClaw, or customer systems can submit tasks and consume signed events without becoming canonical state.

### Phase 4: business departments

Pilot Customer Operations or Sales Preparation with read/draft permissions. Add CRM writes and outbound messages only after idempotency, non-expiring approvals, evaluation, and recovery meet explicit gates.

## Success gates

| Metric                           | Initial gate                                            |
| -------------------------------- | ------------------------------------------------------- |
| Accepted artifact rate           | At least 80% on a fixed low-risk evaluation set         |
| Unapproved consequential actions | Zero                                                    |
| Duplicate external effects       | Zero                                                    |
| Lost or silently abandoned work  | Zero                                                    |
| Recovery after interruption      | 100% reaches resumed or explicit failed state           |
| Evidence completeness            | Every accepted result links required artifacts/receipts |
| Human correction time            | Lower than performing the baseline manually             |
| Cost predictability              | Within per-order budget or explicit stop                |
| Cross-device agreement           | Same canonical state on web, desktop, and mobile        |

ClawsBench’s 7–23% unsafe-action range is a warning that “mostly works” is not a sufficient launch bar for unreviewed effects.

## Easy-win backlog

1. Repository research and evidence-backed briefs.
2. Test-plan generation and non-mutating QA.
3. Issue triage with proposed labels/owners.
4. Dependency, release, or security monitoring.
5. Document extraction into typed artifacts.
6. Daily project/department briefing from canonical events.
7. Draft customer or sales response with cited context.
8. CRM mutation only after approval and version checks.

## Open decisions

1. Coding-team feature first, or general business control plane immediately?
2. Does a work order live in a thread, create one, or reference several?
3. Which artifacts become first-class contracts?
4. How are provider-internal subagents projected without excessive websocket payloads?
5. Which effects always require approval?
6. How are budgets normalized across provider accounting models?
7. Is a department environment-local, project-local, or cross-project?

## Caveats

- Forum reports are anonymous, self-selected, and rarely reproducible.
- Capabilities and pricing in this fast-moving arena require rechecking before procurement.
- Benchmarks cover only a subset of office work.
- This is product/architecture research, not a security threat model, licensing opinion, or implementation estimate.
- “Pi” was interpreted as Pi/OMP. Inflection Pi belongs in a companion/communication comparison.
