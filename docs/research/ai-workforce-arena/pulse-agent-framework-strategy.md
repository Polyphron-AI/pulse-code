# Pulse as the control plane for an AI workforce

## Executive decision

Pulse should own the company’s durable work model. Agent frameworks should execute work behind a replaceable backend contract.

**Own the work. Plug in the workers.**

This means Pulse owns departments, SOPs, work orders, approvals, artifacts, budgets, receipts, credential policy, and accepted completion. Pi/OMP, Hermes, Google ADK, the OpenAI Agents SDK, and Mastra contribute execution capabilities without becoming the authoritative business system.

**Pulse Vault** extends the control plane with agentic credential delegation: a worker can use an approved integration for a specific work attempt without receiving the underlying reusable secret.

## 1. The central architectural choice

### Pulse control plane

- Departments
- SOPs
- Work orders and attempts
- Policies, permissions, and budgets
- Pulse Vault credential policies and grants
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

Pulse retains one durable, event-sourced state machine. A framework run is an execution attempt within that state machine, not a second source of truth. Pulse Vault sits at the execution boundary and resolves approved capabilities only when a work attempt needs them.

## 3. Workspace, Department, and SOP views

The workspace should expose Pulse concepts rather than framework internals.

### Department

A policy and context boundary. It defines purpose, access, budgets, worker eligibility, approval rules, operating context, and which Vault capabilities may be requested.

### SOP

A versioned business process. It defines steps, dependencies, expected artifacts, approval gates, and completion rules without depending on a specific runtime.

### Work order

A durable unit of accountability. It records the requested outcome, assigned department, SOP version, attempts, evidence, approvals, artifacts, and final disposition.

| Pulse owns                                          | Runtime contributes       |
| --------------------------------------------------- | ------------------------- |
| Purpose, permissions, budget, and credential policy | Model and tools           |
| Dependencies and approval policy                    | Agent session             |
| Artifact contract                                   | Generated result          |
| Accepted completion and credential audit            | Usage and trace reference |

A runtime’s subagents remain internal to a work attempt unless Pulse explicitly promotes them into durable workers or new work orders.

## 4. Pulse Vault and agentic credential sharing

Pulse Vault should be the server-owned credential broker for the workforce. “Sharing” means delegating narrowly defined use, not copying tokens into prompts, environment records, framework memory, or client state.

### Vault model

- A **credential record** identifies an integration and account. Secret bytes remain inside the owning environment’s protected backend.
- A **capability policy** states which departments, SOPs, worker templates, and actions may use that integration.
- A **credential grant** binds the approved capability to one work order or attempt, with an expiry, action scope, resource boundary, and budget.
- A **credential lease** is the short-lived runtime mechanism. Prefer provider-issued ephemeral credentials or a server-side proxy. Inject a secret into an isolated worker only when the provider offers no safer delegation path.
- A **credential receipt** records who requested access, which policy allowed it, what bounded action occurred, and whether the grant was revoked. It never records the secret value.

### Execution flow

```text
SOP step requests an integration capability
                    ↓
Pulse evaluates department + worker + work-order policy
                    ↓
Approval gate runs when policy requires a human
                    ↓
Pulse Vault issues a scoped, expiring grant
                    ↓
Backend uses proxy / ephemeral token / isolated injection
                    ↓
Pulse revokes the grant and persists a redacted receipt
```

### Non-negotiable boundaries

- Never send reusable credentials over WebSocket contracts or return them to web, desktop, or mobile.
- Never place credentials in prompts, chat history, framework checkpoints, traces, artifacts, logs, diagnostics, or git checkpoints.
- Do not let a framework’s native credential store become the source of truth. It may hold an attempt-local lease only.
- Bind every grant to the owning environment. Remote, relay, tunnel, and multi-device clients authorize work; they do not receive the credential.
- Default to least privilege, short expiry, explicit revocation, redacted failure details, and separate policy for read and write actions.
- Keep the current `ServerSecretStore` description honest: it is filesystem-protected rather than universally encrypted at rest. Pulse Vault requires a stronger backend or isolated service account before use on shared or untrusted hosts.

