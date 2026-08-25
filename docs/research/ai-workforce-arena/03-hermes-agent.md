# Hermes Agent: business-workforce dossier

## Bottom line

Hermes is the strongest near-term fit for Pulse Code because it already exists as a Pulse provider and its recent design has moved toward the mechanics business work actually needs: separate profiles, durable Kanban state, dependencies, resumability, scheduling, auditability, and human intervention. Forum reports still warn that prompt-level “self-improvement” is weak and multi-agent chat is fragile. Pulse should use Hermes as a capable worker, while keeping Pulse’s event log and work queue authoritative.

## What it is

[Hermes Agent](https://github.com/nousresearch/hermes-agent) is an MIT-licensed, model-agnostic agent runtime with terminal, browser, web, memory, scheduled-task, messaging, and delegation tools. Its [profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles/) separate agents by purpose and state.

The most relevant feature is its [Kanban system](https://github.com/nousresearch/hermes-agent/blob/main/website/docs/user-guide/features/kanban.md): a durable SQLite-backed task state machine with dependencies, named profiles, CLI/tool access, resumability, audit history, and human-in-the-loop operation. Hermes explicitly distinguishes this durable queue from ephemeral `delegate_task` fork/join delegation. Its [tool catalog](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools/) covers the broader execution surface.

## What people report works

- A month-long user report recommends starting with one small workflow, making it “boringly reliable,” then separating profiles and shaping skills. The useful finding is sequencing: reliability emerged from a narrow workflow and careful configuration, not from deploying an instant company. ([Reddit: one month with Hermes](https://www.reddit.com/r/hermesagent/comments/1t29ogw/one_month_with_hermes_agent_what_i_wish_i_knew/))
- Another workflow report found that isolated domain agents working through a shared workspace and durable work state were more dependable than a conversational orchestrator handing off to specialists. ([Reddit: workflow learnings](https://www.reddit.com/r/hermesagent/comments/1u1edgv/my_learnings_after_testing_agent_workflows/))
- An SME practitioner described pilots for apparel outreach with Odoo CRM, packaging-prospect validation, and ERP project support using SharePoint, Excel, and Planner. The report emphasizes human validation and a separate environment, credentials, and recovery path per client. These are plausible deployments, but the outcome claims are self-reported. ([Reddit: SME deployments](https://www.reddit.com/r/hermesagent/comments/1uubez0/anyone_else_deploying_hermes_into_sme_businesses/))
- A particularly credible easy win checks an order page every 20 minutes and alerts staff when a shipment deadline approaches. The value comes from deterministic recurrence and a small, observable action surface. ([Reddit: useful automated tasks](https://www.reddit.com/r/hermesagent/comments/1vvyfi3/what_are_your_most_useful_automated_tasks_with/))
- A research pipeline used eight roles to produce a deep report, but required weeks of adjustment and retained a human as the final credibility filter. ([Reddit: deep-research pipeline](https://www.reddit.com/r/hermesagent/comments/1vkftx8/i_built_a_deep_research_pipeline_out_of_nothing/))

## What fails, and why

- A three-month user found that “self-improvement” did not reliably enforce learned tool preferences or rules. Memory-provider configuration could disable the expected background behavior, and the remaining learning was prompt-level rather than a hard constraint. ([Reddit: self-improvement discussion](https://www.reddit.com/r/hermesagent/comments/1upvfe7/hermes_agents_selfimprovement_does_it_actually/))
- A small-business setup with a coordinator, departmental chats, execution agents, work-order Markdown files, budgets, and red-team checks still left the human copying information between agents. A commenter solved parts of this with Kanban, file inboxes, and cron, but not true agent-to-agent reliability. ([Reddit: human relay problem](https://www.reddit.com/r/hermesagent/comments/1vb4cab/multiagent_setup_works_but_im_the_relay_between/))
- Users migrating from OpenClaw sometimes describe Hermes as slower but more reliable; this is preference evidence, not a controlled comparison. ([Reddit: comparison discussion](https://www.reddit.com/r/hermesagent/comments/1t47gk5/just_discovered_hermes_agent_how_does_it_compare/))
- SME deployments still require credential isolation, monitoring, recovery procedures, and more ongoing care than “one hour per month.” ([SME thread and comments](https://www.reddit.com/r/hermesagent/comments/1uubez0/anyone_else_deploying_hermes_into_sme_businesses/))

The lesson is that Hermes becomes stronger as conversational coordination is replaced by durable work items. Profiles isolate context, but do not by themselves guarantee permissions, idempotency, or cross-system correctness.

## Easy wins

- monitoring a business page or operational inbox and alerting;
- recurring research and security/news briefings;
- document and account research with evidence attached;
- draft outreach or CRM updates awaiting approval;
- engineering and operational work where terminal/browser access is valuable;
- a specialist worker consuming one queued task with explicit dependencies.

## Fit for Pulse Code

**Worker-provider fit: 5/5. Control-plane replacement fit: 2/5.**

Pulse already includes Hermes among its six provider drivers ([architecture overview](../../internals/overview.md)) and has server-side provider adapters. That makes Hermes the lowest-friction candidate for a department-worker pilot.

Recommended boundary:

- Pulse creates and owns the canonical work order, dependency graph, approval, retry, budget, and completion receipt.
- Hermes receives the scoped task, workspace, credentials, and policy through the provider session.
- Hermes may delegate internally, but nested tasks remain execution detail unless explicitly promoted.
- Hermes returns evidence and artifacts; it does not directly declare the business task complete.
- Do not mirror the same queue independently in Pulse and Hermes. If Hermes Kanban is used inside a run, project only the needed activities into Pulse and keep one authoritative state machine.

Hermes profiles are a good implementation analogue for departments, but a Pulse department should additionally define knowledge, tool permissions, budgets, and approval policy.

## Evidence quality

The feature evidence is strong and source-visible. Forum evidence contains several concrete deployments and recurring failure patterns, but no independent longitudinal business benchmark. The “self-improving” label should remain a hypothesis until behavior changes are visible, reviewable, and enforceable.
