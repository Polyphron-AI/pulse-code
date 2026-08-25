# Hermes Agent: business-workforce dossier

## Bottom line

Hermes is the strongest immediate fit because Pulse already supports it and its architecture has moved toward business-relevant mechanics: separate profiles, durable Kanban state, dependencies, resumability, scheduling, audit history, and human intervention. Pulse should use Hermes as a worker while retaining authority over the business queue.

## Product and organizational model

[Hermes Agent](https://github.com/nousresearch/hermes-agent) is an MIT-licensed, model-agnostic runtime with terminal, browser, web, memory, scheduling, messaging, and delegation tools. [Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles/) separate agents by purpose and state.

Its [Kanban system](https://github.com/nousresearch/hermes-agent/blob/main/website/docs/user-guide/features/kanban.md) is a durable SQLite-backed task state machine with dependencies, resumability, audit history, CLI/tool access, and human intervention. Hermes explicitly distinguishes this from ephemeral fork/join delegation. Its [tool catalog](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools/) covers the broader execution surface.

## What people report works

- A month-long user recommends starting with one small workflow, making it “boringly reliable,” then separating profiles and shaping skills. ([field report](https://www.reddit.com/r/hermesagent/comments/1t29ogw/one_month_with_hermes_agent_what_i_wish_i_knew/))
- Another found isolated domain agents using durable work state and a shared workspace more reliable than a conversational orchestrator. ([workflow report](https://www.reddit.com/r/hermesagent/comments/1u1edgv/my_learnings_after_testing_agent_workflows/))
- SME pilots include apparel outreach with Odoo CRM, packaging-prospect validation, and ERP project support using SharePoint, Excel, and Planner, with human validation and separate client environments. ([SME thread](https://www.reddit.com/r/hermesagent/comments/1uubez0/anyone_else_deploying_hermes_into_sme_businesses/))
- A credible easy win checks an order page every 20 minutes and alerts staff before a shipping deadline. ([automation thread](https://www.reddit.com/r/hermesagent/comments/1vvyfi3/what_are_your_most_useful_automated_tasks_with/))
- An eight-role research pipeline produced a useful report but required weeks of adjustment and a human credibility check. ([research pipeline](https://www.reddit.com/r/hermesagent/comments/1vkftx8/i_built_a_deep_research_pipeline_out_of_nothing/))

## What fails, and why

- A three-month user found “self-improvement” did not reliably enforce learned tool preferences or rules; much of it remained prompt-level. ([discussion](https://www.reddit.com/r/hermesagent/comments/1upvfe7/hermes_agents_selfimprovement_does_it_actually/))
- A small-business coordinator/domain-agent setup still left the human relaying information. Kanban and file inboxes helped, but did not create transactional agent-to-agent handoffs. ([human-relay report](https://www.reddit.com/r/hermesagent/comments/1vb4cab/multiagent_setup_works_but_im_the_relay_between/))
- SME use still needs credential isolation, monitoring, recovery, and more care than “one hour per month.” ([SME thread](https://www.reddit.com/r/hermesagent/comments/1uubez0/anyone_else_deploying_hermes_into_sme_businesses/))

Hermes improves when conversation is replaced with durable work items. Profiles isolate context but do not by themselves guarantee permissions, idempotency, or correctness.

## Easy wins

Monitoring and alerts, recurring research, document/account research, draft outreach awaiting approval, engineering operations, and a specialist consuming one queued task with explicit dependencies.

## Pulse Code fit

**Worker-provider fit: 5/5. Control-plane replacement fit: 2/5.**

Pulse already includes Hermes among its provider drivers ([architecture overview](../../internals/overview.md)). Pulse should own work orders, dependencies, approvals, retries, budgets, and completion receipts. Hermes receives scoped execution and returns evidence/artifacts. Do not mirror one queue independently in both Pulse and Hermes.

## Evidence quality

Feature evidence is strong and source-visible. Forum examples are concrete but not independent longitudinal benchmarks. Treat self-improvement as unverified until changes are reviewable and enforceable.
