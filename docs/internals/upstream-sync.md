# Upstream sync (T3 Code → Pulse Code)

Pulse Code is a fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code). Upstream changes come in by **cherry-pick, not merge** — the fork has diverged enough (branding, Pulse Connect, scheduled chats, release pipeline) that a branch merge conflicts across dozens of files and produces a history nobody can read.

Because cherry-picks leave no merge commit, `git merge-base` cannot tell you how current the fork is. The baseline is recorded explicitly instead.

## Two version numbers

| Identifier                                     | Where                                                                                          | Meaning                                                                                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pulse version** (`0.1.0`, `0.1.0-nightly.…`) | `apps/{server,web,desktop}/package.json`, `packages/contracts/package.json`, release tags `v*` | Pulse's own semver, bumped on Pulse's cadence. Client/server skew checks compare this string exactly, so all four package.jsons must agree. Decoupled from T3's numbering as of 0.1.0. |
| **Upstream baseline** (`0.0.33` @ `a87f691bd`) | `UPSTREAM.json` at repo root; tags `t3/v*` on develop                                          | The T3 release every upstream commit _up to_ has been evaluated against — either pulled or listed in `skipped`.                                                                        |

The baseline is not encoded in the Pulse version string on purpose: a suffix marks releases prerelease in `release.yml`, `+build` metadata is dropped by npm dist-tags and electron-updater, and a fourth segment breaks semver tooling.

## `UPSTREAM.json`

```json
{
  "repo": "pingdotgg/t3code",
  "version": "0.0.35",
  "commit": "3108239f6",
  "evaluatedThrough": "018d7f277",
  "syncedAt": "2026-09-01",
  "skipped": ["3db38b881", "88be5631f"]
}
```

- `version` / `commit` — the upstream **release tag** the baseline corresponds to.
- `evaluatedThrough` — the last upstream `main` commit reviewed (may be ahead of the release tag when syncing from main).
- `skipped` — upstream commits deliberately not pulled. This list is what makes "based on v0.0.35" honest; keep it complete. Prune entries once a later sync makes them irrelevant (superseded or reverted upstream).

The file is read at build time:

- `apps/web/vite.config.ts` → `import.meta.env.UPSTREAM_VERSION` / `UPSTREAM_COMMIT` → `branding.ts` → Settings → About ("based on T3 Code v0.0.35 (3108239)"). Desktop inherits this from the web bundle.
- `apps/server/src/environment/ServerEnvironment.ts` → `ExecutionEnvironmentDescriptor.upstreamVersion`, so remote environments (relay, tunnel, tailnet) report their own baseline to any client.

## Sync procedure

1. `git fetch upstream --tags`
2. Review: `git log --oneline --no-merges develop..upstream/main`. Score overlap per commit (files touched ∩ files Pulse has changed since the last baseline) and group by feature domain. Get domains approved, not individual commits. Example review: `project/plans/upstream-sync-2026-08-28*.md`.
3. Branch `sync/t3-v<version>` off `develop`.
4. Cherry-pick approved commits in upstream chronological order, one domain at a time. Resolve conflicts with two standing rules: **branding files always resolve to Pulse**; **Pulse migrations stay first** — renumber upstream migrations behind them and test on a `VACUUM INTO` copy of real data.
5. Anything upstream that points at a T3-hosted service (model manifests, analytics, Clerk) gets repointed or skipped — never left pointing at T3.
6. `vp test run` for the tests touched; scoped typecheck.
7. Update `UPSTREAM.json` (`version`, `commit`, `evaluatedThrough`, `syncedAt`, `skipped`).
8. Merge to `develop`, then `git tag t3/v<version>` on the merge commit and push the tag. `git log t3/v0.0.34..t3/v0.0.35` lists exactly what landed between baselines.
9. Release notes for the next Pulse release open with: "Includes T3 Code through v<version>."

## Checking the baseline

- In the app: Settings → About.
- In the repo: `cat UPSTREAM.json` or `git tag -l 't3/*'`.
- For a remote environment: its `ExecutionEnvironmentDescriptor.upstreamVersion` in the environment list.
