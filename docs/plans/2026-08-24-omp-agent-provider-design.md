# OMP agent provider — feature design

Status: shaped, planned after Scheduled Chats/CRON
Date: 2026-08-24
Roadmap dependency: `R-2026-08-21-scheduled-chats`

## One-line pitch

Let a user choose OMP as a normal Pulse Code provider so OMP can own an agent turn
while Pulse Code keeps ownership of the durable thread, transport, permissions,
checkpoints, and multi-surface UI.

## Sequencing decision

No implementation begins until `R-2026-08-21-scheduled-chats` is complete. OMP is
the next provider goal after that gate because Scheduled Chats establishes the
fresh-session and unattended-turn behavior that OMP must participate in honestly.

Completion means the Scheduled Chats roadmap item and its acceptance criteria are
done, including a provider-support decision per adapter. A partial CRON backend or
an unfinished client surface does not open the OMP build gate.

## Product boundary

OMP is a provider, not a Pulse tool, embedded terminal, or workflow subsystem.

- **OMP owns** model execution, its native tools, rules, skills, provider
  credentials, project instructions, and internal subagents.
- **Pulse Code owns** projects and threads, remote connectivity, canonical runtime
  events, permission presentation, user-input presentation, checkpoints, and
  provider lifecycle.
- **The environment owns** the OMP installation and credentials. A phone or remote
  browser controls the environment through Pulse Code; it never starts a second
  OMP network service.

This preserves OMP's value without creating a second orchestration model inside
Pulse Code.

## Transport decision: native ACP

Pulse Code starts OMP through its native `omp acp` command and communicates over
ACP JSON-RPC on stdio. This is the primary and only required v1 transport.

OMP also exposes an SDK, interactive UI, and a richer OMP-specific RPC protocol.
They are intentionally not the integration boundary:

- TUI scraping cannot provide durable typed permissions or session recovery.
- Embedding the SDK couples Pulse Code's server release and failure domain to OMP's
  JavaScript runtime, dependencies, and extension lifecycle.
- OMP RPC duplicates the ACP runtime already used by Pulse Code and has historically
  differed from ACP in mode support.

Official protocol references used for this design:

- OMP ACP implementation: <https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/modes/acp/acp-agent.ts>
- OMP approval behavior: <https://github.com/can1357/oh-my-pi/blob/main/docs/approval-mode.md>
- OMP session storage: <https://github.com/can1357/oh-my-pi/blob/main/docs/session.md>
- OMP RPC surface: <https://github.com/can1357/oh-my-pi/blob/main/docs/rpc.md>
- ACP protocol: <https://agentclientprotocol.com/protocol/v1/overview>

## Architecture

```text
web / desktop / mobile
          |
     Pulse WebSocket
          |
 thread orchestration
          |
      OmpAdapter
          |
  AcpSessionRuntime
          |
    stdio JSON-RPC
          |
       omp acp
          |
 models / tools / skills / subagents
```

OMP session updates and permission requests travel back through the same path and
are normalized into existing `ProviderRuntimeEvent` values before crossing the
Pulse WebSocket. Raw OMP protocol history is never broadcast to clients.

## Process and session ownership

V1 runs one OMP subprocess per active Pulse thread. Although ACP can represent
multiple sessions, per-thread processes give the smallest unsurprising lifecycle:

- working directory, runtime mode, and temporary configuration are isolated;
- cancellation and crashes affect one thread;
- existing provider session reaping controls idle-process cost;
- a Pulse server restart can respawn OMP and load the saved ACP session ID.

The Pulse thread stores the opaque OMP ACP session ID in its provider resume cursor.
OMP continues to own its append-only session files. Pulse Code does not parse,
copy, edit, or use OMP's JSONL as its read model.

### Thread lifecycle

1. Resolve the configured OMP provider instance for the environment.
2. Spawn `omp acp` with the project root as the working directory.
3. Initialize ACP and authenticate with OMP's existing `agent` auth method.
4. Create a session or load the opaque session ID from the resume cursor.
5. Send the user turn as `session/prompt` with supported text and image content.
6. Project ACP content, plan, tool, status, permission, and terminal updates into
   canonical Pulse events.
7. Map Stop to ACP cancellation and orderly thread disposal to process shutdown.
8. Persist the returned session ID and let the existing checkpoint path capture
   workspace changes.

Scheduled Chats must start a fresh OMP provider session for every occurrence, just
as its design requires for every other adapter. The scheduled thread remains
durable in Pulse Code; OMP conversation state is not resumed across cron fires.

