## Scope Brief — Pulse desktop product separation

> **Goal:**
> `/goal Build Pulse Code as an independently installable downstream desktop product (official T3 remains untouched; web and mobile remain shared); done when Pulse has isolated Windows/macOS/Linux identity and state, focused tests and a Windows installer pass, and the changes are committed and pushed to main.`

### 1. Objective

Produce a Pulse desktop build that can be installed and run beside official T3 without sharing or
taking over T3 application identity, protocols, state, shortcuts, updater ownership, or release
artifacts. Leave the repository ready for the next action: installing the new Pulse Windows build.

### 2. In Scope

- Pulse-only application/bundle IDs, executable/launcher identity, Linux desktop/WM identity,
  protocols, install paths, state roots, updater/release coordinates, and artifact names.
- Removal of automatic T3 desktop state discovery and OS-level protocol takeover.
- Focused unit/build-script tests for Windows, macOS, and Linux configuration.
- A locally built unsigned Windows installer plus package/smoke inspection.
- PRD/change-control synchronization, release documentation, commit, and push to `origin/main`.

### 3. Out of Scope (explicit non-goals)

- Any change to the official T3 repository, T3 CI, or T3 release artifacts.
- Separate Pulse web or mobile product identities.
- Building the optional T3 import tool; this release must start fresh.
- Installing the resulting Pulse package during this goal; installation is the next explicit action.
- Claiming signed/notarized or cross-platform runtime proof unavailable on this Windows host.

### 4. Deliverables

| Artifact              | Format / location                                     | Notes                                                    |
| --------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Runtime identity      | `apps/desktop/src/app/`, `apps/desktop/src/electron/` | Pulse-only state, app IDs, Linux identity, and protocols |
| Packaging identity    | `scripts/build-desktop-artifact.ts`, launcher scripts | Pulse-only Windows/macOS/Linux builder configuration     |
| Focused verification  | Existing desktop and build-artifact test files        | Fresh-state and no-T3-alias assertions                   |
| Release contract/docs | PRD, internal compatibility, and install docs         | State the downstream and fresh-install boundary          |
| Install candidate     | `release/Pulse-Code-0.0.33-x64.exe`                   | Unsigned Windows artifact inspected and smoke-tested     |
| Durable delivery      | Git commit on `main`, pushed to `origin/main`         | Explicit user authorization in this request              |

### 5. Constraints

- Preserve performance, remote-ready behavior, and the shared web/mobile clients.
- Do not read-write or migrate official T3 desktop state.
- Do not build or publish a modified T3 artifact from Pulse CI.
- Keep legacy source-level names only where they are internal compatibility details and cannot collide
  with official T3 at the OS, state, installer, updater, or release boundary.
- Use focused checks only; no repo-wide validation beyond the release build's own required steps.
- Default permanent desktop application/bundle ID: `ai.polyphron.pulsecode`.

### 6. Success Criteria (Definition of Done)

- [ ] Windows, macOS, and Linux package configs expose only Pulse IDs, names, protocols, paths, and
      update/release ownership.
- [ ] Pulse defaults to Pulse-owned state and never automatically selects an existing T3 state root.
- [ ] Official T3 and Pulse can hold separate single-instance locks and protocol registrations.
- [ ] Focused identity, protocol, launcher, and artifact-builder tests pass.
- [ ] Desktop typecheck and relevant formatting checks pass.
- [ ] An unsigned Windows installer builds and package inspection/smoke checks pass without installing it.
- [ ] PRD, decisions, acceptance criteria, CR, docs, and implementation agree.
- [ ] All scoped changes are committed to `main` and pushed to `origin/main`.

### 7. Audience / Context

The whole Pulse team installing packaged desktop applications on Windows, macOS, and Linux while
retaining access to the official T3 desktop product. Web and mobile users remain on shared clients.

### 8. Open Assumptions

- `ai.polyphron.pulsecode` is the permanent Pulse desktop reverse-DNS namespace. Veto before the
  first signed team release if the signing owner cannot use it.
- This Windows host can prove the Windows artifact and platform-neutral configuration/tests; macOS
  notarization and Linux runtime installation remain CI/release evidence, not claims made locally.

### 9. Confidence (final)

| Area         | Band      | Score | Evidence (required for 80+)                                                                                                                        |
| ------------ | --------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective    | Certain   | 98    | User: “Build this out update, commit and push so that next we can install Pulse code”                                                              |
| Boundaries   | Certain   | 98    | `prd/11-product-line-and-distribution-boundary.md` in/out-of-scope sections                                                                        |
| Deliverables | Confident | 92    | SCOUT found identity and package seams in `DesktopEnvironment.ts`, `DesktopAppIdentity.ts`, `ElectronProtocol.ts`, and `build-desktop-artifact.ts` |
| Constraints  | Confident | 86    | Locked decisions D-2026-08-21-\* and repository AGENTS.md multi-surface/release rules                                                              |
| Success      | Certain   | 96    | Ten deterministic cases in `prd/20-acceptance-criteria/desktop-product-line-boundary.md`                                                           |
| Audience     | Certain   | 98    | User: Pulse Code “used by our whole team”; PRD limits independent identity to desktop                                                              |

### 10. User notes captured during scoping

- “T3 should remain true to the T3 main repository.”
- “Pulse code can pull any of the features released on T3 into Pulse code selectively or add
  additional features that aren't in T3 selectively.”
- “Web and mobile should remain a shared client initially.”
- “I recommend a fresh installation with an optional explicit import tool.”

### 11. Calibration log

- 2026-08-21: Deliverables was scored 92 at gate; wrong because SCOUT missed `apps/desktop/src/app/DesktopApp.ts` passing the legacy scheme alias. Anchor implication: protocol-boundary scouts must grep all `getLegacyDesktopScheme` callers, not only the defining module and Clerk.
- 2026-08-21: Deliverables was still incomplete after the first correction because early Electron startup independently read `T3CODE_HOME` and defaulted to `~/.t3/dev`. Anchor implication: desktop state scouts must trace both the main configuration service and pre-runtime startup helpers.
- 2026-08-21: Deliverables also omitted downstream test-fixture migration after `T3CODE_HOME` became intentionally ignored. Anchor implication: identity-boundary plans must include a usage scan for test isolation variables so focused and later CI runs cannot fall through to live user state.
- 2026-08-21: The first real Windows package build exposed a stale verifier path derived from the display product name instead of the new executable identity. Anchor implication: package identity scouts must trace emitted executable names into post-build validators and smoke probes, not stop at electron-builder configuration.

---

**Created:** 2026-08-21 . **Last opened:** 2026-08-21 . **Last edited:** 2026-08-21 . **Status:** confirmed . **Owner:** Product
