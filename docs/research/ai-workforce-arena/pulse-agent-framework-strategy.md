# Pulse as the control plane for an AI workforce

## Executive decision

Pulse should own the company’s durable work model. Agent frameworks should execute work behind a replaceable backend contract.

**Own the work. Plug in the workers.**

This means Pulse owns departments, SOPs, work orders, approvals, artifacts, budgets, receipts, and accepted completion. Pi/OMP, Hermes, Google ADK, the OpenAI Agents SDK, and Mastra contribute execution capabilities without becoming the authoritative business system.

## 1. The central architectural choice

### Pulse control plane

- Departments
- SOPs
- Work orders and attempts
- Policies, permissions, and budgets
- Approvals
- Artifacts and evidence
- Receipts and accepted completion

### Execution runtimes

- **Pi / OMP and Hermes:** the strongest immediate worker candidates for engineering and persistent operations.
- **Google ADK, OpenAI Agents SDK, and Mastra:** additional execution backends, not replacement control planes.

The key boundary is simple: frameworks execute work; Pulse determines what that work means.

## 2. Target system boundary

```text
Workspace UI
Departments · SOPs · queue · approvals · evidence
                         ↓
Pulse control plane
Typed commands · events · policies · budgets · artifacts · receipts
                         ↓
                  Work-order dispatch
                         ↓
┌────────────┬────────────┬────────────┬──────────────────┐
│ Pi / OMP   │ Hermes     │ Google ADK │ OpenAI / Mastra │
│ coding and │ persistent │ remote     │ focused workers │
│ specialists│ operations │ agent teams│ or SOP runs     │
└────────────┴────────────┴────────────┴──────────────────┘
```

Pulse retains one durable, event-sourced state machine. A framework run is an execution attempt within that state machine, not a second source of truth.

## 3. Workspace, Department, and SOP views

The workspace should expose Pulse concepts rather than framework internals.

### Department

A policy and context boundary. It defines purpose, access, budgets, worker eligibility, approval rules, and operating context.

### SOP

A versioned business process. It defines steps, dependencies, expected artifacts, approval gates, and completion rules without depending on a specific runtime.

### Work order

A durable unit of accountability. It records the requested outcome, assigned department, SOP version, attempts, evidence, approvals, artifacts, and final disposition.

| Pulse owns                       | Runtime contributes       |
| -------------------------------- | ------------------------- |
| Purpose, permissions, and budget | Model and tools           |
| Dependencies and approval policy | Agent session             |
| Artifact contract                | Generated result          |
| Accepted completion              | Usage and trace reference |

A runtime’s subagents remain internal to a work attempt unless Pulse explicitly promotes them into durable workers or new work orders.

## 4. Pi / OMP and Hermes

### Pi / OMP: engineering worker

Best suited to bounded repository work, parallel research, implementation, testing, and review.

OMP can own its temporary specialist graph. Pulse should own the work order, artifact requirements, checkpoint evidence, approvals, and accepted result.

### Hermes: operations worker

Best suited to persistent profiles, recurring research, monitoring, scheduling, and tool-heavy operations.

Hermes can maintain worker-local execution context. Its Kanban model is a useful execution reference, but Pulse remains the authoritative business queue.

## 5. Google ADK

**Best role in Pulse:** remote agent and workflow backend.

Google ADK brings graph workflows, agent teams, resume support, evaluation, MCP, A2A interoperability, and Google Cloud deployment.

One ADK run should map to one Pulse work attempt. ADK checkpoints and sessions remain external execution state referenced by Pulse; they do not replace the Pulse work record.

### Potential impact

- **High reach:** cross-language support, A2A, and cloud deployment make it suitable for hosted enterprise departments and external agent ecosystems.
- **High implementation effort:** Pulse needs an adapter, lifecycle mapping, normalized events, and potentially an A2A boundary.
- **High overlap risk:** ADK has its own graphs, sessions, and recovery model, so state ownership must be explicit.

## 6. OpenAI Agents SDK

**Best role in Pulse:** lightweight, focused worker runtime.

