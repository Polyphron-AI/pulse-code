# MetaGPT: business-workforce dossier

## Bottom line

MetaGPT is the purest “software company in a box” research example: product manager, architect, engineer, and QA roles follow standard operating procedures and exchange artifacts. Its lasting contribution is the artifact/SOP handoff, not evidence that simulated employees form a dependable company. Pulse should borrow the explicit deliverables and review gates, not the role-play runtime.

## What it is

[MetaGPT](https://github.com/FoundationAgents/MetaGPT) assigns software-company roles to agents and encodes standard operating procedures for requirements, design, implementation, and review. The original [MetaGPT paper](https://arxiv.org/abs/2308.00352) argues that structured procedures and intermediate artifacts improve coherence compared with unstructured conversational collaboration.

Its model is a simulated organization: agents observe messages relevant to their role, produce standardized documents or code, and pass work downstream.

## What people report works

- The role sequence makes software lifecycle gaps visible: requirements, architecture, implementation, and testing have named owners and expected outputs.
- Intermediate artifacts reduce the need for every agent to share the full conversation.
- The system is useful for demonstrations, scaffolding greenfield projects, and studying multi-agent coordination.
- Community comparisons continue to recognize role-based frameworks as intuitive for fixed software pipelines, even when they prefer more explicit runtimes for production.

## What fails, and why

- Role-play systems tend to lose coherence across long handoff chains because each probabilistic transformation can discard constraints.
- The software-company metaphor encourages users to add roles before proving a need for separate context or parallelism.
- Generated specifications and reviews can agree with one another while sharing the same false assumption.
- A community ranking estimated low unattended success for long role-play workflows and described handoff drift as common. The percentages are one user’s estimate, not benchmark data. ([Reddit: local multi-agent ranking](https://www.reddit.com/r/better_claw/comments/1uvht82/every_local_multiagent_setup_ranked_by_how_often/))
- Early user discussion was driven largely by comparing the product with the paper’s claims, not by sustained operational evidence. That gap reinforces that an impressive organization diagram does not remove runtime and validation work. ([Reddit: early MetaGPT discussion](https://www.reddit.com/r/ChatGPTPro/comments/168yjo6))

## Easy wins

- generating a first-pass requirements/design/test artifact set;
- teaching or visualizing a software delivery process;
- parallel critique of a bounded design;
- producing checklists and handoff templates;
- identifying which artifacts Pulse department workers should exchange.

## Fit for Pulse Code

**Direct runtime fit: 1/5. SOP and artifact-reference value: 3/5.**

The reusable idea is a typed artifact contract:

- a research worker returns evidence and a synthesis;
- a planner returns scope, dependencies, and acceptance criteria;
- an executor returns changed artifacts and receipts;
- a reviewer returns findings tied to evidence;
- the next worker consumes those artifacts, not a personality’s entire chat history.

Pulse should let departments have human-readable names, but the system should be correct even if every role label is removed. That is a useful test against org-chart theatre.

## Evidence quality

The paper supports structured communication in a software-engineering benchmark context. It does not demonstrate autonomous operation of general business departments. Current forum evidence is comparatively sparse and often retrospective, so this dossier gives MetaGPT less weight than active deployments and contemporary office-task benchmarks.
