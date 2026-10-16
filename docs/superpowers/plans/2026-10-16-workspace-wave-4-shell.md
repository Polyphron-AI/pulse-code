# Wave 4: Shared workspace shell implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch the nine stable task IDs individually. W4-T4 is a family, not a dispatchable task.

**Goal:** Build the common workspace navigation, headers and independently selected project resource frame shown in all eight mockups. Preserve the reviewed B-2026-10-16-001 correction. Give every later wave one deterministic, isolated sample-data and capture interface.

**Architecture:** Keep environment-owned links, queries, permissions and project records authoritative. The shell composes presentational navigation, a per-space rail, a split or full-width center and one resource body. Resource selection is view state independent of selected-item context. Keep the existing query atoms and change subscriptions. Dev fixtures inject in-memory module boundaries into the same presentation components before the live application boots. They never initialize live connections. No product module registry, second link graph or new shell RPC is needed.

**Tech Stack:** TypeScript, React 19, TanStack Router, Effect atoms through existing client-runtime bindings, Tailwind semantic theme tokens, Base UI primitives, lucide-react, vite-plus/test, react-test-renderer and happy-dom for interaction tests. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-14-unified-workspace-design.md`, especially A12 and A13; `docs/superpowers/workspace-mockups/mockup-waves/wave-map.md`, shared sections and Wave 4. Main plan `docs/superpowers/plans/2026-10-14-unified-workspace.md:17-32,6494-6526` supplies the baseline and global constraints. A13 and the corrected wave map win over the original four-column and 20/80 wording.

**Mockups:** All paths are under `docs/superpowers/workspace-mockups/mockups/`: `01-email-files.png`, `02-communications-files.png`, `03-tasks.png`, `04-projects.png`, `05-browser-module.png`, `06-agents-module.png`, `07-meetings-notes.png`, `08-calendar-tasks.png`.

**Execution root:** `C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace`, branch `qb/feat-unified-workspace`. Source anchors below were read on 2026-10-16 at `6363a7913b` plus the correction. During writing, the shared checkout advanced to `d82b8004cca208df753e74e90c82fa94a69f0540`, which commits that same correction and both regression tests. W4-T0 is therefore an idempotent checkpoint verification plus remaining reference preparation. Re-read anchors when taking a task, since preceding tasks move lines. This document authorizes planning only. This writer performed no implementation, account operation, capture or commit.

## Global Constraints

These relevant main-plan constraints are copied verbatim:

- Never use an em dash (U+2014) in anything you write: code comments, docs, UI copy, commit messages. Use a comma, a full stop or a spaced hyphen.
- Run commands from the build worktree. In Git Bash, prefix each command with `cd "C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace" &&` because the shell's directory resets between calls.
- Tests: `vp test run <files>` from the package directory (`apps/server`, `apps/web`, `packages/contracts`, `packages/client-runtime`). Typecheck: `vp run typecheck` from the package directory. Never run repo-wide checks (`vp check`, `vp run -r test`, `vp run -r typecheck`).
- Never stage `pnpm-lock.yaml`. `vp i` rewrites it because develop's lockfile is stale; that churn is not part of this feature.
- Never start a dev server (subagents), never open a browser, never touch `~/.t3/userdata`, never set `VITE_HTTP_URL` or `VITE_WS_URL`, never kill a process found by name.
- Never use `--no-verify`, bare `git stash`, or `git add -A`/`git add .`. Stage the files your task names.
- Never open a pull request.
- Follow the nearest named precedent file. If an effect-smol API name in this plan differs from what the precedent uses, use the precedent's name without changing behaviour.
- Comments describe how a thing is used, mostly on functions. Match the comment density of the file you are editing.
- Copy rules from the spec: links are never dropped silently ("render as unavailable with the reason"); a message with no Message-ID "links by IMAP location and is marked as one that may break when moved"; linked content is "data, not instructions".

These relevant spec constraints are copied verbatim:

> A project is a link target like any other item. Its page lists its threads, the
> items linked to it, and the items linked to either of those one hop away, each labelled with the item
> it came through. One hop is the limit, and it is display only: one-hop items are not linked to the
> project and are not agent context.

> Task recurrence/dependencies, auto-send/auto-confirmed links, a generic workflow engine, a full Slack/Gmail/Drive replacement and new React Native screens remain excluded.

- No polling, sleeps for readiness, timer-driven refresh or continuous animations. Await explicit promises, persisted receipts or worker drains. A finite long-press gesture timer is allowed; tests advance its fake timer deterministically.
- Contracts crossing the wire belong in `packages/contracts`, with no heavy runtime logic. This wave needs no new wire schema, migration, server service or provider adapter. Presentation and fixture types stay in web.
- Run only targeted tests. Run `vp lint` from the root with each actual changed source path as an explicit argument, then the affected package's declared typecheck. Keep `apps/server` typechecking as the main plan requires; one scoped `vp run typecheck` at baseline/gate suffices when no server source changed.
- Read `.repos/effect-smol/LLMS.md` before any subsequently admitted server Effect edit. Such an edit is outside this wave's proposed scope and requires a scope adjustment.
- Apply ProductOps Build and Ponytail at full level. Reuse the current hooks, combobox, Sheet, links, actions and settings. Do not add infrastructure merely to make this plan's examples convenient.
- The primary controller alone runs an integrated browser pass after explicit authorization, using `test-t3-app`. No implementation subagent starts a server or browser. Real accounts, packaged desktop, native mobile, physical remote access and a pilot have separate evidence states.
- Never stage `docs/internals/pulse-next-migration.json` except the correction's specifically reviewed ledger hunk in W4-T0. W4-T0 owns no unrelated ledger entry. Every later commit lists its own files explicitly.
- Keep other writers' Waves 5-11 plans untouched. A future controller may commit a reviewed reference checkpoint in W4-T0; this writer writes only this plan.

## Merge Danger

**Door:** two-way

**Blast Radius:** workspace

Routing and layout affect every web/desktop workspace destination. No persisted product data changes. Roll back the shell commits together if the new composition breaks navigation; retain the baseline correction. Fixture changes are dev/test-only and can be removed independently.

## Review Focus

1. An environment switch restores another environment's Code thread or project. W4-T1 `workspaceNavigation.test.ts` covers A/B scoped return; W4-T4a `workspaceResourceState.test.ts` covers equal project IDs, deleted selections and late responses.
2. Resources silently becomes selected-item context, grants access or links on browsing. W4-T4a `WorkspaceResourcesPanel.test.tsx` asserts zero writes through picker/tab actions. W4-T4b `WorkspaceLinkedContext.test.tsx` exercises confirmed, suggested and one-hop distinctions.
3. Resize mounts two tool bodies or loses the active browser lease/draft. W4-T6 `WorkspaceShell.integration.test.tsx` measures active subscriptions and retained draft through 390/768/1024/1279/1280 transitions.
4. Fixture entry accidentally boots live RPC/auth, advances its date or ships in production. W4-T7 `workspaceMockupFixtures.test.ts`, `workspaceMockupEntry.test.tsx` and `workspaceMockupBuild.test.ts` cover clock, side-effect boundaries and production module exclusion.
5. A pending picker or context menu acts on a newly selected item. W4-T5 `WorkspaceItemActions.test.tsx` opens an action for A, changes selection to B, resolves the deferred picker and checks A's exact environment/ref/origin. Also test cancel and revoked permission.

## Rendered look reference

Read the PNG yourself before implementing a task. All boxes are `[x,y,width,height]` in CSS pixels at 1280x800, scale 1, zoom 100%. Corrected inventory authority is `mockup-waves/gap-shell.md:15-107`, supplemented by the named module inventories. Colors and type below are design estimates, not claims of extracted source tokens. Use these as the pinned target values through feature-scoped semantic aliases; do not change global Code tokens to force one screenshot.

Use Segoe UI, system-ui, sans-serif on the Windows capture host, normal letter spacing. Record the actual resolved font and OS. Main foreground `#f0f0f0`, secondary `#86868a`, faint `#626268`, action blue `#3268ff`. Sidebar `#050505`, center `#090909`, rail/resources `#101010`, breadcrumb `#0d0e15`, border `#1c1c20`, active neutral row `#232323`, selected navy `#162139`. Borders are 1px. No card shadows or repeated animation.

| Region, owner              | Box                 | Full rendering requirement                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary sidebar, W4-T2     | `[0,0,207,800]`     | Border at x206. Sidebar ends at x207 in Workspace mode; no separate 64px global rail. Empty black area below Settings. Keep Code's resizable sidebar independent.                                                                                                                                                               |
| Brand, W4-T2               | `[0,0,207,44]`      | Static blue grid/glow brightest around x150,y0, fading right/down. Reuse existing backdrop with a workspace variant. `PanelLeftClose`, 12px, at x16,y16. `Pulse Next` sample or `Pulse Code` live at x42 baseline y22, 11px/500. Sidebar toggle remains actionable and named.                                                   |
| Mode, W4-T1/T2             | `[7,44,193,26]`     | Border `#202024`, radius 9. Two equal segments, left selected with subtle fill. `BriefcaseBusiness` plus `Office` in fixture, `Workspace` live; `Code2` plus `Code`. Type 10px/600, icons 12px. Current mode exposes pressed/current state.                                                                                     |
| Workspace entrance, W4-T2  | `[7,79,193,27]`     | Briefcase at x13,y87, 12px; `Workspace` at x32 baseline y92, 11px muted. Goes to Projects with current environment.                                                                                                                                                                                                             |
| Section, W4-T2             | `[13,123,190,14]`   | Fixture `Office`, live `Workspace`, 10px regular muted. About 17px separation after Workspace entry.                                                                                                                                                                                                                            |
| Six destinations, W4-T1/T2 | `[7,141,193,171]`   | Rows y141,170,199,228,257,286, each 26px high with 3px gap. Exact order Communications, Meetings, Calendar, Email, Tasks, Projects. Icons MessagesSquare, Mic, CalendarDays, Mail, ListTodo, Folder at x13; labels x32. Inactive 11px/400 `#99999b`; active 11px/600 `#ededed`, fill `#232323`, radius 6. Exactly one selected. |
| Settings, W4-T2            | `[7,325,193,27]`    | Settings icon and label, same muted row styling, extra 13px after Projects. Opens existing Settings. Do not pin to bottom.                                                                                                                                                                                                      |
| Breadcrumb, W4-T3          | `[207,0,1073,26]`   | One bar across rail, center and resource column. 9px text begins x220 baseline y14. Sample `SynKEK workspace / <space>`. Right `Design preview · sample data`, blue 8px/500, right inset 13px. Truncate environment segment first, retain current space and accessible full name.                                               |
| Space rail, W4-T2          | `[207,26,52,774]`   | Fine right border. First icon pill `[215,38,36,27]`, navy, radius 13, blue 14px glyph. Labels centered x233 around baselines y75,126,179, 8px. Second and third icons near y104/157. No counts. Idle gray; selected label white/600. Compact targets expand to 44px.                                                            |
| Engagement header, W4-T3   | `[259,26,681,52]`   | Bottom border y77. Title x275 baseline y46, 13px/600. Subtitle x275 baseline y64, 10px muted. One header spans list and detail. Resources `[822,39,74,26]`, Folder 13px, label 11px/600, transparent. Sample MC avatar `[904,42,19,19]`, navy circle, blue 8px initials.                                                        |
| Center below header, W4-T3 | `[259,78,681,722]`  | Email and Communications only: list `[259,78,170,722]`, divider at x429, detail `[430,78,510,722]`. Resize hit area overlays divider without adding 4px to the width budget. Tasks/Projects/Meetings/Calendar use full 681px; no empty list allocation.                                                                         |
| Project header, W4-T4a     | `[940,26,340,52]`   | Fine left border. Picker `[953,38,278,28]`, icon Folder blue 13px at x957, `SynKEK` x976, 11px/600, small ChevronDown after text. Trigger has transparent fill. X glyph around x1250,y48, 10px with a 28px target. No Context heading or origin line here.                                                                      |
| Resource tabs, W4-T4a      | `[947,84,320,51]`   | Six 52px-wide tiles with about 2px gaps, height 44px. Icons centered near y97, 12px; labels baseline y117, 9px. Files/Folder, Browser/Globe, Agents/Bot, Tasks/ListTodo, Docs/FileText, PRs/GitPullRequest. Selected navy radius 12, blue glyph/text. One selected tile matching mounted body. Separator y134.                  |
| Resource body, W4-T4a      | `[940,135,340,633]` | Independent vertical scroll, 13px horizontal inset where module uses it, 314px content width. Exactly one lazy body. Shell adds no nested card, tool heading or second project selector around module output.                                                                                                                   |
| Resource footer, W4-T5     | `[940,768,340,32]`  | Top border, static 5px dot x953,y782, text x964 baseline y786, 8px gray. Settings glyph x1258,y780, 10px, within a larger hit target. Footer remains outside body scroll. Safe-area padding is additional on compact clients.                                                                                                   |

### Per-PNG shell state

| Recipe | Active destination; breadcrumb | Rail order and icons                             | Title; subtitle                                     | Correct resource tab                        |
| ------ | ------------------------------ | ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------- |
| 01     | Email; Email                   | Inbox/Inbox, Unread/Bell, Later/Bookmark         | Inbox; maya@synkek.com                              | Files                                       |
| 02     | Communications; Communications | Chats/MessageSquare, Unread/Bell, Later/Bookmark | # marketing; SynKEK · Slack · 8 members             | Files, correcting source Browser highlight  |
| 03     | Tasks; Tasks                   | All tasks/ListTodo, Open/Clock, Done/Check       | Tasks; A clear plan for everything that comes next. | Files                                       |
| 04     | Projects; Projects             | Projects/Folder, Linked/Link                     | Projects; SynKEK · Brand & growth                   | Files                                       |
| 05     | Communications; Communications | Same three controls as 02                        | Same as 02                                          | Browser, correcting source Agents highlight |
| 06     | Communications; Communications | Same three controls as 02                        | Same as 02                                          | Agents, correcting source Files highlight   |
| 07     | Meetings; Meetings             | Upcoming/CalendarDays, Recordings/Mic            | Meetings; SynKEK · Brand & growth                   | Docs, launch-review note                    |
| 08     | Calendar; Calendar             | Agenda/CalendarDays, Week/PanelsTopLeft          | Calendar; SynKEK · Brand & growth                   | Tasks                                       |

First rail entry is selected in every recipe. No badge on All tasks, Open, Done, Inbox, Unread or Later. Schedule exists in both 07 and 08 at `[847,102,76,24]`; their date chips belong inside the full center, not a shell list column. W6 owns behavior and exact subtitles. All eight show open Resources at `fixture-synkek`.

The seed freezes the 07 body subtitle `Prepare, meet and follow through.` and the 08 body subtitle `Your week · 12 – 18 October 2026`. Both date headings are `Tuesday, 13 October`; chips are `M 12`, `T 13`, `W 14`, `T 15`, `F 16`, `S 17`, `S 18`, with T 13 selected. The date-range separator here is U+2013, matching source copy; authored prose never uses U+2014.