## Installation, authentication, and models

Provider discovery runs on the environment server:

- `omp --version` determines whether OMP is installed and records its version.
- An ACP initialization probe determines protocol compatibility and authentication
  state.
- ACP session configuration is the primary model, thinking-level, and mode source.
  `omp models --json` may be used as a bounded health/catalog fallback.

When OMP is absent, Settings explains that it must be installed on the environment
host and offers a copyable platform command. On Windows the official command is:

```powershell
irm https://omp.sh/install.ps1 | iex
```

Web and mobile clients never execute host installation commands. An optional
desktop/server-managed installer is a later feature requiring an explicit action,
version verification, progress, and failure recovery. Pulse Code never updates OMP
as a side effect of starting a thread.

Credentials stay in OMP's own home and are not copied into Pulse settings. If ACP
reports a terminal authentication method, Pulse may surface an environment-host
setup action in a later slice; v1 can report the exact unauthenticated state and
link to OMP setup.

## Permission model

Pulse must not claim that a thread is supervised while OMP can bypass ACP approval
requests through a project or global `tools.approvalMode: yolo` setting.

Each OMP process therefore receives a Pulse-owned temporary configuration overlay
that selects the effective approval policy for that thread without changing
`~/.omp` or project files:

- **Supervised** routes mutating file operations and commands through ACP permission
  requests rendered by Pulse Code.
- **Full access** retains the ACP path but lets Pulse Code accept requests according
  to the explicit thread mode. It does not silently launch OMP with `--yolo`.
- More nuanced Pulse modes are exposed only after their OMP tool-policy mapping is
  tested and can be described truthfully.

The overlay changes only approval behavior. It must not replace OMP's models,
tools, prompts, rules, skills, or MCP configuration.

Pulse's ACP filesystem and terminal client capabilities remain disabled by default.
OMP uses its native environment-local tools, while Pulse receives structured ACP
updates and permission requests. This is both remote-ready and a smaller security
boundary.

## Pulse MCP injection

The OMP ACP session receives the same per-thread Pulse MCP endpoint already used by
ACP-backed providers. This gives OMP access to thread-scoped Pulse tools without
writing user configuration. The injected server uses a stable Pulse-owned name and
must not erase or rewrite OMP's existing MCP configuration.

Tool-name collisions and unsupported MCP transports fail visibly during the
protocol spike; they do not trigger silent fallback to a different tool.

## Event and interaction mapping

V1 maps the standard ACP surface:

- assistant text and reasoning;
- plan entries and session modes;
- tool-call start, progress, and completion;
- permission requests and outcomes;
- model and thinking configuration;
- images in user prompts;
- cancellation, errors, and session completion.

OMP generic form elicitation needs a reusable ACP-to-`ProviderUserInput` bridge.
That bridge is a separate build step because free-text and structured fields may
require a contract/UI addition beyond the current multiple-choice shape. Until it
ships, unsupported elicitation fails visibly rather than hanging the thread.

OMP's internal Agent Hub can operate in v1, but Pulse initially renders only the
standard task/tool activity ACP exposes. Rich subagent rosters, nested transcripts,
and subscriptions are a follow-up. Prefer an upstream or documented ACP extension;
use a narrow OMP RPC side channel only if ACP cannot carry the required data.

## Surface decisions

### Web and desktop

- Settings → Providers includes an OMP card with installation, version,
  authentication, binary path, profile, and model health.
- The provider/model picker includes configured OMP instances.
- Plan mode, thinking, Stop, permissions, images, and status use the existing chat
  affordances when ACP advertises support.
- The command palette and settings deep links follow the same provider-instance
  behavior as other built-in providers.

Desktop wraps the web surface. It gains no separate embedded OMP terminal in v1.

### Mobile

- Mobile can choose an already configured OMP instance, start or resume a thread,
  stop a turn, answer supported permissions, and view normalized activity.
- Installation and host authentication remain environment-host actions with clear
  guidance rather than non-functional mobile controls.

### Connection modes

Local, LAN, relay, and tunnel clients all use the existing Pulse WebSocket. OMP is
spawned only by the environment server and no OMP port or origin is exposed.

## Failure and recovery

- Missing binary, incompatible version, unauthenticated state, ACP handshake
  failure, and unsupported capability are distinct provider health states.
- A process crash settles the turn with an honest provider error and leaves the
  checkpoint/worktree reviewable.
- Restart recovery loads the opaque OMP session ID when the thread semantics allow
  resume.
- If OMP rejects a saved session, Pulse reports that state and offers a new session;
  it does not silently merge histories.