The OpenAI Agents SDK brings agents, tools, manager patterns, handoffs, guardrails, sessions, and automatic tracing with relatively little machinery.

The runtime’s final output should be treated as a candidate artifact. Pulse still validates the artifact contract, handles approvals, records evidence, and completes the work order.

### Potential impact

- **Low implementation effort:** a small runner and event adapter can expose it behind the common backend contract.
- **Low duplicate-state risk:** Pulse supplies the durable workflow and business state.
- **Provider tilt:** the strongest experience remains OpenAI-first, so the Pulse contract must stay provider-neutral.

## 7. Mastra

**Best role in Pulse:** bounded, typed SOP workflow runner.

Mastra brings typed workflows, branches, loops, parallel steps, suspend/resume, approval patterns, MCP, tracing, and evaluations. Its TypeScript foundation aligns naturally with Pulse’s stack.

Mastra should execute one versioned SOP attempt. Pulse should continue to own the SOP definition, authoritative status, approvals, artifacts, and final completion.

### Potential impact

- **Fast product fit:** its typed workflow model closely matches SOP execution.
- **Medium implementation effort:** it can be integrated as a library or isolated sidecar.
- **Very high duplicate-state risk:** both Mastra and Pulse can persist workflows and approvals, so the integration must nominate Pulse as the sole business authority.

## 8. Decision matrix

| Decision lens         | Google ADK     | OpenAI Agents SDK | Mastra            | Pulse requirement                     |
| --------------------- | -------------- | ----------------- | ----------------- | ------------------------------------- |
| Primary role          | Remote backend | Focused worker    | SOP runner        | Support all three behind one contract |
| Implementation effort | High           | Low               | Medium            | Adopt in stages                       |
| Durable workflow      | Strong         | External          | Strong            | Pulse-owned                           |
| Duplicate-state risk  | High           | Low               | Very high         | Enforce the boundary                  |
| Strategic value       | A2A and cloud  | Easy workers      | Fast SOP delivery | Composable workforce                  |

## 9. Common execution contract

Pulse should define provider-neutral domain contracts such as:

- `Department`
- `WorkerTemplate`
- `SopDefinition`
- `WorkOrder`
- `WorkAttempt`
- `Artifact`
- `Approval`
- `WorkReceipt`

Every runtime should sit behind a common `WorkExecutionBackend` capable of:

- starting a typed attempt;
- resuming after durable input or approval;
- cancelling without ambiguity; and
- streaming normalized execution events.

Only meaningful activity should be projected to clients. Pulse should not broadcast every token or transient subagent event across web, desktop, and mobile.

## 10. Recommended sequence

1. **Build the Pulse domain:** departments, SOPs, work orders, attempts, artifacts, approvals, and typed receipts.
2. **Integrate the existing worker strategy:** OMP for Engineering; Hermes for Research and Operations.
3. **Add an OpenAI worker backend:** this is the lowest-cost validation of the common execution contract.
4. **Pilot Mastra on one bounded durable SOP:** keep explicit ownership of state and approvals in Pulse.
5. **Add Google ADK through an adapter or A2A:** target remote enterprise departments and external agent ecosystems.

## Final recommendation

The winning design lets any framework disappear without taking the company’s work history with it.

Pulse should therefore become the durable control plane and user-facing system of record. Pi/OMP, Hermes, Google ADK, OpenAI Agents SDK, and Mastra should remain replaceable execution engines selected per work order, department policy, and operational need.

## Sources

- [Pulse Code architecture overview](../../internals/overview.md)
- [Pulse workforce comparison and recommendation](comparison-and-pulse-code-recommendation.md)
- [Pi and Oh My Pi research](02-pi-and-oh-my-pi.md)
- [Hermes Agent research](03-hermes-agent.md)
- [Google Agent Development Kit](https://adk.dev/)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [OpenAI multi-agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [Mastra agent framework](https://mastra.ai/ai-agent-framework)
- [Mastra MCP guide](https://mastra.ai/docs/agents/mcp-guide)