### Module boundaries visible inside the frame

These details set the shell's padding and fixture obligations; they do not transfer module implementation to Wave 4.

- 01-04 Files begins with `[953,149,314,29]` search, `Search in Drive`, radius 16. Breadcrumb baseline y205 `Project Drive > SynKEK`; Type/People controls y229; headings y275; eight 43px rows through y634. Four folders SEO/Marketing/Website/Products, followed by four Docs. Only Marketing's folder glyph is blue because a confirmed project-folder relation exists, D29. W7 owns the explorer.
- 05 Browser uses the same search bounds with `Search or enter a URL` and a `[953,191,314,312]` site card. Exact body `Meet the new collection. Thoughtful products, made for everyday life.` includes the comma. W10 owns the body. Fixture content is inert local markup, never a request to synkek.com.
- 06 Agents has no search. Heading `Project agents` x953 baseline y159, subtitle `General agents assigned to SynKEK` y178. Three rows at y218/303/388, monograms Sa/Ce/Wd, static dots, `Open conversation →`. W10 owns their real thread identity.
- 07 Docs begins `[953,148,314,20]`, `Launch review · Meeting notes`; card `[953,178,314,345]`, 16px title, 10px body, headings/list. Comment after divider y536. W6 supplies native-note identity; W8 owns formatted rendering/comments. No editor or recording target is pictured.
- 08 Tasks begins x953 baseline y158 `Project tasks`, subtitle `SynKEK · 4 open` y178. Five 59px rows, four unchecked and final checked. W5 owns completion. 03's corresponding center list uses x275..923 and has a LayoutGrid Board icon. No rail badges.

### Sample-to-live substitutions

| Element          | Sample fixture                                           | Live                                                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand/mode/group | Pulse Next; Office / Code; Office                        | Pulse Code; Workspace / Code; Workspace, D25. Preserve Code controls.                                                                                                                                                                                          |
| Breadcrumb       | SynKEK workspace                                         | Selected environment display name, otherwise Workspace. Never infer organization from email or project.                                                                                                                                                        |
| Marker           | Design preview · sample data on every recipe             | Hidden. Never claim sample status for real data.                                                                                                                                                                                                               |
| Avatar           | MC, accessible Maya Chen                                 | Configured environment-owner initials and name only. Hide when unset. W5-T3 supplies the future owner source; W4 must accept absent owner without inventing identity. No profile menu.                                                                         |
| Footer           | Blue dot; Sample project connections                     | Connected only with known supported health for every included source; Unavailable when a known source failed; otherwise neutral dot and Connection status unavailable. Empty/unknown sets are unknown, not connected. Never probe providers to fill this text. |
| Gear             | Selected fixture project settings, in-memory             | Existing ProjectWorkspaceSettings with captured environment/project. Account management remains its explicit Settings route.                                                                                                                                   |
| Files sentence   | Shared with the SynKEK team. Files stay in Google Drive. | Files stay in Google Drive. unless complete provider sharing metadata supports a more specific claim, D11.                                                                                                                                                     |
| Channel count    | 8 members, complete source metadata in fixture           | Show only a source-reported complete/fresh count, D26. No roster/history fanout.                                                                                                                                                                               |

### V1 and unpictured states

Use dark, en-GB, Africa/Johannesburg, fixed `2026-10-13T10:30:00+02:00`. Named boundaries, row pitch, insets and control bounds must be within 2 CSS px; type sizes within 1px. Copy, wrapping, icon type/order and selection must match the corrected fixture. Compare side-by-side crops and an overlay/difference. Exclude text antialiasing only from geometric measurement. Record D03, D25 and D28 departures; do not mask whole controls. A changed host/font requires a reviewed rebaseline.

Hover uses a weaker neutral tint than selection; keyboard focus uses the existing visible ring. Errors use role=alert and a bounded Retry action. Project-picker empty copy is `No matching projects.`; no-project body is `Choose a project to see its resources.`; deleted selection is `This project is unavailable.` and keeps the explicit picker. These are proposed states and require review. Resources closed, Linked context, open picker/menu, Code, 1024px and 390px layouts have no original PNG target. Capture and review them separately. A light-theme smoke check is separate from dark PNG acceptance.

## Task order and ownership

Run W4-T0 first. W4-T7 may then establish the fixture interface; functional W4-T1 can start from T0, but no visual verdict precedes T7 readiness. Shell file serial chain is W4-T1 -> W4-T2 -> W4-T3 -> W4-T4a -> W4-T4b -> W4-T5 -> W4-T6. W4-T6 is the wave gate, not an extra renamed task. Reserve the global RPC/migration slot only if scope is explicitly expanded; none of the planned shell tasks needs it. Preserve all earlier and concurrent edits.

For new files below, line range is `new`; existing ranges refer to the inspected baseline. Commit steps are future implementation instructions, not actions for this plan-writing pass. Use conventional titles and truthful model/harness attribution under the active delivery rules; the original main plan's fixed Claude attribution is historical and is not evidence of who implements this wave.

### Task W4-T0: Commit B-2026-10-16-001 shell correction

**Files:** Reviewed correction modifications `apps/web/src/components/workspace/ProjectsNav.tsx:23-137`, `ProjectsSpace.tsx:78-305`, `WorkspaceEngagement.tsx:7-125`, `WorkspaceSpaceSelector.tsx:10-164`, `WorkspaceSpaceSelector.test.tsx:1-45`, `WorkspaceToolsPanel.tsx:30-168`, `mail/LinkedSection.tsx:36-96`, `mail/MailNav.tsx:24-130`, `mail/MailSpace.test.tsx:1-151`. Include currently untracked `apps/web/src/components/workspace/ProjectsNav.test.tsx:1-92` and `WorkspaceEngagement.test.tsx:1-45`. Correction-only docs/ledger hunks: `docs/user/workspace-spaces.md:1-69`, spec A12 at `:367-380`, main plan Wave 3b at `:6494-6496`, `docs/internals/pulse-next-migration.json:21-62`. Do not absorb other active ledger entries.

**Interfaces:** Consumes the reviewed working-tree diff and audit `.superpowers/sdd/2026-10-14-unified-workspace/presentation-audit-2026-10-16.md:39-49`. Produces a recorded baseline commit SHA containing both regression tests and a reviewed reference checkpoint SHA for isolated children. No API changes.

**Depends on:** Existing correction review and its required checks. **Serial slot:** Controller-only baseline preparation before any isolated implementation. **Risk:** workspace, two-way.

Current checkpoint observed by this writer: `d82b8004cca208df753e74e90c82fa94a69f0540`, title `fix(web): keep workspace context sidebar and project picker in reach`. Its twelve-file list contains the eleven web source/tests below and `docs/user/workspace-spaces.md`. Both formerly untracked tests are committed. Do not create a duplicate correction commit, amend it or restage those files. The staging fallback below applies only if resuming on an earlier parent where this checkpoint is absent. Spec/plan/ledger and tracked reference preparation remain separate reviewed work.

- [ ] Check `git merge-base --is-ancestor d82b8004cca208df753e74e90c82fa94a69f0540 HEAD` and `git show --format= --name-only d82b8004cc`. If present with the verified twelve-file set, record its full SHA and skip correction staging/commit below. Retain the focused checks required by the current controller; historical passing checks are not a new execution receipt.

- [ ] Inspect `git diff -- apps/web/src/components/workspace` and read both untracked tests. Limit the future staged diff to the eleven files listed here. Compare with the audit and the ledger's B-2026-10-16-001 entry. Separate A13/later-wave planning hunks from A12 correction hunks. Do not stage the whole ledger or whole main plan by default.
- [ ] Run from `apps/web`:

  ```text
  vp test run src/components/workspace/ProjectsNav.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx src/components/workspace/WorkspaceSpaceSelector.test.tsx src/components/workspace/mail/MailSpace.test.tsx src/routes/-_chat.workspace.test.ts src/components/workspace/mail/linkedItems.test.ts
  vp run typecheck
  ```

  Expected exit 0, including the existing Projects linking regression and single-tool regression. This is a baseline-preservation task, so do not invent a failing test or new production behavior to manufacture red. A failure blocks dispatch until diagnosed against the reviewed diff. Run server package `vp run typecheck` once and record its result.

- [ ] Run targeted lint on the eleven explicit web paths and `git diff --check`. Reuse the audit's prior build/render evidence as historical evidence only. If a new build is required by active delivery policy, run web `vp run build` and distinguish incumbent warnings.
- [ ] Stage only the reviewed correction, with this explicit future command list. Select only correction hunks in the interactive docs step. Inspect `git diff --cached --name-only` and `git diff --cached` before committing. Never stage an ignored audit blindly or stage another writer's output.

  ```text
  git add -- apps/web/src/components/workspace/ProjectsNav.tsx apps/web/src/components/workspace/ProjectsSpace.tsx apps/web/src/components/workspace/WorkspaceEngagement.tsx apps/web/src/components/workspace/WorkspaceSpaceSelector.tsx apps/web/src/components/workspace/WorkspaceSpaceSelector.test.tsx apps/web/src/components/workspace/WorkspaceToolsPanel.tsx apps/web/src/components/workspace/mail/LinkedSection.tsx apps/web/src/components/workspace/mail/MailNav.tsx apps/web/src/components/workspace/mail/MailSpace.test.tsx apps/web/src/components/workspace/ProjectsNav.test.tsx apps/web/src/components/workspace/WorkspaceEngagement.test.tsx
  git add -p -- docs/user/workspace-spaces.md docs/superpowers/specs/2026-10-14-unified-workspace-design.md docs/superpowers/plans/2026-10-14-unified-workspace.md docs/internals/pulse-next-migration.json
  git commit -m "fix(web): preserve workspace navigation and context"
  ```

- [ ] Prepare a separate reviewed reference checkpoint, before isolated children start, containing the main plan's A13/Wave 4+ handoff, this per-wave plan, A13 spec and the reference bundle. List all eight PNG paths, seven `gap-*.md` files, `wave-map.md`, `review-fidelity.md`, `review-feasibility.md`, and `writer-brief.md` individually in its staging command. Exclude presentation HTML and PR-only evidence. Commit only the approved named planning inputs, title `docs(workspace): record reviewed mockup implementation inputs`. If Waves 5-11 plans are still being written, leave those paths out and do not stage their partial content.

  ```text
  git add -- docs/superpowers/plans/2026-10-14-unified-workspace.md docs/superpowers/plans/2026-10-16-workspace-wave-4-shell.md docs/superpowers/specs/2026-10-14-unified-workspace-design.md docs/superpowers/workspace-mockups/mockups/01-email-files.png docs/superpowers/workspace-mockups/mockups/02-communications-files.png docs/superpowers/workspace-mockups/mockups/03-tasks.png docs/superpowers/workspace-mockups/mockups/04-projects.png docs/superpowers/workspace-mockups/mockups/05-browser-module.png docs/superpowers/workspace-mockups/mockups/06-agents-module.png docs/superpowers/workspace-mockups/mockups/07-meetings-notes.png docs/superpowers/workspace-mockups/mockups/08-calendar-tasks.png docs/superpowers/workspace-mockups/mockup-waves/gap-shell.md docs/superpowers/workspace-mockups/mockup-waves/gap-tasks-calendar.md docs/superpowers/workspace-mockups/mockup-waves/gap-meetings-notes.md docs/superpowers/workspace-mockups/mockup-waves/gap-projects-docs-prs.md docs/superpowers/workspace-mockups/mockup-waves/gap-email-files.md docs/superpowers/workspace-mockups/mockup-waves/gap-communications.md docs/superpowers/workspace-mockups/mockup-waves/gap-browser-agents.md docs/superpowers/workspace-mockups/mockup-waves/wave-map.md docs/superpowers/workspace-mockups/mockup-waves/review-fidelity.md docs/superpowers/workspace-mockups/mockup-waves/review-feasibility.md docs/superpowers/workspace-mockups/mockup-waves/writer-brief.md
  git commit -m "docs(workspace): record reviewed mockup implementation inputs"
  ```

- [ ] Verify the resulting baseline contains each regression and asset, for example:

  ```text
  git cat-file -e HEAD:apps/web/src/components/workspace/ProjectsNav.test.tsx
  git cat-file -e HEAD:apps/web/src/components/workspace/WorkspaceEngagement.test.tsx
  git cat-file -e HEAD:docs/superpowers/workspace-mockups/mockups/08-calendar-tasks.png
  git log -2 --oneline
  ```

  Record both SHAs in the implementation handoff. No staging or commit is permitted during this writer assignment.

- [ ] Surface checklist: entry points preserve existing Code/Workspace, Projects picker and folder-only Mail; clients web/desktop and compact web retain the correction; native receives no new screen; all providers retain existing behavior; contracts unchanged; close/open and link/unlink remain; local/remote environment scoping retained; docs correction hunks included only as reviewed.
- [ ] Visual acceptance: no rendered delta or fresh screenshot gate. Reference all PNGs `[0,0,1280,800]`, `gap-shell.md:15-107`. Future visual tasks depend on W4-T7. Do not report this task as full shell parity.

### Task W4-T7: Isolated sample fixture and eight capture recipes

**Files:** Create `apps/web/src/components/workspace/dev/workspaceMockupFixtures.ts`, `workspaceMockupFixtures.test.ts`, `workspaceMockupEntry.tsx`, `workspaceMockupEntry.test.tsx`, `WorkspaceMockupApp.tsx`, `workspaceMockupBuild.test.ts`, all new. Modify the five-line `apps/web/src/bootstrap.ts:1-5` to branch before importing main. Create module-local dev adapters below and `docs/superpowers/workspace-mockups/capture-recipes.md`, new. Existing bootstrap precedent is its guarded `import("./main")`; production entry is `apps/web/index.html:491` via bootstrap, not a new public route.

**Interfaces:** Consumes the corrected eight inventories and PNGs. Produces the exact fixture interface below, owned by T7. These are proposed web dev/test names, not new RPC contracts. Domain workers translate seed data into their own contract shapes in their adapter; never change production schemas to accommodate sample data.

**Depends on:** W4-T0. **Serial slot:** Fixture/bootstrap files exclusively; later tasks editing shared presentational shell files follow the shell chain. **Risk:** web, two-way. No filesystem or network boundary is admitted.

#### Stable fixture interface for Waves 5-11

Export these declarations from `workspaceMockupFixtures.ts`:

