# Complete v40 through upstream domain batches

The user approved dependency-complete upstream batches, followed by restoration
of Pulse-specific behavior at explicit interfaces and combined review. The goal
is coverage of every source in the pinned v40 inventory, not another fixed-size
shortlist. The target remains `09e8de9c655ae85410bf6b00446f272a01da81c7`.
Starting Pulse revision: `470d6081de81dc7672314957c717714c6f3a9b46`.

## Scope and completion

The canonical ledger starts with 267 ported-reviewed, 772 needs-disposition,
nine partially-ported and six target-files-identical rows. All 1,054 sources
remain in scope. The 787 rows outside ported-reviewed need further implementation,
semantic review, policy resolution or acceptance, according to their actual gaps.
File identity alone is not semantic acceptance. Earlier partial rows sometimes
mix implementation and native acceptance; review their evidence before changing
their status, and retain acceptance gaps separately when justified.

Source coverage can come from an ordered import, a reviewed target-domain
implementation, or demonstrably equivalent Pulse behavior. Superseded patches
do not need to be replayed into obsolete code. Do not mark a row complete only
because its files appeared in an imported batch. Preserve declared Pulse policy
differences; analytics transmission, mutable upstream metadata ownership,
repository trust lists and release destinations require an explicit decision
where they conflict with Pulse policy. Do not silently copy upstream identities
or opt users into external data flows.

Stable promotion, publishing, deployment, live database writes and provider login
or real-turn acceptance are not authorized by this import campaign. Integrate
reviewed results locally into `release/pulse-preview-v040-batch7-20260910` while
preserving its existing voice and Office edits. Keep isolated test environments.

## Coverage routing at the starting revision

These mutually exclusive counts route all 787 unresolved rows. They are not
dependency-complete batches or effort estimates. A contracts/client-runtime row,
or a row touching multiple runtime apps, goes into the cross-client group first;
otherwise the runtime app, shared package, documentation or repository owner
determines its group. The canonical ledger remains the source list.

| Routing group              | Sources |
| -------------------------- | ------: |
| Cross-client and contracts |     128 |
| Web                        |     329 |
| Server                     |     112 |
| Mobile                     |      82 |
| Desktop                    |      24 |
| Shared packages            |      19 |
| Marketing                  |      17 |
| Tooling and repository     |      74 |
| Documentation only         |       2 |

## Execution loop

Current batch state and resume actions live in the authoritative
[progress JSON](../internals/t3-upstream-progress.json). Its
[Markdown index](../internals/t3-upstream-progress.md) is generated. This plan owns
the preservation requirements and scope decisions; update the JSON rather than
maintaining another live status list here.

