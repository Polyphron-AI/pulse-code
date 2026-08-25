# MetaGPT: business-workforce dossier

## Bottom line

MetaGPT is the purest “software company in a box” example: product manager, architect, engineer, and QA roles follow SOPs and exchange artifacts. Its reusable contribution is the artifact/SOP handoff, not proof that simulated employees form a dependable company.

## Product model

[MetaGPT](https://github.com/FoundationAgents/MetaGPT) assigns software-company roles and standard procedures for requirements, design, implementation, and review. The [paper](https://arxiv.org/abs/2308.00352) argues that structured procedures and intermediate artifacts improve coherence over unstructured multi-agent chat.

## What works

- The role sequence exposes missing lifecycle stages and expected outputs.
- Intermediate artifacts reduce the need to share the full conversation.
- It is useful for demos, greenfield scaffolding, and studying coordination.

## What fails, and why

Long handoff chains lose constraints; generated specs and reviews can share the same false assumption; and the metaphor encourages unnecessary roles. A community ranking describes role-play systems as weak on untouched long-horizon work, but its percentages are one user’s estimates, not benchmark data. ([ranking](https://www.reddit.com/r/better_claw/comments/1uvht82/every_local_multiagent_setup_ranked_by_how_often/)) Early discussion was driven more by paper claims than sustained operational evidence. ([discussion](https://www.reddit.com/r/ChatGPTPro/comments/168yjo6))

## Easy wins

First-pass requirement/design/test sets, process visualization, bounded design critique, and handoff templates.

## Pulse Code fit

**Runtime fit: 1/5. SOP/artifact value: 3/5.**

Pulse should borrow typed deliverables: evidence from research, scope/dependencies from planning, changed artifacts and receipts from execution, and evidence-tied findings from review. The system should remain correct if every human-style role label is removed.

## Evidence quality

The paper supports structured software communication, not autonomous general-business departments. Current forum evidence is sparse.
