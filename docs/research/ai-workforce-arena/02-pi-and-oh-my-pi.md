# Pi and Oh My Pi: business-workforce dossier

## Identity note

“Pi” is ambiguous. For this arena it means the open-source [Pi coding-agent toolkit](https://github.com/badlogic/pi-mono) and its opinionated derivative [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi), not Inflection’s consumer companion. That interpretation matches Pulse Code’s existing OMP provider design work.

## Bottom line

Pi is a small, extensible agent runtime rather than a business-workforce product. OMP adds a strong multi-agent operating layer: task batches, isolation, an Agent Hub, steering, persistence, cost visibility, and nested workers. This makes OMP one of the best **worker providers** for Pulse Code, but a poor candidate to become Pulse’s durable business control plane.

## What it is

The [Pi monorepo](https://github.com/badlogic/pi-mono) supplies model APIs, an agent core, a coding agent, a Slack bot, and a web UI. Its coding agent is intentionally extensible through packages, skills, and extensions; extensions execute arbitrary code and therefore inherit the trust boundary of the local agent process. Pi’s philosophy is a small core with user-composed capability.

OMP layers more structure on top. Its official documentation describes:

- a live [Agent Hub](https://github.com/can1357/oh-my-pi/blob/main/docs/agent-hub.md) with parent/child relationships, status, transcripts, tokens, cost, steering, revival, termination, and persisted parked agents;
- a [task tool](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/task.md) that can batch work, choose agents and effort, require schemas, and isolate subtasks;
- collaboration and hub controls for spawning and managing specialist workers ([collaboration guide](https://github.com/can1357/oh-my-pi/blob/main/docs/collab.md), [hub tool](https://github.com/can1357/oh-my-pi/blob/main/docs/tools/hub.md)).

This is a technical team model: a primary agent delegates context-isolated work to disposable or parked specialists.

## What people report works

- Pi users report using the coding agent as a general-purpose tool for document knowledge bases, structured extraction across more than 100 PDFs, database benchmarking, and browser-driven tasks. These are credible task shapes even though the post is anecdotal. ([LocalLLaMA discussion](https://www.reddit.com/r/LocalLLaMA/comments/1seojt5/anyone_else_using_coding_agents_as_generalpurpose/))
- A local multi-agent guide describes private, role-separated agents controlled by `AGENTS.md`, with the author rating Pi’s local stability highly. This is self-reported but demonstrates the appeal of a transparent, file-based operating model. ([Pi Coding Agent guide](https://www.reddit.com/r/PiCodingAgent/comments/1tcxdc3/guide_running_a_fully_local_multiagent_coding/))
- Users repeatedly value OMP’s sensible defaults and bundled orchestration, while some find bare Pi more effective for one-shot work. That tension is useful: composition helps recurring workflows, but installed machinery has context and behavioral cost. ([“Pi Agent is excellent”](https://www.reddit.com/r/PiCodingAgent/comments/1vrzsac/pi_agent_is_excellent/))
- Subagents are most consistently praised for isolated research, review, and parallel read-heavy work—not for simulating a meeting among persistent personalities. ([subagent discussion](https://www.reddit.com/r/PiCodingAgent/comments/1t6zzwv/do_subagents_really_matter/))

## What fails, and why

The Pi ecosystem’s strengths create its main risks:

- Extension provenance can be unclear. A user mistook a third-party subagent extension for an official feature; the extension was useful, but the confusion demonstrates a supply-chain and expectations problem. ([extension discussion](https://www.reddit.com/r/PiCodingAgent/comments/1u6d9yj/pi_subagents_claude_code_like_subagents_for_pi/))
- Long-running continuity remains an add-on concern. Community packages exist specifically to counter context loss and improve handoffs, which means memory should not be assumed merely because an agent process persists. ([continuity package discussion](https://www.reddit.com/r/PiCodingAgent/comments/1uf6f3f/i_built_a_pi_package_for_agentmanaged_continuity/))
- Users asking for planner/coder/reviewer workflows still describe restarts, missing visibility, and process management as active design concerns. ([workflow discussion](https://www.reddit.com/r/PiCodingAgent/comments/1vjmwbt/workflow_for_coding_with_pi_agent/))
- OMP can feel heavy relative to Pi’s minimal core. Language-server context, plugins, and automatic behavior can consume attention and tokens before they solve a demonstrated problem. ([ecosystem discussion](https://www.reddit.com/r/PiCodingAgent/comments/1vkeiw0/are_there_other_extensions_which_implement_ideas/))

These are manageable at a provider boundary. They become dangerous if OMP’s internal agent graph is also treated as Pulse’s canonical business state.

## Easy wins

- parallel research, document extraction, and synthesis;
- coding, review, testing, and repository maintenance;
- departmental specialist tasks with explicit input and output schemas;
- privacy-sensitive work on local models or local data;
- tasks where a primary worker benefits from short-lived subagents but Pulse only needs the parent result and activity stream.

## Fit for Pulse Code

**Worker-provider fit: 5/5. Business control-plane fit: 2/5.**

Pulse already has a shaped [OMP provider design](../../plans/2026-08-24-omp-agent-provider-design.md) with the right ownership split: OMP owns model selection, tools, skills, and internal subagents; Pulse owns projects, durable threads, transport, permissions, checkpoints, and multi-surface UI. OMP should arrive through its native ACP surface rather than being reimplemented as a Pulse workflow subsystem.

For the department concept:

- an OMP profile or template can implement a department worker;
- its internal subagents can be visible as nested execution, not promoted automatically to first-class Pulse employees;
- Pulse should issue a typed work order and receive artifacts, activities, cost, and a terminal receipt;
- OMP’s Agent Hub is a strong reference for roster and intervention UX;
- Pulse must remain the source of truth for dependencies, retries, approvals, and cross-department handoffs.

## Evidence quality

The official repositories provide strong evidence for technical capabilities. Business-use evidence is thinner than for Grok Bot, Hermes, or OpenClaw and is concentrated in technical communities. The recommendation therefore rests more on protocol and architecture fit than on proof of autonomous office work.