- Provider-side conversation rollback is not promised in v1. Workspace checkpoint
  restoration and OMP session history are separate operations until ACP supports an
  honest combined behavior.
- Scheduled runs use Scheduled Chats' existing preflight, timeout, and failure
  events; OMP does not introduce a second unattended-run watchdog.

## Contracts and settings

`ProviderDriverKind` already accepts branded provider slugs, so OMP uses `omp` as a
normal first-party driver kind. New contract work is limited to OMP settings and any
later generic elicitation shape.

Initial OMP settings:

- `enabled`;
- `binaryPath`, defaulting to `omp`;
- optional profile/config selector with no arbitrary shell interpolation.

Arbitrary launch arguments are a non-goal for v1. They make runtime and approval
behavior impossible for Pulse Code to describe reliably.

## Performance constraints

- Spawn only for active threads and use the existing idle session reaper.
- Normalize and bound events server-side; never forward raw OMP logs or entire
  session history over the WebSocket.
- Coalesce high-frequency progress updates using existing ACP/provider patterns.
- Do not introduce continuously repainting client animations.
- Measure process memory and event volume during the protocol spike with one and
  several simultaneous threads.

## Compatibility policy

OMP releases quickly, so integration relies on capability negotiation and recorded
protocol fixtures rather than undocumented version checks alone.

- The protocol spike selects a tested minimum OMP version.
- Newer versions are accepted when required ACP capabilities negotiate successfully.
- The provider health card explains version incompatibility and the supported
  range.
- Focused tests use a fake ACP peer; an opt-in real-CLI smoke test covers the pinned
  minimum and current supported OMP release.

## Non-goals

- Recreating OMP's Agent Hub or terminal UI inside Pulse Code.
- Replacing Pulse orchestration, event sourcing, threads, or checkpoints.
- Importing or synchronizing OMP session JSONL into the Pulse database.
- Shipping OMP inside every web, mobile, or server distribution.
- Automatically installing or updating OMP without an explicit host-side action.
- Building a generic arbitrary-ACP plugin system as a prerequisite.
- Supporting OMP RPC-only extension UI in the first release.

## Constraints and open questions

The following are resolved by the first protocol spike and do not justify starting
before CRON is complete:

1. **Minimum version:** record the first OMP release that passes the required ACP
   initialize/auth/new/load/prompt/permission/mode/model/image/cancel matrix.
2. **Approval overlay:** confirm the narrowest overlay that overrides `yolo` without
   suppressing unrelated user/project OMP configuration.
3. **Session options:** record how OMP advertises model, thinking, and plan/vibe
   modes and preserve unknown options rather than hard-coding a closed list.
4. **Elicitation:** determine whether the current Pulse user-input contract can map
   OMP's primitive form schema losslessly; otherwise shape the smallest shared ACP
   contract extension.
5. **Subagents:** record what standard ACP updates expose before deciding whether a
   custom extension is justified.

No open question changes the provider/ACP boundary.

## Build order

Implementation begins only after the Scheduled Chats dependency gate passes.

1. **ACP compatibility fixture.** Install a pinned OMP release in a disposable
   development environment and record focused initialize, auth, new/load, prompt,
   permission, mode/model, image, cancel, crash, and scheduled-fresh-session tests.
   Decide and document the minimum version and approval overlay.
2. **Provider contracts and discovery.** Add OMP settings, provider catalog/driver
   registration, binary/version/auth/model health, and focused contract/provider
   tests. No turn execution yet.
3. **Thread execution walking skeleton.** Add OMP ACP support and adapter mapping for
   start/resume, prompt, standard updates, permissions, MCP injection, cancel,
   completion, process cleanup, and scheduled fresh sessions. Prove local and
   remote-shaped server behavior with focused tests.
4. **All primary surfaces.** Add web/desktop settings and picker paths, command
   palette reachability, mobile configured-provider selection and interaction,
   icons/status, and `docs/user/` guidance. Perform one integrated client pass only
   with explicit user approval.
5. **Structured elicitation.** Add the smallest reusable ACP form bridge and test
   web/mobile responses and cancellation. Skip if the compatibility fixture proves
   OMP does not require it for supported workflows.
6. **Agent Hub follow-up.** Based on measured demand and the fixture, shape rich
   subagent visualization separately. It is not part of OMP provider MVP completion.

Each build step is its own goal-assistant cycle with targeted tests and typechecks.

---

**Created:** 2026-08-24 . **Status:** shaped, blocked by Scheduled Chats . **Owner:** Product
