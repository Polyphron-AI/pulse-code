---
id: CR-2026-09-09-warden-mcp-cli
status: proposed
impact: schema
created_at: 2026-09-09
files_touched:
  - prd/17-pulse-warden.md
  - prd/20-acceptance-criteria/pulse-warden.md
  - prd/warden/mcp-cli.md
  - prd/README.md
  - tool-flow/pulse-warden.md
  - workflows/pulse-warden.md
  - sitemap/pulse-warden.md
  - project/state.json
  - project/workspace-overlay.json
  - project/workspace.json
---

# Explicit Warden MCP and CLI deliverables

The owner requested closing the MCP/CLI gaps after review. Add six requirements and six matching acceptance scenarios, plus the coordinated tool/command contract. Existing generic broker operations and optional bw bridge did not fully specify these deliverables.

Specify agent-safe tools, Pulse CLI commands, authentication and environment binding, provider registration/doctor/removal, parsable outputs and exit reasons, noninteractive behavior, human-only approval and cancellation/reconciliation. UI, MCP and CLI must share authorization and idempotency fixtures. Existing custody, native passkey, commercial and isolation gates remain unchanged.

This records authorized specification work. Detailed tool/command names and new Warden-only exit codes are proposed and must be checked against implementation compatibility. No runtime command, API or tool is claimed shipped; no prior CR or baseline is auto-approved. Paired repositories carry byte-identical prd/warden/mcp-cli.md and coordinated acceptance.

Validation and before/after snapshots are retained in the Pulse workspace under output/warden-mcp-cli-prd-2026-09-09. Existing unrelated viewer findings remain separate.

**Created:** 2026-09-09 . **Last opened:** 2026-09-09 . **Last edited:** 2026-09-09 . **Status:** proposed . **Owner:** Product / Engineering