```ts
import type { ReactNode } from "react";
import type { EnvironmentId, ProjectId, WorkspaceItemRef } from "@t3tools/contracts";

export type WorkspaceMockupId = "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08";
export type WorkspaceMockupArea =
  | "mail"
  | "communications"
  | "tasks"
  | "projects"
  | "drive"
  | "calendar"
  | "notes"
  | "browser"
  | "agents";
export type WorkspaceMockupTab = "files" | "browser" | "agents" | "tasks" | "docs" | "prs";
export type MockupMutation =
  "link" | "unlink" | "save" | "send" | "schedule" | "join" | "open-thread";
export interface WorkspaceMockupRecipe {
  readonly id: WorkspaceMockupId;
  readonly png: string;
  readonly route: string;
  readonly space: "mail" | "communications" | "tasks" | "projects" | "meetings" | "calendar";
  readonly view: string;
  readonly resourceTab: WorkspaceMockupTab;
  readonly selectedKey: string | null;
  readonly requiredAreas: readonly WorkspaceMockupArea[];
  readonly corrections: readonly ("D03-mail-sender" | "D03-tab" | "D28-date-copy")[];
}
export interface WorkspaceMockupSession {
  readonly id: WorkspaceMockupId;
  readonly environmentId: EnvironmentId;
  readonly resourceProjectId: ProjectId;
  readonly recipe: WorkspaceMockupRecipe;
  readonly clock: { readonly now: () => Date; readonly today: () => "2026-10-13" };
  readonly locale: "en-GB";
  readonly timeZone: "Africa/Johannesburg";
  readonly seed: WorkspaceMockupSeed;
  readonly operations: ReadonlyArray<{
    readonly kind: MockupMutation;
    readonly item: WorkspaceItemRef | null;
    readonly value: string | null;
  }>;
  readonly record: (kind: MockupMutation, item?: WorkspaceItemRef, value?: string) => Promise<void>;
  readonly settled: () => Promise<void>;
  readonly dispose: () => void;
}
export interface WorkspaceMockupModule {
  readonly area: WorkspaceMockupArea;
  readonly readyRegions: readonly ("center" | "resource")[];
  readonly incompleteRegions?: readonly string[];
  readonly settled: () => Promise<void>;
  readonly center?: ReactNode;
  readonly resource?: ReactNode;
  readonly dispose: () => void;
}
export type CreateWorkspaceMockupModule = (
  session: WorkspaceMockupSession,
) => WorkspaceMockupModule;
```

`WorkspaceMockupSeed` is an exported readonly object type with the exact properties and record fields in the seed table below. Arrays use readonly element interfaces without literal-length constraints. It is not `unknown`, `any`, a copy of future RPC responses or a mutable global. Export `workspaceMockupRecipes: Readonly<Record<WorkspaceMockupId, WorkspaceMockupRecipe>>`, `createWorkspaceMockupSession(id: WorkspaceMockupId): WorkspaceMockupSession`, `parseWorkspaceMockupRequest(url: URL, dev: boolean): WorkspaceMockupId | null` and `createWorkspaceMockupSeed(): WorkspaceMockupSeed`. Declare the seed interface before annotating the factory, avoiding a circular ReturnType definition.

Every domain adapter exports `createWorkspaceMockupModule: CreateWorkspaceMockupModule`. T7 creates the initial adapters with `readyRegions: []`, no live imports and no fabricated completed module. They can expose their in-memory query/mutation fake from the same file as their module lands. Use one fixed import list inside the dev-only entry, not a runtime-discovered product registry. The nine adapter files are:

| Path relative to `apps/web/src/components/workspace/` | Owner after W4-T7    | Completion it contributes                                |
| ----------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `mail/dev/workspaceMockupModule.tsx`                  | W11                  | 01 center                                                |
| `communications/dev/workspaceMockupModule.tsx`        | W9                   | 02/05/06 center                                          |
| `tasks/dev/workspaceMockupModule.tsx`                 | W5                   | 03 center and 08 resource                                |
| `projects/dev/workspaceMockupModule.tsx`              | W8                   | 04 center                                                |
| `drive/dev/workspaceMockupModule.tsx`                 | W7                   | 01-04 resource                                           |
| `calendar/dev/workspaceMockupModule.tsx`              | W6                   | 07/08 center                                             |
| `notes/dev/workspaceMockupModule.tsx`                 | W6, then W8 serially | 07 Docs identity/plain note, then formatted card/comment |
| `browser/dev/workspaceMockupModule.tsx`               | W10                  | 05 resource                                              |
| `agents/dev/workspaceMockupModule.tsx`                | W10                  | 06 resource                                              |

Each module uses the same presentation component as live mode with injected module-local fake reads/commands. It must not mount a live-connected container and then mask its requests. A component needing extraction gets a small presentational view in its owning wave. Shell T3/T4 similarly give `WorkspaceMockupApp` their actual navigation/header/resource presentation components. Until then the entry displays a marked readiness report and selected recipe, not a screenshot facsimile. The final rendered mockup never uses a PNG or HTML screenshot as its UI.

#### Exact seed data and identities

Use environment `fixture-environment`, resource project `fixture-synkek`, secondary projects `fixture-pulse-website`, `fixture-brand-studio`. Brand and mode are sample-only. Use factory-local arrays and new Date objects, reset on every recipe load. No shared mutation survives Reset or navigation to another fixture recipe.

| Seed property and required record fields                                                                               | Exact values and relationships                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `people`: id, name, initials, role, source                                                                             | `maya`/Maya Chen/MC/Admin/Slack; `leo`/Leo Martins/LM/Member/Slack; `nina`/Nina Patel/NP/Member/Slack; `alex`/Alex Morgan/AM/Member/Slack. Display fixture coworkers only. Header owner Maya.                                                                                                                                                                                                                                                                                                                                                                                          |
| `projects`: id, title, description, channelCount, memberCount                                                          | SynKEK, `Brand, website and growth marketing`, 4, 8; Pulse website, `Shared team workspace`, 2, 4; Brand studio, same description, 2, 4. All sample `Drive linked`; complete provider count metadata. No Pulse role grants.                                                                                                                                                                                                                                                                                                                                                            |
| `mail`: id, messageId, accountId, folder, uid, uidValidity, fromName, fromAddress, subject, preview, displayTime, body | Five stable rows `mail-1`..`mail-5`; Message-IDs `<fixture-1@synkek.invalid>`..5; account `fixture-mail-maya`, folder INBOX, uid 1..5, uidValidity 1. Account address maya@synkek.com. Selected first row Nina Patel/nina@synkek.com, D03 correction from source Maya. Subjects in order `SynKEK · October launch review`, `Your updated homepage designs`, `SEO report: September results`, `Product shoot · final selects`, `Weekly marketing catch-up`. Remaining senders Leo, Nina, Alex, Maya. Preview `Thanks team, sharing the latest ...`. First time 10:24, others Yesterday. |
| `channels`: id, title, group, knownUnread, memberCount                                                                 | GENERAL team-updates/design/random; SynKEK marketing/website/seo/product-launch. Marketing id `slack-marketing`, 3 known unread in loaded page, 8 members complete/fresh at fixed clock. DIRECT MESSAGES Maya/Leo/Nina with matching people IDs. No live Slack grant implied.                                                                                                                                                                                                                                                                                                          |
| `messages`: id, channelId, personId, displayTime, text, replyIds, fileId                                               | Four top-level ids `message-1`..4, marketing, maya/leo/nina/maya, 09:12/09:18/09:24/10:04. First links `doc-strategy` with two explicit reply records `reply-1`,`reply-2`. Marker at message-1 leaves three known unread. Exact text below.                                                                                                                                                                                                                                                                                                                                            |
| `tasks`: id, projectId, title, area, dueDate, personId, completed                                                      | ids `task-1`..5, all SynKEK. Approve homepage copy/Marketing/2026-10-13/maya/false; Review October keyword plan/Website/2026-10-16/leo/false; Prepare product launch assets/Marketing/2026-10-16/nina/false; Publish campaign landing page/Website/2026-10-16/alex/false; Share weekly performance report/Marketing/2026-10-16/maya/true. Same objects feed 03 and 08; open total 4.                                                                                                                                                                                                   |
| `drive`: rootId, connectionId, folders, documents, confirmedFolderId                                                   | root `drive-synkek`, connection `fixture-drive`, confirmed folder `folder-marketing`. Folder record id/title/modified: folder-seo/SEO/2026-10-10, folder-marketing/Marketing/2026-10-11, folder-website/Website/2026-10-12, folder-products/Products/2026-10-13. Document ids doc-strategy/doc-calendar/doc-brand/doc-checklist; titles Q4 marketing strategy/October content calendar/Brand guidelines/Website launch checklist; modified 12/11/10/9 Oct. Folder children arrays empty until a module's own browse test supplies them.                                                |
| `events`: id, title, start, durationMinutes, source, attendeeIds, description, joinUrl, noteId                         | ids event-standup/event-review/event-handoff; Tuesday 2026-10-13 at 09:00/14:00/16:30 +02:00; Marketing stand-up/30/Google Calendar; SynKEK · Launch review/45/Google Meet; Website design handoff/30/Google Calendar. All attendees maya/leo/nina. Review description `Campaign readiness, homepage feedback and remaining launch tasks.` Others no description. All noteId note-launch-review. Join URLs https://meet.example.invalid/standup, /review, /handoff, intercepted by fake shell, never opened.                                                                           |
| `note`: id, title, projectId, sharingCount, body, comments                                                             | note-launch-review, `Launch review · Meeting notes`, SynKEK, 8 complete fixture-only sharing metadata. Markdown exact headings/list below. One comment id comment-nina, person nina, exact body below.                                                                                                                                                                                                                                                                                                                                                                                 |
| `agents`: threadId, projectId, title, monogram, status, activity                                                       | thread-seo/thread-content/thread-website, SynKEK, SEO analyst/Sa/working/Reviewing keyword opportunities; Content editor/Ce/idle/Ready for your next instruction; Website developer/Wd/idle/same. Opening records open-thread only. Status never launches a process.                                                                                                                                                                                                                                                                                                                   |
| `browser`: url, title, heading, body, actionLabel                                                                      | https://synkek.example.invalid/, SynKEK, `Built for\nwhat's next.`, `Meet the new collection. Thoughtful products, made for everyday life.`, Explore products. Display footer `synkek.com · Website preview` is fixture artwork copy; no DNS request or iframe.                                                                                                                                                                                                                                                                                                                        |
| `links`: id, a, b, status, origin, source                                                                              | Confirmed project-to-folder-marketing, marketing-message-1-to-doc-strategy, each agent-thread-to-project, review-event-to-note. Use real WorkspaceLinkEndpoint/ref shapes when adapters translate. Include one separate dismissed and one suggested URL in functional-only context scenarios; omit them from untouched PNG recipes. Fixed origin time and viewing endpoint survive unlink/relink.                                                                                                                                                                                      |

First mail body is exactly:

```text
Hi team,

We're ready for the October launch review. I've updated the marketing strategy and added
the final product assets to our shared folder.

Could you take a look at the homepage copy and leave your feedback before Thursday? The
SEO plan is ready for sign-off too.

Everything is in the SynKEK Drive. Please use the shared files so we're all working from the
same version.

Thanks,
Nina
```

Store paragraphs without visual line breaks inside each paragraph; wrapping belongs to the real reader. Recipient display is `to Maya, Leo, me · 10:24 AM`. Selected reader and list share the first stable Message-ID. Empty reply, `Reply to Nina, Maya and Leo`, `Write your reply...`, sample `Send demo` and `Attach from project Drive` are W11 presentation expectations.

Communication texts, in order:

```text
Morning team! The October campaign is ready for review. I've added the strategy and launch checklist to our project Drive.
Homepage is looking good. The new product section is ready for copy review.
I'll review the SEO titles this morning. Let's keep all feedback on the strategy doc so nothing gets lost.
Perfect. I've added the remaining actions to Tasks. We can go through them in our 14:00 catch-up.
```

The two collapsed reply bodies are not visible in the PNG. Seed deterministic text `Reply one for fixture review.` and `Reply two for fixture review.`, mark as functional-only content in the recipe document, and do not claim original copy. Doc metadata is `Google Docs · SynKEK / Marketing`. Composer `Message #marketing`, Plus, sample `Send demo`; no pending send.

Native note Markdown and comment:

```markdown
Our October focus is a clear product story, a faster website and campaigns that turn interest into action.

## Launch priorities

1. Finish the homepage and product copy.
2. Review SEO titles and search intent.
3. Align campaign assets with the product launch.

## Review & next steps

Maya owns final approval. Leo will publish the website after Thursday's review.
```

Comment `Looks good. Let's include the new keyword targets in the product pages.` Use real list semantics and shared renderer later. No production team/sharing inference follows from seed counts.

#### Capture and readiness interface

Export a test-only global from the dev entry, declared in that module only:

```ts
interface WorkspaceMockupCaptureApi {
  readonly configureCapture: (context: {
    readonly viewport: {
      readonly width: number;
      readonly height: number;
      readonly deviceScaleFactor: 1;
      readonly zoom: 1;
    };
    readonly resolvedFont: string;
    readonly os: string;
  }) => void;
  readonly reset: (id: WorkspaceMockupId) => Promise<void>;
  readonly ready: () => Promise<{
    readonly fixtureReady: true;
    readonly shellReady: boolean;
    readonly incompleteRegions: readonly string[];
    readonly manifest: WorkspaceMockupCaptureManifest;
  }>;
}
```

Attach it as `window.__workspaceMockupCapture` only inside the DEV branch. `reset` disposes mounted adapters, creates a fresh session, rerenders, and resolves after React's committed layout signals and every active adapter's `settled()` promise. It does not poll the DOM or wait for arbitrary durations. Concurrent resets are serialized; only latest generation can resolve as current. StrictMode may remount views; operations remain idempotent and cleanup leaves zero retained subscriptions. Dispose aborts in-flight fake work and clears closure-owned memory. No page reload, credential/cache reuse or real storage is required.

The capture controller calls configureCapture with its observed viewport/scale/zoom, resolved font and host OS before requesting a capture manifest. Reject unsupported scale/zoom or an unresolved font. Keep capture metadata through reset but recreate all product-like seed state. Before configureCapture, the dev page can show fixture readiness, but ready rejects a capture-manifest request with `Capture host metadata is required.` No manifest invents the host. The ready response's fixtureReady claim comes from seed validation, while incompleteRegions comes from actual module readiness. Count attempted application RPC/fetch/WebSocket/connector calls in networkRequests; same-origin Vite JS/CSS/font asset loading is outside that counter. A successful isolated manifest requires zero such application requests, including zero blocked attempts.

`WorkspaceMockupCaptureManifest` has exactly these fields: `version: 1`, `fixtureId`, `referencePng`, `route`, `viewport: { width, height, deviceScaleFactor: 1, zoom: 1 }`, `locale: "en-GB"`, `timeZone: "Africa/Johannesburg"`, `clock: "2026-10-13T10:30:00+02:00"`, `theme: "dark"`, `fontFamily`, `resolvedFont`, `os`, `selectedKey`, `resourceEnvironmentId`, `resourceProjectId`, `resourceTab`, `sampleMarker: true`, `corrections`, `incompleteRegions`, `readiness: "seed-only" | "shell" | "complete"`, `captureKind: "synthetic"`, `networkRequests: 0`, `pendingOperations: 0`. Measured host fields come from the capture controller; never manufacture them. Reject a final manifest missing measured font/OS or containing incomplete regions within the claimed crop.

`fixtureReady` means pinned seed/isolation/recipes pass. `shellReady` means W4 shell regions render with the actual shell components. `complete` means each required module region is ready, not merely mounted. For 07, plain note readiness from W6 cannot claim W8's formatted/comment crop. Record subregions `07.docs-format` and `07.docs-comments` until W8 supplies them. Shell crop claims can pass while module regions remain incomplete, but full-PNG parity cannot. Preserve D05/D06 held/live departures in live manifests separately.

