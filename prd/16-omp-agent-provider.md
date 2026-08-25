# OMP agent provider

Status: proposed; planned after Scheduled Chats/CRON
Design authority: `docs/plans/2026-08-24-omp-agent-provider-design.md`

## Problem

Pulse Code users can run several provider agents, but cannot select OMP and let its
native model, tools, skills, and subagents solve a normal Pulse thread. Using OMP in
a separate terminal loses Pulse's durable thread, remote access, canonical status,
permission UI, and checkpoint review.

## Scope

- <a id=provider></a>**First-class provider.** A configured environment can expose
  OMP as a normal provider instance in settings and provider/model pickers.
- <a id=thread-control></a>**Thread control through ACP.** Pulse starts or loads an
  OMP ACP session for a thread and supports prompt, standard content/tool/plan
  updates, permission responses, cancellation, completion, and opaque session
  resume.
- <a id=omp-ownership></a>**OMP-native execution.** OMP retains ownership of its
  credentials, models, tools, rules, skills, project instructions, MCP configuration,
  and internal subagents; Pulse does not scrape its TUI or import its session files.
- <a id=trust></a>**Honest approvals.** A Pulse-owned per-thread config overlay keeps
  supervised writes and commands on the ACP permission path even when ambient OMP
  configuration would bypass it. Full access is always an explicit thread choice.
- <a id=remote></a>**Remote-ready process boundary.** OMP runs only on the environment
  host. Web, desktop, mobile, LAN, relay, and tunnel clients control it through the
  existing Pulse WebSocket without exposing an OMP network service.
- <a id=install-health></a>**Installation and health.** Provider settings distinguish
  missing binary, incompatible version, authentication, and model health; install
  guidance targets the environment host and never runs automatically from a remote
  client.
- <a id=scheduled></a>**Scheduled Chats compatibility.** Every scheduled occurrence
  starts a fresh OMP provider session and uses the shared scheduled-run preflight,
  timeout, failure, and checkpoint behavior.
- <a id=surfaces></a>**Multi-surface completion.** Web/desktop expose provider setup
  and every normal picker entry point; mobile can select and operate an already
  configured OMP instance; user documentation explains installation, trust, and
  host availability.

## Non-goals

Embedding the OMP SDK, scraping the interactive terminal, replacing Pulse
orchestration, importing OMP session JSONL, automatically installing/updating OMP,
building a generic arbitrary-ACP marketplace, or reproducing OMP's rich Agent Hub
in the MVP.

## Constraints

- Build remains blocked until `R-2026-08-21-scheduled-chats` is complete.
- Native `omp acp` over stdio is the v1 transport.
- One OMP subprocess may exist per active Pulse thread and must be subject to the
  existing provider-session lifecycle.
- Raw OMP logs and histories do not cross the Pulse WebSocket.
- Pulse settings do not accept arbitrary interpolated shell arguments.
- Unknown or unsupported ACP capabilities fail visibly rather than silently
  changing provider, model, permission, or session behavior.

## Acceptance

- A user with OMP installed and authenticated can choose it, send a turn, observe
  normalized agent/tool activity, answer permissions, stop, reconnect, and resume.
- Supervised mode cannot be bypassed by an ambient OMP `yolo` approval setting.
- Missing/incompatible/unauthenticated states give distinct recovery guidance.
- The same thread behavior works from web, desktop, and mobile over local and remote
  connections.
- A scheduled OMP turn proves fresh provider-session behavior and the common timeout
  and failure path.
- Focused contracts/server/web/mobile tests and targeted typechecks pass.
- `docs/user/` describes the shipped provider in product language.

---

**Created:** 2026-08-24 . **Status:** proposed . **Owner:** Product
