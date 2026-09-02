# Pulse as the control plane for an AI workforce

## Executive decision

Pulse should own the company’s durable work model. Agent frameworks should execute work behind a replaceable backend contract.

**Own the work. Plug in the workers.**

This means Pulse owns departments, SOPs, work orders, approvals, artifacts, budgets, receipts, credential policy, and accepted completion. OMP is the first-party engineering provider. Codex, Claude, Hermes, Google ADK, the OpenAI Agents SDK, and Mastra remain replaceable execution adapters rather than authoritative business systems.

Orca is a complementary reference for local execution supervision. Its project, worktree, run, gate, diff, and remote-status patterns should inform Pulse's execution boundary. Orca is not a model provider, a Pulse secret consumer, or a second control plane.

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

- **OMP:** the first-party engineering harness and provider for repository work.
- **Codex, Claude, and other coding CLIs:** peer engineering workers behind replaceable adapters.
- **Hermes:** the strongest candidate for persistent research and operations.
- **Orca architecture:** a reference for supervising local projects, worktrees, runs, gates, diffs, and remote execution status.
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
Pulse-owned local execution boundary
Projects · worktrees · runs · gates · diffs · remote status
                         ↓
┌─────────────┬──────────────┬────────────┬───────────────────┐
│ OMP         │ Codex/Claude │ Hermes     │ ADK/OpenAI/Mastra │
│ first-party │ peer coding  │ persistent │ remote or focused │
│ provider    │ adapters     │ operations │ workers/SOP runs  │
└─────────────┴──────────────┴────────────┴───────────────────┘
```

Pulse retains one durable, event-sourced state machine. A framework run is an execution attempt within that state machine, not a second source of truth. Pulse Vault sits at the execution boundary and resolves approved capabilities only when a work attempt needs them.

## 3. Orca and OMP are complementary

| Component                 | Role in the target architecture                                               |
| ------------------------- | ----------------------------------------------------------------------------- |
| Pulse                     | Durable business control plane and user-facing system of record               |
| Orca architecture         | Reference for local projects, worktrees, runs, gates, diffs, and remote state |
| OMP                       | First-party engineering harness and provider                                  |
| Codex, Claude, and others | Replaceable peer engineering adapters                                         |
| GitHub App                | Repository, branch, commit, pull request, check, review, and merge boundary   |
| Pulse Vault               | Credential policy, scoped grants, revocation, and redacted receipts           |

Pulse already has project, worktree, source-control, remote-environment, and provider primitives. It should deepen those primitives behind one common execution contract, using Orca as a design reference rather than adding a second durable engine.

Orca is a separate application. Pulse has no supported API, provider registration, or secret bridge that supplies `ServerSecretStore` or Vault credentials to Orca. That boundary is not process isolation. The current `ServerSecretStore` keeps raw secrets in filesystem-protected storage for one trusted OS account; a compromised or deliberately directed Orca or agent process running as that user could read the backing files. Untrusted orchestration needs a separate OS account or sandbox, or a stronger Vault backend. OMP launched by Orca should use Orca's own environment and native OMP state or authentication. Pulse signing, linking, bootstrap, and relay keys are never OMP provider credentials.

### GitHub and Pulse Issues

Pulse Issues should remain the product record for a bug, task, acceptance criteria, and business evidence. GitHub should own repository facts: branches, commits, pull requests, checks, diffs, reviews, and merge state.

A `WorkAttempt` should link one Pulse issue to its worktree and GitHub artifacts. Review feedback belongs to the attempt as versioned evidence. Merge remains gated on the Pulse acceptance policy and GitHub checks rather than being inferred from an agent's final message.

## 4. Workspace, Department, and SOP views

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

## 5. Pulse Vault and agentic credential sharing

Pulse Vault should be the server-owned credential broker for the workforce. “Sharing” means delegating narrowly defined use, not copying tokens into prompts, environment records, framework memory, or client state.

### Vault model

- A **credential record** identifies an integration and account. Secret bytes remain inside the owning environment’s protected backend.
- A **capability policy** states which departments, SOPs, worker templates, and actions may use that integration.
- A **credential grant** binds the approved capability to one work order or attempt, with an expiry, action scope, resource boundary, and budget.
- A **credential lease** is the short-lived runtime mechanism. Prefer provider-issued ephemeral credentials or a server-side proxy. Inject a secret into an isolated worker only when the provider offers no safer delegation path.
- A **credential receipt** records who requested access, which policy allowed it, what bounded action occurred, and whether the grant was revoked. It never records the secret value.
- A **credential requirement** is a portable declaration that a worker or SOP needs a capability such as `github.pull-request.write` or `ssh.production.read`. It contains no account identifier or secret. Pulse resolves it against the destination project's Vault policy when the worker starts.

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
- Never include credential records, grants, leases, or account bindings in an exported worker profile. Export only capability requirements.
- Do not let a framework's native credential store become the source of truth. It may hold an attempt-local lease only.
- Bind every grant to the owning environment. Remote, relay, tunnel, and multi-device clients authorize work; they do not receive the credential.
- Default to least privilege, short expiry, explicit revocation, redacted failure details, and separate policy for read and write actions.
- Keep the current `ServerSecretStore` description honest: it is filesystem-protected rather than universally encrypted at rest. Pulse Vault requires a stronger backend or isolated service account before use on shared or untrusted hosts.

### Workspace presentation

Departments should show available capabilities, policy, approval requirements, health, and recent credential receipts, not secret values. A work order should show which Vault grant was used, its scope and expiry, and the resulting evidence. Settings remains the place to connect, rotate, revoke, and diagnose integration credentials.

## 6. OMP and Hermes

### OMP: first-party engineering worker

Best suited to bounded repository work, parallel research, implementation, testing, and review.

OMP can own its temporary specialist graph. Pulse should own the work order, artifact requirements, checkpoint evidence, approvals, and accepted result.

For credentialed engineering work, OMP receives an attempt-local Vault capability. Temporary specialists inherit only the subset explicitly allowed by the parent work attempt; they do not inherit ambient credentials by default.

### Hermes: operations worker

Best suited to persistent profiles, recurring research, monitoring, scheduling, and tool-heavy operations.

Hermes can maintain worker-local execution context. Its Kanban model is a useful execution reference, but Pulse remains the authoritative business queue.

Hermes is the strongest candidate for recurring credentialed operations, so scheduled runs need fresh grants rather than stored long-lived tokens in the worker profile.

### Portable worker profiles

Nous Research now supports exporting and importing Hermes profiles while stripping credentials. The exported package can carry skills, memory, persona, schedules, plugins, settings, and presentation preferences. Hermes distributions also exclude `.env` and `auth.json`, then declare the environment variables an installer must supply.

Pulse should adopt the stronger version of this split:

- A `WorkerTemplate` is portable across users, environments, and projects.
- The template contains role, instructions, skills, tools, schedules, runtime preferences, and named credential requirements.
- Pulse never exports Vault records, project bindings, account identifiers, grants, leases, or secret values with the template.
- Importing a template produces an unresolved-capabilities review. Pulse Warden shows which requirements the destination project can satisfy and asks for approval when a capability crosses a project boundary.
- Cloning a worker inside the same project may reuse the project's credential policy, but the new worker receives fresh attempt-local grants rather than copied credentials.
- Removing a worker does not remove or revoke the shared project credential unless a human explicitly chooses that separate action.

This makes workers shareable without turning agent packages into credential archives. It also keeps the Pulse project mapping as the place where a portable worker gains real authority.

## 7. Google ADK

**Best role in Pulse:** remote agent and workflow backend.

Google ADK brings graph workflows, agent teams, resume support, evaluation, MCP, A2A interoperability, and Google Cloud deployment.

One ADK run should map to one Pulse work attempt. ADK checkpoints and sessions remain external execution state referenced by Pulse; they do not replace the Pulse work record.

ADK tools should call Pulse-managed capability endpoints or receive short-lived workload credentials. A2A identity proves which remote agent is requesting the grant; it does not by itself authorize access.

### Potential impact

- **High reach:** cross-language support, A2A, and cloud deployment make it suitable for hosted enterprise departments and external agent ecosystems.
- **High implementation effort:** Pulse needs an adapter, lifecycle mapping, normalized events, and potentially an A2A boundary.
- **High overlap risk:** ADK has its own graphs, sessions, and recovery model, so state ownership must be explicit.

## 8. OpenAI Agents SDK

**Best role in Pulse:** lightweight, focused worker runtime.

The OpenAI Agents SDK brings agents, tools, manager patterns, handoffs, guardrails, sessions, and automatic tracing with relatively little machinery.

The runtime’s final output should be treated as a candidate artifact. Pulse still validates the artifact contract, handles approvals, records evidence, and completes the work order.

OpenAI tools should be wrapped by Pulse-owned functions that redeem a Vault grant server-side. Traces receive credential and action references, never authorization material.

### Potential impact

- **Low implementation effort:** a small runner and event adapter can expose it behind the common backend contract.
- **Low duplicate-state risk:** Pulse supplies the durable workflow and business state.
- **Provider tilt:** the strongest experience remains OpenAI-first, so the Pulse contract must stay provider-neutral.

## 9. Mastra

**Best role in Pulse:** bounded, typed SOP workflow runner.

Mastra brings typed workflows, branches, loops, parallel steps, suspend/resume, approval patterns, MCP, tracing, and evaluations. Its TypeScript foundation aligns naturally with Pulse’s stack.

Mastra should execute one versioned SOP attempt. Pulse should continue to own the SOP definition, authoritative status, approvals, artifacts, and final completion.

Mastra’s suspend/resume points can request a Pulse approval or Vault grant, but Mastra should persist only the grant reference and redacted result.

### Potential impact

- **Fast product fit:** its typed workflow model closely matches SOP execution.
- **Medium implementation effort:** it can be integrated as a library or isolated sidecar.
- **Very high duplicate-state risk:** both Mastra and Pulse can persist workflows and approvals, so the integration must nominate Pulse as the sole business authority.

## 10. Decision matrix

| Decision lens          | Google ADK                            | OpenAI Agents SDK | Mastra            | Pulse requirement                     |
| ---------------------- | ------------------------------------- | ----------------- | ----------------- | ------------------------------------- |
| Primary role           | Remote backend                        | Focused worker    | SOP runner        | Support all three behind one contract |
| Implementation effort  | High                                  | Low               | Medium            | Adopt in stages                       |
| Durable workflow       | Strong                                | External          | Strong            | Pulse-owned                           |
| Duplicate-state risk   | High                                  | Low               | Very high         | Enforce the boundary                  |
| Strategic value        | A2A and cloud                         | Easy workers      | Fast SOP delivery | Composable workforce                  |
| Credential integration | Remote identity + capability endpoint | Wrapped tools     | Step-level grants | Pulse Vault owns policy and leases    |

## 11. Common execution contract

Pulse should define provider-neutral domain contracts such as:

- `Workspace`
- `Project`
- `Department`
- `WorkerTemplate`
- `WorkerCapability`
- `SopDefinition`
- `WorkOrder`
- `WorkAttempt`
- `Worktree`
- `ExecutionGate`
- `RemoteExecutionTarget`
- `Artifact`
- `Approval`
- `WorkReceipt`
- `CredentialPolicy`
- `CredentialRequirement`
- `CredentialGrant`
- `CredentialReceipt`

Every runtime should sit behind a common `WorkExecutionBackend` capable of:

- attaching to a Pulse project and isolated worktree;
- starting a typed attempt;
- resuming after durable input or approval;
- cancelling without ambiguity;
- streaming normalized execution events;
- publishing gate, diff, and remote execution status;
- requesting a named Vault capability without reading its backing secret; and
- revoking all attempt-local grants on cancellation, failure, or completion.

Only meaningful activity should be projected to clients. Pulse should not broadcast every token or transient subagent event across web, desktop, and mobile.

## 12. Current implementation status

The following work exists on this branch. It is not a claim that the branch has been merged, pushed, or released:

- OMP is registered as a first-party, multi-instance provider across contracts, settings, server runtime, and provider selection surfaces.
- Interactive OMP sessions use ACP for new, load, resume, model and thinking selection, default and plan modes, permission requests, form elicitation, interruption, and stop.
- Provider health runs the configured binary with `omp --version` and `omp models --json`. Pulse publishes only the exact selectors returned by OMP and does not invent fallback models.
- The selected provider instance environment overrides the server process environment. Sensitive values use `ServerSecretStore`; `settings.json` and settings clients retain only redacted placeholders after saving.
- Interactive OMP state is rooted under a Pulse-managed, per-instance `PI_CODING_AGENT_DIR`. Native OMP `.env` and local authentication fallback can still operate when the selected instance does not supply a credential.
- Provider API keys in the Pulse instance's sensitive-environment editor are the supported onboarding path. Native OMP `/login` is not supported Pulse provider setup: it normally writes to its default root, does not populate Pulse's forced per-instance root, and is not available through Pulse ACP terminal authentication.
- OMP text generation uses fresh per-call agent, session, home, config, data, cache, state, and temporary roots. It disables tools, MCP servers, permissions, and elicitation. It removes Pulse-internal and path-escape variables; strips `OMP_AUTH_BROKER_URL`, `OMP_AUTH_BROKER_TOKEN`, `OMP_AUTH_BROKER_ACCOUNT_POOL_FILE`, and `OMP_AUTH_BROKER_SNAPSHOT_CACHE`; and strips external `PI_CONFIG_DIR` and `PI_CONFIG_FILES` redirects. A scalar broker snapshot TTL may remain, but it cannot activate or select broker state. Text generation supports bundled models through provider API keys, but intentionally does not import shared OMP OAuth or custom model state. `--no-session` disables normal session persistence; any process writes are confined to the disposable run root rather than being literally absent.
- Provider maintenance resolves the official `@oh-my-pi/pi-coding-agent` package and invokes the configured OMP binary with `omp update`.
- The web and desktop shell includes a Pulse-native `/workspace` surface branded as the ORCA workspace. It projects existing thread shells into attention, working, ready, and OMP views without subscribing to every thread transcript or claiming that an external Orca runtime is connected. Initial synchronization and disconnected environments are identified explicitly; cached remote data is presented as last-known state rather than live state.
- The sidebar and command palette open the ORCA workspace. The workspace can prepare a new OMP draft or a separate OMP draft that uses an existing thread only as a prompt reference, by selecting the target project, that environment's exact enabled OMP instance, and one model selector discovered from the instance. Preparation is disabled while the target environment is disconnected.
- Preparing OMP work seeds a reviewable prompt with human UX, efficiency, and effectiveness lenses. It does not send automatically, alter the user's sticky provider default, switch a started non-OMP thread in place, or claim a durable parent-child relationship.
- OMP draft preparation receives the Pulse server process environment plus the selected OMP instance's configured overrides. It does not export Codex, ChatGPT, Claude, or other provider login or subscription state into OMP; executable and model readiness are distinct from credential verification, so the first turn can still fail on missing, expired, or unintended ambient authentication.
- This implemented workspace slice is responsive in the web and desktop shell; it does not yet add a native route or launch surface to `apps/mobile` and must not be described as native-mobile integration.

The broader workforce domain, Pulse Vault grants and leases, Orca-style execution contract, Orca adapter, and issue-to-attempt-to-pull-request record described above remain future work. Orca has no provider registration or secret bridge in this branch.

## 13. Recommended sequence

1. **Build the Pulse domain:** workspaces, projects, departments, SOPs, work orders, attempts, artifacts, approvals, and typed receipts.
2. **Deepen the local execution boundary:** use Orca's project, worktree, run, gate, diff, and remote-status patterns to extend Pulse's existing primitives behind one contract.
3. **Define the Pulse Vault contract:** credential records, capability policies, grants, leases, revocation, redacted receipts, and provider-neutral failure types. Keep secrets out of shared contracts.
4. **Define portable worker templates:** export skills, persona, schedules, plugins, and capability requirements while excluding all credential material and project bindings.
5. **Harden the credential backend:** preserve the current single-owner `ServerSecretStore` path, close its documented release gates, and add an encrypted or externally managed backend before supporting shared or untrusted hosts.
6. **Stabilize OMP against the common contract:** use the first-party provider as the initial engineering conformance target, including gates and evidence.
7. **Apply the same contract to peer coding workers:** keep Codex, Claude, and later engineering CLIs replaceable rather than granting OMP a privileged protocol.
8. **Link Pulse Issues and GitHub:** bind each accepted attempt to its worktree, commits, pull request, checks, review evidence, and merge decision.
9. **Add Hermes for Research and Operations:** validate read-only Vault grants first, then bounded scheduled writes with explicit approval.
10. **Add focused workflow backends:** use OpenAI for a small worker, pilot Mastra on one bounded SOP, then add Google ADK or A2A for remote enterprise execution.

### Vault rollout gates

1. **Read-only proof:** one integration, one department, one scoped resource, short expiry, complete audit receipt.
2. **Approved write proof:** preview and human confirmation before a bounded external mutation.
3. **Scheduled-worker proof:** Hermes obtains a fresh grant per run and cannot reuse it after completion.
4. **Remote-worker proof:** an ADK or other remote backend authenticates its workload identity and redeems only its assigned capability.
5. **Shared-host release:** ship only after host isolation, encrypted or external secret storage, backup and diagnostic exclusions, rotation, and revocation are verified.

## Final recommendation

The winning design lets any framework disappear without taking the company’s work history with it.

Pulse should therefore remain the durable control plane and user-facing system of record. Pulse Vault should be the credential authority at its execution boundary. OMP should be the first-party engineering provider, while Codex, Claude, Hermes, Google ADK, OpenAI Agents SDK, and Mastra remain replaceable adapters selected per work order, department policy, credential capability, and operational need. Orca should inform the local supervision boundary without becoming a model provider or secret consumer.

## Sources

- [Pulse Code architecture overview](../../internals/overview.md)
- [Pulse integrations platform](../../internals/integrations-platform.md)
- [Integration secret-store and OAuth threat review](../../internals/integrations-secret-review.md)
- [Pulse workforce comparison and recommendation](comparison-and-pulse-code-recommendation.md)
- [Pi and Oh My Pi research](02-pi-and-oh-my-pi.md)
- [Oh My Pi source and installation](https://github.com/can1357/oh-my-pi)
- [Oh My Pi releases](https://github.com/can1357/oh-my-pi/releases)
- [Oh My Pi provider and credential resolution](https://github.com/can1357/oh-my-pi/blob/main/docs/providers.md)
- [Oh My Pi settings and state roots](https://github.com/can1357/oh-my-pi/blob/main/docs/settings.md)
- [Oh My Pi approval modes](https://github.com/can1357/oh-my-pi/blob/main/docs/approval-mode.md)
- [Orca source and README](https://github.com/stablyai/orca)
- [Orca releases](https://github.com/stablyai/orca/releases)
- [Orca CLI worktree model](https://github.com/stablyai/orca/blob/main/skill-guides/orca-cli.md)
- [Hermes Agent research](03-hermes-agent.md)
- [Nous Research announcement: portable Hermes profiles](https://x.com/NousResearch/status/2094515104670715940)
- [Hermes profile distributions](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profile-distributions.md)
- [Hermes security model](https://github.com/NousResearch/hermes-agent/security)
- [Google Agent Development Kit](https://adk.dev/)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [OpenAI multi-agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [Mastra agent framework](https://mastra.ai/ai-agent-framework)
- [Mastra MCP guide](https://mastra.ai/docs/agents/mcp-guide)
