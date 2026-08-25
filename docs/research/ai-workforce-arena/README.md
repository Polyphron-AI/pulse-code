# AI workforce arena

Research date: 2026-08-25  
Decision audience: Pulse Code product and engineering maintainers

This pack evaluates products and frameworks that organize AI agents as managers, specialists, departments, or durable business processes. It focuses on what survives contact with real work: scheduling, handoffs, approvals, shared state, retries, cost, and auditability.

The four named candidates are joined by five deliberately different comparators: CrewAI for the human-organization metaphor, LangGraph for durable graph execution, MetaGPT for SOP-driven company simulation, n8n for deterministic integration workflows, and Relevance AI for commercial workforce UX. Together they cover the main architectural choices without turning the pack into an unbounded catalog of every agent framework.

## Dossiers

- [Grok Bot](01-grok-bot.md)
- [Pi and Oh My Pi](02-pi-and-oh-my-pi.md)
- [Hermes Agent](03-hermes-agent.md)
- [OpenClaw](04-openclaw.md)
- [CrewAI](05-crewai.md)
- [LangGraph](06-langgraph.md)
- [MetaGPT](07-metagpt.md)
- [n8n](08-n8n.md)
- [Relevance AI](09-relevance-ai.md)
- [Comparison and Pulse Code recommendation](comparison-and-pulse-code-recommendation.md)

## Method

The evidence ladder used throughout is:

1. Official documentation and source code for product capabilities.
2. Published benchmarks or research for reliability and safety.
3. Forum reports with concrete workflows, failure modes, time, or cost.
4. General opinions only when they reveal recurring expectations or adoption friction.

Forum claims are anecdotes, not measured product comparisons. Promotional posts, self-reported savings, and unverifiable revenue claims are marked as such or excluded. The attached `r/cursor` Grok Bot review is treated as a supplied primary anecdote and cross-checked against the live thread.

## Interpretation rules

- “Employee” is a product metaphor, not evidence of human-equivalent reliability.
- A role name is not a permission boundary, durable queue, or service-level guarantee.
- A successful demo is weaker evidence than a recurring run with recovery, audit history, and bounded side effects.
- The most useful fit question for Pulse Code is not “which product should we copy?” It is “which control-plane mechanics should Pulse own, and which agent runtimes should remain workers behind provider adapters?”
