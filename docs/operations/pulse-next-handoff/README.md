# Pulse Next handoff: the five-slice batch

Written 2026-09-13. Base revision for every slice in this batch is `origin/develop`
at 885200895 ("Merge branch 'feat/pulse-next-installer-identity' into develop").

This directory is the handoff for the batch of work opened after the first
Pulse Next alpha was installed and tested on Windows. The tester reported five
problems in one message:

1. the app reports version 0.0.39 and should be at T3 v0.0.40, and the version
   string should always say which T3 version Pulse Next is compatible up to
2. the icons and the publisher are still T3's
3. onboarding is still branded T3 Code
4. Skills, MCP and dictation are not reachable as settings subsections
5. Parakeet dictation does not initialise, and dictation setup should be offered
   during onboarding

Each numbered slice below has its own document, its own branch, its own worktree
and its own implementation owner, per `docs/operations/pulse-feature-delivery.md`.

| Slice | Document | Branch | Worktree |
|---|---|---|---|
| Upstream sync and version scheme | [01](01-upstream-v040-sync.md) | `sync/upstream-v040` | `.worktrees/upstream-v040-probe` |
| Brand mark and publisher | [02](02-brand-icons-publisher.md) | `feat/pulse-brand-icons` | `.worktrees/pulse-brand-icons` |
| Integrations settings subnav | [03](03-settings-integrations-subnav.md) | `feat/pulse-settings-subnav` | `.worktrees/pulse-settings-subnav` |
| Onboarding branding | [04](04-onboarding-branding.md) | `feat/pulse-onboarding-brand` | `.worktrees/pulse-onboarding` |
| Dictation: Parakeet fix and onboarding step | [05](05-dictation-parakeet.md) | `fix/pulse-parakeet-init` | `.worktrees/pulse-parakeet` |

## The compatibility mandate

This is the rule that outranks the others, restated by the user during the batch:
keep massive upstream compatibility, as the delivery playbook requires.

Pulse Next is T3 upstream plus a thin, well-seamed Pulse layer. The intent stated
by the user is to take T3 v0.0.40 as the base and layer Pulse Next commits on top
through a thick compatibility layer, so future updates from the fork flow in very
easily. In practice that means, in priority order:

1. Prefer upstream's file, upstream's structure, upstream's control flow and
   upstream's paths.
2. Inject Pulse values through the Pulse-owned seam,
   `packages/shared/src/productIdentity.ts`, rather than hardcoding them.
3. Put new behavior in a Pulse-owned file that upstream never touches, and
   reference it from as few upstream lines as possible.
4. Minimise the count of explicitly edited upstream lines. Every slice owner
   reports that exact list with a justification per line.
5. If a resolution leaves a large hand-written delta inside an upstream file,
   stop and restructure it into the seam instead.

Additive changes beat edits. Edits beat refactors. Refactors of upstream files
are, for this batch, a defect.

## The Pulse-owned seam

`packages/shared/src/productIdentity.ts` is the single source of truth for
OS-level identity, exported from `packages/shared/package.json` as
`./productIdentity`. It currently carries the product names ("Pulse Next",
plus Alpha, Nightly and Dev variants), `DESKTOP_APP_ID` `ai.polyphron.pulsenext`,
`DESKTOP_EXECUTABLE_NAME` `pulsenext`, the URL schemes, the user data directory
name, `HOME_BASE_DIR_NAME` `.pulse-next`, the artifact name template and the
macOS microphone usage description, along with helpers that take an
`isDevelopment` flag.

Two files deliberately cannot import it and duplicate its values instead:
`apps/desktop/scripts/electron-launcher.mjs`, which is plain `.mjs` and cannot
import TypeScript, and whose values are pinned by `electron-launcher.test.mjs`.
When identity changes, both move together and `LAUNCHER_VERSION` is bumped.

## Integration order

The slices were cut to be low-conflict, but they are not independent:

1. **Slice 01 lands first.** It rewrites the identity-bearing desktop files and
   the build script during conflict resolution, so everything else rebases onto
   its result rather than the reverse.
2. **Slices 02, 03, 04 next**, in any order. Upstream churn on their target files
   over the v0.0.40 range was one to three commits each.
3. **Slice 05 last**, because it shares `WelcomeWizard.tsx` with slice 04.

`WelcomeWizard.tsx` is the one file two slices touch. The split is deliberate and
must be respected: slice 04 owns the copy, the strings and the wordmark seam;
slice 05 owns the step machinery and adds a new Pulse-owned step component. If
either slice strays across that line the merge gets expensive.

Merging to `develop` is done by the integrating session, not by slice owners.
`develop` is checked out in the `.worktrees/pulse-next` worktree and must not be
disturbed, so integration uses git plumbing rather than a checkout:

```sh
git commit-tree "HEAD^{tree}" -p origin/develop -p HEAD -m "<message>"
git push origin <sha>:refs/heads/develop
```

## Standing constraints for every slice

These are project and user rules, not slice preferences.

- No em dash in any authored prose, including docs, comments and commit messages.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- No repo-wide checks. No `vp check`, no `vp run -r test`, no `vp run -r typecheck`.
  Focused tests only, and on Windows run `vp test run` from the package directory.
- Never use bare `git stash` or `git stash pop`. The stash stack is shared with
  other worktrees and sessions. Use a temporary WIP commit, or
  `git stash push -u -m "<unique-tag>"` with `git stash apply <sha>`.
- Never kill a process by pattern. Only a PID captured at spawn.
- `~/.t3/userdata` is the developer's live database. Read and copy from it,
  never serve from it, never open it read-write, never clean it.
- Never set `VITE_HTTP_URL` or `VITE_WS_URL` for dev.
- No PR unless the developer explicitly asks.
- Pulse Next policy: no publication, no update feed pointing at T3, no installing
  build candidates, the GitHub default branch stays `main`, and legacy branches
  are never merged wholesale. Port selected changes into a fresh branch from
  `origin/develop` instead. See `docs/operations/pulse-next-branches.md`.
- Do not touch the `.worktrees/pulse-next` develop checkout.
- No browsers or computer use for verification unless the user asks. Subagents do
  not launch their own dev servers.

## Per-slice process

From `docs/operations/pulse-feature-delivery.md`: one implementation owner per
slice, a JSON ledger with acceptance cases written in `docs/internals/` before any
code is written, focused checks only, then one bounded review of a frozen
revision with findings batched rather than trickled. Layered commits are fine and
do not need per-commit review gates.
