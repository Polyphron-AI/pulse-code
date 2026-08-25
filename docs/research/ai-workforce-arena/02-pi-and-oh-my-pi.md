# Pi and Oh My Pi: business-workforce dossier

## Identity note

“Pi” here means the open-source [Pi coding-agent toolkit](https://github.com/badlogic/pi-mono) and [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi), not Inflection’s consumer companion. This matches Pulse Code’s existing OMP provider design work.

## Bottom line

Pi is a small extensible runtime rather than a workforce product. OMP adds multi-agent task batching, isolation, a live hub, steering, persistence, and cost visibility. It is one of the best worker providers for Pulse, but should not become Pulse’s durable business control plane.

## Product and organizational model

The [Pi monorepo](https://github.com/badlogic/pi-mono) supplies model APIs, an agent core, a coding agent, a Slack bot, and a web UI. Its coding agent is extended through packages, skills, and arbitrary-code extensions, which share the local process trust boundary.

OMP adds:

- an [Agent Hub](https://github.com/can1357/oh-my-pi/blob/main/docs/agent-hub.md) with parent/child relationships, state, transcripts, tokens, cost, steering, revival, termination, and parked-agent persistence;
- a [task tool](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/task.md) with batching, model/effort selection, schemas, and isolation;
- collaboration controls for spawning specialists ([collaboration guide](https://github.com/can1357/oh-my-pi/blob/main/docs/collab.md)).

This is a technical-team model: a primary agent delegates context-isolated work to disposable or parked specialists.

## What people report works

- Pi users report document knowledge bases, structured extraction across more than 100 PDFs, database benchmarking, and browser-driven tasks. ([LocalLLaMA discussion](https://www.reddit.com/r/LocalLLaMA/comments/1seojt5/anyone_else_using_coding_agents_as_generalpurpose/))
- A local multi-agent guide describes private role-separated agents controlled through `AGENTS.md`. ([Pi guide](https://www.reddit.com/r/PiCodingAgent/comments/1tcxdc3/guide_running_a_fully_local_multiagent_coding/))
- Users value OMP’s useful defaults, while some find bare Pi better for one-shot tasks. Composition helps recurring work but adds context and behavioral cost. ([discussion](https://www.reddit.com/r/PiCodingAgent/comments/1vrzsac/pi_agent_is_excellent/))
- Subagents are most consistently useful for isolated research, review, and parallel read-heavy work. ([subagent discussion](https://www.reddit.com/r/PiCodingAgent/comments/1t6zzwv/do_subagents_really_matter/))

## What fails, and why

- Extension provenance can be unclear; one useful third-party subagent extension was mistaken for an official feature. ([discussion](https://www.reddit.com/r/PiCodingAgent/comments/1u6d9yj/pi_subagents_claude_code_like_subagents_for_pi/))
- Community continuity packages exist specifically to counter long-session context loss. ([continuity discussion](https://www.reddit.com/r/PiCodingAgent/comments/1uf6f3f/i_built_a_pi_package_for_agentmanaged_continuity/))
- Planner/coder/reviewer users still discuss restarts, process visibility, and handoff management. ([workflow discussion](https://www.reddit.com/r/PiCodingAgent/comments/1vjmwbt/workflow_for_coding_with_pi_agent/))
- OMP can feel heavy relative to Pi’s minimal core; LSP context and automatic behavior can consume tokens before solving a proven problem. ([ecosystem discussion](https://www.reddit.com/r/PiCodingAgent/comments/1vkeiw0/are_there_other_extensions_which_implement_ideas/))

These are manageable at a provider boundary and dangerous if OMP’s internal graph is also treated as Pulse’s canonical business state.

## Easy wins

Parallel research, document extraction, coding, review, testing, repository maintenance, private local work, and specialist tasks with explicit input/output schemas.

## Pulse Code fit

**Worker-provider fit: 5/5. Control-plane fit: 2/5.**

A Pulse OMP integration should use a provider boundary: OMP owns models, tools, skills, and internal subagents; Pulse owns projects, durable threads, transport, permissions, checkpoints, and multi-surface UI. Pulse should issue typed work orders and receive artifacts, activity, cost, and terminal receipts. OMP’s internal subagents are nested execution, not automatically first-class Pulse employees.

## Evidence quality

Technical capabilities are source-visible. Business-use evidence is thinner than for Grok Bot, Hermes, or OpenClaw, so the recommendation rests mainly on protocol and architecture fit.