Use the [batch execution policy](../internals/t3-upstream-import-playbook.md#batch-execution-policy)
now. The domain's final state is the engineering and review unit; source rows
remain the coverage unit. Prepare the next batch during implementation or review,
keep overlapping implementations sequential, and restore Pulse against the ordered batch's
final state. Independent combined review gates integration. Start the next import
from the preceding reviewed integration checkpoint and record its actual base.
Record shared batch evidence once and link supported ledger rows to it.

At adoption of this policy, terminal rendering/streaming has been integrated and
its eight source rows reviewed. Favicon implementation is frozen at `d612517ec`
with 121 focused tests reported passing. That policy-adoption checkpoint preceded
independent combined review. Consult the progress JSON for subsequent review and
integration status. This historical checkpoint does not close favicon rows or
change the campaign's scope.

1. Select a coherent module or cooperating module set from the unresolved rows.
2. Freeze the source set in upstream dependency order. Check prerequisite changes
   and later fixes against the final target, including already-reviewed sources.
   Path overlap and independent merge conflicts are only screening hints.
3. List Pulse behavior that must survive and its preservation tests. Prefer
   importing the shared implementation first where the existing interface works.
   Extract Pulse policy only where a real ownership difference requires it.
4. Keep upstream provenance, Pulse repairs and tests in distinguishable commits.
   Verify the combined behavior once using focused tests and affected package
   checks. No repository-wide test or typecheck runs.
5. Sol independently reviews the complete selected source obligations and Pulse
   preservation. Astra decides architecture and import strategy. The primary
   agent integrates and performs relevant real-client checks.
6. Update only supported ledger rows, with assessment revisions and evidence.
   Audit the source set, counts, revision ancestry and unchanged classifier
   snapshot. Integrate reviewed commits into the preview candidate.
7. Continue with the next unresolved domain. Record actual blockers and explicit
   Pulse policy differences instead of treating a clean build as full coverage.

The [import playbook](../internals/t3-upstream-import-playbook.md) supplies the
decision-record template and measured lessons. The existing 794-row classifier
snapshot remains historical and unchanged. It must not be mistaken for current
pending counts or a proven dependency graph.

## First domain

Finish terminal rendering and streaming as a cooperating module set. Inspect
clipboard selection, mouse motion reports, live link resolution, hidden rendering,
buffer rollover, metadata scans and obsolete link helpers together. Preserve
Pulse's shared multi-click interval, terminal selection actions, bounded retained
history, persistence ordering and environment-scoped local/remote PTY transport.
Rollover includes client-runtime and mobile integration; do not stop at the web
renderer. The exact source set and proof belong in the domain review document
before implementation.

## Approved execution queue

The user approved independent parallel domains in separate worktrees. Astra's
desktop error-predicate pair has no shared-file, contract, settings or runtime
dependency overlap with utilities9. It may run alongside utilities. PR/settings
remain in the shared sequence. The primary agent alone updates campaign metadata.

### Independent desktop error predicates, two sources

`a9caf7b7089afb6f1b3b888ea404b75b8f9e88e1 56a2f42b8ce27f5deefaa85a02ae9c1d3b61f309`

Delete source-defined unused Schema.is exports and their test-only assertions in
ElectronDialog, ElectronTheme, ElectronUpdater, ElectronWindow,
DesktopServerExposure, DesktopIpc, BrowserSession and DesktopUpdates. Astra's
consumer search found only definitions and test callers. Recheck that at the
actual base. Preserve error classes, payloads, cause chains, Pulse window identity,
update channels and exposure behavior. No extraction or native launch is needed.
Run those eight focused desktop tests, desktop typecheck and changed-file lint.
Record evidence in `docs/internals/v40-desktop-predicates-review-2026-09-12.md`.

These source sets are frozen in upstream order. Selection is not semantic closure.
Sources already reviewed supply prerequisites; their Pulse adaptations must remain.
No batch below claims to finish every feature in its broad product category.

### Terminal rendering and streaming, eight sources

`21e80a06 592c5983 883e1a3c da7e46d0 5eab021a fec606f9 07fb04dc 6615d3d7`

Use ordered imports and narrow restoration. Prior Shift, grapheme, snapshot and
server history changes are reviewed. Keep Pulse's shared multi-click interval.
Hidden terminals continue parsing and answering VT queries, then render the
current state on reveal without hidden autofocus. Preserve terminal metadata
ordering, tie-breaking, environment independence, subscription lifetimes and
collectability. Rollover includes shared runtime, web and mobile. Keep unrelated
ChatView, drawer and terminal-link changes out. Close confirmation, focus hints,
panel grouping, mobile clipboard/GhosttyKit and truecolor remain separate.

Run focused Ghostty, terminal-links and terminalSessions web tests, shared
terminalSession tests, and mobile menu/buffer replay/launch-context tests. Check
the three affected packages. Evidence:
`docs/internals/v40-terminal-domain-review-2026-09-12.md`.

### Shared host classification and favicon behavior, three sources

`b6f72681 3e544f8c 748fe0f8`

Use the source's shared hostClassification extraction and favicon eligibility,
with narrow web/mobile integration. Preserve resolver compatibility exports,
Pulse environment routing, private/Tailscale/mapped-IPv6 handling, explicit and
themed provider icons, project favicon persistence and existing shape behavior.
Mobile must suppress private-host requests and reset failed-host state when the
host changes. Keep Pulse markdown, feed and link actions.

Run shared hostClassification/favicon, web resolver/favicon/ChatMarkdown/
PreviewFaviconIcon and focused mobile fallback regressions. Typecheck shared,
web and mobile. Do not replace whole feed or markdown files from the target.

### Shared command lookup and utility interfaces, nine sources

`c3cacead 1568b3fd aca2afc0 c6410d37 da1bebbb 1584076d cb58dfd6 86f07996 2c301fd0`

The shell sources complete its selected history after reviewed Windows PATH
repair and ordering fixes. The remaining sources remove unused viewport/preview/
mention/Clerk helpers, make settings/ranking helpers private, and correct the
cloudflared validation subcommand. A production consumer search found only
owning-module uses of the affected shared helpers. Adapt tests through public
behavior. Broad cleanup `0671e342` remains excluded.

Preserve first-entry PATH precedence, quoting, case-sensitive directory variants
on Windows, executable extensions, cache and login-shell capture. Preserve Pulse
settings/model fields, PULSE_CODE_CLOUDFLARED_PATH precedence, legacy fallback and
branded errors. Run shell, previewViewport, preview, composerTrigger, serverSettings,
relayAuth, searchRanking and relayClient test files, shared types and changed-file
lint. There are nine sources but eight distinct focused test files. No new
abstraction is justified.

### PR browsing, detail and read freshness, 29 sources

Astra revalidated this source set after favicon integration at `a291b1775`.
No additional production prerequisite was identified. Keep `3c73fa7c` before
`110bbe6b` for targeted refresh and refreshed-atom deduplication. The optional
checkout field and Bitbucket mapping from `9fdafdf1` are partly present; verify
generic service projection and checkout UI rather than replaying supported pieces.
Retain favicon privacy when adding reference autolinks, and confirm `#123` is a PR
before intercepting issue navigation. Confirmed-merge and held-summary protection
already exist; neither `98a29cba` nor a settlement rewrite is required.

`apps/web/src/state/pullRequests.test.ts` does not yet exist. Add focused refresh
coverage if needed; do not report this planned path as a test already executed.

```text
26af903b a850895f 229b05df 7068e86f ebb9b9fd
cefec32d e9c4775e 42a8fd51 3c73fa7c 9fdafdf1
0681d854 57a66608 1eb36b45 2a3cfe45 0bc59bba
48ba76bc 645d5854 493fbb58 373be93e 0869ad64
95103905 a76b898b 91c66ac4 110bbe6b 931d41f9
e5a87e8b ea0487cc ba873b81 4e59b06b
```

Adopt the selected PR list/detail and read-state behavior, restoring Pulse
composition. Structural prerequisites for thread linkage, filters, API reuse,
workflow actions, cached chrome, labels, shared state, refresh, browser destination
and persistent diff layout are already reviewed. The checkout contract source
adds an optional field; apply its complete provider/client obligation.

Preserve named filters and author/label preference persistence in existing
PullRequestNamedFilters and preference helpers. Preserve environment-scoped facets,
Pulse merge-ready ranking alongside upstream authored-first/diff-size ordering,
workflow/revert actions, labels, documents/media, browser preference and thread
links. Keep confirmed-merge validation and all excluded service behavior.

Exclude settlement/event-store changes, visibility leases, relay renewal, mixed
usage/settlement, diff-tree/highlighter changes, global loading restyles, segmented
controls and broad export cleanup. Do not overwrite the whole PullRequestService.

Run web pullRequest module tests, PR state/open-link/right-panel tests; shared PR
state tests; server PullRequestService/Bitbucket JSON/GitHub GraphQL budget tests;
and contracts pullRequest tests. Add saved-filter navigation, scoped facets,
ranking ties and stale in-flight result preservation cases as needed. Run scoped
checks in affected packages. Estimated medium-to-high effort, not measured yet.

### Settings navigation and provider editor, 30 sources

The [settings preparation handoff](../internals/v40-settings-preparation-2026-09-12.md)
records exact existing boundaries, focused tests and required preservation cases.

Astra revalidated this batch at `7b4dcead3`. Before `009c13fa`, adopt the narrow
core keybindings guard and regression from
`ce8ca5bb3d005d8653d1b09c1e7c9e02d3ef8ae4`. The full source also wires sidebar
terminal-focus hooks and their test. Keep its ledger obligation partial unless
those remaining behaviors are separately imported and reviewed.

Reviewed machine icons, enabled-state, custom model definitions, shared defaults
and load balancing provide existing prerequisites. Antigravity retains its prior
partial status and runtime acceptance gap. The audit of 72 touched TypeScript
paths found no other selected-behavior prerequisite. WorkspacePageContainer
`d7abd7f3`, grouped rename helper `e67074f8`, mobile Uniwind/voice context and
terminal close/grouping context are excluded neighboring changes, not reasons
to adopt whole target files. Revalidate this decision at the actual post-PR base.

```text
fda740ad 36f4314a 07f8027d 549201fc e2d4d12a
f276e632 be218ac7 5e63aea2 c50b0b4e ff93aba6
a1a2bb1c 6effe0a2 b59b7d0a 829c3db9 343db2c3
d7884ce9 2b10398c 082cab22 8357eef1 76494650
2e61301b 4d3907f6 896fe82f 07d2497d bc8584bf
009c13fa 54441e63 3be90ced a9fc4dc2 45387700
```

Adopt selected navigation/search/provider-editor behavior through existing
ProviderSetupSection, McpSettingsPanel and ManagedSkillsPanel composition. Retain
Pulse Office, Talk, scheduler, ORCA and other commands, pulseSettingsSearch,
Pulse Connect wording, configured provider paths, explicit model choices, MCP
defaults, managed skills and usage controls. Preserve requested environment and
instance ownership, including visibly unavailable missing environments rather than
fallback. Keep readonly remote, hosted pairing and desktop-local gates.

Apply clone-default and machine-icon sources across mobile/shared consumers.
Apply keyboard changes across every touched caller, not just settings. Reuse the
already extracted ExpandableText module. Do not replace whole ChatView,
SettingsPanels or CommandPalette files with upstream versions.

Exclude shared-preference sync, auto-settle defaults, usage-control relocation,
installer ownership, global loading/notice restyles, segmented controls, mobile
Uniwind and broad export cleanup. Preserve current behavior at those joins.

Run focused command-palette/settings/keybinding/provider-instance/provider-model/
readiness web tests, shared project operations tests, and mobile project-selection/
environment-presentation tests. Add preservation cases for missing targeted
environments, readonly setup, enabled state and instance-targeted setup links.
Retain pulseSettingsSearch coverage. Check web, shared runtime and mobile types.
Estimated high effort, mainly Pulse navigation and configuration restoration.
