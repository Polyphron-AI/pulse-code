# LangGraph: business-workforce dossier

## Bottom line

LangGraph is the strongest architectural comparator. It treats agent work as stateful graph execution with checkpoints, interrupts, replay, and human intervention rather than org-chart conversation. That is close to what Pulse should build natively, but embedding LangGraph would create a second orchestration authority.

## Product model

[LangGraph](https://www.langchain.com/langgraph) is an MIT-licensed low-level runtime for long-running stateful agents. It centers on explicit state, nodes and transitions, durable execution, persistence, and interrupts. LangChain’s [production-runtime description](https://www.langchain.com/blog/runtime-behind-production-deep-agents) emphasizes checkpointing each superstep, thread IDs, resumability, memory, multi-tenancy, and observability.

## What works

- Practitioners choose it for branching, retries, approvals, and recovery because explicit state enables inspection and replay. ([eight-month report](https://www.reddit.com/r/LangChain/comments/1sx309s/spent_8_months_building_agents/))
- A framework comparison found it offered the most state/retry control, at the price of a steeper learning curve. ([comparison](https://www.reddit.com/r/AI_Agents/comments/1us5nvp/langgraph_crewai_or_raw_a2a_this_is_what_i/))
- Production discussion favors a thin orchestrator and three to five scoped workers, adding agents only for real parallelism or context isolation. ([discussion](https://www.reddit.com/r/LLMDevs/comments/1sxonw2/how_many_of_you_are_actually_running_multiagent/))

## What fails, and why

Graphs require upfront modeling, can become complex, and do not validate model output merely by encoding transitions. Local traces do not automatically cover external side effects. Embedding it inside Pulse would create dual checkpoints and unclear retry/cancellation ownership.

## Easy wins

High-risk workflows with approvals, long-running resumable work, known dependencies and branches, bounded parallel fan-out/join, and replayable evaluation.

## Pulse Code fit

**Direct fit: 2/5. Architectural value: 5/5.**

Pulse already has typed commands, persisted events, projections, queue-backed reactors, receipts, and provider adapters ([overview](../../internals/overview.md)). Borrow checkpointing, durable interrupts, run identity, replay, and deterministic joins. Build a small fixed work-order lifecycle before considering a general graph editor.

## Evidence quality

Official architecture evidence is strong. Forum evidence remains anecdotal. LangGraph validates explicit-state design, not autonomous employee replacement.
