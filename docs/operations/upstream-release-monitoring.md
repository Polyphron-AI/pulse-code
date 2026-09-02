# Upstream release monitoring

Pulse tracks official OMP and Orca releases without importing either source tree into this
repository.

| Project  | Official release source                                          | Polyphron-AI fork                                                 | Pulse relationship         |
| -------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| Oh My Pi | [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi/releases) | [Polyphron-AI/oh-my-pi](https://github.com/Polyphron-AI/oh-my-pi) | First-party provider       |
| Orca     | [stablyai/orca](https://github.com/stablyai/orca/releases)       | [Polyphron-AI/orca](https://github.com/Polyphron-AI/orca)         | Workspace design reference |

GitHub links each organization fork to its official parent. Official repositories remain the
release authorities because GitHub Releases are not copied into forks. The organization forks are
review and porting targets.

## Check for new releases

Run:

```sh
vp run releases:check-upstreams
```

The command checks the official latest-release endpoint and confirms that each Polyphron-AI fork
still points to the expected parent. It accepts `GITHUB_TOKEN` to avoid anonymous GitHub API rate
limits.

For machine-readable output:

```sh
vp run releases:check-upstreams --json
```

For a future scheduled workflow that should fail when a release has moved past the checked-in
cursor:

```sh
vp run releases:check-upstreams --json --fail-on-update
```

Update the `observedTag` and `observedAt` fields in
`scripts/check-upstream-releases.ts` only after reviewing the upstream release. Set `reviewedTag`
only when the relevant compatibility evidence exists.

## Sync the porting forks

Fast-forward either fork from its linked parent with GitHub CLI:

```sh
gh repo sync Polyphron-AI/oh-my-pi
gh repo sync Polyphron-AI/orca
```

Do not use `--force` after downstream review branches or commits exist. Release detection does not
depend on fork synchronization because it reads the official repository.

For OMP, review provider discovery, model catalog, ACP lifecycle, cancellation, approvals,
credentials, isolated text generation, and `omp update`. For Orca, review changes that affect the
Pulse workspace model, worktrees, runs, gates, diffs, remote state, or OMP coordination.

Synchronizing a fork does not merge anything into Pulse Code. Port upstream changes through a
normal Pulse feature branch and focused tests.