### Workspace presentation

Departments should show available capabilities, policy, approval requirements, health, and recent credential receipts—not secret values. A work order should show which Vault grant was used, its scope and expiry, and the resulting evidence. Settings remains the place to connect, rotate, revoke, and diagnose integration credentials.

## 5. Pi / OMP and Hermes

### Pi / OMP: engineering worker

Best suited to bounded repository work, parallel research, implementation, testing, and review.

OMP can own its temporary specialist graph. Pulse should own the work order, artifact requirements, checkpoint evidence, approvals, and accepted result.

For credentialed engineering work, OMP receives an attempt-local Vault capability. Temporary specialists inherit only the subset explicitly allowed by the parent work attempt; they do not inherit ambient credentials by default.

### Hermes: operations worker

Best suited to persistent profiles, recurring research, monitoring, scheduling, and tool-heavy operations.

Hermes can maintain worker-local execution context. Its Kanban model is a useful execution reference, but Pulse remains the authoritative business queue.

Hermes is the strongest candidate for recurring credentialed operations, so scheduled runs need fresh grants rather than stored long-lived tokens in the worker profile.

## 6. Google ADK

**Best role in Pulse:** remote agent and workflow backend.

Google ADK brings graph workflows, agent teams, resume support, evaluation, MCP, A2A interoperability, and Google Cloud deployment.

One ADK run should map to one Pulse work attempt. ADK checkpoints and sessions remain external execution state referenced by Pulse; they do not replace the Pulse work record.

ADK tools should call Pulse-managed capability endpoints or receive short-lived workload credentials. A2A identity proves which remote agent is requesting the grant; it does not by itself authorize access.

### Potential impact

- **High reach:** cross-language support, A2A, and cloud deployment make it suitable for hosted enterprise departments and external agent ecosystems.
- **High implementation effort:** Pulse needs an adapter, lifecycle mapping, normalized events, and potentially an A2A boundary.
- **High overlap risk:** ADK has its own graphs, sessions, and recovery model, so state ownership must be explicit.

## 7. OpenAI Agents SDK

**Best role in Pulse:** lightweight, focused worker runtime.

The OpenAI Agents SDK brings agents, tools, manager patterns, handoffs, guardrails, sessions, and automatic tracing with relatively little machinery.

The runtime’s final output should be treated as a candidate artifact. Pulse still validates the artifact contract, handles approvals, records evidence, and completes the work order.

OpenAI tools should be wrapped by Pulse-owned functions that redeem a Vault grant server-side. Traces receive credential and action references, never authorization material.

### Potential impact

- **Low implementation effort:** a small runner and event adapter can expose it behind the common backend contract.
- **Low duplicate-state risk:** Pulse supplies the durable workflow and business state.
- **Provider tilt:** the strongest experience remains OpenAI-first, so the Pulse contract must stay provider-neutral.

## 8. Mastra

**Best role in Pulse:** bounded, typed SOP workflow runner.

Mastra brings typed workflows, branches, loops, parallel steps, suspend/resume, approval patterns, MCP, tracing, and evaluations. Its TypeScript foundation aligns naturally with Pulse’s stack.

Mastra should execute one versioned SOP attempt. Pulse should continue to own the SOP definition, authoritative status, approvals, artifacts, and final completion.

Mastra’s suspend/resume points can request a Pulse approval or Vault grant, but Mastra should persist only the grant reference and redacted result.

### Potential impact

- **Fast product fit:** its typed workflow model closely matches SOP execution.
- **Medium implementation effort:** it can be integrated as a library or isolated sidecar.
- **Very high duplicate-state risk:** both Mastra and Pulse can persist workflows and approvals, so the integration must nominate Pulse as the sole business authority.

## 9. Decision matrix

