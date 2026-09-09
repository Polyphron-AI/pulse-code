---
id: CR-2026-09-10-warden-readiness
status: proposed
impact: schema
created_at: 2026-09-10
files_touched:
  - prd/17-pulse-warden.md
  - tool-flow/pulse-warden.md
  - prd/warden/readiness.md
  - prd/warden/feasibility.md
  - prd/warden/decisions.md
  - prd/warden/first-read.md
  - prd/warden/first-read-plan.md
  - prd/README.md
---

# Prepare the Warden first read build packet

The owner asked to proceed with feasibility and implementation planning after merging the Warden PRDs. This packet records current code/branch evidence, manager/native feasibility, a concrete first-read contract, outstanding decisions and dependency-wired tasks.

Go PR66 now supplies internal broker primitives. Additional Go/Pulse infrastructure branches overlap planned work and must be reconciled before implementation. The old Beat port remains outside inspected main. D1 proposes using existing Grafana reads for generic first-slice conformance; this does not change the existing GitHub/Beat release gate without the owner's choice.

The packet proposes status mapping, digest binding, narrow CLI identity bootstrap and reuse of warden_uses instead of a duplicate grant store. Detailed schema/protocol changes remain proposed. No historical approval, production readiness, upstream licensing clearance, native compatibility or live read is implied.

The shared five-document packet is identical across repositories. The Go task ledger is authoritative for the cross-product graph. Documentation/link/coverage checks and the focused synthetic foundation test command are recorded in readiness.md. Original mixed local workspaces and operational credentials are untouched.
