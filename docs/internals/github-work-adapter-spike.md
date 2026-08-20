# GitHub work adapter spike

This spike tests the provider-neutral integration lifecycle against the existing GitHub CLI,
repository, pull-request, permission, and rate-budget implementation. It does not ship a GitHub
Issues adapter or UI.

## Recommendation: reshape, then run a read-only proof

Do not add GitHub work items directly to the Pulse Issues adapter and do not treat pull requests as
generic tickets. The shared connection/health/mapping/error seam survives this second-provider test,
but the first GitHub slice should be a separate read-only `GitHubIssueCli`/domain adapter for one
mapped repository. Build it only after the transport bridge and shared-server connection ownership
gap have explicit owners.

The minimum proof is repository Issues list/detail, not GitHub Projects v2. Projects v2 adds owner,
project-number, GraphQL pagination, field configuration, and `read:project` scope semantics before the
basic host/account/repository lifecycle has been proven.

## Existing evidence

| Concern              | Existing implementation                                                                                                                                                     | Adapter consequence                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-owned auth    | `sourceControl/GitHubCli.ts` runs `gh` only on the owning server and maps missing CLI, authentication, rate-limit, not-found, decode, and command failures to typed errors. | Reuse the server process boundary. Project only viewer/host/configured state; never return a `gh` token or auth file.                                                                  |
| Host/account health  | `pullRequest/GitHubPullRequestCli.ts#getViewerLogin` calls `gh api user --jq .login`; repository reads always name the host.                                                | One lifecycle connection is host-scoped. Account hint is the viewer login; endpoint hint is the host URL. GitHub Enterprise must remain first-class.                                   |
| Repository identity  | Pull-request service resolves provider, host, and canonical repository identity from each Pulse Code project.                                                               | Map `ProjectId` to owner/repository. Use owner as `providerWorkspaceId` and owner/repository as `providerProjectId`; do not guess from display text when canonical identity is absent. |
| Permissions          | GitHub pull-request provider combines repository role, viewer authorship, and action-specific answers immediately before writes.                                            | Connection capability is not permission for every repository. `work.write` must be checked per mapped repository/action, not inferred from successful authentication.                  |
| REST/CLI rate limits | Pull-request service wraps provider calls in host-scoped `SourceControlRateLimit`, with exponential cooldown from 30 seconds to 15 minutes and interactive reserve bypass.  | Reuse one `github + host` lease for Issue reads/writes so a second adapter cannot evade existing cooldown.                                                                             |
| GraphQL budget       | `githubGraphQlBudget.ts` observes query cost and protects a 10% reserve; manual action checks can opt into that reserve.                                                    | Any later Projects v2 or GraphQL Issue read must use this budget instead of issuing raw `gh api graphql` calls.                                                                        |
| Bounded decoding     | Pull-request JSON has operation-specific decoders, page ceilings, diff byte ceilings, thread-page ceilings, and typed invalid-response errors.                              | Add dedicated GitHub Issue schemas and explicit page/detail bounds. Do not reuse PR or Pulse Issue wire shapes.                                                                        |
| Private input        | User-authored queries, comments, reviews, and GraphQL variables travel on stdin because argv is visible in process listings and errors.                                     | Keep search text and future Issue mutation bodies on stdin/body files. Never place them in argv or diagnostic detail.                                                                  |

## Proposed lifecycle mapping

| Shared field            | GitHub projection                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providerId`            | `github`                                                                                                                                                      |
| `connectionId`          | Stable host-scoped ID; include account identity only if multi-account switching becomes supported.                                                            |
| `accountHint`           | Authenticated viewer login from `gh api user`.                                                                                                                |
| `endpointHint`          | `https://<host>` (or the normalized Enterprise host origin).                                                                                                  |
| `credentialConfigured`  | `true` only after a successful authenticated health check; no credential reference/value crosses the adapter.                                                 |
| `providerWorkspaceId`   | Repository owner/organization login.                                                                                                                          |
| `providerProjectId`     | Canonical `owner/repository`; repository is the first mapping unit.                                                                                           |
| connection capabilities | `work.read`, `code.read`, `workspace.read`; add `work.write` only when the adapter can truthfully support a checked action path.                              |
| health errors           | Missing `gh` → unavailable; unauthenticated → reauthorization required; rate limit → rate limited; decode → invalid response; missing repo/Issue → not found. |

