# LangGraph: business-workforce dossier

## Bottom line

LangGraph is the strongest architectural comparator in the arena. It treats agent work as stateful graph execution with checkpoints, interrupts, replay, and human intervention instead of relying on an org-chart conversation. That is close to the reliability model Pulse Code should pursue. It is still a poor direct dependency because Pulse already has an event-sourced TypeScript control plane and should not install a second orchestration authority.

## What it is

[LangGraph](https://www.langchain.com/langgraph) is an MIT-licensed, low-level runtime for long-running, stateful agents. Its design centers on explicit state, nodes and transitions, durable execution, streaming, persistence, and human-in-the-loop interrupts. LangChain’s description of the [runtime behind production deep agents](https://www.langchain.com/blog/runtime-behind-production-deep-agents) emphasizes checkpointing at each superstep, thread identities, resumability, memory, multi-tenancy, and observability.

LangGraph does not require an employee metaphor. A supervisor and specialist agents can be represented, but they are nodes inside an explicit execution graph.

## What people report works

- Practitioners choose LangGraph for workflows with branching, retries, approval gates, and recovery because explicit state makes execution inspectable and replayable. An eight-month field report argues that the operating layer—state, traces, bounded execution, and recovery—matters more than the agent framework itself. ([Reddit: eight months building agents](https://www.reddit.com/r/LangChain/comments/1sx309s/spent_8_months_building_agents/))
- A cross-framework comparison found LangGraph gave the most control over state and retries, at the cost of a steeper learning curve and incomplete global tracing across a broader system. ([Reddit: framework comparison](https://www.reddit.com/r/AI_Agents/comments/1us5nvp/langgraph_crewai_or_raw_a2a_this_is_what_i/))
- Production-oriented discussion favors a thin orchestrator and roughly three to five tightly scoped workers. Multiple agents are justified by real parallelism or context isolation; a single agent with tools handles many other tasks more cheaply. ([Reddit: production multi-agent discussion](https://www.reddit.com/r/LLMDevs/comments/1sxonw2/how_many_of_you_are_actually_running_multiagent/))

## What fails, and why

- Graphs impose upfront modeling work and can become visually or operationally complex.
- Explicit local traces do not automatically solve observability across external services, providers, and side effects.
- A graph can encode a bad process just as faithfully as a good one; deterministic transitions do not validate model output.
- Teams that need only one agent and a few tools can pay a framework tax without gaining useful reliability.
- Embedding LangGraph inside another durable orchestrator creates dual checkpoints, unclear cancellation, and disagreement over which runtime owns retries and completion.

## Easy wins

- high-risk workflows with explicit approval and compensation steps;
- long-running research or operations with resumable checkpoints;
- workflows where dependencies and conditional branches are known;
- bounded parallel specialist work followed by a deterministic join and validation;
- replayable incident investigation and evaluation.

## Fit for Pulse Code

**Direct dependency fit: 2/5. Architectural-reference value: 5/5.**

Pulse already has the essential foundation described in its [architecture overview](../../internals/overview.md): typed commands, persisted events, projections, queue-backed reactors, receipts, and provider-neutral adapters. Pulse should extend that native model with work orders rather than delegate durability to LangGraph.

Borrow these ideas:

- checkpoint after every meaningful state transition;
- make interrupts and approvals durable;
- identify each execution and work item separately from the chat thread;
- resume from persisted state rather than reconstructing intent from conversation;
- make parallel fan-out and deterministic join visible;
- support replay and evaluation from the event history.

Avoid exposing a general-purpose graph editor in the first release. A small fixed work-order lifecycle will cover the initial department use cases with less complexity.

## Evidence quality

Official architecture evidence is strong. Forum reports are technically detailed but remain anecdotal. LangGraph’s value here is not a claim that it autonomously replaces departments; it is evidence that mature agent infrastructure converges on explicit state and durable execution.
