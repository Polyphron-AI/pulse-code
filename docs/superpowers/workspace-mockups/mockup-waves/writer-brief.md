# Per-wave plan writer brief (shared by every writer)

Worktree: `C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace`, branch `qb/feat-unified-workspace`. M = `docs/superpowers/workspace-mockups`.

## Goal

Turn one wave of `M/mockup-waves/wave-map.md` into a detailed, executable implementation plan so an implementer subagent who sees only one task is 100% aware of both the code function and the rendered look that must be achieved. The mockup PNGs in `M/mockups/` are the source of truth for look.

## Inputs (read all that apply to your wave)

- `M/mockup-waves/wave-map.md`: your wave section, plus the shared sections (Evidence, Ownership, Delivery and test contract, File-set notation, Maintainer decisions, Visual acceptance contract V1, Shared-file serial slots, Wave 4 sample chrome to live chrome, Per-PNG capture recipes, Review response log).
- The mockup PNGs your wave names. Open them as images and study them.
- The gap reports your wave cites (`M/mockup-waves/gap-*.md`) and both reviews (`review-fidelity.md`, `review-feasibility.md`).
- Main plan header and Global Constraints: `docs/superpowers/plans/2026-10-14-unified-workspace.md` (first ~110 lines) and its outline for your wave. Spec: `docs/superpowers/specs/2026-10-14-unified-workspace-design.md` incl. amendment A13.
- `AGENTS.md` (performance, remote ready, multi-surface, hit every surface, docs split). For server Effect code read `.repos/effect-smol/LLMS.md`.
- The actual current code each task touches. Read it before writing code steps. The working tree includes the uncommitted shell correction B-2026-10-16-001; treat it as current.

## Output

Write exactly one file: the per-wave plan path named in your wave section of wave-map.md (`docs/superpowers/plans/2026-10-16-workspace-wave-<N>-<slug>.md`). Format (superpowers writing-plans):

1. Header: title, the "For agentic workers" line (REQUIRED SUB-SKILL: superpowers:subagent-driven-development), Goal, Architecture, Tech Stack, Spec (spec path + wave-map path), Mockups (PNG paths).
2. Global Constraints: copy verbatim the relevant ones from the main plan and spec, plus: no em dashes in authored text, no polling, no continuous animations, contracts in packages/contracts with no heavy runtime logic, never touch ~/.t3/userdata, never set VITE_HTTP_URL/VITE_WS_URL, targeted tests only (`vp test run <files>` from the package dir; no repo-wide checks).
3. Review Focus: five most likely uncovered failure modes, each pinned to a test in the owning task.
4. Rendered look reference: for each PNG region your wave owns, the full look spec an implementer builds from (pixel box at 1280x800, typography, hex colors, lucide icons, spacing, radius, states, exact copy), corrected per the reviews. Plus the sample-to-live chrome substitutions that apply.
5. Tasks, in dependency order, one per wave-map task ID (keep IDs, e.g. `### Task W6-T1a: ...`). Each task: Files (create/modify with path:line ranges you verified, test files), Interfaces (Consumes / Produces with exact names and types), Depends on, Serial slot, then bite-sized checkbox steps: failing test with real code, run command and expected failure, minimal implementation with real code, run and expected pass, surface checklist items for this task (entry points, clients web/desktop/mobile, providers, contracts, reverse states, connection modes, docs), visual acceptance (capture recipe, PNG, pixel box, pass criteria, allowed substitutions), commit step with an explicit file list (never `git add -A` or `.`; never stage pnpm-lock.yaml or docs/internals/pulse-next-migration.json unless the task owns it). Conventional commit title.
6. Wave gate task: docs/user, docs/internals, glossary updates, focused verification, screenshot comparison against the PNGs.
7. Self-review section: decisions this wave depends on (D-IDs and the default assumed), and anything you could not resolve.

## Rules

- No placeholders ("TBD", "add error handling", "similar to Task N"). Real code in code steps, matching surrounding repo idiom.
- Do not edit any file except your one output plan file. Do not stage, commit, stash or checkout. No dev servers, browsers, provider CLIs, network, or repo-wide checks.
- No em dash characters (U+2014). Verify with a grep before finishing.
- If wave-map.md is wrong about current code, follow the code and note the deviation in the Self-review section.
- Final message: path written, line count, task count, decisions assumed, and open issues.
