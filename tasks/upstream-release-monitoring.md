# Monitor OMP and Orca releases

Run this task from the Pulse Code repository root. It checks public release metadata and GitHub
fork ancestry. It must not change repository or GitHub state.

## Run the check

Execute:

```sh
vp run releases:check-upstreams --json --fail-on-update
```

Capture the JSON written to standard output and the command exit code. The command uses
`GITHUB_TOKEN` when the host already provides one. Never print, inspect, or modify that token.

## Classify the result

- `NO_CHANGE`: every result has `ok: true`, `releaseState: "current"`, and
  `forkState: "linked"`.
- `REVIEW_REQUIRED`: at least one result has `releaseState: "update-available"`.
- `MONITOR_ERROR`: a result has `ok: false`, a fork has `forkState: "mismatch"`, the command
  produces no usable JSON, or the check cannot reach GitHub.

`compatibilityState: "unreviewed"` is informational. Never describe an upstream release as
compatible unless the checked-in registry says `reviewed`.

## Report

Start the reply with exactly one status name: `NO_CHANGE`, `REVIEW_REQUIRED`, or `MONITOR_ERROR`.

For `NO_CHANGE`, list the current OMP and Orca tags and confirm that both fork links are intact.
Keep the reply under 80 words.

For `REVIEW_REQUIRED`, include the project name, observed tag, latest tag, publication time,
official release URL, fork repository, and compatibility state. State that a maintainer must
review the release before advancing the cursor or porting changes.

For `MONITOR_ERROR`, include the affected project and the exact error or fork-parent mismatch.
Recommend rerunning the check after access or repository ancestry is fixed.

Do not paste the complete JSON unless it is needed to explain malformed output.

## Safety limits

Do not edit `observedTag` or `reviewedTag`. Do not sync either fork, modify code, commit, push,
open an issue or pull request, merge, or deploy. Those actions require a separate maintainer-run
review after the monitor reports `REVIEW_REQUIRED`.