Write these routes and exact capture selections in `capture-recipes.md`:

| ID  | Dev-only URL path/query                      | Selected key; resource state                                       | Required areas          |
| --- | -------------------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| 01  | `/workspace?space=mail&fixture=01`           | mail-1 stable message, INBOX, fixture-mail-maya; SynKEK/Files/root | mail, drive             |
| 02  | `/workspace?space=communications&fixture=02` | slack-marketing; SynKEK/Files/root                                 | communications, drive   |
| 03  | `/workspace?space=tasks&fixture=03`          | no task detail, All tasks; SynKEK/Files/root                       | tasks, drive            |
| 04  | `/workspace?space=projects&fixture=04`       | fixture-synkek card; SynKEK/Files/root                             | projects, drive         |
| 05  | `/workspace?space=communications&fixture=05` | slack-marketing; SynKEK/Browser, controlled inert site             | communications, browser |
| 06  | `/workspace?space=communications&fixture=06` | slack-marketing; SynKEK/Agents                                     | communications, agents  |
| 07  | `/workspace?space=meetings&fixture=07`       | Upcoming, 2026-10-13; SynKEK/Docs/note-launch-review               | calendar, notes         |
| 08  | `/workspace?space=calendar&fixture=08`       | Agenda, 2026-10-13; SynKEK/Tasks                                   | calendar, tasks         |

Document V1 settings, receipt-driven readiness, clearing hover/focus, selected refs, exact output naming `<id>-<width>x<height>.png` plus adjacent `.manifest.json`, and corrected PNG comparison boxes. Outputs go to a disposable worktree-local evidence directory chosen by the controller, never the production home. Do not accept a `homeDir`, SQLite path or external state path in any fixture API. A relative asset URL must stay in the dev entry; reject absolute/parent-traversal file paths rather than opening them.

#### Implementation cycle

- [ ] Add a failing `workspaceMockupFixtures.test.ts` against the declared factory. Use real test code:

  ```ts
  import { expect, it, vi } from "vite-plus/test";
  import {
    createWorkspaceMockupSession,
    parseWorkspaceMockupRequest,
  } from "./workspaceMockupFixtures";

  it("resets memory and keeps Tuesday fixed after host time advances", async () => {
    vi.useFakeTimers();
    try {
      const first = createWorkspaceMockupSession("08");
      vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
      expect(first.clock.now().toISOString()).toBe("2026-10-13T08:30:00.000Z");
      expect(first.clock.today()).toBe("2026-10-13");
      expect(first.seed.tasks.filter((task) => !task.completed)).toHaveLength(4);
      await first.record("send", undefined, "sample reply");
      await first.settled();
      expect(first.operations).toHaveLength(1);
      first.dispose();
      const next = createWorkspaceMockupSession("08");
      expect(next.operations).toHaveLength(0);
      next.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects production selectors and every external state path", () => {
    expect(
      parseWorkspaceMockupRequest(new URL("http://fixture.invalid/workspace?fixture=01"), false),
    ).toBeNull();
    expect(() =>
      parseWorkspaceMockupRequest(
        new URL("http://fixture.invalid/workspace?fixture=01&homeDir=C:/Users/qblaa/.t3/userdata"),
        true,
      ),
    ).toThrow("Fixture state is in memory only.");
  });
  ```

  Add cases for every recipe, fresh seed object identity, uid/Message-ID matching, four folders/four docs, Marketing confirmed relation, event/note refs, D03 tab corrections, invalid IDs and no unexpected `fixture` selector admitted into production search parsing.

- [ ] Run from `apps/web`: `vp test run src/components/workspace/dev/workspaceMockupFixtures.test.ts`. Expected red because the factory does not exist. Do not run product services to establish red.
- [ ] Implement the fixed clock and in-memory operation boundary with no live imports:

  ```ts
  const fixedInstant = "2026-10-13T08:30:00.000Z";
  const clock = {
    now: () => new Date(fixedInstant),
    today: () => "2026-10-13" as const,
  };
  const operations: Array<WorkspaceMockupSession["operations"][number]> = [];
  let disposed = false;
  const record: WorkspaceMockupSession["record"] = async (kind, item, value) => {
    if (disposed) throw new Error("Fixture session is disposed.");
    operations.push({ kind, item: item ?? null, value: value ?? null });
  };
  ```

  The factory combines this with a new seed, selected recipe, branded fixture IDs, immediate settled promise for synchronous work and dispose. Module adapters own Deferred/promise completion for their async fakes. Do not change global Date or patch production clocks. Views receiving dates use injected clock/locale/timezone, not ambient `new Date()`.

- [ ] Guard bootstrap before importing any live application module:

  ```ts
  import { showBootError } from "./lib/bootError";

  const fixtureRequested = new URL(window.location.href).searchParams.has("fixture");
  if (import.meta.env.DEV && fixtureRequested) {
    void import("./components/workspace/dev/workspaceMockupEntry")
      .then(({ startWorkspaceMockup }) => startWorkspaceMockup())
      .catch(showBootError);
  } else {
    void import("./main").then(({ startup }) => startup).catch(showBootError);
  }
  ```

  `startWorkspaceMockup(): Promise<void>` validates request, renders only the isolated dev app and its CSS/presentation imports, pins theme/locale, publishes readiness, and shows the sample marker. Invalid dev requests render an error and do not fall through to main. Production ignores/rejects the selector through normal route parsing and never imports the dev entry. It must not preserve `fixture` in product URLs.

- [ ] Add `workspaceMockupEntry.test.tsx` with happy-dom. Stub fetch, WebSocket, desktopBridge commands, shell.openExternal and process-send boundaries to throw on use; mock `./main` at bootstrap's actual import path with a spy. Import bootstrap in the fixture branch and await `startWorkspaceMockup`'s promise through a test export or module mock, then assert main was never imported and the marker appears for all eight reset results. Fire sample send/Join/Schedule actions after their adapters arrive and check operations only. No test opens a URL or talks to SMTP, OAuth, an agent or a real database.
- [ ] Add `workspaceMockupBuild.test.ts` using the installed Vite build API with `write:false`, `configFile:false`, the actual bootstrap.ts as input and production define `"import.meta.env.DEV": "false"`. Use a test build plugin to supply an inert main module and boot-error module only; do not replace bootstrap or the fixture import. Assert output module IDs exclude `/components/workspace/dev/` and all nine module adapters. Also inspect the actual `vp run build` web manifest/chunks once, searching for the sample marker and unique seed Message-ID. A string search alone is supplementary; excluded module IDs from the real entry are the test's core proof. Preserve the normal main import failure handling.
- [ ] Run from `apps/web`:

  ```text
  vp test run src/components/workspace/dev/workspaceMockupFixtures.test.ts src/components/workspace/dev/workspaceMockupEntry.test.tsx src/components/workspace/dev/workspaceMockupBuild.test.ts
  vp run typecheck
  vp run build
  ```

  Expected green and no fixture module/data in production chunks. Targeted lint all created TS/TSX paths and bootstrap. No server is required for these tests/build.

- [ ] Surface checklist: all eight dev routes reset explicitly; fixtures cover web/desktop presentation and compact web without native screens; Codex/Claude/Cursor/Grok/OpenCode/ACP are all non-running fakes; no wire contract change; reset/dispose reverses state; local/direct/relay/tunnel use the same fake session without real connections; docs are contributor capture recipes, not shipped user promises.
- [ ] Visual acceptance: establish seed/isolation readiness first. With future explicit browser authorization, capture all eight `[0,0,1280,800]` recipes, record missing module regions honestly, then let T3/T4 and later wave owners replace readiness-only regions with actual views. Compare only complete claimed regions under V1. No substitutions inside fixture crops except D03/D28 corrections recorded above. Capture 1024 and 390 separately as proposed adaptations. T7 readiness is a prerequisite, not a claim that all module screenshots passed.
- [ ] Commit these seventeen explicit files after inspecting the diff. Do not include another owner's later adapter changes.

  ```text
  git add -- apps/web/src/bootstrap.ts apps/web/src/components/workspace/dev/workspaceMockupFixtures.ts apps/web/src/components/workspace/dev/workspaceMockupFixtures.test.ts apps/web/src/components/workspace/dev/workspaceMockupEntry.tsx apps/web/src/components/workspace/dev/workspaceMockupEntry.test.tsx apps/web/src/components/workspace/dev/WorkspaceMockupApp.tsx apps/web/src/components/workspace/dev/workspaceMockupBuild.test.ts apps/web/src/components/workspace/mail/dev/workspaceMockupModule.tsx apps/web/src/components/workspace/communications/dev/workspaceMockupModule.tsx apps/web/src/components/workspace/tasks/dev/workspaceMockupModule.tsx apps/web/src/components/workspace/projects/dev/workspaceMockupModule.tsx apps/web/src/components/workspace/drive/dev/workspaceMockupModule.tsx apps/web/src/components/workspace/calendar/dev/workspaceMockupModule.tsx apps/web/src/components/workspace/notes/dev/workspaceMockupModule.tsx apps/web/src/components/workspace/browser/dev/workspaceMockupModule.tsx apps/web/src/components/workspace/agents/dev/workspaceMockupModule.tsx docs/superpowers/workspace-mockups/capture-recipes.md
  git commit -m "test(web): add isolated workspace mockup fixtures"
  ```

### Task W4-T1: Typed destinations and scoped mode return

**Files:** Modify `apps/web/src/routes/_chat.workspace.tsx:8-74`, `routes/-_chat.workspace.test.ts:1-65`, `components/workspace/WorkspaceSpaceSelector.tsx:10-164`, `WorkspaceSpaceSelector.test.tsx:1-45`, `OfficeWorkspace.tsx:18-107`, `components/CommandPalette.tsx:1891-1971`. Create `apps/web/src/components/workspace/workspaceNavigation.ts` and `workspaceNavigation.test.ts`, new. No changes to generated route tree are expected because the route path stays `/workspace`.

**Consumes:** Existing EnvironmentId, route href/search, explicit environment or active scoped Code environment, live capability flags. **Produces:** `WorkspaceDestination = "communications" | "meetings" | "calendar" | "mail" | "tasks" | "projects"`; `workspaceDestinations` fixed ordered data; `workspaceDestinationSearch(destination, environmentId): WorkspaceSearch`; `rememberCodeLocation(environmentId, href): void`; `codeReturnHref(environmentId): string`; `parseWorkspaceSearch` extended with validated destination-specific `view`. Keep `WorkspaceSearch` exported from its current route or re-export if moved to avoid a circular import.

**Depends on:** W4-T0, and T7 before visual claims. **Serial slot:** Shell chain first; owns CommandPalette edits until complete. **Risk:** workspace, two-way.

- [ ] Add route red cases using the existing vite-plus/test imports:

  ```ts
  it("keeps a canonical destination's environment and valid view", () => {
    expect(
      parseWorkspaceSearch({
        space: "tasks",
        view: "open",
        environment: "remote-a",
        project: "project-a",
      }),
    ).toEqual({ space: "tasks", view: "open", environment: "remote-a", project: "project-a" });
    expect(
      parseWorkspaceSearch({ space: "calendar", view: "open", environment: "remote-a" }),
    ).toEqual({ space: "calendar", environment: "remote-a" });
  });
  it("preserves legacy Telegram source identity through normalization", () => {
    expect(
      parseWorkspaceSearch({
        space: "office",
        officeView: "communications",
        communicationProvider: "telegram",
        environment: "remote-a",
        account: "bot-1",
        item: "bot-1/-42/2",
      }),
    ).toEqual({
      space: "communications",
      communicationProvider: "telegram",
      environment: "remote-a",
      account: "bot-1",
      item: "bot-1/-42/2",
    });
  });
  ```

  Cover mail/project legacy inputs, invalid types/lengths, empty space, unknown views and stripping fixture/resource-data selectors. Account/folder identity remains bounded text; mail item may retain its current 8192-byte string bound. Do not narrow Telegram IDs accidentally with a mail parser.

- [ ] In `workspaceNavigation.test.ts`, remember distinct Code hrefs for `EnvironmentId.make("a")` and `EnvironmentId.make("b")`; assert return A never yields B. Settings and `/workspace` must never be remembered as Code. Root fallback is `/` when that environment has no valid stored Code href. A deleted thread uses the router's existing unavailable handling, not a fallback to another thread.
- [ ] Run from `apps/web`: `vp test run src/routes/-_chat.workspace.test.ts src/components/workspace/workspaceNavigation.test.ts src/components/workspace/WorkspaceSpaceSelector.test.tsx`. Expected red on new canonical destinations and scoped return.
- [ ] Implement a closed route/view vocabulary and environment-scoped return memory:

  ```ts
  const views = {
    communications: ["chats", "unread", "later"],
    meetings: ["upcoming", "recordings"],
    calendar: ["agenda", "week"],
    mail: ["inbox", "unread", "later"],
    tasks: ["all", "open", "done"],
    projects: ["projects", "linked"],
  } as const;
  const codeLocations = new Map<EnvironmentId, string>();
  export function rememberCodeLocation(environmentId: EnvironmentId, href: string) {
    const url = new URL(href, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || href.startsWith("//")) return;
    if (url.pathname === "/workspace" || url.pathname.startsWith("/settings")) return;
    codeLocations.set(environmentId, `${url.pathname}${url.search}${url.hash}`);
  }
  export function codeReturnHref(environmentId: EnvironmentId) {
    return codeLocations.get(environmentId) ?? "/";
  }
  ```

  Restrict stored hrefs to recognized internal Code destinations using the current route resolver before calling remember. Pass the actual scoped Code environment, not only workspace search, since Code environment identity is in route params. Do not infer it from the last primary environment after a switch. Scope Workspace return similarly by environment; entering Workspace defaults to Projects and preserves the environment. Keep state session-local unless there is an existing storage need.

