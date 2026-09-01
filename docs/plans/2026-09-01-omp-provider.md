# OMP provider implementation plan

## Status

Repository implementation is complete on the current feature branch and awaits normal review and integration. This document does not claim that the branch has been merged, pushed, or released. Native OMP and Orca installation on a workstation is a separate verification step.

## Goal

Add Oh My Pi as a first-party Pulse provider. Pulse launches `omp acp`, keeps sensitive per-instance environment values in the existing server secret store, and assigns each interactive instance its own OMP agent root with `PI_CODING_AGENT_DIR`.

Orca remains an independent local orchestration application. It may launch the same native `omp` executable, but it cannot read Pulse secrets and does not act as a Pulse model provider.

## Completed implementation

### Contracts and provider surfaces

- Added an `OmpSettings` schema with an enabled flag and explicit binary path.
- Added OMP to settings defaults, provider-instance creation, display metadata, provider icons, and model selection surfaces.
- Registered OMP as a first-party, multi-instance server driver.
- Added focused contract, settings, server, web, and mobile presentation tests.

### Status, models, and maintenance

- Checks the configured executable with `omp --version`.
- Discovers the model catalog with bounded `omp models --json` execution.
- Publishes exact `provider/model-id` selectors and OMP thinking options without invented fallback models.
- Reports missing, timed-out, failed, malformed, and empty-catalog states without copying raw command output into user-visible errors.
- Resolves update advisories for `@oh-my-pi/pi-coding-agent` and runs the configured executable with `omp update`.

### Interactive ACP runtime

- Supports new, load, resume, send, steer, interrupt, and stop lifecycle operations.
- Maps Pulse default and plan interaction modes to OMP ACP modes.
- Applies model and thinking changes before publishing a started turn.
- Maps OMP permission requests and form elicitation into Pulse approvals and user-input events.
- Declines unsupported URL elicitation.
- Makes cancellation linearizable across queued and in-flight pre-prompt configuration so a cancelled turn cannot dispatch a later prompt.
- Publishes one terminal event for a started failed turn and does not publish a started turn for pre-start configuration failure.

### Credentials and interactive state

- Merges the selected provider instance environment over the Pulse server process environment. The selected instance wins for duplicate names, with case-insensitive replacement on Windows.
- Stores sensitive environment values through `ServerSecretStore`; `settings.json` and settings clients receive only redacted placeholders after save.
- Removes inherited OMP profile selectors and forces a Pulse-managed `PI_CODING_AGENT_DIR` for each instance.
- Maps Pulse runtime modes to OMP startup policy:
  - `approval-required` to `always-ask`
  - `auto-accept-edits` to `write`
  - `auto` to `always-ask`, because Pulse has no provider-neutral OMP auto-reviewer
  - `full-access` to `yolo`

`PI_CODING_AGENT_DIR` separates OMP's agent configuration, stored authentication, and sessions per Pulse instance. It does not block every native fallback. If the selected instance omits a provider key, interactive OMP can still resolve credentials from its native stored auth or from project, agent, config-root, or home `.env` files. Native OMP launched outside Pulse operates independently.

Orca cannot read `ServerSecretStore` or a future Pulse Vault. OMP launched by Orca uses Orca's environment and native OMP state unless an operator configures a separate shared boundary explicitly. Pulse signing, link, pairing, bootstrap, relay, and internal service keys are not model-provider credentials.

### Isolated text generation

- Uses a fresh per-call workspace, agent, session, home, config, data, cache, state, application-data, and temporary root.
- Starts ACP with tools, extensions, skills, rules, LSP, titles, and normal session persistence disabled.
- Advertises no terminal or filesystem capability, passes no MCP servers, cancels permission requests, and cancels or denies elicitation.
- Removes Pulse-internal variables, OMP auth-broker variables, config-file overlays, alternate git roots, and other path escape variables.
- Applies the exact selected model and thinking option before prompting.
- Supports bundled OMP models when the selected Pulse instance supplies their provider API key.
- Intentionally does not import shared OMP OAuth sessions or custom `models.yml` definitions into the clean call root.

The `--no-session` flag disables ordinary persisted conversation history. It does not prove that the OMP process performs no writes. Session-related writes are confined to the fresh per-call session root and removed with the scoped run directory.

## Repository verification

The implementation commits include focused OMP driver, provider, ACP support, elicitation, process-boundary, adapter lifecycle, text-generation, settings, contract, and provider-surface tests. They also include targeted type checks, lint, formatting, diff checks, and child-process cleanup checks performed during implementation.

The OMP process tests use deterministic local fixtures. They verify repository behavior without requiring a developer machine to have OMP installed or a live model-provider credential.

## Machine installation verification

Machine installation is operational evidence, not repository behavior. It remains a separate step for every supported host:

1. Install OMP from the official distribution for Windows, macOS, or Linux.
2. Verify `omp --version` and `omp models --json` in the same environment that starts the Pulse server.
3. Configure the Pulse provider with the resolved native binary path and a provider-specific API key.
4. Start one interactive ACP session and verify a bundled API-key-backed model.
5. If Orca is required, install its official desktop build separately and verify its own OMP authentication and state. Do not copy Pulse internal keys.

No machine-installation result is recorded as complete by this repository plan.
