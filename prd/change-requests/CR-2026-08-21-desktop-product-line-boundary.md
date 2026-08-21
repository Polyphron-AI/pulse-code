---
id: CR-2026-08-21-desktop-product-line-boundary
status: approved
impact: locked-reopen
author: Codex
created_at: 2026-08-21
files_touched:
  - prd/README.md
  - prd/11-product-line-and-distribution-boundary.md
  - prd/20-acceptance-criteria/desktop-product-line-boundary.md
baseline_sha: c297b4ad7a48d2f345153cf5092d686fab3bff22
implementation_sha: 448ead486
approval_tag: prd-approved-2026-08-21-desktop-boundary
related_crs: []
---

# CR-2026-08-21-desktop-product-line-boundary

## Summary

Establish Pulse as a selectively evolving downstream product with an independently installable
desktop distribution while official T3 remains wholly upstream-owned and web/mobile stay shared
initially.

## What changed (human-readable)

- `prd/README.md`
  - Adds the product-line boundary and its acceptance criteria to the PRD authority.
- `prd/11-product-line-and-distribution-boundary.md`
  - Makes the official T3 main repository the sole authority for T3 source and releases.
  - Gives Pulse its own repository history, CI, desktop artifacts, release cadence, selective
    upstream-intake process, and freedom to ship Pulse-only features.
  - Requires separate Windows, macOS, and Linux desktop identities that install, run, update, and
    uninstall beside official T3.
  - Requires fresh Pulse state and defers T3 migration to an explicit, selective, non-destructive
    import tool.
  - Keeps web and mobile as shared clients initially.
- `prd/20-acceptance-criteria/desktop-product-line-boundary.md`
  - Adds deterministic release-source, side-by-side, lifecycle-isolation, fresh-state, import,
    shared-client, and cross-platform release-proof cases.

## Locked decisions touched

- `D-2026-08-21-upstream-t3-fidelity` — newly locked.
- `D-2026-08-21-selective-pulse-downstream` — newly locked.
- `D-2026-08-21-desktop-identity-isolation` — newly locked.
- `D-2026-08-21-shared-web-mobile-initially` — newly locked.
- No previously locked decision is reopened.

## Evidence

- User direction: T3 must remain true to the official T3 main repository; Pulse may selectively pull
  released T3 features and add Pulse-only features.
- User direction: the identity boundary applies only to packaged desktop applications on Windows,
  macOS, and Linux; web and mobile remain shared initially.
- User direction: Pulse is intended for team-wide installation, starts fresh, and may later offer an
  optional explicit import tool.
- Repository evidence: `upstream` points to `pingdotgg/t3code`, while `origin` points to the
  Pulse repository.
- Implementation evidence: desktop runtime, launchers, protocols, Linux registration, state roots,
  updater coordinates, and package configuration now use Pulse-only desktop identity.
- Verification evidence: 44 integrated desktop tests and 7 identity-specific builder tests pass;
  desktop typecheck passes; the unsigned Windows x64 installer passes packaged-payload inspection
  and contains `pulsecode.exe` with no `t3code.exe` primary.

## Sign-off required

- [x] Product owner
- [x] Client contact
- [x] Baseline seal after the human-initiated commit

## Linked gaps

- **high** — G-2026-08-21-desktop-identity-not-isolated — implementation and Windows package
  inspection now satisfy the static identity boundary; installed Windows lifecycle proof and signed
  macOS/Linux package and lifecycle evidence remain required for team-wide release.

## Raw diff

<details><summary>PRD diff against prd-approved-2026-08-21</summary>

```diff
diff --git a/prd/README.md b/prd/README.md
--- a/prd/README.md
+++ b/prd/README.md
@@
+Add the product-line boundary and deterministic desktop acceptance-criteria entries.

diff --git a/prd/11-product-line-and-distribution-boundary.md b/prd/11-product-line-and-distribution-boundary.md
new file mode 100644
--- /dev/null
+++ b/prd/11-product-line-and-distribution-boundary.md

diff --git a/prd/20-acceptance-criteria/desktop-product-line-boundary.md b/prd/20-acceptance-criteria/desktop-product-line-boundary.md
new file mode 100644
--- /dev/null
+++ b/prd/20-acceptance-criteria/desktop-product-line-boundary.md
```

The complete proposed content is carried in the two new files and the updated PRD index.

</details>

## History

- 2026-08-21 proposed (Codex)
- 2026-08-21 product direction explicitly confirmed by the user; canonical baseline tag pending the
  human-initiated commit required by change control.
- 2026-08-21 Pulse-only desktop identity implemented and the unsigned Windows x64 candidate passed
  focused tests, typecheck, package validation, archive inspection, and hashing.
- 2026-08-21 implementation committed as `448ead486`; approval seal prepared as
  `prd-approved-2026-08-21-desktop-boundary`.

---

**Created:** 2026-08-21 . **Last opened:** 2026-08-21 . **Last edited:** 2026-08-21 . **Status:** approved . **Owner:** Product