- [ ] Normalize old `office + officeView=communications` into canonical communications while preserving provider/account/item/environment. Keep bare `space=office` and its old hashes opening the existing legacy local Office view for backward compatibility. Do not list that legacy view as a seventh primary destination. Workspace mode entry and Open Workspace now go to Projects. Existing desktop Talk/Office controls remain reachable by the legacy route and a plainly named `Open local Office tools` palette entry. Canonical Meetings/Calendar availability must not silently open those local-only legacy tools.
- [ ] Route all six destinations through their present or explicit unavailable containers. Before W5/W6 exist, Tasks/Meetings/Calendar show `This view is not available on this server yet.` with their correct shell heading, plus the existing local-tools entrance where applicable. No calls to nonexistent RPCs, no auto-connect, no provider run. Later wave owners replace the center content only. Mail remains canonical `space=mail` with visible label Email.
- [ ] Update mode selector, OfficeSidebar links and six palette commands to use the same destination data/helper. Add functional selector tests by clicking destinations and asserting route changes and zero command writes. Exercise back/forward with a memory router, and switch environment before Code return. Preserve capabilities on old servers and current Mail/Telegram deep-link behavior. Do not add a new destination keybinding set; existing mode/navigation bindings retain their paths.
- [ ] Rerun the same three test files, expected green. Run `vp run typecheck` in web and targeted root lint for the eight owned files. Update test expectations for intentional canonical normalization; do not delete the legacy identity tests.
- [ ] Surface checklist: menu, mode switch, palette, URL and history share routes; web/desktop share implementation and phone menu closes after selection; native contracts decode unchanged; providers Codex/Claude/Cursor/Grok/OpenCode/ACP start no work on navigation; no contracts; Workspace/Code return reversible; local/direct/relay/tunnel and environment A/B use explicit identity; W4-T6 documents changed navigation.
- [ ] Visual acceptance: T7 recipes 01-08, `[0,0,259,800]`, `gap-shell.md:15-53`. Check exact row order, one selected destination, proper breadcrumb and 01 Inbox/Unread/Later. Only D25/live environment substitutions allowed. Legacy Office and Code states get proposed reviewed captures, not original-PNG parity claims.
- [ ] Future commit, explicit paths:

  ```text
  git add -- apps/web/src/routes/_chat.workspace.tsx apps/web/src/routes/-_chat.workspace.test.ts apps/web/src/components/workspace/workspaceNavigation.ts apps/web/src/components/workspace/workspaceNavigation.test.ts apps/web/src/components/workspace/WorkspaceSpaceSelector.tsx apps/web/src/components/workspace/WorkspaceSpaceSelector.test.tsx apps/web/src/components/workspace/OfficeWorkspace.tsx apps/web/src/components/CommandPalette.tsx
  git commit -m "feat(web): add scoped workspace destinations"
  ```

### Task W4-T2: Persistent navigation and per-space rail slots

**Files:** Modify `apps/web/src/components/AppSidebarLayout.tsx:228-377`, `components/sidebar/SidebarChrome.tsx:34-85`, `components/workspace/OfficeWorkspace.tsx:18-107`, `WorkspaceSpaceSelector.tsx:29-164`, `ProjectsNav.tsx:23-137`, `mail/MailNav.tsx:24-130`; selector tests `WorkspaceSpaceSelector.test.tsx:1-45` and `ProjectsNav.test.tsx:1-92` as needed. Create `WorkspaceNavigation.tsx`, `WorkspaceViewRail.tsx`, `WorkspaceNavigation.test.tsx`, all in `apps/web/src/components/workspace/`, new. Modify T7 `dev/WorkspaceMockupApp.tsx`. The shared ui/sidebar defaults are not to be changed for Code.

**Consumes:** T1 canonical destination/route helpers, existing SidebarProvider, MailNav accounts/folders, ProjectsNav combobox. **Produces:** `WorkspaceNavigation({ destination, environmentId, mode, onNavigate, children? })` presentation and `WorkspaceViewRail({ items, selected, onSelect })`, with `WorkspaceRailItem = { id: string; label: string; Icon: LucideIcon; unavailableReason?: string }`. Space owners supply rail semantics and optional account/folder popover; shell supplies placement. `WorkspaceSpaceSelector` becomes the two-mode control and does not recursively include WorkspaceNavigation.

`destination` is WorkspaceDestination, `environmentId` is EnvironmentId, `mode` is `"workspace" | "code"`, `onNavigate` accepts WorkspaceDestination and returns void. A separate `onModeChange(mode)` callback accepts that same two-value mode type. `children` is ReactNode for space-owned disclosures. The rail takes `items: readonly WorkspaceRailItem[]`, `selected: string`, `onSelect: (id: string) => void`. unavailableReason means visible explanation and no module RPC on activation.

**Depends on:** W4-T1 and W4-T7 for its dev-app integration file. T1's functional route work can precede T7. **Serial slot:** After T1; AppSidebarLayout/SidebarChrome/OfficeWorkspace/MailNav/ProjectsNav exclusive. **Risk:** workspace, two-way.

- [ ] Add `WorkspaceNavigation.test.tsx`, happy-dom. Render with a memory router and current SidebarProvider, click Meetings then Email then Projects and verify the same six destination links remain available, exactly one `aria-current=page`, and the route keeps `environment=a`. Test keyboard Enter/Space on a rail control and compact navigation dismissal. Test actual view navigation, not static markup or CSS class snapshots.

  ```tsx
  function NavigationProbe() {
    const [destination, setDestination] = useState<WorkspaceDestination>("projects");
    return (
      <>
        <WorkspaceNavigation
          destination={destination}
          environmentId={EnvironmentId.make("a")}
          mode="workspace"
          onModeChange={() => {}}
          onNavigate={setDestination}
        />
        <main aria-label="Current destination">{destination}</main>
      </>
    );
  }
  it("keeps all destinations while the user changes the current view", async () => {
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    await act(async () => root.render(<NavigationProbe />));
    await act(async () => getByRole(node, "link", { name: "Meetings" }).click());
    expect(getByRole(node, "main", { name: "Current destination" }).textContent).toBe("meetings");
    expect(getByRole(node, "link", { name: "Email" })).toBeDefined();
    expect(node.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    await act(async () => root.unmount());
    node.remove();
  });
  ```

  Import act/useState, createRoot, getByRole and branded IDs using the onboardingBrand.test.tsx precedent. The presentation component uses anchors with canonical hrefs and prevents default only when invoking injected onNavigate. Wrap the probe in SidebarProvider if its reused toggle needs that context. Router-level companion coverage verifies actual history/environment preservation, so this probe cannot substitute for route integration.

- [ ] Add a regression that opens the Mail account/folder disclosure from Email, selects Sent on the second account and observes account/folder route identity without any project list. Open Projects' searchable combobox, type a query, choose a result and retain the existing project row actions. A compact menu close must return focus to its trigger.
- [ ] Run from web: `vp test run src/components/workspace/WorkspaceNavigation.test.tsx src/components/workspace/WorkspaceSpaceSelector.test.tsx src/components/workspace/ProjectsNav.test.tsx`. Expected red because persistent navigation/rail do not exist.
- [ ] Implement composition, with the important width/order expressed directly:

  ```tsx
  <div className="flex min-h-0 min-w-0 flex-1">
    <nav
      aria-label="Workspace navigation"
      className="w-[207px] shrink-0 border-r border-sidebar-border bg-sidebar"
    >
      {navigation}
    </nav>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {breadcrumb}
      <div className="flex min-h-0 min-w-0 flex-1">
        <WorkspaceViewRail items={items} selected={view} onSelect={onSelectView} />
        {children}
      </div>
    </div>
  </div>
  ```

  Navigation/header tokens use the rendering table above. Keep this composition inside the existing workspace branch of AppSidebarLayout, not nested beneath its old 64px selector plus Code-width Sidebar. Use a `WorkspaceLayout` branch with fixed sidebar width; Code retains `--sidebar-width`, resizing, both current/legacy ThreadSidebar branches, SidebarControl and native window-control insets. The snippet illustrates composition; breadcrumb is added by T3. Do not render a duplicate breadcrumb in the final tree.

- [ ] Reuse SidebarChromeHeader through an explicit `workspace` variant or a small workspace-only header. Never recursively mount its current WorkspaceSpaceSelector twice. Workspace static artwork gets a workspace-only size override; Code artwork and native control reservation remain. Keep existing sidebar toggle shortcut listener once at app level. Move Settings to y325 in wide Workspace mode, leaving Code utility layout intact.
- [ ] Fit the Mail folder/account disclosure into the existing rail's Inbox affordance or adjacent accessible header control. In the default fixture its panel is closed, preserving the 52px rail and the three pictured labels. The disclosure body reuses MailNav's real account/folder reads and Email accounts link, with no SidebarChromeHeader/duplicate whole sidebar. Keep the Projects searchable picker on the project/resource chooser; do not add an always-visible flat list. Proposed open disclosures require review.
- [ ] Render each rail as a nav with named controls and selected state. All pictured controls remain visible. Until its owner lands Unread/Later/Week/Recordings behavior, an unsupported control shows a reason and makes zero RPCs; do not simulate unread from a page or create fake Later storage. Do not mark those behaviors delivered in W4. T1's route parser rejects cross-space view values.
- [ ] Wire dev `WorkspaceMockupApp` to the same navigation presentation with its exact recipe data and fixture labels. This is the first point the sample brand/mode may render; never import dev seeds into live SidebarChromeHeader. Run the same test command, expected green, then web typecheck and targeted lint on the owned paths.
- [ ] Surface checklist: persistent pointer/keyboard nav, palette and existing sidebar toggle remain; web/desktop share it, phone gets a menu and touch targets; native screens unchanged; no provider or wire behavior; open/close disclosures and Settings return work; local/remote views retain environment; docs in T6. Preserve both Code sidebar variants explicitly.
- [ ] Visual acceptance: T7 01-08 `[0,0,259,800]`, `gap-shell.md:15-53`. Measure x207 and x259, 26px row height/29px pitch, mode bounds, unbadged rails and Settings position. D25 brand/mode and real environment substitutions only. Open disclosure and Code captures are proposed-state reviews.
- [ ] Future commit:

  ```text
  git add -- apps/web/src/components/AppSidebarLayout.tsx apps/web/src/components/sidebar/SidebarChrome.tsx apps/web/src/components/workspace/OfficeWorkspace.tsx apps/web/src/components/workspace/WorkspaceSpaceSelector.tsx apps/web/src/components/workspace/ProjectsNav.tsx apps/web/src/components/workspace/mail/MailNav.tsx apps/web/src/components/workspace/WorkspaceNavigation.tsx apps/web/src/components/workspace/WorkspaceViewRail.tsx apps/web/src/components/workspace/WorkspaceNavigation.test.tsx apps/web/src/components/workspace/WorkspaceSpaceSelector.test.tsx apps/web/src/components/workspace/ProjectsNav.test.tsx apps/web/src/components/workspace/dev/WorkspaceMockupApp.tsx
  git commit -m "feat(web): keep workspace navigation across spaces"
  ```

### Task W4-T3: Shared headers and center sizing

**Files:** Modify `apps/web/src/components/workspace/WorkspaceEngagement.tsx:7-125` and `.test.tsx:1-45`, `apps/web/src/components/WorkspacePageHeader.tsx:7-28`, `WorkspaceBreadcrumb.tsx:5-77`, `components/workspace/mail/MailSpace.tsx:54-149,216-337`, `ProjectsSpace.tsx:78-305`, `CommunicationsWorkspace.tsx:21-27,69-197`, `TelegramWorkspace.tsx:31-67,124-292`, and `ChatCommunicationsWorkspace.tsx:161-346,488-577`. Create `components/workspace/WorkspaceHeader.tsx`, `WorkspaceHeader.test.tsx`, new. Modify dev `WorkspaceMockupApp.tsx` from T7.

**Consumes:** T2 navigation, `useEnvironment(environmentId).label`, optional owner display, selected center item and module-provided title/subtitle. **Produces:** `WorkspaceHeaderModel = { title: string; subtitle?: string; environmentLabel: string; spaceLabel: string; owner?: { name: string; initials: string }; sample?: boolean }`; `WorkspaceHeader` and optional compact actions; `WorkspaceEngagement` discriminated layout props with `layout: "split" | "full"`, split-only `list`, `selected`, `onBack?`, common `children`, `resources`, `header`. Keep compatibility with old `linked` callers until T4b migrates them, then remove the alias in the same serial chain.

Common engagement props also require `environmentId: EnvironmentId`, `space: WorkspaceDestination`; `children`, `resources` and `header` are ReactNode. Full layout has no required list or selected prop. Split layout requires `list: ReactNode`, `selected: boolean`, `onBack?: () => void`. Header action callbacks are injected; the header does not own resource queries. No fixture import enters these common types.

**Depends on:** W4-T2. **Serial slot:** After T2, all named shared headers/containers exclusively. **Risk:** workspace, two-way.

- [ ] Add failing behavioral coverage in `WorkspaceEngagement.test.tsx`: render full layout with a center form, interact with it and assert no Item list region or Resize item list separator exists. Split layout retains list selection, Back and keyboard resize. Test center state survives Resources open/close. Use a stateful probe and actual event calls rather than renderToStaticMarkup.

  ```tsx
  function Counter() {
    const [count, setCount] = useState(0);
    return <button onClick={() => setCount(count + 1)}>Saved {count}</button>;
  }
  it("lets a full-width module work without a list pane", async () => {
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(
        <WorkspaceEngagement
          environmentId={EnvironmentId.make("a")}
          space="projects"
          layout="full"
          header={<h1>Projects</h1>}
          resources={<p>Resources</p>}
        >
          <Counter />
        </WorkspaceEngagement>,
      );
    });
    const button = view.root
      .findAllByType("button")
      .find((node) => node.children.join("") === "Saved 0")!;
    await act(async () => button.props.onClick());
    expect(
      view.root.findAllByType("button").some((node) => node.children.join("") === "Saved 1"),
    ).toBe(true);
    expect(view.root.findAllByProps({ "aria-label": "Item list" })).toHaveLength(0);
    expect(view.root.findAllByProps({ "aria-label": "Resize item list" })).toHaveLength(0);
    await act(async () => view.unmount());
  });
  ```

- [ ] In `WorkspaceHeader.test.tsx`, render a long environment label, change Mail account and channel metadata, click Resources and verify only resource visibility changes. Owner absent renders no avatar/name claim; owner present exposes full accessible name. The marker exists only with injected `sample=true`. Use a memory router for breadcrumb navigation.
- [ ] Run from web: `vp test run src/components/workspace/WorkspaceEngagement.test.tsx src/components/workspace/WorkspaceHeader.test.tsx src/components/workspace/mail/MailSpace.test.tsx`. Expected red on new layout/header APIs.
- [ ] Implement the sizing model with a fixed wide default rather than old percentage:

  ```ts
  const split = useResizableWidth({
    storageKey: `pulse.workspace.${environmentId}.${space}.engagement-width.v2`,
    defaultWidth: 170,
    minWidth: Math.min(160, hostWidth * 0.4),
    maxWidth: hostWidth * 0.6,
    edge: "right",
  });
  ```

  Call hooks consistently, using a split child component when layout differs. Retain ResizeObserver cleanup. Use one CSS-pixel divider and a wider absolute hit area. First clean fixture render has a 170px list within the 681px center; old saved 20% widths do not override the fixture. Keyboard Left/Right by 20px and Home/End remain. Saved live widths are clamped after resize and separated by environment/space. Full layout never subscribes to unused list state.