The existing `gh` credential is externally managed by the CLI, not copied into
`ServerSecretStore`. This is still a server-owned execution boundary, but the connection record must
declare the secret reference as externally managed or null. On shared servers it is currently an
environment-admin/OS-user connection, not a per-Pulse-Code-user OAuth connection.

## Minimum Issue read proof

Create a provider-domain module beside the existing GitHub pull-request adapter; do not modify
`GitHubPullRequestCli` to absorb Issues.

1. Validate a canonical host plus `owner/repository` mapping.
2. Health-check with the existing authenticated viewer call.
3. List at most 50 Issues for the mapped repository with stable number, title, state, URL,
   `updatedAt`, bounded labels, and bounded assignee summaries.
4. Read one Issue by number with the same identity fields and a bounded body. Exclude comments,
   events, Projects v2 fields, attachments, and cross-linked evidence from the first detail.
5. Carry provenance as host + owner/repository + Issue number + source URL + fetched/updated times.
   A bare Issue number is never globally stable and must not be used without repository identity.
6. Translate CLI/provider failures into `IntegrationOperationError` without raw stderr or command
   causes.
7. Run all reads through the existing host cooldown; use GraphQL budget only if a field cannot be
   obtained through the bounded CLI/REST response.

Candidate calls are `gh issue list --repo <host>/<owner>/<repo> --limit 51 --json ...` and
`gh issue view <number> --repo ... --json ...`. Exact fields and decoders belong in the proof and
must be fixture-tested before use. The extra list row is the truncation signal.

## First action candidate

Close/reopen is the smallest reversible GitHub Issue mutation, but it should not ship in the
read-only proof. A later action adapter must:

- re-read repository permission and current Issue state immediately before execution;
- preview exact repository, number, before/after state, and source URL;
- consume a one-time expiring confirmation token;
- re-read `updatedAt` before writing and return `stale_version` when it changed;
- acknowledge that GitHub Issue updates do not provide the same atomic numeric version precondition
  as Pulse, so a final provider race remains possible and must be documented in the receipt;
- return a success/failed audit receipt and never blind-retry a write.

This difference is provider semantics, not a reason to add a universal version field or weaken
Pulse's optimistic version check.

## Concepts that must stay provider-specific

- Issue number, open/closed state, labels, milestones, assignees, reactions, and Projects v2 fields.
- Repository role versus per-action permission, viewer authorship, organization policy, and
  Enterprise host behavior.
- GitHub search qualifiers, REST/GraphQL pagination, node IDs, rate cost, and API scopes.
- Pull requests remain in the existing change-request domain; GitHub Issues do not inherit PR
  review, diff, merge, or thread semantics.
- Pulse Reports, evidence ingestion, severity, triage states, and fix-thread records remain in the
  Pulse Issues domain.

## Abstraction verdict

The demonstrated lifecycle boundary is viable for a second provider: host/account health, explicit
project mapping, bounded capabilities, provenance, typed errors, and confirm-before-write receipts
all transfer. Two reshapes are required before build:

1. Add an explicit externally-managed credential mode/metadata rule so a `gh` profile is represented
   honestly without a fake `ServerSecretStore` reference.
2. Resolve connection ownership for shared servers; the active OS user's `gh` account must not be
   silently presented as every paired user's personal connection.

After those gates and the shared transport bridge, build the read-only repository Issues proof.
Stop if canonical repository mapping cannot remain environment/project scoped, or if health must
expose CLI credential material. Do not promote GitHub Issues or Projects UI based on this spike
alone; provider-demand evidence is still required.

## Verification targets

- `apps/server/src/sourceControl/GitHubCli.test.ts`
- `apps/server/src/sourceControl/githubGraphQlBudget.test.ts`
- `apps/server/src/sourceControl/SourceControlRateLimit.test.ts`
- `apps/server/src/pullRequest/GitHubPullRequestCli.test.ts`
- `apps/server/src/pullRequest/GitHubPullRequestProvider.test.ts`

---

**Created:** 2026-08-20 . **Last opened:** 2026-08-20 . **Last edited:** 2026-08-20 . **Status:** discovery complete . **Owner:** Engineering
