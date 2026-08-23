---
name: goal-assistant
description: Drive a feature goal through a Plan → Improve → Build → Validate cycle against this repo's ProductOps artifacts (design doc, PRD, CR, roadmap). Use when asked to advance, resume, or check progress on a feature goal (e.g. "/goal-assistant scheduled-chats"). Repeatable — each invocation runs one cycle and reports the gate status.
---

# Goal Assistant

Advance one feature goal through a single **Plan → Improve → Build → Validate**
cycle. Invoke with the goal name as the argument; with no argument, default to
`scheduled-chats`.

Each cycle is bounded: do the smallest useful increment per phase, report gate
status, and stop. The user re-invokes to continue. Never silently expand scope.

## Goal registry

| Goal                     | Design authority                                           | Requirement                                                                                            | Roadmap item                                                                   |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| scheduled-chats          | `docs/plans/2026-08-21-scheduled-chats-design.md`          | `prd/12-scheduled-chats.md` + `prd/change-requests/CR-2026-08-21-scheduled-chats.md`                   | `R-2026-08-21-scheduled-chats` in `project/state/shards/roadmap.yaml`          |
| mobile-file-link-actions | `docs/plans/2026-08-21-mobile-file-link-actions-design.md` | `prd/13-mobile-file-link-actions.md` + `prd/change-requests/CR-2026-08-21-mobile-file-link-actions.md` | `R-2026-08-21-mobile-file-link-actions` in `project/state/shards/roadmap.yaml` |

For a goal not in the registry: ask the user for its design authority, or offer to
bootstrap one (design doc in `docs/plans/`, CR in `prd/change-requests/`) before
any build work. Add the new goal to this table as part of that cycle.

## Phase 1 — Plan

1. Read the goal's design authority end to end. It outranks this skill and your
   assumptions; decided items are not re-litigated.
2. Read the build order at the end of the design doc, then diff it against
   reality: `git status`, the files each step names, and existing tests. Determine
   the current step: last step whose artifacts exist and whose tests pass.
3. Write (or update) the plan for **this cycle only**: the next incomplete build
   step, its files, its verification command. One step per cycle unless steps are
   trivially small.

## Phase 2 — Improve

Before building, spend one bounded pass improving the plan, not the code:

- Check the design doc's "Constraints and open questions" for anything the next
  step depends on. If an open question blocks the step, surface it to the user
  instead of guessing.
- Check AGENTS.md "Hit every surface" against the step: entry points, clients,
  providers, contracts, reverse states, connection modes, docs. List which apply.
- Check for drift: has the design doc changed since the last cycle in ways that
  invalidate already-built artifacts? If yes, the improve output is a repair task
  prepended to the plan.
- Fold any improvement back into the design doc (edit it — one authority, no
  parallel notes files).

## Phase 3 — Build

- Implement exactly the planned step. Respect the repo's hard rules: never touch
  `apps/server/src/provider/` while unrelated in-flight work sits there (check
  `git status` first), no `any`, Effect code only after reading
  `.repos/effect-smol/LLMS.md`, comments only where the code can't say it.
- Backend behavior ships with focused tests in the same cycle — a build phase
  that produces untested behavior fails its gate.
- Do not commit. Working-tree only; commits are the user's change-control act
  (CR sign-off pattern).

## Phase 4 — Validate

1. **Tests**: `vp test run <touched files>` — targeted only, never repo-wide
   (no `vp check`, no `vp run -r ...`). Tests wait on receipts/settled state,
   never sleeps.
2. **Types**: targeted typecheck for changed packages.
3. **Feature check** ("checking for this feature"): re-read the goal's PRD scope
   section and mark each scope bullet ✅ built / 🔨 in progress / ⬜ not started,
   citing the file that proves each ✅. This is the honest progress table — a
   bullet is ✅ only when its tests pass.
4. **Docs gate**: if the cycle changed user-visible behavior, `docs/user/` needs
   an entry before the goal can ever be called done (shipped-product voice).

## Report format

End every cycle with:

```
Goal: <name> — cycle result
Step built: <build-order step> — <pass|fail>
Tests: <command> → <summary>
Scope: <n>/<total> PRD bullets ✅
Next: <the next step, or blocking question>
```

If validation failed, the next cycle's plan is the fix — say so explicitly.
Never report a step as done with failing tests, and never check CR sign-off
boxes; approval belongs to the product owner.