- [ ] Add a workspace-specific variant to WorkspacePageHeader/Breadcrumb so normal Code/Settings topbar height is unchanged. One 26px breadcrumb belongs above rail+center+resources, one 52px module header above center only. Give Electron's top strip drag-region, while buttons/links/inputs are no-drag through existing rules. Native controls remain reserved on macOS/Windows overlay clients; any required inset departure gets a separate desktop capture. Never globally set `--workspace-topbar-height:26px` for every Code header.
- [ ] Introduce `WorkspaceHeader` title flex column with `min-width:0`, trailing controls fixed-size and `max-width` truncation. Header title/subtitle come from each module, not copied fixture labels. The Resources trigger is present with no selected item. Owner is optional until W5's configured profile exists; no email-name-derived MC. The dev app injects MC/Maya and the exact sample strings.
- [ ] Migrate Mail, Projects, Desktop Communications, Telegram and ChatCommunicationsWorkspace away from nested top headers/SidebarInsets. Telegram passes canonical space=communications to the typed engagement component; provider identity stays in its own ref/search fields. Keep desktop account connect/disconnect/Refresh and Telegram bot selector reachable through explicit module controls inside the center, not silently deleted to fit the mockup. Existing local legacy Office keeps its own route. Canonical unavailable Tasks/Meetings/Calendar use full layout. Projects remains a full-width center even before W8 redesigns its cards; its existing project list/detail can compose inside that center without forcing a 170px shell list.
- [ ] Run the same test command, expected green. Add account/environment title update and long-name assertions to the tests, then web typecheck and targeted lint. Do not replace mail conversation newest-message link semantics while moving headers.
- [ ] Surface checklist: Resources, breadcrumb, Back and separator keyboard paths; web/desktop drag/no-drag, phone one-pane composition; native contract unchanged; every provider uses existing item actions; no new contracts; list/detail Back and Resources close/reopen; explicit environment and no hardcoded origin for all connection modes; T6 docs.
- [ ] Visual acceptance: T7 all eight `[207,0,1073,78]` plus `[259,78,681,722]`, `gap-shell.md:30-57`. One breadcrumb/header, resources/avatar alignment, no vacant list in wide-body spaces, x429 divider only in Email/Communications. Live title/account/provider/optional owner plus chrome substitutions only. Module interiors remain owned elsewhere.
- [ ] Future commit:

  ```text
  git add -- apps/web/src/components/workspace/WorkspaceEngagement.tsx apps/web/src/components/workspace/WorkspaceEngagement.test.tsx apps/web/src/components/WorkspacePageHeader.tsx apps/web/src/components/WorkspaceBreadcrumb.tsx apps/web/src/components/workspace/WorkspaceHeader.tsx apps/web/src/components/workspace/WorkspaceHeader.test.tsx apps/web/src/components/workspace/mail/MailSpace.tsx apps/web/src/components/workspace/ProjectsSpace.tsx apps/web/src/components/workspace/CommunicationsWorkspace.tsx apps/web/src/components/workspace/TelegramWorkspace.tsx apps/web/src/components/workspace/ChatCommunicationsWorkspace.tsx apps/web/src/components/workspace/dev/WorkspaceMockupApp.tsx
  git commit -m "feat(web): share workspace headers and center layouts"
  ```

### Task W4-T4a: Project resource frame, selection and six lazy tabs

**Files:** Modify `apps/web/src/components/workspace/WorkspaceEngagement.tsx:8-107`, `.test.tsx:13-45`, `WorkspaceToolsPanel.tsx:30-168`, `ProjectsNav.tsx:23-137`. Create `WorkspaceResourcesPanel.tsx`, `WorkspaceResourcesPanel.test.tsx`, `workspaceResourceState.ts`, `workspaceResourceState.test.ts`, `WorkspaceResourceBody.tsx`, all in the same workspace directory, new. Modify `dev/WorkspaceMockupApp.tsx`. Reuse `ProjectsNav`'s combobox at baseline `:43-125`, but keep project selection in the resource frame separate from center route navigation.

**Consumes:** `EnvironmentId`, environment-local project/thread projections, selected-item confirmed linked project refs and structural owner candidates from current WorkspaceToolsPanel. **Produces:** the following public web presentation types and functions:

```ts
export type WorkspaceResourceTab = "files" | "browser" | "agents" | "tasks" | "docs" | "prs";
export interface WorkspaceResourceScope {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}
export interface WorkspaceResourceBodyProps extends WorkspaceResourceScope {
  readonly selectedItem: WorkspaceLinkEndpoint | null;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
}
export type WorkspaceResourceProject =
  | { readonly kind: "selected"; readonly scope: WorkspaceResourceScope; readonly title: string }
  | { readonly kind: "choose"; readonly candidates: readonly ProjectId[] }
  | { readonly kind: "unavailable"; readonly projectId: ProjectId };
```

Export `resolveResourceProject({ environmentId, projects, explicitProjectId, owningProjectIds, confirmedProjectIds }): WorkspaceResourceProject`. `projects` is `readonly { environmentId: EnvironmentId; id: ProjectId; title: string }[]`; explicitProjectId is ProjectId|null; candidate arrays are readonly ProjectId[]. Produce `useWorkspaceResourceState(environmentId)` with `open`, `projectId`, `selectedTab`, `chooseProject`, `selectTab`, `close`, `reopen`. Persist open/project and each chosen project's tab in browser-local preferences, keyed by environment. Compact sheet visibility is transient and is not the persisted wide-open preference.

Export `WorkspaceResourcesPanel` with scope/project resolution, controlled tab/open actions and selectedItem nullable. It renders the picker, close, tab strip, selected body and footer slot. `WorkspaceResourceBody` is a closed six-case switch, not an extensible registration system. Module owners consume `WorkspaceResourceBodyProps` and replace only their named case. Existing tool bodies remain usable with truthful limitations. Selected project does not become an agent read grant.

**Depends on:** W4-T3. **Serial slot:** After T3, owns the four named shared source files. Subsequent module wiring into WorkspaceResourceBody must acquire that file's serial slot, one owner at a time. **Risk:** workspace, two-way.

- [ ] Add a failing resolver test with real branded IDs:

  ```ts
  import { EnvironmentId, ProjectId } from "@t3tools/contracts";
  import { expect, it } from "vite-plus/test";
  import { resolveResourceProject } from "./workspaceResourceState";

  it("does not choose the first unrelated project or cross environments", () => {
    const a = EnvironmentId.make("a");
    const b = EnvironmentId.make("b");
    const id = ProjectId.make("same-id");
    const result = resolveResourceProject({
      environmentId: a,
      projects: [{ environmentId: b, id, title: "Other machine" }],
      explicitProjectId: null,
      owningProjectIds: [],
      confirmedProjectIds: [id],
    });
    expect(result).toEqual({ kind: "choose", candidates: [] });
    expect(
      resolveResourceProject({
        environmentId: a,
        projects: [],
        explicitProjectId: id,
        owningProjectIds: [],
        confirmedProjectIds: [],
      }),
    ).toEqual({ kind: "unavailable", projectId: id });
  });
  ```

  Add zero/one/multiple valid candidates, explicit choice retained across item changes, structural task/thread ownership and an unavailable remembered choice. Wait until project projections are ready before declaring deleted; loading is a separate state supplied by the container.

- [ ] Add `WorkspaceResourcesPanel.test.tsx` with two fake module bodies that increment/decrement active subscriptions in useEffect. Render with `selectedItem=null`, choose a project before any item, change Files to Browser, close and reopen. Assert max active bodies is one, inactive body loader was not invoked, same project/tab restored and link/start commands were never called. Resolve a deferred A query after switching to environment B and assert no A title/body appears. Test X releases the wide column and Resources reopens it.
- [ ] Run from web: `vp test run src/components/workspace/workspaceResourceState.test.ts src/components/workspace/WorkspaceResourcesPanel.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx`. Expected red on missing resolver/frame behavior.
- [ ] Implement the extracted resolver from the existing source, preserving its single-candidate rule:

  ```ts
  const available = projects.filter((project) => project.environmentId === environmentId);
  if (explicitProjectId !== null) {
    const chosen = available.find((project) => project.id === explicitProjectId);
    return chosen
      ? { kind: "selected", scope: { environmentId, projectId: chosen.id }, title: chosen.title }
      : { kind: "unavailable", projectId: explicitProjectId };
  }
  const ids = new Set([...owningProjectIds, ...confirmedProjectIds]);
  const candidates = available.filter((project) => ids.has(project.id));
  const only = candidates.length === 1 ? candidates[0] : undefined;
  return only
    ? { kind: "selected", scope: { environmentId, projectId: only.id }, title: only.title }
    : { kind: "choose", candidates: candidates.map((project) => project.id) };
  ```

  Confirmed refs exclude model suggestions and one-hop discovery. With no item, a Projects page supplies its center project as a structural candidate; a previous explicit resource selection wins. With zero candidates show the picker, never default to any unrelated first project. Auto-resolution is recomputed only while no explicit resource choice exists. Deleted explicit projects remain visible as unavailable until the user chooses another. No root changes or link commands occur.

- [ ] Use the existing local-storage hook with a versioned schema and defaults. A malformed saved tab falls back to Files, malformed project ID to no explicit choice, denied storage to in-memory state. Keys are `pulse.workspace.resources.v1:<environmentId>`; per-project tab map keys are ProjectId strings. Query requests and React body keys include both environmentId and projectId. Do not let a stale persisted availability flag override current capabilities. Project names are presentation, never cache identity.
- [ ] Build the 340px frame and combobox using the exact rendering table. Selected tab controls expose role=tab, aria-selected, matching aria-controls and a single role=tabpanel. Arrow/Home/End move focus; Enter/Space activates a tab, so merely traversing focus does not start each lazy module. Horizontal scroll is confined to the tab strip. X is `Close resources`; Resources trigger carries expanded state. Use a footer slot now, completed in T5.
- [ ] Implement the closed lazy switch. Keep the existing Browser function in WorkspaceToolsPanel.tsx for W4, exporting it if the selected body needs a direct import and adapting its scope/nullable action target there. W10 owns its later extraction to WorkspaceBrowser.tsx and inline redesign. Existing Files/Agents continue as explicitly limited project-link lists until W7/W10 replace them. Project Tasks can reuse current ProjectTasks behind its capability gate; full mockup task behavior belongs to W5. Docs and PRs show `Documents are not available on this server yet.` and `Project pull requests are not available in this view yet.` until their owner lands. All six tabs remain visible and selection-consistent. No empty stub counts as module completion.
- [ ] Remove Browser's private project `<select>` and selected-item-only project resolution from WorkspaceToolsPanel after callers pass the resolved scope. Browser configuration and project-thread lookup still require the selected environment/project. File/agent lists resolve project-confirmed links using the existing shared link query, not all items in the environment. If a selected-item action exists inside a resource, pass nullable selectedItem and disable that action with a reason when absent. Browsing project content must remain possible before selection.
- [ ] Connect dev app to the same frame with fixture project records and chosen tab. Every recipe begins open with SynKEK, regardless of previously saved live localStorage. Run the same focused suite, expected green, web typecheck and targeted lint. Check no duplicate change subscription was introduced.
- [ ] Surface checklist: resource picker, tab keyboard controls, X and header trigger; web/desktop and phone sheet share state; native contract unchanged; no provider runs or reads beyond existing grants; no contract changes; close/reopen and deleted-selection recovery; local/direct/relay/tunnel requests/cache keys keep environment; T6 docs define resource frame and independent selection.
- [ ] Visual acceptance: T7 all eight `[940,26,340,774]`, `gap-shell.md:33-36,60-107`. Fixed footer boundary, six ordered tabs, correct Files/Browser/Agents corrections, no second project selector, one selected lazy body. Actual project names/unavailable body and chrome substitutions allowed live. Picker, empty, deleted and closed states require reviewed proposed captures.
- [ ] Future commit:

  ```text
  git add -- apps/web/src/components/workspace/WorkspaceEngagement.tsx apps/web/src/components/workspace/WorkspaceEngagement.test.tsx apps/web/src/components/workspace/WorkspaceToolsPanel.tsx apps/web/src/components/workspace/ProjectsNav.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.test.tsx apps/web/src/components/workspace/workspaceResourceState.ts apps/web/src/components/workspace/workspaceResourceState.test.ts apps/web/src/components/workspace/WorkspaceResourceBody.tsx apps/web/src/components/workspace/dev/WorkspaceMockupApp.tsx
  git commit -m "feat(web): separate project resources from item selection"
  ```

### Task W4-T4b: Linked context entrance and retained provenance

**Files:** Modify `apps/web/src/components/workspace/WorkspaceResourcesPanel.tsx` and `WorkspaceHeader.tsx` from T3/T4a, `WorkspaceEngagement.tsx:8-107`, `mail/LinkedSection.tsx:36-96,99-423`, `mail/MailSpace.tsx:287-307,374-404`, `ProjectsSpace.tsx:151-161`, `TelegramWorkspace.tsx:219-292`. Create `WorkspaceLinkedContext.tsx` and `WorkspaceLinkedContext.test.tsx`, new. Existing `mail/linkedItems.ts` helpers and `SuggestedSection.tsx` behavior are consumed, not rewritten. Re-read their exact line ranges before an admitted change.

**Consumes:** `{ environmentId: EnvironmentId; item: WorkspaceLinkEndpoint | null; linkedData?: WorkspaceLinkList; onOpen: (ref: WorkspaceItemRef) => void }`, resource state, existing useMailLinks and SuggestedSection. **Produces:** named `Linked context` header action, `WorkspaceLinkedContext` view, and `LinkedSection` mode `"context" | "legacy"` during migration. Context mode contains Linked, Suggested, linked projects and provenance, without recreating resource tools. After every workspace caller is migrated, retain legacy mode only if Code still consumes it; otherwise remove the obsolete tool tabs.

**Depends on:** W4-T4a. **Serial slot:** After T4a, owns linked context/header/resource-frame and named caller changes. **Risk:** workspace, two-way.

- [ ] Add real interaction red case in `WorkspaceLinkedContext.test.tsx` using happy-dom and current module mocks:

  ```tsx
  it("opens selected-item context without replacing the resource project", async () => {
    const environmentId = EnvironmentId.make("a");
    const item = {
      ref: { type: "url" as const, url: "https://example.invalid/a" },
      title: "Page A",
    };
    const onOpen = vi.fn();
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    await act(async () =>
      root.render(
        <WorkspaceLinkedContext environmentId={environmentId} item={item} onOpen={onOpen} />,
      ),
    );
    expect(node.textContent).toContain("Linked");
    expect(node.textContent).toContain("Things you connected to this item.");
    await act(async () => getByRole(node, "button", { name: "url: Linked page" }).click());
    expect(onOpen).toHaveBeenCalledWith({ type: "url", url: "https://example.invalid/linked" });
    await act(async () => root.unmount());
    node.remove();
  });
  ```

  Set up the existing useEnvironmentQuery mock to return a confirmed linked row with title `Linked page`, url https://example.invalid/linked, status confirmed, source user, fixed updatedAt and the normal WorkspaceLinkView id shape from linkedItems.test.ts:19-25. The frame-level companion test opens Linked context through the header, changes resource project in the background, then acts on that linked row. Assert captured item A remains the context source and resource project B stays selected when returning. Check actual link command spies from the mounted frame, not an unconnected local spy.