| Decision lens          | Google ADK                            | OpenAI Agents SDK | Mastra            | Pulse requirement                     |
| ---------------------- | ------------------------------------- | ----------------- | ----------------- | ------------------------------------- |
| Primary role           | Remote backend                        | Focused worker    | SOP runner        | Support all three behind one contract |
| Implementation effort  | High                                  | Low               | Medium            | Adopt in stages                       |
| Durable workflow       | Strong                                | External          | Strong            | Pulse-owned                           |
| Duplicate-state risk   | High                                  | Low               | Very high         | Enforce the boundary                  |
| Strategic value        | A2A and cloud                         | Easy workers      | Fast SOP delivery | Composable workforce                  |
| Credential integration | Remote identity + capability endpoint | Wrapped tools     | Step-level grants | Pulse Vault owns policy and leases    |

## 10. Common execution contract

Pulse should define provider-neutral domain contracts such as:

- `Department`
- `WorkerTemplate`
- `SopDefinition`
- `WorkOrder`
- `WorkAttempt`
- `Artifact`
- `Approval`
- `WorkReceipt`
- `CredentialPolicy`
- `CredentialGrant`
- `CredentialReceipt`

Every runtime should sit behind a common `WorkExecutionBackend` capable of:

- starting a typed attempt;
- resuming after durable input or approval;
- cancelling without ambiguity;
- streaming normalized execution events;
- requesting a named Vault capability without reading its backing secret; and
- revoking all attempt-local grants on cancellation, failure, or completion.

Only meaningful activity should be projected to clients. Pulse should not broadcast every token or transient subagent event across web, desktop, and mobile.

## 11. Recommended sequence

1. **Build the Pulse domain:** departments, SOPs, work orders, attempts, artifacts, approvals, and typed receipts.
2. **Define the Pulse Vault contract:** credential records, capability policies, grants, leases, revocation, redacted receipts, and provider-neutral failure types. Keep secrets out of shared contracts.
3. **Harden the credential backend:** preserve the current single-owner `ServerSecretStore` path, close its documented release gates, and add an encrypted or externally managed backend before supporting shared or untrusted hosts.
4. **Integrate the existing worker strategy:** OMP for Engineering; Hermes for Research and Operations. Validate read-only Vault grants first, then bounded write actions with explicit approval.
5. **Add an OpenAI worker backend:** use wrapped tools to validate the common execution and credential-capability contracts at low integration cost.
6. **Pilot Mastra on one bounded durable SOP:** keep explicit ownership of state, approvals, and credential grants in Pulse.
7. **Add Google ADK through an adapter or A2A:** target remote enterprise departments and external agent ecosystems while keeping authorization in Pulse Vault.

### Vault rollout gates

1. **Read-only proof:** one integration, one department, one scoped resource, short expiry, complete audit receipt.
2. **Approved write proof:** preview and human confirmation before a bounded external mutation.
3. **Scheduled-worker proof:** Hermes obtains a fresh grant per run and cannot reuse it after completion.
4. **Remote-worker proof:** an ADK or other remote backend authenticates its workload identity and redeems only its assigned capability.
5. **Shared-host release:** ship only after host isolation, encrypted or external secret storage, backup and diagnostic exclusions, rotation, and revocation are verified.

## Final recommendation

The winning design lets any framework disappear without taking the company’s work history with it.

Pulse should therefore become the durable control plane and user-facing system of record. Pulse Vault should be the credential authority at its execution boundary. Pi/OMP, Hermes, Google ADK, OpenAI Agents SDK, and Mastra should remain replaceable execution engines selected per work order, department policy, credential capability, and operational need.

## Sources

- [Pulse Code architecture overview](../../internals/overview.md)
- [Pulse integrations platform](../../internals/integrations-platform.md)
- [Integration secret-store and OAuth threat review](../../internals/integrations-secret-review.md)
- [Pulse workforce comparison and recommendation](comparison-and-pulse-code-recommendation.md)
- [Pi and Oh My Pi research](02-pi-and-oh-my-pi.md)
- [Hermes Agent research](03-hermes-agent.md)
- [Google Agent Development Kit](https://adk.dev/)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [OpenAI multi-agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [Mastra agent framework](https://mastra.ai/ai-agent-framework)
- [Mastra MCP guide](https://mastra.ai/docs/agents/mcp-guide)