- [ ] Mock the existing workspaceLinks query with one confirmed URL, one suggested URL, one linked project and fixed origin. Click suggestion Accept and Dismiss in separate cases; assert only the existing explicit command fires, then render returned data and inspect the confirmed/source/reason state. A one-hop related row remains discovery only. Deleted item renders unavailable with its reason; no row disappears silently. Unlink/relink tests belong to T5's command flow.
- [ ] Run web `vp test run src/components/workspace/WorkspaceLinkedContext.test.tsx src/components/workspace/mail/MailSpace.test.tsx src/components/workspace/mail/linkedItems.test.ts`. Expected red on missing context component/entrance.
- [ ] Keep the original header's Resources control at its pictured bounds. Add a 28px Link icon action immediately before it on wide screens, accessible name/tooltip `Linked context`; when width is insufficient, put the named action in the header overflow menu. This is a proposed live addition, not source artwork. Its open context view has title `Linked context`, a visible `Back to resources` action, and the captured item's title. Initial fixture screenshots leave it closed. No selection shows `Select an item to see its linked context.` without disabling Resources.
- [ ] Implement a small captured context state:

  ```ts
  type ContextTarget = {
    readonly environmentId: EnvironmentId;
    readonly item: WorkspaceLinkEndpoint;
  };
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const openContext = () => {
    if (selectedItem !== null) setContextTarget({ environmentId, item: selectedItem });
  };
  const closeContext = () => setContextTarget(null);
  ```

  An environment change closes the captured context rather than querying old refs through the new environment. An item change while context is open keeps a clearly labelled captured target until Back/reopen, avoiding mixed identity. Resource project changes never rewrite contextTarget. Closing context restores resource tab/project exactly. Only one of context or resource body is mounted.

- [ ] Reuse LinkedList, linkedItemLabel/originText, Info popover and SuggestedSection. Context uses a two-view Linked/Projects filter, preserving Linked then Suggested order. Keep exact explanatory copy from the spec; tap/focus/hover all work. Confirmed relationships, structural ownership, model suggestions and one-hop rows keep their distinct labels. Opening context never accepts a suggestion or requests model generation automatically if existing behavior requires explicit Refresh.
- [ ] Preserve Mail conversation aggregation via listMany over loaded messages; origin/new link target remains the newest stable message, not the conversation ID or currently highlighted reply. Move the old `linked` prop callers onto the explicit selected-item context input, remove duplicate resource tool tabs from their context mode, and keep Code thread-detail linking untouched. Run the same three focused test files, expected green, plus web typecheck and targeted lint.
- [ ] Surface checklist: header, overflow, palette through T5, linked row menus, existing info popover and touch; web/desktop/phone same captured ref; native contracts unchanged; all providers retain confirmed-only context grants, no adapter-specific reader expansion; no contracts; Back/context close, accept/dismiss and unavailable recovery; environment change cancels context; T6 user docs explain independent Resources versus Linked context.
- [ ] Visual acceptance: T7 all eight `[822,26,118,52]`, `gap-shell.md:32-35`; preserve Resources/avatar and title truncation. The new Link action and open context view need reviewed proposed captures because no PNG depicts them. Live actual links/provenance and chrome substitutions only; no extra tab in the six-tab resource strip.
- [ ] Future commit:

  ```text
  git add -- apps/web/src/components/workspace/WorkspaceResourcesPanel.tsx apps/web/src/components/workspace/WorkspaceHeader.tsx apps/web/src/components/workspace/WorkspaceEngagement.tsx apps/web/src/components/workspace/WorkspaceLinkedContext.tsx apps/web/src/components/workspace/WorkspaceLinkedContext.test.tsx apps/web/src/components/workspace/mail/LinkedSection.tsx apps/web/src/components/workspace/mail/MailSpace.tsx apps/web/src/components/workspace/ProjectsSpace.tsx apps/web/src/components/workspace/TelegramWorkspace.tsx
  git commit -m "feat(web): retain linked context beside project resources"
  ```

### Task W4-T5: Shared item actions, project settings and truthful footer

**Files:** Modify `apps/web/src/components/workspace/WorkspaceItemActions.tsx:44-229,465-575`, `mail/LinkedSection.tsx:99-424`, `mail/useMailLinks.ts:21-57`, `ProjectTasks.tsx:33-141`, `WorkspaceResourcesPanel.tsx` from T4a, and `apps/web/src/components/CommandPalette.tsx:1923-1946` only if its existing selected-action dispatch needs adjustment. Create `WorkspaceItemActions.test.tsx`, `WorkspaceResourceFooter.tsx`, `WorkspaceResourceFooter.test.tsx`, new. Consume `mail/linkedItems.ts` drag/origin helpers and existing server link deduplication; no server change planned.

**Consumes:** Captured `{ environmentId, item, confirmed }`, live read/operate capability, project-local known health observations and `ProjectWorkspaceSettings`. **Produces:** consistent selected/resource item actions through existing WorkspaceItemMenu/WorkspaceItemActions; `WorkspaceResourceFooter({ scope, observations, sample, onSettings })`. `observations` is `readonly { source: string; state: "connected" | "unavailable" | "unknown" }[]`, supplied only by mounted known sources. Export pure `resourceConnectionLabel(observations)` returning `Connected | Unavailable | Connection status unavailable`. Missing/empty information is unknown. Settings stays scoped and explicit.

**Depends on:** W4-T4a. **Serial slot:** After W4-T4b, owns actions/links/ProjectTasks/frame and the small palette block. **Risk:** workspace, two-way.

- [ ] Add a meaningful race test in `WorkspaceItemActions.test.tsx` using the existing react-test-renderer/act idiom and mocked local API boundary:

  ```ts
  it("keeps the original item when its project chooser resolves after selection changes", async () => {
    let resolveChoice!: (value: string | null) => void;
    const choice = new Promise<string | null>((resolve) => { resolveChoice = resolve; });
    contextMenuShow.mockReturnValueOnce(choice);
    const a = { ref: { type: "url" as const, url: "https://example.invalid/a" }, title: "A" };
    const b = { ref: { type: "url" as const, url: "https://example.invalid/b" }, title: "B" };
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(<WorkspaceItemActions environmentId={environmentId} item={a} />);
    });
    const add = view.root.findAllByType("button")
      .find((button) => button.children.includes("Add to project"))!;
    await act(async () => { add.props.onClick({ currentTarget: targetElement }); });
    await act(async () => {
      view.update(<WorkspaceItemActions environmentId={environmentId} item={b} />);
      resolveChoice(projectChoiceId);
      await choice;
    });
    expect(linkToProject).toHaveBeenCalledWith(
      { ref: a.ref, title: "A" }, expect.objectContaining({ id: projectId }),
      { type: "action", action: "add-to-project" },
    );
    await act(async () => view.unmount());
  });
  ```

  Test setup uses real `EnvironmentId.make`/`ProjectId.make`, `projectMenuItems`' actual choice ID, a DOM target with getBoundingClientRect, mocked useMailCapabilities, existing project/query hooks and useMailLinks returning a spy. Declare the named spies in `vi.hoisted` or current file-scope mock style. Also resolve null and assert no link/project/thread. Test a menu opened for A whose row updates to B before choosing an action, and environment revocation while pending. Existing async closures may already satisfy part of the test; retain correct code and fix only the failing path.

- [ ] Add footer test cases: no observations, all connected, one unknown plus connected, one unavailable. Test sample label only with sample=true. Click the gear for project A/environment A, update current resource selection to B while settings is open and assert Save still calls saveConfig for A. Close/cancel produces no save. No new connection read may happen on footer mount.
- [ ] Run web `vp test run src/components/workspace/WorkspaceItemActions.test.tsx src/components/workspace/WorkspaceResourceFooter.test.tsx src/components/workspace/mail/linkedItems.test.ts`. Expected red for the new footer and any demonstrated target-capture gap.
- [ ] Keep action authority in existing hooks. At native context-menu, popover and touch-menu open, capture the item/environment/confirmed list once. Render WorkspaceItemActions keyed by that captured identity until close; cancel on environment removal or permission loss. The existing `choose` function already closes over its original props during an awaited picker; do not add a second action service if that path passes. Revalidate current operate permission before a mutation. Start thread remains a removable-context draft and starts no paid turn; Start automation remains an editor, no creation on cancel.
- [ ] Use one selected-item action host with `shortcuts=true`. Resource row actions have shortcuts=false so one keypress never reaches multiple items. Preserve context-menu/Shift+F10/visible ellipsis/500ms long-press and cancel the touch gesture after more than 10px movement, pointer cancel or unmount. Palette targets the currently captured action host; a disconnected DOM button aborts. Add named Resources/Linked context palette actions through the same host callbacks if present, not a second navigation/action model.
- [ ] Implement truthful aggregate copy:

  ```ts
  export function resourceConnectionLabel(
    observations: readonly { state: "connected" | "unavailable" | "unknown" }[],
  ) {
    if (observations.some((source) => source.state === "unavailable")) return "Unavailable";
    if (observations.length > 0 && observations.every((source) => source.state === "connected"))
      return "Connected";
    return "Connection status unavailable";
  }
  ```

  No RPC, timer, spinner or provider probe exists in the footer. Use static blue for sample/known connected, neutral for unknown and an accessible unavailable label for failed sources. Color never carries the only state indication. Until later modules provide supported selected-project health, live footer is unknown. Environment socket connectivity alone does not prove project-source connectivity.

- [ ] Gear opens a scoped settings Sheet/Dialog with existing `ProjectWorkspaceSettings environmentId/projectId`, captured when opened. Keep current save/read permission guards. An optional link to Settings Integrations uses the existing route and keeps a return target; it must not imply the global page is project-filtered. Closing settings restores resource tab/project. A new read on explicitly opening settings is fine; none on the idle footer.
- [ ] Exercise existing link/unlink/relink through `useMailLinks` with a fake command boundary returning the same link ID and origin. Inspect the actual request payload, including `viewing`, and render the returned origin after relink. Existing server tests own deduplication and dismissed-row persistence; rerun those only if server behavior changes. Distinguish direct project link, owned task/thread, Suggested and Via relation. No browsing/hover creates a confirmed relation.
- [ ] Run the same focused suite, expected green, plus web typecheck and targeted lint. Add selected/resource endpoint agreement through detail/header, palette, existing shortcuts and touch menu. Backend remains unchanged; no additional native provider tests are needed for a presentation refactor.
- [ ] Surface checklist: header/menu/palette/keybindings/touch/drag all bind the same captured endpoint; web/desktop and phone share actions, native contracts unchanged; Codex/Claude/Cursor/Grok/OpenCode/ACP grants and explicit tool capability gating remain; no contracts; unlink/relink, cancel/retry and settings close work; environment/client origin never substitutes for remote target; T6 docs state actions and unknown connection meaning only where useful.
- [ ] Visual acceptance: T7 all eight footer `[940,768,340,32]`, 04 card menus as proposed states, `gap-shell.md:36-38`. Check dot/text/gear bounds, fixed position and sample-only label. Live labels only from the table. Menus and settings need reviewed proposed captures and action tests, not a claim of pictured original states.
- [ ] Future commit:

  ```text
  git add -- apps/web/src/components/workspace/WorkspaceItemActions.tsx apps/web/src/components/workspace/WorkspaceItemActions.test.tsx apps/web/src/components/workspace/mail/LinkedSection.tsx apps/web/src/components/workspace/mail/useMailLinks.ts apps/web/src/components/workspace/ProjectTasks.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.tsx apps/web/src/components/workspace/WorkspaceResourceFooter.tsx apps/web/src/components/workspace/WorkspaceResourceFooter.test.tsx apps/web/src/components/CommandPalette.tsx
  git commit -m "feat(web): keep resource actions scoped and connection status truthful"
  ```

### Task W4-T6: Compact shell, single-body regression and wave gate

**Files:** Modify the now-shared `apps/web/src/components/workspace/WorkspaceEngagement.tsx` and `.test.tsx`, `WorkspaceHeader.tsx`, `WorkspaceResourcesPanel.tsx`, `WorkspaceViewRail.tsx`, `WorkspaceResourceBody.tsx`, `workspaceResourceState.ts`; modify `apps/web/src/components/AppSidebarLayout.tsx:228-377` only for workspace breakpoint/toggle integration. Create `apps/web/src/components/workspace/WorkspaceShell.integration.test.tsx`, new. Extend T7 `dev/WorkspaceMockupApp.tsx` and `capture-recipes.md` with readiness/capture outcomes. Docs gate paths are `docs/user/workspace-spaces.md:1-69`, `docs/internals/overview.md:1-42` and `docs/internals/glossary.md:6-20`. Existing Sheet implementation at `apps/web/src/components/ui/sheet.tsx:54-129` already supports keepMounted/transitionDurationMs; consume it without changing unrelated sheets.

**Consumes:** T1-T5 shell, active fixture modules, actual width/media changes, existing Sheet focus/escape semantics and keyboard navigation. **Produces:** reviewed compact adaptation, one mounted active resource body across dock/sheet transitions, completed shell readiness, documentation changes and an explicit evidence matrix. `WorkspaceEngagement` uses full layout at >=1280 CSS px and sheet resources below 1280; under 768 the navigation becomes a menu and split center becomes one pane. 768-1279 retains usable navigation/rail but no persistent resource width. Do not interpret the main center's observed width as the viewport breakpoint.

**Depends on:** W4-T5 plus T7 fixture readiness for visual checks. **Serial slot:** Last shell task; acquire every named shared UI file before integration. Module owners can extend only their local adapters in parallel after this interface lands. **Risk:** workspace, two-way.

- [ ] Add an integration red test with a stateful body and effect cleanup probe, using the installed react-test-renderer precedent. Test the real layout rather than mocking away both hosts:

  ```tsx
  function BodyProbe({ onActive }: { onActive: (delta: number) => void }) {
    const [draft, setDraft] = useState("");
    useEffect(() => {
      onActive(1);
      return () => onActive(-1);
    }, [onActive]);
    return (
      <input
        aria-label="Resource draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }

  it("transfers a resource body without losing its draft or duplicating a subscription", async () => {
    let active = 0;
    let maximum = 0;
    const onActive = (delta: number) => {
      active += delta;
      maximum = Math.max(maximum, active);
    };
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(
        <WorkspaceEngagement
          environmentId={EnvironmentId.make("a")}
          space="projects"
          layout="full"
          header={<p>Projects</p>}
          resources={<BodyProbe onActive={onActive} />}
        >
          <p>Center</p>
        </WorkspaceEngagement>,
      );
    });
    await act(async () =>
      view.root
        .findByProps({ "aria-label": "Resource draft" })
        .props.onChange({ target: { value: "keep me" } }),
    );
    await act(async () => viewport.set(1024));
    expect(view.root.findByProps({ "aria-label": "Resource draft" }).props.value).toBe("keep me");
    await act(async () => viewport.set(1280));
    expect(maximum).toBe(1);
    expect(view.root.findByProps({ "aria-label": "Resource draft" }).props.value).toBe("keep me");
    await act(async () => view.unmount());
    expect(active).toBe(0);
  });
  ```

  `viewport` is a deterministic matchMedia/ResizeObserver test fake created in this file. Its `set(width: number)` synchronously updates innerWidth, dispatches matching media change callbacks and ResizeObserver entries, then resolves at the React act boundary. It must not start a browser or poll. For DOM-portal implementation use happy-dom/createRoot and getByRole instead of react-test-renderer for this case; drive the same input/change/resize/assert sequence. Never mock away the body host whose continuity the test measures.

- [ ] Add keyboard/touch tests for 390x844, 768, 1024, 1279 and 1280: list -> detail -> Back retains search/scroll, Resources before selection opens, Escape and close return focus to trigger, 44px compact action targets, six-tab strip scrolls within itself, sheet-open resize restores wide boundaries and only one tool lease. Fake the preview boundary to count acquired/released leases, not the whole Browser body. No new preview can start merely from resizing.
- [ ] Run web `vp test run src/components/workspace/WorkspaceShell.integration.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx src/components/workspace/WorkspaceResourcesPanel.test.tsx`. Expected red for the continuity/responsive gaps.
- [ ] Keep one selected-body React owner across layout changes. First try the existing single mounted tool and shared query atoms. If moving it between mutually exclusive aside/Sheet branches remounts and loses state, use one stable portal container owned by WorkspaceEngagement, moving that DOM container into the active host. Do not duplicate the resource component in CSS-hidden trees. The small mechanism is:

  ```tsx
  const [bodyContainer, setBodyContainer] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const container = document.createElement("div");
    container.className = "flex min-h-0 min-w-0 flex-1 flex-col";
    setBodyContainer(container);
    return () => container.remove();
  }, []);
  const dockBody = useCallback(
    (target: HTMLDivElement | null) => {
      if (target !== null && bodyContainer !== null) target.appendChild(bodyContainer);
    },
    [bodyContainer],
  );
  const body =
    bodyContainer !== null && resourceVisible ? createPortal(resources, bodyContainer) : null;
  ```

  Import createPortal from react-dom. Render one active dock div with ref=dockBody, either in the wide aside or inside the existing SheetPopup. Render `body` once. Container identity stays fixed when the viewport changes. Both aside and popup include no duplicate children. Normal resource close can unmount the body and stop work; reopening retains the chosen project/tab. Center forms/drafts remain mounted behind a compact resource sheet. Persist per-space center selection/search/draft through navigation only where existing owners already do; do not add a generic draft store.

- [ ] Model viewport transfer as one state transition so a visible wide body stays visible in the sheet on narrowing, and an open sheet becomes the wide dock on widening. Do not render an intermediate resourceVisible=false that would unmount the portal. Initial compact entry starts with Resources closed; initial wide entry uses remembered wide preference/default open. Compact dismissal does not overwrite the wide preference. User X in wide mode persists closed. Sheet open/close is transient, and an environment change drops old transient context/settings targets.
- [ ] Use Sheet's existing modal semantics, focus trap, Escape and scroll locking. Move the stable container before focus restoration, keep focus on the same node if it remains visible and otherwise restore the appropriate trigger. Closing at 390 returns to the current pane; Back returns detail to list rather than changing resource project. Footer is outside inner scroll, with safe-area padding. Keep tab labels readable; the horizontal overflow belongs to the strip, never document.body.
- [ ] Run the same three tests, expected green. Run the complete focused Wave 4 file set once from web:

  ```text
  vp test run src/routes/-_chat.workspace.test.ts src/components/workspace/workspaceNavigation.test.ts src/components/workspace/WorkspaceSpaceSelector.test.tsx src/components/workspace/WorkspaceNavigation.test.tsx src/components/workspace/ProjectsNav.test.tsx src/components/workspace/WorkspaceHeader.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx src/components/workspace/workspaceResourceState.test.ts src/components/workspace/WorkspaceResourcesPanel.test.tsx src/components/workspace/WorkspaceLinkedContext.test.tsx src/components/workspace/WorkspaceItemActions.test.tsx src/components/workspace/WorkspaceResourceFooter.test.tsx src/components/workspace/WorkspaceShell.integration.test.tsx src/components/workspace/mail/MailSpace.test.tsx src/components/workspace/mail/linkedItems.test.ts src/components/workspace/dev/workspaceMockupFixtures.test.ts src/components/workspace/dev/workspaceMockupEntry.test.tsx src/components/workspace/dev/workspaceMockupBuild.test.ts
  vp run typecheck
  ```

  Run `vp run typecheck` once in apps/server to retain the main-plan invariant. No repo-wide test/typecheck/lint. Run targeted lint on the actual Wave 4 changed files and `git diff --check`. Run web build once for actual production fixture exclusion if it has changed since T7's build; do not repeat an unchanged build just for ceremony.

- [ ] Exercise a connection-mode matrix through the same mounted shell and mocked environment runtime: local, direct remote, relay/tunnel with opaque endpoint, two environments sharing a project ID, disconnected and old server with missing capability flags. No test assumes localhost or uses client filesystem/desktopBridge for remote data. Old server shows readable unavailable text, no unsupported method invocation. No per-row full fetch, all-project fanout, independent change subscription per tab or time-based refresh.
- [ ] Update `docs/user/workspace-spaces.md` opening navigation and Projects/context paragraphs. Suggested replacement for the first paragraph, adjusted to the actual accepted implementation:

  ```text
  Choose Workspace to open Projects. Communications, Meetings, Calendar, Email, Tasks and Projects share the workspace navigation. Views that need a newer server explain their availability. Code restores your previous Code location in the selected environment.

  Resources shows the project you choose, even before you select an item. Changing that project does not link anything. Linked context shows the selected item's confirmed links, suggestions and their origins. Close Resources to make more room, then reopen it from the header. On a phone, Resources opens over the current view.
  ```

  Describe only accepted behavior. Keep manual reply/explorer/calendar/communications body claims at their existing delivered scope until their wave passes. Preserve the documented local Office tools path if retained. Do not put fixture URLs, source paths or test tooling in user docs.

- [ ] Review `docs/internals/overview.md` for the cross-component constraint that resource browsing is independent view state and grants no linked-item access. Add one short ownership paragraph only if the existing workspace-links/connection docs do not already convey this boundary. Review/update `docs/internals/glossary.md` with one definition: `Resource frame` is the selected environment/project's Files, Browser, Agents, Tasks, Docs and PRs container; selecting/browsing it does not confirm links. Keep Linked items' grant semantics distinct. Record a concrete no-change reason in the gate evidence if an existing definition already suffices. Do not add field catalogs or document every component. Other waves own date-only task/calendar occurrence/workspace note/Drive root/PR collection/Later/read-marker definitions.
- [ ] Visual acceptance, primary-controller wave gate only after explicit browser/server authorization: use `test-t3-app` with a disposable worktree environment and T7's non-writing entry. Reset each recipe; await its ready promise; set 1280x800 scale1/zoom1/dark/Segoe UI/en-GB/Africa-Johannesburg. Capture eight views `[0,0,1280,800]`, side-by-side and overlay each named shell crop against 01-08, using `gap-shell.md:101-107` and the rendering table. Measure x207/x259/x940, y26/y78/y135/y768, x429 only in split views. Check sample marker and all D03 corrections. Pass only within V1 tolerance. Module-incomplete regions remain explicitly unaccepted. Allowed live substitutions are only the chrome table; compact layouts have no original pixel target.
- [ ] Capture 1024px and 390x844 proposed states in the same authorized pass. Check no page-level horizontal overflow, tab-only scroll, focus/back behavior and one resource body. Capture Code with current/legacy sidebar variants and long names; review new Linked context/project-picker/settings/unavailable states. Batch repairs, then one affected-case recheck. A 390px browser viewport is phone-web evidence, not React Native or physical-device evidence. Real desktop native window-control behavior needs its own packaged/host result.
- [ ] Store synthetic capture manifests beside screenshots in the controller's approved disposable evidence directory and report eight shell-crop outcomes separately from full-module PNG outcomes. Never hand-write producer verification receipts. If browser use remains unauthorized, mark render gate `unrun, browser/server not authorized` and hand over code verification without claiming visual acceptance. A local HTTP request cannot prove another device reached the app. Preview links, if authorized later, follow the test-t3-app pairing and Tailscale instructions.
- [ ] Surface checklist: six rows, account/folder/project disclosures, header/detail/menu/palette/keybindings/touch; shared web/desktop, responsive phone web, no new native screens; all six provider families preserve existing capability/grant behavior; no new wire contracts; cancel/Back/close/reopen/link/unlink/relink/settings return; local/direct/relay/tunnel/multi-environment/old server explicit; user docs, architecture review and glossary complete. All module content remains owned by its later wave.
- [ ] Future commit with only changed members of this explicit list:

  ```text
  git add -- apps/web/src/components/workspace/WorkspaceEngagement.tsx apps/web/src/components/workspace/WorkspaceEngagement.test.tsx apps/web/src/components/workspace/WorkspaceHeader.tsx apps/web/src/components/workspace/WorkspaceResourcesPanel.tsx apps/web/src/components/workspace/WorkspaceViewRail.tsx apps/web/src/components/workspace/WorkspaceResourceBody.tsx apps/web/src/components/workspace/workspaceResourceState.ts apps/web/src/components/workspace/WorkspaceShell.integration.test.tsx apps/web/src/components/AppSidebarLayout.tsx apps/web/src/components/workspace/dev/WorkspaceMockupApp.tsx docs/superpowers/workspace-mockups/capture-recipes.md docs/user/workspace-spaces.md docs/internals/overview.md docs/internals/glossary.md
  git commit -m "feat(web): complete responsive workspace shell"
  ```

## Self-review

### Decisions assumed for planning

Every D decision remains `default assumed, confirm`; this plan is not account consent. The implementation controller records confirmation or a scope change before admitting the affected behavior.

| Decision    | Default used here                                                                                              | Consequence                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| D01         | Six destinations, Projects landing, searchable project dropdown, default-open wide Resources with close/reopen | T1-T6 implement shared shell; legacy Office URL remains reachable without adding a seventh primary row.            |
| D02         | Independent resource project, separate named Linked context action                                             | Resource choice never confirms links or supplies context grants.                                                   |
| D03         | Files selected in 02, Browser in 05, Agents in 06; selected 01 sender corrected to Nina                        | Seed recipes and capture manifests record departures; production identity stays real.                              |
| D05         | Optional configured environment-owner identity, Me/Unassigned later; no Pulse directory or roles               | Hide live avatar until supported profile exists. Fixture coworkers/roster confer no access.                        |
| D06         | No live follower promise                                                                                       | Fixture 03 may retain source footer, later live Tasks owner removes/records it until follow lifecycle is approved. |
| D11         | Sharing/people counts only from supported complete metadata                                                    | Unknown project source health/sharing remains neutral; no invented SynKEK team live.                               |
| D14         | Confirmed read-only Drive root/account; browsing never changes root                                            | T4 passes scoped project, W7 implements data/filters.                                                              |
| D17         | Real Mail unseen, shared saved refs for Later, loaded-page chat markers                                        | Shell rails display controls without implementing page-local substitutes.                                          |
| D18/D19/D20 | Existing approved readers; Teams URL handoff only, Telegram received bot history                               | New navigation grants no connector/sending authority.                                                              |
| D21/D22/D23 | Desktop Browser with external web fallback, linked-thread agents, existing Code PR identity                    | Six lazy slots do not imply module completion or new agent/PR products.                                            |
| D24         | Web, shared desktop and phone web; native compatibility, explicit connection-mode tests                        | No new React Native screens, packaged/real-device evidence remains separate.                                       |
| D25         | Live Pulse Code / Workspace / Code, fixture Pulse Next / Office / Code                                         | Explicit sample/live text difference while geometry stays fixed.                                                   |
| D26/D27     | Source-reported member count and approved Slack existing DMs only                                              | Fixture 8 members/three DMs are sample metadata, no scope expansion.                                               |
| D28         | Seven day chips select current week; date picker is separately reviewed                                        | Fixed Tue 13 and exact 07/08 subtitles, no invented arrows; Schedule in both.                                      |
| D29         | Blue Marketing means confirmed folder linked to selected resource project                                      | Fixture relation exists; no selected-folder interpretation.                                                        |

### Source deviations and unresolved evidence

- The main plan's old 20/80 default would produce 136px, not 170px, inside a 681px center. This plan deliberately follows the PNG/map's x429 split, retaining keyboard resizing and scoped saved preferences.
- The wave map described an uncommitted correction when inspected. During this assignment another actor committed the unchanged correction as d82b8004cc. Its actual twelve-file commit list was inspected, including ProjectsNav.test.tsx and WorkspaceEngagement.test.tsx. T0 now verifies and reuses that SHA rather than making a second correction commit. Reference checkpoint readiness is still independent.
- The original review requested a light target. All eight supplied images are dark, and the corrected V1 rejects that recommendation. Dark is the comparison target; light is a separate smoke check.
- Current code has a 320px aside at WorkspaceEngagement:91 and a Sheet at :95, not a 340px project resource frame. ToolsPanel:55-73 currently resolves projects and selected-item file/thread links. This plan refactors those real seams instead of claiming the target already exists.
- Code has no environment-scoped return map today. T1 adds session-local scoping without a new server contract. Bare Office remains a legacy local-tools route for compatibility; its behavior is outside original eight-PNG acceptance and must receive a proposed-state review.
- W4-T7 provides deterministic seed/isolation before later modules exist. W4 can certify shell crops; full 01-08 parity depends on module waves. 07 full formatted Docs/comments waits for W8, and live coworker/follower pixels remain conditional under D05/D06. No synthetic screenshot can establish real provider permission or API sufficiency.
- Linked context's added header action, open project dropdown, PR-open, Board, Week, Recordings, compact and error states have no supplied reference PNG. Their owner/controller must review proposed captures before claiming those visual gates.
- Environment-owner profile and project-level source health have no complete current shell source. Optional avatar/unknown footer are intentional live states, not invented identities or probes. Later producers must supply supported metadata through the declared props.
- No existing graphify graph was present. Generating one or invoking context generation would violate this writer's one-file/no-network boundary. Code/spec/mockups were inspected directly. No server Effect edit is planned, so no Effect API is assumed here.
- The writer inspected source and images only. No application tests, network, browser, dev server, provider CLI, staging, commit or live userdata operation ran. New tests/code above are executable implementation instructions, not passing test receipts.

### Writer checks

- Nine tasks retain the exact requested IDs in dependency order: W4-T0, W4-T7, W4-T1, W4-T2, W4-T3, W4-T4a, W4-T4b, W4-T5, W4-T6.
- Wave gate lives in W4-T6 and includes docs/user, architecture/glossary review, focused verification and all eight shell comparisons.
- Only this plan is written in this assignment. Future implementation commit lists are explicit and exclude lockfile churn, unrelated ledger entries and other writers' plans.
- Artifact prose check: `python C:/Users/qblaa/.codex/plugins/cache/product-ops-skill/product-ops/5.9.0/skills/product-ops/scripts/prose_lint.py docs/superpowers/plans/2026-10-16-workspace-wave-4-shell.md`, exit 0, one eligible file clean. A direct U+2014 scan found zero. These are document checks, not product verification. Recheck after the final edit.

## Surfaced gaps

No new product-scope decision beyond the wave map is assumed. Open implementation evidence is the baseline commit checkpoint, later module readiness, review of unpictured states and future authorized render/account/device verification. No tracker mutation or implementation is part of this handoff.
