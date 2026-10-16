# Workspace Wave 10: Browser and project agents

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch W10-T1 through W10-T4 separately, preserving their IDs and exclusive file ownership.

**Goal:** Put the existing desktop Browser in the selected project's resource body. Give web and phone users an honest external-tab path. Show Project agents as explicit project-thread links with live thread titles and state. Browsing, opening a conversation, and opening an assignment picker start no provider turn.

**Architecture:** Consume the Wave 4 project resource frame and its independent resource-project selection. Extract the Browser and Agents bodies from `WorkspaceToolsPanel.tsx`. Reuse `PreviewPanel`, `PreviewView`, `openPreviewSession`, `previewStateStore`, `BrowserSurfaceSlot`, environment-scoped workspace link atoms, thread shells, and shared item actions. The Browser's selected-item link target is distinct from its resource project. Assignment is an existing confirmed thread-to-project link. No new RPC, migration, browser protocol, Agent record, transcript reader, or page-content reader is needed.

**Tech Stack:** TypeScript, React 19, TanStack Router, Effect reactivity atoms, existing preview IPC and native presentation leases, lucide-react, existing UI primitives, `vite-plus/test`, and `react-test-renderer`. Use a DOM test environment for focus, native form events, and compact sheet behavior.

**Spec:** `docs/superpowers/specs/2026-10-14-unified-workspace-design.md`, including A12 and A13; `docs/superpowers/workspace-mockups/mockup-waves/wave-map.md`, shared contracts and Wave 10. The parent outline is `docs/superpowers/plans/2026-10-14-unified-workspace.md:6629-6642`.

**Mockups:** `docs/superpowers/workspace-mockups/mockups/05-browser-module.png` and `docs/superpowers/workspace-mockups/mockups/06-agents-module.png`. Read `gap-browser-agents.md:19-85` for the corrected inventory and BA-2 through BA-6 for behavior. Both reviews and the wave map's Review response log apply. The PNGs define appearance, while D21 explicitly permits a different web/phone body.

**Worktree:** `C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace`, branch `qb/feat-unified-workspace`. Source anchors below were read on 2026-10-16 at the correction baseline described by the map. Earlier-wave plans are being written in parallel. Their bodies and interfaces are prerequisites, not claims that they exist now.

## Global Constraints

The following parent-plan constraints apply with the controller's attribution decision below:

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

Relevant spec text, copied verbatim:

> Below the sections sit the tools. **Browser** opens pages inside the desktop app; web and phone open a
> new tab. **Files** shows linked Drive files. **Agents** lists threads linked to the item and starts a
> new one.

> Task recurrence/dependencies, auto-send/auto-confirmed links, a generic workflow engine, a full Slack/Gmail/Drive replacement and new React Native screens remain excluded.

The first quotation describes selected-item context. A13 and D02/D22 add a separate project resource view. Preserve the item-scoped Linked context entrance when adding project agents.

- Reuse the existing preview/session/link paths. Stop at the smallest correct change. No new dependency or general module registry.
- No polling, sleep-based readiness, continuous animation, page capture loop, transcript fetch per agent, history synchronization, or all-project query fanout. Await the operation, published event, receipt, or worker drain that proves the state changed.
- Anything crossing the wire belongs in `packages/contracts`, with no heavy runtime logic. This wave uses existing shapes unchanged. An unexpected missing wire capability returns to the controller as a separately bounded change.
- Keep live data out of fixtures. Never touch `~/.t3/userdata`. W4-T7 provides isolated, non-writing sample data and a controlled page. Never navigate to production `synkek.com` for the comparison.
- Keep `VITE_HTTP_URL` and `VITE_WS_URL` unset. Single-origin routing must work over local, direct remote, relay, and tunnel connections.
- Preserve B-2026-10-16-001 and other writers' work. No checkout, stash, staging, commit, server, browser, provider CLI, network, or product test is authorized by this plan-writing assignment. Commit commands below are instructions for later authorized implementation only.
- Implementer commits end with a Co-Authored-By line naming the model that made the commit; controller commits use the controller's attribution line.
- Acquire the existing exclusive UI-file slots. W10-T1 -> W10-T2 -> W10-T3 -> W10-T4 is a scheduler chain. W10-T4 does not require a W9 connector. Shared RPC/migration/context files are read-only for this wave.
- W4-T7 and reviewed proposed states are required before visual acceptance. Permission for a server, browser, device, account, or packaged client is a separate prerequisite for the primary controller's integration pass.
- Never stage `docs/internals/pulse-next-migration.json` in these tasks. The controller owns the ledger. Use explicit file lists, including only changed files from the task's set.

## Review Focus

1. Resource switching steals or closes the desktop tab, or inline and enlarged views fight over its guest. W10-T1 owns `hands one tab between resource and Code without a stale release hiding its owner`, the inline interaction journey, and `openPreviewSession.test.ts` session regression coverage.
2. A browser action writes the new selection after navigation or an environment switch. W10-T3 owns `links the captured page to the captured target after navigation`, including colliding IDs in another environment, and the existing reverse-pair/origin service tests.
3. Web falsely claims to observe an external tab, or a blocked popup loses the user's address. W10-T2 owns `keeps the pasted link target when external opening is blocked`, `rejects unsafe addresses`, and DOM retry/focus tests at 390 and 1024px.
4. Merely project-owned or message-linked threads appear as assigned agents, or opening Agents starts paid work. W10-T4 owns `shows only confirmed project-thread assignments` and `opens the scoped conversation without starting a turn`.
5. Stale shells invent activity or cause full-history reads. W10-T4 owns `updates title and state from shells without reading histories`, unavailable/disconnected cases, second-client link invalidation, and the final no-polling/request-budget assertion.

## Rendered look reference

All boxes are `[x,y,width,height]` in CSS pixels at 1280x800, scale 1 and zoom 100%. V1 pins dark theme, en-GB, Africa/Johannesburg, Tuesday 13 October 2026 through W4-T7, and Segoe UI on the Windows capture host with system-ui fallback. Record the resolved font and OS. Geometry, baseline, spacing and bounds must be within 2px; font size within 1px. Compare both side-by-side crops and an overlay/difference. Font antialiasing is excluded only from geometric measurement. Light theme is a separate smoke check.

The hex colors below describe the observed pixels. Implement them through the existing theme tokens and component variants. Do not scatter inline hex values through production components or create a new theme. Owned bodies sit in a `min-w-0 min-h-0` flex child with their own scrolling area. They do not add another project header, tabs, card border, footer, or resource-project picker.

### Shared placement and corrected chrome

The full resource frame is approximately `[940,26,340,774]`, background `#111112`, left rule near `#1c1c20`. Its content is x953..1267, width 314, with about 13px side insets. The footer starts y768 and stays outside the body scroll. The main conversation remains visible, with its boundary at x940. No Browser or Agents entry is added to the main rail.

Wave 4 owns the project header `[953,38,314,31]`, six icon/label tabs around `[946,85,322,43]`, close/reopen, and footer. Keep tab order Files/Folder, Browser/Globe, Agents/Bot, Tasks/ListTodo, Docs/FileText, PRs/GitPullRequest. Icons are about 13px, labels 9px, cells about 52x43 with radius 13px. Correct the contradictory reference highlights under D03: PNG 05 selects Browser only; PNG 06 selects Agents only. Do not reproduce a stale second selected-looking fill.

| Shared element                          | Sample appearance                                               | Live substitution                                                                                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand `[0,0,207,44]`                    | Pulse Next, static blue artwork                                 | Pulse Code, same geometry, D25                                                                                                                                                                              |
| Mode `[7,44,193,26]` and group label    | Office / Code and Office                                        | Workspace / Code and Workspace, preserving A12 Code controls                                                                                                                                                |
| Breadcrumb `[220,0,585,26]`             | SynKEK workspace / Communications                               | Selected environment name / current space, Workspace fallback                                                                                                                                               |
| Marker `[1149,0,118,26]`                | Design preview · sample data                                    | Hide outside isolated fixture mode                                                                                                                                                                          |
| Avatar `[904,42,19,19]`                 | MC                                                              | Configured environment-owner initials with accessible name, or hidden                                                                                                                                       |
| Conversation subtitle `[275,55,540,18]` | SynKEK · Slack · 8 members                                      | Actual project/provider; count only with complete supported provider metadata, D26                                                                                                                          |
| Footer `[940,768,340,32]`               | Static blue 5px dot, Sample project connections, Settings glyph | Connected only for known supported health; Unavailable for a failed known source; otherwise neutral dot and Connection status unavailable. Gear opens scoped project settings. No probes to fill the label. |

The W9 conversation, composer, channel list and DMs are composite placement evidence. W4-T7 supplies that fixed background for 05/06 without a real Slack connection. W10 does not implement, restyle or gate on those readers.

### PNG 05, desktop Browser

Own `[953,149,314,354]`, corrected inventory `gap-browser-agents.md:55-67`.

| Element             | Box or baseline                            | Exact appearance and copy                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Address/search pill | `[953,149,314,29]`                         | Fill about `#19191b`, subtle 1px border, radius 15. Search icon at x965/y163, 12px. `Search or enter a URL` at x983/y164, 10px muted `#85858e`. SlidersHorizontal at x1251/y163, 12px. No always-visible extra Go/nav/tab/profile toolbar. Enter submits. |
| Controlled website  | `[953,191,314,311]`                        | Near-black `#090909`, 1px dark rule, radius 9, about 13px gap after pill and 16px internal inset. It is real controlled site content in the incumbent desktop preview, not production Browser markup painted to impersonate a website.                    |
| Wordmark            | x970/y220                                  | `SynKEK`, blue about `#356bff`, 10px semibold                                                                                                                                                                                                             |
| Heading             | x970/y270..321                             | `Built for` then `what's next.`, white `#ececf1`, 24px bold, 31px line height, about 230px width                                                                                                                                                          |
| Body                | x970/y345..373                             | `Meet the new collection. Thoughtful products, made for` then `everyday life.`, 12px muted, 20px line height. Preserve the comma.                                                                                                                         |
| Site CTA            | `[970,397,103,24]`                         | `Explore products`, 11px semibold white, fill about `#376aff`, radius 7. Its fixture destination is inert. It never performs a workspace Link action.                                                                                                     |
| Site footer         | rule `[970,458,280,1]`, text baseline y481 | `synkek.com · Website preview`, 10px muted                                                                                                                                                                                                                |
| Remaining body      | x953/y503 through y766                     | Blank panel. Do not fill it with invented bookmarks, large action stacks or nested tool cards.                                                                                                                                                            |

The fixture can keep an empty search draft while showing its seeded preview. A real current URL comes from the active preview session, not the empty placeholder. Keep Search, URL draft and observed desktop page state distinct.

The SlidersHorizontal control opens a proposed anchored menu using existing popup primitives. Its desktop actions expose existing navigation/profile controls and optional Enlarge. The compact menu also exposes the captured page actions from W10-T3. Their popup/open state is not pictured and needs a reviewed proposed capture. Closing the menu restores focus to its trigger. There is no auto-open menu in the PNG comparison.

### PNG 05, web/phone substitute under D21

Retain the same pill at `[953,149,314,29]`. Replace only `[953,191,314,311]` with a proposed external-tab card, radius 9 and the same background/border/insets. Use 13px semibold `Open this page in your browser`, 12px/20px explanatory copy, a wrapping selectable canonical URL and a normal `Open in new tab` action. Exact guidance is `External tabs do not report navigation here. Paste the current page address before linking it.` Keep a visible `Link target` label beside the pasted URL. With no address, say `Paste an http or https address, or search this project's linked pages.`

Keep retry available after any open attempt. Do not display a success badge, an observed external title, loading progress for the external site, or a faux embedded page. On a known shell rejection, show its failure and retain the address. On web the current helper cannot reliably detect popup blocking; say `If no tab opened, allow pop-ups and try again, or copy this address.` This honest state is the blocked-open acceptance target.

At 390x844, use W4-T6's Resources sheet, one active body, inset content that fits the sheet, a scrollable tab strip and Back/focus return. At 1024px use the shell's intermediate sheet behavior. These states have no original PNG; review proposed captures at each width, including long URLs and titles. Only the desktop 1280px controlled-site state claims original PNG parity.

### PNG 06, Project agents

Own `[953,149,314,309]`, corrected inventory `gap-browser-agents.md:69-81`. Body is flat, with no bordered card around each row.

| Element                  | Box or baseline                                        | Exact fixture appearance and copy                                                                                            |
| ------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Heading                  | x953/y159                                              | `Project agents`, 13px semibold `#ececf1`                                                                                    |
| Subtitle                 | x953/y178                                              | `General agents assigned to SynKEK`, 10px muted `#85858e`                                                                    |
| First tile               | `[953,217,29,30]`                                      | Navy about `#151d32`, radius 9, `Sa`, 9px bold blue                                                                          |
| First title and activity | x991/y226 and y246                                     | `SEO analyst`, 12px bold; `Reviewing keyword opportunities`, 9px muted, fixture-only activity                                |
| First status and link    | 7px dot near x1263/y232; x953/y267                     | Solid blue dot, `Open conversation →`, 10px blue                                                                             |
| First divider            | `[953,287,314,1]`                                      | About `#1c1c20`                                                                                                              |
| Second row               | tile `[953,302,29,30]`; title x991/y311; activity y331 | `Ce`, `Content editor`, `Ready for your next instruction`; gray static dot near x1263/y317; link baseline y352; divider y372 |
| Third row                | tile `[953,387,29,30]`; title x991/y396; activity y416 | `Wd`, `Website developer`, `Ready for your next instruction`; gray dot near x1263/y402; link baseline y437; divider y457     |

Row pitch is 85px. Open conversation starts at x953, not below x991. Monograms derive from the first characters of the first two words, first uppercase and second lowercase, matching Sa/Ce/Wd. Keep full titles accessible when truncating to reserve status width. Dots are static and decorative; expose the text state to assistive technology.

Live subtitle substitutes the selected project name. Live titles come from scoped shells, falling back to stored endpoint title while unavailable. Running state says `Working`; queued says `Queued`; preparing/starting says `Starting`; pending approvals or user input says `Waiting for your input`; failed says `Last run failed`; interrupted/cancelled/rolled_back says `Not running`; known completed/idle says `Ready for your next instruction`. Missing or disconnected state says `Status unavailable` and explains why. No shell field supports the fixture's keyword sentence, so do not invent it in production or add a model call.

`Link existing thread` and `Start thread` live in a restrained heading overflow menu and the empty state, not permanent large buttons in the reference capture. Each row's menu offers `Unassign from project`, provenance and shared work actions. Empty copy is `No agents assigned to this project.` Unavailable copy is `This conversation is unavailable. You can remove its project assignment.` Keep the row and unlink action. Loading copy is `Loading project agents...`; old-server copy is `Project links are unavailable on this server.` These are proposed states requiring review. Use existing focus rings, keyboard popup navigation and touch controls with at least 44px effective hit areas on phone.

## Earlier-wave interfaces and ownership

Consume the exact exports in W4's Canonical seams for Waves 5-11 section. Import WorkspaceResourceBodyProps from apps/web/src/components/workspace/WorkspaceResourceBody.tsx. That file is the only tab body switch: T1 replaces its Browser case and T4 its Agents case. WorkspaceToolsPanel.tsx is edited only to extract/remove legacy bodies; WorkspaceResourcesPanel.tsx remains the W4 frame. Do not redefine shell state or make another project picker. The body-switch serial chain is W4-T4a -> W5-T7 -> W6-T8 -> W7-T3 -> W8-T3a -> W8-T7 -> W8-T8 -> W10-T1 -> W10-T4, splicing non-admitted tasks. Retain earlier cases and add switch-level mount/request tests in WorkspaceResourceBody.test.tsx.

| Producer | Consumed interface by its wave-map name                     | Required type/semantics at the W10 boundary                                                                                                              |
| -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W4-T4a   | Project resource frame, selection and six lazy tabs         | `environmentId: EnvironmentId`, selected project `{ id: ProjectId; title: string }                                                                       | null`, selected tab, body visibility, one lazy body, existing project settings callback |
| W4-T4b   | Linked context entrance and retained provenance             | selected-item WorkspaceLinkEndpoint or null, independent from resource project; retained Linked/Suggested/origin/unlink UI                               |
| W4-T5    | Shared item actions, project settings and truthful footer   | captured endpoint, scoped Open callback, `WorkspaceItemActions`/`WorkspaceItemMenu`, existing palette/keybinding/touch dispatch, permission-aware writes |
| W4-T6    | Compact shell and single-body regression                    | one body transfers between aside and sheet; close/reopen and focus return retain project/tab; no duplicate lease                                         |
| W4-T7    | Isolated sample workspace fixture and eight capture recipes | non-writing fixture 05/06 selectors, fixed clock/theme/font, controlled page, sample-only activity text, capture manifest                                |

W4 WorkspaceResourceBodyProps retains environmentId/projectId, selectedItem: WorkspaceLinkEndpoint | null, request: WorkspaceItemRef | null and onOpen. Import useWorkspaceResources from workspaceResourceState.ts for the single context-owned openResource({ tab, projectId, request }) handoff. Shell header data is WorkspaceHeaderModel via WorkspaceEngagement.header; workspaceRailItems supplies rail data and view is the only rail URL key. These contracts are not redefined here.

New W10 body props extend the canonical props; projectTitle comes from the selected resource project and linkTarget is a derived alias of selectedItem, never a second selection store:

```ts
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";

type WorkspaceBrowserProps = WorkspaceResourceBodyProps & {
  projectTitle: string;
  linkTarget: WorkspaceResourceBodyProps["selectedItem"];
  visible: boolean;
};

type WorkspaceAgentsProps = WorkspaceResourceBodyProps & {
  projectTitle: string;
};
```

Use `key={`${environmentId}:${projectId}`}` at the body boundary so local address, picker and error state cannot leak across environments/projects. Browser has no selected-item target before a selection; browsing and project-agent actions still work. Disable Link with `Select an item to link this page to.` rather than silently substituting the resource project. A named `Link to project` choice may explicitly choose that project through existing shared actions.

## Tasks

### Task W10-T1: Inline desktop Browser using existing preview lease

**Depends on:** W4-T6. W4-T7 is a visual prerequisite only. No W9 dependency.

**Serial slot:** First W10 Browser/UI extraction slot; acquire WorkspaceResourceBody.tsx after W8-T8 or the nearest admitted body-switch predecessor. Exclusively own `WorkspaceToolsPanel.tsx`, the new Browser body, and the preview component prop changes while editing. Coordinate with any other preview owner. No RPC/migration/context slot.

**Door:** two-way. **Blast Radius:** medium. The shared preview default must remain unchanged for Code. Rollback restores the old presentation adapter without deleting preview sessions or links.

**Files:**

- Modify `apps/web/src/components/workspace/WorkspaceToolsPanel.tsx:1-29,75-112,170-330` only for legacy Browser extraction/removal.
- Modify `apps/web/src/components/workspace/WorkspaceResourceBody.tsx` Browser case and `WorkspaceResourceBody.test.tsx`; preserve all other cases.
- Modify `apps/web/src/components/workspace/dev/browserMockupModule.tsx`, the W4-T7-owned adapter transferred to T1.
- Create `apps/web/src/components/workspace/WorkspaceBrowser.tsx`, `WorkspaceBrowserView.tsx` and `WorkspaceBrowser.test.tsx`. Keep the view free of live container/query/preview imports.
- Modify `apps/web/src/components/workspace/WorkspaceToolsPanel.test.tsx:1-175`, preserving current Files/Agents tests until T4 takes their ownership.
- Modify `apps/web/src/components/preview/PreviewPanel.tsx:3-20,23-53` and `PreviewView.tsx:77-88,708-825` for one optional chrome renderer.
- Modify `apps/web/src/components/preview/PreviewView.test.tsx:1-654` and `apps/web/src/browser/browserSurfaceStore.test.ts:1-200` for relevant regressions.
- Read/reuse `openPreviewSession.ts:27-65`, `openPreviewSession.test.ts:1-142`, `BrowserSurfaceSlot.tsx:29-82`, `browserSurfaceStore.ts:197-231`, `PreviewPanelShell.tsx:17-38` and `usePreviewSession.ts:31-100`. These are not rewrite targets.

**Interfaces:** Consumes W4-T4a/T6 WorkspaceResourceBodyProps and body selection/visibility, W4-T5 scoped settings, `workspaceTools.config({ environmentId, input: { projectId } })`, `ScopedThreadRef`, and existing preview snapshots/events. Produces `WorkspaceBrowser(props: WorkspaceBrowserProps)`, optional `renderChrome` and optional `surfaceCornerRadius?: number` props on the incumbent preview components. No wire shape changes.

- [ ] Add a red interaction test before extracting. Extend the existing `WorkspaceToolsPanel.test.tsx` mock harness so its fake PreviewPanel renders a visible `Incumbent Browser` region and follows the `visible` prop. For the post-extraction test, its fake must also render the passed `renderChrome` with navigation controls whose submit uses the fake preview boundary; it cannot discard the tested form. Keep a separate real PreviewView test for the forwarded renderer and its native slot. Preserve the existing mock page/title and configured remote thread. Add this test using its existing `mount`, `renderer`, `mocks`, and `item` declarations:

```tsx
it("shows the configured desktop page in the resource body without opening a dialog", async () => {
  mocks.desktop = true;
  mocks.preview.mockResolvedValue({ _tag: "Success", value: {} });
  await mount();
  await act(() =>
    renderer!.root.findByType("input").props.onChange({
      target: { value: "https://example.test/page" },
    }),
  );
  await act(() =>
    renderer!.root.findByType("form").props.onSubmit({
      preventDefault() {},
    }),
  );
  const dialog = renderer!.root.findAllByProps({ role: "dialog" });
  expect(dialog).toHaveLength(0);
  expect(JSON.stringify(renderer!.toJSON())).toContain("Incumbent Browser");
  expect(mocks.preview).toHaveBeenCalledWith(
    expect.objectContaining({
      threadRef: { environmentId: "remote", threadId: "t" },
      url: "https://example.test/page",
    }),
  );
});
```

For the red witness, the dialog mock must preserve `role="dialog"` on its open wrapper instead of dropping the wrapper as it currently does. Use `<div role="dialog">{children}</div>`. This exposes the existing modal behavior rather than making a false passing assertion. After W4 changes, update only the mount adapter to its delivered resource-project props. Keep this public action and assertions.

- [ ] Run from `apps/web`: `vp test run src/components/workspace/WorkspaceToolsPanel.test.tsx`. Expected red: the current Browser has no native form to submit. Preserve that observation before the product edit. Once the form exists, the same test also rejects the mandatory dialog. Move this coverage into `WorkspaceBrowser.test.tsx` when the extracted body is available.

- [ ] Add the native presentation handoff test to the existing store suite. This uses the real public lease API, not callback counts:

```ts
it("hands one tab between resource and Code without a stale release hiding its owner", () => {
  const tab = "remote:browser-thread:epoch-1:tab-1";
  const resource = acquireBrowserSurface(tab);
  expect(resource.present({ x: 953, y: 191, width: 314, height: 311 }, true, 9)).toBe(true);
  const code = acquireBrowserSurface(tab);
  expect(resource.present({ x: 953, y: 191, width: 314, height: 311 }, true)).toBe(false);
  expect(code.present({ x: 700, y: 80, width: 580, height: 720 }, true)).toBe(true);
  resource.release();
  expect(useBrowserSurfaceStore.getState().byTabId[tab]?.visible).toBe(true);
  code.release();
  const returned = acquireBrowserSurface(tab);
  expect(returned.present({ x: 953, y: 191, width: 314, height: 311 }, true, 9)).toBe(true);
  expect(Object.keys(useBrowserSurfaceStore.getState().byTabId)).toEqual([tab]);
  returned.release();
  expect(useBrowserSurfaceStore.getState().byTabId[tab]?.visible).toBe(false);
});
```

This is a preservation test and may already pass. It does not replace the red inline journey or prove session reuse alone.

- [ ] Wire WorkspaceBrowser into the Browser case in WorkspaceResourceBody.tsx, forwarding canonical props and request, plus derived projectTitle/linkTarget/visibility. Test Browser selection, requested URL and switch-away/unmount without losing another case. Extract the existing Browser function, retaining the environment+project filter on `browserThreadId`, `useWorkspaceCanOperate`, `openPreviewSession`, error messages and external path. Remove the outer bordered Browser tool card and redundant heading/project selector after binding the W4 resource body. Keep missing config guidance and project settings access.

- [ ] Add one optional renderer to the incumbent preview, forwarding it unchanged through `PreviewPanel`. Use the exact existing PreviewChromeRow props as its type:

```tsx
import type { ComponentProps, ReactNode } from "react";

type PreviewChromeRenderer = (
  controls: ComponentProps<typeof PreviewChromeRow>,
) => ReactNode;

// Add to PreviewView Props, and use an exported alias for PreviewPanel's prop.
renderChrome?: PreviewChromeRenderer;
```

Move the current `PreviewChromeRow` JSX props at `PreviewView.tsx:713-777` into a `chromeProps` object checked with `satisfies ComponentProps<typeof PreviewChromeRow>`. Preserve every existing callback, profile indicator and `PreviewMoreMenu`. Render it once:

```tsx
{
  renderChrome ? renderChrome(chromeProps) : <PreviewChromeRow {...chromeProps} />;
}
```

Export `PreviewChromeRenderer` from `PreviewView.tsx` and type-import it in PreviewPanel. Keep the default prop absent for all Code callers. Do not duplicate BrowserSurfaceSlot or its runtime-tab-ID calculation in WorkspaceBrowser.

Use a local feature component for the compact chrome. The following complete form/popup shows the structure. Existing UI Buttons use their variants and sizes, without restyling them. Render `ResourceBrowserChrome` as an element in `renderResourceChrome`, so its hooks belong to a component rather than a render callback:

```tsx
function ResourceBrowserChrome({
  controls,
}: {
  controls: ComponentProps<typeof PreviewChromeRow>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mb-[13px] shrink-0">
      <form
        className="flex h-[29px] min-w-0 items-center gap-1 rounded-full border border-border bg-muted px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring"
        onSubmit={(event) => {
          event.preventDefault();
          const url = normalizeLinkUrl(draft);
          if (!url) {
            setError("Enter an http or https address.");
            return;
          }
          setError(null);
          controls.onSubmit(url);
        }}
      >
        <Search size={12} aria-hidden="true" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[10px] text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Browser page address"
          placeholder="Search or enter a URL"
          maxLength={2048}
          value={draft}
          disabled={controls.inputDisabled}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Popover>
          <PopoverTrigger
            render={
              <Button type="button" size="icon-xs" variant="ghost" aria-label="Browser actions" />
            }
          >
            <SlidersHorizontal size={12} />
          </PopoverTrigger>
          <PopoverPopup>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={!controls.canGoBack}
              onClick={controls.onBack}
            >
              Back
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={!controls.canGoForward}
              onClick={controls.onForward}
            >
              Forward
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={controls.refreshDisabled}
              onClick={controls.onRefresh}
            >
              Reload
            </Button>
            {controls.leadingActions}
            {controls.trailingActions}
          </PopoverPopup>
        </Popover>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
```

Import Search/SlidersHorizontal from lucide-react and Popover/PopoverTrigger/PopoverPopup from the existing UI module. Use the delivered W4 token mapping for the observed dark fill; no new stylesheet is needed. In T3, lift this local draft to WorkspaceBrowser and pass it into the chrome so local search and captured external address use the same value. T2's external branch uses the same feature form layout with its external-submit action.

- [ ] Supply a feature-owned compact form through `renderChrome`. Its native form submit calls the provided `controls.onSubmit` with a validated URL. SlidersHorizontal opens an anchored popup with `controls.onBack`, `onForward`, `onRefresh`, `leadingActions`, and `trailingActions`. Keep disabled state and existing profile scope. Optional Enlarge swaps the inline presentation for one dialog presentation, never both. The fullscreen/Code controls remain in the incumbent paths. Do not add capture/recording buttons to the compact pill.

```tsx
<div className="min-h-0 min-w-0 flex-1">
  <Suspense fallback={<p role="status">Loading Browser...</p>}>
    <PreviewPanel
      mode="embedded"
      threadRef={threadRef}
      visible={visible}
      renderChrome={renderResourceChrome}
      surfaceCornerRadius={9}
    />
  </Suspense>
</div>
```

`threadRef` is the already validated configured thread, never the selected conversation. `renderResourceChrome` is the component's local renderer using the 29px pill specified above. Forward `surfaceCornerRadius` through PreviewPanel into PreviewView, defaulting to zero. Apply it to the existing surface container's border radius and to `BrowserSurfaceSlot.cornerRadius`; CSS clipping alone cannot round a native guest. The isolated fixture's preview wrapper is 353px high: 29px pill, 13px gap, 311px page. Live mode uses fluid available space. Preserve native resize measurement. If enlargement is included, conditionally mount one PreviewPanel branch; pass the same scoped thread and active tab. Do not call preview close on unmount or resource-tab switch.

- [ ] Add the remaining named tests to `WorkspaceBrowser.test.tsx`: redirect and title event update the active page; hide/unmount and return reuse the same session/tab; Enlarge closes back to inline; missing configured thread gives settings guidance; failed load exposes Retry; resource project and selected chat can differ; older server rejects preview read without an unhandled error. Use actual preview store events and fake preview transport, with one awaited open result. Assert session identity and displayed page after return, not merely an open callback count. A reconnect/epoch change must use the existing runtime-tab-ID path rather than the old native guest.

- [ ] Complete apps/web/src/components/workspace/dev/browserMockupModule.tsx under its per-file slot. Export createWorkspaceMockupModule: CreateWorkspaceMockupModule returning WorkspaceMockupModule. Extract/export pure WorkspaceBrowserView in WorkspaceBrowserView.tsx with controlled addressDraft, linkTarget, displayedUrl, renderPage: ReactNode, menuOpen, unavailableReason and onAddressChange/onSubmit/onMenuChange/onOpenExternal callbacks. The live WorkspaceBrowser supplies real preview state; the adapter supplies local inert site content and fake commands to that same view. Only then set readyRegions: ["resource"] for 05. settled() awaits fake command completion; dispose releases adapter state. Never mount the live container, preview session, native lease or RPC in the fixture. Extend WorkspaceBrowser.test.tsx for fake-backed readiness/isolation; no registration API.

- [ ] Run from `apps/web`:

```text
vp test run src/components/workspace/WorkspaceBrowser.test.tsx src/components/workspace/WorkspaceToolsPanel.test.tsx src/components/preview/PreviewView.test.tsx src/components/preview/openPreviewSession.test.ts src/browser/browserSurfaceStore.test.ts src/components/workspace/WorkspaceResourceBody.test.tsx
vp lint src/components/workspace/WorkspaceBrowser.tsx src/components/workspace/WorkspaceBrowser.test.tsx src/components/workspace/WorkspaceToolsPanel.tsx src/components/workspace/WorkspaceToolsPanel.test.tsx src/components/preview/PreviewPanel.tsx src/components/preview/PreviewView.tsx src/components/preview/PreviewView.test.tsx src/browser/browserSurfaceStore.test.ts src/components/workspace/WorkspaceResourceBody.tsx src/components/workspace/WorkspaceResourceBody.test.tsx src/components/workspace/dev/browserMockupModule.tsx src/components/workspace/WorkspaceBrowserView.tsx
vp run typecheck
```

Expected green: inline journey passes; Code default chrome/profile tests remain green; one lease/session survives return. No server test/typecheck claim is made by running the web package.

- [ ] Surface checklist: resource tab and existing Code Browser/settings entry agree; web fallback remains available for T2; phone uses W4 sheet; no RN screen or shared decode change; Codex/Claude/Cursor/Grok/OpenCode/ACP providers keep existing preview tooling and do not run from opening UI; no contract change; hide/show, close/reopen, enlarge/return and failed-load/retry retain session; local and remote configured threads remain environment-scoped. T4 owns final user/internal documentation.

- [ ] Visual acceptance: after W4-T7, capture `/workspace?space=communications&fixture=05`, Browser selected, controlled site settled. Compare PNG 05 box `[953,149,314,354]`, heading wrap, comma, CTA, site footer and absence of nested chrome within V1. Clear focus/hover and close popup. Allowed substitutions are D03 selection correction and the W4 chrome table only in fixture mode; actual website/title/URL only in live mode. Review compact menu, load failure and enlargement proposed captures separately. A mocked DOM test cannot establish native compositing.

- [ ] Commit only the changed paths below during later authorized implementation:

```text
git add -- apps/web/src/components/workspace/WorkspaceBrowser.tsx apps/web/src/components/workspace/WorkspaceBrowser.test.tsx apps/web/src/components/workspace/WorkspaceToolsPanel.tsx apps/web/src/components/workspace/WorkspaceToolsPanel.test.tsx apps/web/src/components/preview/PreviewPanel.tsx apps/web/src/components/preview/PreviewView.tsx apps/web/src/components/preview/PreviewView.test.tsx apps/web/src/browser/browserSurfaceStore.test.ts apps/web/src/components/workspace/WorkspaceResourceBody.tsx apps/web/src/components/workspace/WorkspaceResourceBody.test.tsx apps/web/src/components/workspace/dev/browserMockupModule.tsx apps/web/src/components/workspace/WorkspaceBrowserView.tsx
git commit -m "feat(web): show project Browser inside resources"
```

### Task W10-T2: Truthful web and phone external-tab Browser

**Depends on:** W10-T1 and W4-T6. **Serial slot:** W10 Browser/UI, predecessor W10-T1. Acquire the user-doc file separately if another wave is editing it.

**Door:** two-way. **Blast Radius:** low. No protocol or persistence changes.

**Files:** Modify the T1-created `WorkspaceBrowser.tsx`, `WorkspaceBrowserView.tsx` and `WorkspaceBrowser.test.tsx`, and `docs/user/workspace-spaces.md:53-67`. Read `apps/web/src/localApi.ts:20-31` and `localApi.test.ts:1-130`. Do not broaden LocalApi or reinterpret its web return as an observed tab. Extend `WorkspaceEngagement.test.tsx:1-45` only if the new body exposes a regression in W4's compact transfer; it is an exclusive W4/T2 shared-file handoff, not authority to redesign the shell.

**Interfaces:** Consumes `WorkspaceBrowserProps`, W4-T6 sheet/back/focus contract, `normalizeLinkUrl`, `readLocalApi().shell.openExternal(url): Promise<void>`. Produces the external-tab card and a validated current pasted address. No PreviewPanel is mounted when `isPreviewSupportedInRuntime()` is false. A desktop client connected to an unsupported preview environment offers an explicit external-open alternative after the existing failure, rather than claiming inline availability.

- [ ] Add red tests to the extracted Browser's interaction suite. Retain T1's test setup and add a `setAddress` helper that calls the labeled input's change action and a `clickText` helper that finds a button by its visible text. Use the same deterministic mock query/preview boundaries. Core assertions are:

```tsx
it("keeps the pasted link target when external opening is blocked", async () => {
  mocks.desktop = false;
  mocks.external.mockResolvedValue(undefined);
  await mount();
  await act(() =>
    renderer!.root.findByType("input").props.onChange({
      target: { value: "https://example.test/pasted?utm_source=test#section" },
    }),
  );
  const button = renderer!.root
    .findAllByType("button")
    .find((node) => node.props.children === "Open in new tab")!;
  await act(() => button.props.onClick());
  const text = JSON.stringify(renderer!.toJSON());
  expect(text).toContain("Link target");
  expect(text).toContain("https://example.test/pasted");
  expect(text).toContain("If no tab opened");
  expect(text).not.toContain("Page opened successfully");
  expect(renderer!.root.findAllByType("iframe")).toHaveLength(0);
  expect(button.props.disabled).not.toBe(true);
});
```

The fake void success models the current helper's unobservable popup-block result. Add a DOM test with `window.open` returning null to exercise the actual helper under the same action. Do not assert that null means blocked, because `noopener` can also return null on success. Separately reject `mocks.external` with `new Error("Unable to open link.")` and assert a visible alert, unchanged input and usable retry.

- [ ] Run from `apps/web`: `vp test run src/components/workspace/WorkspaceBrowser.test.tsx`. Expected red: the current extracted body lacks the external card's Link target and retry guidance.

- [ ] Render a dedicated external branch. Keep address opening in the direct click or form-submit gesture, before awaiting any unrelated work. Validate via `normalizeLinkUrl`. Store error/busy state, and never set a web observed-page snapshot or opened-success state:

```tsx
const openExternalAddress = async () => {
  const url = normalizeLinkUrl(address);
  if (!url) {
    setError("Enter an http or https address.");
    return;
  }
  const api = readLocalApi();
  if (!api) {
    setError("Browser is unavailable on this client.");
    return;
  }
  setError(null);
  try {
    await api.shell.openExternal(url);
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : "The page could not be opened.");
  }
};
```

The helper above launches synchronously up to its first await. The retained input is the only source for an external link endpoint. Show the exact external guidance specified in the reference section at all times. A known host error is an alert; unknown web popup outcome keeps neutral retry guidance. Use a selectable URL and an explicit copy action through the existing clipboard path if present. Do not add popup inspection or navigation listeners.

- [ ] Add named interaction cases `rejects unsafe addresses`, `pasting a new address replaces only the external link target`, `missing operate permission still allows external reading`, and `external mode never mounts the desktop preview`. Invalid `javascript:`, `file:`, empty and over-2048-character input must not call the external boundary. Non-URL text remains a project-linked-page query for T3; no search engine request. A reader may open an external URL while link mutation remains disabled.

- [ ] Add DOM cases at W4's delivered resize/sheet boundary: 390x844 sheet open, long URL wrapping, Back restores selected message/draft/focus, 1024 sheet to 1280 aside transfer, and no duplicate Browser body after a resize. Use resize events/observer callbacks and awaited React work, not time-based readiness. CSS overflow is verified in the later primary client pass as well; a DOM test alone cannot measure browser layout.

- [ ] Update the existing Browser paragraph in `docs/user/workspace-spaces.md`. State that desktop keeps the project Browser inside Resources, web/phone open a new tab, the pasted address is Link target, and users must paste a changed address after browsing externally. Do not add implementation paths or imply browser cookies transfer to the server.

- [ ] Run from `apps/web`:

```text
vp test run src/components/workspace/WorkspaceBrowser.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx src/localApi.test.ts src/components/workspace/WorkspaceResourceBody.test.tsx
vp lint src/components/workspace/WorkspaceBrowser.tsx src/components/workspace/WorkspaceBrowser.test.tsx src/components/workspace/WorkspaceBrowserView.tsx
vp run typecheck
```

Expected green: invalid addresses stay local; external launch failure preserves the input; a blocked/unknown popup has a retry path; compact navigation retains the center selection.

- [ ] Surface checklist: form Enter, explicit Open, shared URL opener, touch menu and retry use the same address; desktop inline remains unchanged; responsive web and phone sheet delivered, RN screens unchanged; all provider adapters receive no new capability or run; contracts unchanged; open/retry/cancel and sheet close/reopen retain address within the current scope; environment/project changes reset scoped draft state; external site state remains client-local over local/direct/relay/tunnel connections. User guide updated here, durable internal decision reviewed in T4.

- [ ] Visual acceptance: W4-T7 fixture 05 plus an explicit web-runtime variant. Compare pill `[953,149,314,29]` to PNG 05. Review the external body in `[953,191,314,311]` as a D21 substitution with exact guidance and Link target. Capture 390x844 and 1024px long-address/focus states. No iframe, false observed navigation, blank embedded rectangle or page-level horizontal overflow. Allowed live substitution is the entered URL, actual project name and W4 live chrome.

- [ ] Commit the changed files explicitly. If a W4 compact regression required a test change, name it separately after reviewing that diff.

```text
git add -- apps/web/src/components/workspace/WorkspaceBrowser.tsx apps/web/src/components/workspace/WorkspaceBrowser.test.tsx docs/user/workspace-spaces.md apps/web/src/components/workspace/WorkspaceBrowserView.tsx
git commit -m "feat(web): explain project Browser external tabs"
```

### Task W10-T3: Captured page actions and linked-page search

**Depends on:** W10-T1, W10-T2 and W4-T5. **Serial slot:** W10 Browser/UI, predecessor W10-T2. Acquire shared item-action/opener ownership before touching them. No server/context write slot.

**Door:** two-way. **Blast Radius:** medium. Captured endpoints affect persistent links and thread context. Rollback removes only new entrances, never stored relations.

**Files:**

- Modify `apps/web/src/components/workspace/WorkspaceBrowserView.tsx` alongside the live Browser to keep page/search/menu presentation shared with the isolated adapter.

- Modify T1-created `WorkspaceBrowser.tsx` and `WorkspaceBrowser.test.tsx`.
- Create `apps/web/src/components/workspace/workspaceBrowser.logic.ts` and `.test.ts` for canonical capture and bounded local search used by both Browser modes.
- Modify `apps/web/src/components/workspace/useWorkspaceItemOpener.ts:38-81` and `.test.ts:1-16` for an optional project-resource URL opening path.
- Modify `WorkspaceItemActions.tsx:43-63,141-180,465-575` and `.test.tsx:1-125` only if W4's shared captured-resource actions do not already satisfy the behavior. Preserve its touch/context/keybinding dispatch and existing confirmation semantics.
- Read/reuse `mail/useMailLinks.ts:17-57`, `mail/LinkedSection.tsx:150-205,225-282,364-395`, `packages/contracts/src/pulseLinks.ts:17-37,125-196,275-291`, and existing link atom subscriptions. Do not add another picker or relation store.
- Regression-only suites: `packages/contracts/src/pulseLinks.test.ts`, `apps/server/src/workspace/WorkspaceLinks.test.ts`, `apps/server/src/workspace/linkedItemsTurn.integration.test.ts`, and `apps/server/src/mcp/toolkits/workspace/handlers.test.ts`. They are not default edit targets.

**Interfaces:** Consumes W4-T5 captured shared actions, `WorkspaceLinkEndpoint`, `WorkspaceLinkList`, `PreviewSessionSnapshot["navStatus"]`, `useMailLinks(environmentId).linkItem(a,b)` and `.unlink(id)`, scoped `workspaceLinks.list` and subscribeChanges invalidation. Produces `captureWorkspacePage`, `findLinkedPages`, compact Link/menu actions, and an optional resource-aware URL handler on `useWorkspaceItemOpener`. URL reads remain metadata-only and thread reads unsupported under D22.

- [ ] Write the red capture test in the new logic suite using existing contract identities:

```ts
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { captureWorkspacePage, findLinkedPages } from "./workspaceBrowser.logic";

it("captures URL, title, environment and target before navigation changes them", () => {
  const target = {
    ref: { type: "project" as const, projectId: ProjectId.make("selected-item-project") },
    title: "Captured target",
  };
  const captured = captureWorkspacePage({
    environmentId: EnvironmentId.make("remote-a"),
    target,
    desktop: true,
    address: "https://ignored.test/typed",
    navigation: {
      _tag: "Success",
      url: "https://example.test/final?utm_source=demo#heading",
      title: "Redirected page",
    },
  });
  target.title = "Changed selection label";
  expect(captured).toEqual({
    environmentId: "remote-a",
    target: {
      ref: { type: "project", projectId: "selected-item-project" },
      title: "Captured target",
    },
    page: {
      ref: { type: "url", url: "https://example.test/final" },
      title: "Redirected page",
    },
  });
  expect(
    captureWorkspacePage({
      environmentId: EnvironmentId.make("remote-a"),
      target: null,
      desktop: false,
      address: "https://example.test/",
      navigation: undefined,
    }),
  ).toBeNull();
});
```

- [ ] Run from `apps/web`: `vp test run src/components/workspace/workspaceBrowser.logic.test.ts`. Expected red: the named module/functions do not yet exist. After implementing capture, add web-address and Loading/LoadFailed cases before claiming green.

- [ ] Implement only the shared capture/search logic needed by this body:

```ts
import {
  normalizeLinkUrl,
  workspaceItemKey,
  type EnvironmentId,
  type PreviewSessionSnapshot,
  type WorkspaceLinkEndpoint,
  type WorkspaceLinkList,
} from "@t3tools/contracts";

export function captureWorkspacePage(input: {
  environmentId: EnvironmentId;
  target: WorkspaceLinkEndpoint | null;
  desktop: boolean;
  address: string;
  navigation: PreviewSessionSnapshot["navStatus"] | undefined;
}) {
  const navigation = input.navigation;
  if (input.desktop && navigation?._tag !== "Success") return null;
  const raw = input.desktop && navigation?._tag === "Success" ? navigation.url : input.address;
  const url = normalizeLinkUrl(raw);
  if (!url || !input.target) return null;
  const title = input.desktop && navigation?._tag === "Success" ? navigation.title : url;
  return {
    environmentId: input.environmentId,
    target: structuredClone(input.target),
    page: { ref: { type: "url" as const, url }, title: title.slice(0, 300) },
  };
}

export function findLinkedPages(list: WorkspaceLinkList | null, query: string) {
  const needle = query.trim().toLocaleLowerCase("en-GB");
  const seen = new Set<string>();
  return (list?.linked ?? [])
    .filter((view) => {
      if (view.status !== "confirmed" || view.item.ref.type !== "url") return false;
      const key = workspaceItemKey(view.item.ref);
      if (seen.has(key)) return false;
      seen.add(key);
      return `${view.item.title ?? ""}\n${view.item.ref.url}`
        .toLocaleLowerCase("en-GB")
        .includes(needle);
    })
    .slice(0, 50);
}
```

Use the current project's direct bounded link result, never the selected item's list or projectHub one-hop discovery. Preserve its `truncated` indication as `Only loaded linked pages are searched.` Search does not scan additional projects, provider histories or an Internet engine. Empty non-URL results say `No linked pages match. Paste an http or https address to open a page.`

Replace T1's URL-only invalid-input branch for ordinary text queries. On Enter, a valid address submits through the existing navigation handler; nonempty text opens the local results. Empty input clears results. A string with an explicit unsupported scheme still shows the unsafe-address validation error, rather than becoming an external navigation. In the desktop chrome's submit handler the core branch is:

```tsx
const url = normalizeLinkUrl(address);
if (url) {
  setSearchOpen(false);
  controls.onSubmit(url);
} else if (/^[a-z][a-z0-9+.-]*:/iu.test(address.trim())) {
  setError("Enter an http or https address.");
} else {
  setError(null);
  setSearchOpen(address.trim().length > 0);
}
```

`address`, `searchOpen` and error state belong to the scoped WorkspaceBrowser instance. Pass the controlled draft and handler into ResourceBrowserChrome. For external mode, the valid-URL branch calls `openExternalAddress()` directly from the same form event; the text-query branch remains local. Show the selected results from `findLinkedPages(projectLinks.data, address)` below the pill in a reviewed popup, with no active-site navigation until a result is explicitly chosen.

Add a real bounded search test. Import `WorkspaceLinkList` as a schema value and `effect/Schema` as Schema in the same new test file:

```ts
it("searches confirmed direct pages and collapses canonical duplicates", () => {
  const makeView = (suffix: string, url: string, status: "confirmed" | "suggested") => ({
    id: `wl_00000000-0000-0000-0000-${suffix}`,
    item: { ref: { type: "url", url }, title: "Project handbook" },
    status,
    source: { type: "user" },
    updatedAt: "2026-10-13T09:00:00.000Z",
  });
  const list = Schema.decodeUnknownSync(WorkspaceLinkList)({
    linked: [
      makeView("000000000001", "https://example.test/handbook", "confirmed"),
      makeView("000000000002", "https://example.test/handbook#intro", "confirmed"),
    ],
    suggested: [makeView("000000000003", "https://other.test/handbook", "suggested")],
    truncated: true,
  });
  expect(findLinkedPages(list, "HANDBOOK")).toHaveLength(1);
  expect(findLinkedPages(list, "other.test")).toHaveLength(0);
  expect(findLinkedPages(list, "nothing matches")).toHaveLength(0);
});
```

- [ ] In Browser, capture the target/page/environment synchronously on Link/menu activation. Freeze the menu's page endpoint until that menu closes. Link only when capability and operate permission allow it. Bind the pending command to the captured environment, so changing the active environment cannot redirect the mutation:

```tsx
const captured = captureWorkspacePage({
  environmentId,
  target: linkTarget,
  desktop,
  address,
  navigation: preview.snapshot?.navStatus,
});
if (!captured) return;
const { target, page } = captured;
await linkItem(target, page);
```

Here `linkItem` is the `useMailLinks(environmentId)` instance from the same render that captured the action. Its environment does not come from a later active-environment lookup. Guard local result/error updates after scope change/unmount; do not cancel or retarget a command already issued. The original endpoint identity remains the write target even if the current page redirects or the selected message changes.

- [ ] Add the async UI regression `links the captured page to the captured target after navigation`. In the existing React test harness, use a promise gate, issue Link, update preview snapshot and selected item, then resolve the gate:

```ts
let finish!: () => void;
const pending = new Promise<void>((resolve) => {
  finish = resolve;
});
mocks.link.mockImplementation(() => pending);
```

Read the captured `mocks.link.mock.calls[0]` before resolving, update the mounted Browser with the different target and publish a new preview Success event, then `finish()` inside `act`. Assert the acknowledged relation has the original two refs and original title. Repeat with another environment containing the same project/thread IDs and verify no mutation was sent to it. Assert Link is disabled with a named reason for no selection, pending navigation, failed load, no operate permission and duplicate in-flight submission.

- [ ] Give linked-page results a normal selectable list with Open and shared actions. The small Sliders/menu control and active-page menu wrap `WorkspaceItemMenu`/`WorkspaceItemActions` around the captured page endpoint, never the conversation behind it. Keep Link target visible in the popup/card. Result menus show link/unlink provenance through existing controls. Link/unlink/relink uses existing service semantics, preserving the first origin and reverse-pair deduplication.

- [ ] Extend the URL opener with an optional second argument. Keep existing callers' behavior, including Drive external opening, unchanged. The new optional branch delegates resource URL opening to the already scoped Browser rather than opening a second modal:

```ts
type WorkspaceOpenOptions = {
  openPage?: (ref: Extract<WorkspaceItemRef, { type: "url" }>) => void;
};

// Add options: WorkspaceOpenOptions = {} to useWorkspaceItemOpener.
if (ref.type === "url" && options.openPage) {
  options.openPage(ref);
  return;
}
```

The W4/T1 adapter supplies `openPage` only when it can select the existing Browser body for the captured environment/resource project. Desktop uses its configured preview thread; web/phone call the external opener from the actual result click. Do not put a callback in persisted route state. Header/palette/keybinding actions use W4's single active-resource endpoint dispatcher; do not register competing global shortcut listeners in Browser and the center conversation.

- [ ] Add focused tests for local title/URL search, duplicate canonical URLs, suggested/one-hop rows excluded, truncated results labelled, direct URL Enter opening, context menu/keyboard/touch carrying page refs, and external opener dispatch without observing later external navigation. Reuse `WorkspaceItemActions.test.tsx` and the existing linked-context tests for Start thread with retained/removed URL chips, Start project cancellation, Add to project and automation cancellation. No retained chip means no link grant, no automatic paid run before Send, and no page-content grant after Send.

- [ ] Run the narrow public-boundary regressions. Commands are separate by package:

```text
# apps/web
vp test run src/components/workspace/WorkspaceBrowser.test.tsx src/components/workspace/workspaceBrowser.logic.test.ts src/components/workspace/useWorkspaceItemOpener.test.ts src/components/workspace/WorkspaceItemActions.test.tsx src/components/workspace/WorkspaceResourceBody.test.tsx
vp lint src/components/workspace/WorkspaceBrowser.tsx src/components/workspace/WorkspaceBrowser.test.tsx src/components/workspace/workspaceBrowser.logic.ts src/components/workspace/workspaceBrowser.logic.test.ts src/components/workspace/useWorkspaceItemOpener.ts src/components/workspace/useWorkspaceItemOpener.test.ts src/components/workspace/WorkspaceBrowserView.tsx
vp run typecheck
# packages/contracts
vp test run src/pulseLinks.test.ts
# apps/server
vp test run src/workspace/WorkspaceLinks.test.ts src/workspace/linkedItemsTurn.integration.test.ts src/mcp/toolkits/workspace/handlers.test.ts
```

Expected green: canonical pair/origin tests pass, second-client invalidation remains subscription-based, context remains bounded/sanitized, URL read returns metadata and thread read remains unsupported. Do not change server behavior to make a new UI promise true. If these existing suites lack a required public-seam case, request the shared context slot and a bounded test-only amendment before editing them.

- [ ] Surface checklist: address Enter, result Open, Link, header, context menu, palette, configured keybinding and touch/drag use captured page refs; desktop uses its existing preview, web/phone external path; native contracts unchanged; Codex/Claude/Cursor/Grok/OpenCode/ACP receive existing bounded linked metadata only, unsupported provider tool support stays explicit; no contract/schema expansion; link/unlink/relink and retained/removed composer chips preserve grant semantics; second-client changes refresh only this environment through existing subscriptions. Final guide wording and internals/glossary review belong to T4.

- [ ] Visual acceptance: PNG 05 pill `[953,149,314,29]` unchanged and site CTA untouched. Capture the 05 fixture with menu closed, then proposed search results and captured-page popup with the selected item's target name visible. Results must not overlap beyond the resource popup's bounds or add a permanent action stack. Allowed live substitutions are real captured URL/title, linked-page results and W4 chrome. D21 excludes Internet search, extraction, cookies and history synchronization.

- [ ] Commit only actual owned changes. Add shared item-action files separately only when their diff was required and verified.

```text
git add -- apps/web/src/components/workspace/WorkspaceBrowser.tsx apps/web/src/components/workspace/WorkspaceBrowser.test.tsx apps/web/src/components/workspace/workspaceBrowser.logic.ts apps/web/src/components/workspace/workspaceBrowser.logic.test.ts apps/web/src/components/workspace/useWorkspaceItemOpener.ts apps/web/src/components/workspace/useWorkspaceItemOpener.test.ts apps/web/src/components/workspace/WorkspaceBrowserView.tsx
git commit -m "feat(web): capture project page links and search"
```

### Task W10-T4: Project agents as real linked-thread cards

**Depends on:** W4-T5 and W4-T6. **Serial slot:** W10 Browser/UI, predecessor W10-T3. T3 is a shared-file scheduling edge, not a dependency on Browser data. No W9 dependency. W4-T7 gates only visual acceptance. Acquire the WorkspaceResourceBody.tsx slot after T1 and the nearest admitted predecessor, then user/internal docs ownership. Shared docs gate order is by wave number, admitted only: W4 -> W5 -> W6 -> W7 -> W8 -> W9-T8 -> W10-T4 -> W11 gate, splicing cuts. T2's workspace-spaces.md edit also holds this docs slot.

**Door:** two-way. **Blast Radius:** medium. A mistaken assignment would create shared context, so reuse explicit confirmations and environment authorization. Removing an assignment must not delete a thread or stop its run.

**Files:**

- Create `apps/web/src/components/workspace/WorkspaceAgents.tsx`, `WorkspaceAgentsView.tsx` and `WorkspaceAgents.test.tsx`. Keep the view free of live container/query imports.
- Modify `apps/web/src/components/workspace/WorkspaceResourceBody.tsx` Agents case and `WorkspaceResourceBody.test.tsx` under the body-switch slot.
- Modify `WorkspaceToolsPanel.tsx:48-73,135-166` and `WorkspaceToolsPanel.test.tsx:120-175` only to remove/extract the legacy Agents body. Retain item-linked threads in Linked context.
- Modify `apps/web/src/components/workspace/dev/agentsMockupModule.tsx` under its transferred W4-T7 adapter slot.
- Extend `useWorkspaceItemOpener.test.ts:1-16` for actual scoped navigation outcomes. T3 owns any production opener changes.
- Reuse `apps/web/src/state/entities.ts:75-111`, `packages/client-runtime/src/state/models.ts:36-125`, the existing environment connection state, link atom/change stream and shared thread picker/action UI. No transcript/detail hook in a row.
- Modify `docs/user/workspace-spaces.md:43-69`, `docs/internals/overview.md:1-126` and `docs/internals/glossary.md:6-21` only for the final documented behavior/decision. These anchors are current ranges, not instructions to rewrite whole documents.
- Wave-gate tests reuse `WorkspaceEngagement.test.tsx:1-45`, T1/T2 Browser tests, `WorkspaceItemActions.test.tsx:1-125` and existing server linked-context tests. No default server code change.

**Interfaces:** Consumes W4 resource selection and scoped Open, `workspaceLinks.list({ environmentId, input: { item: { type: "project", projectId } } })`, `WorkspaceLinkList.linked`, `WorkspaceLinkView.id`, and `EnvironmentThreadShell` through existing shared shell state. Produces `WorkspaceAgents(props: WorkspaceAgentsProps)` and flat project-agent rows. A confirmed link is an assignment; `thread.projectId` alone is not. No Agent/persona/model manager or independent scheduler.

- [ ] Start `WorkspaceAgents.test.tsx` from the existing `WorkspaceToolsPanel.test.tsx` mock pattern. Mock only query, shell and command boundaries; retain real component behavior. The query must distinguish project p from selected mail m and another environment. Give the test a project link to t1, no link for project-owned t2, a message-only link to t3, and a suggested t4. The first red assertion is the rendered assignment set after selecting project p.

```tsx
it("shows only confirmed project-thread assignments", async () => {
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(
      <WorkspaceAgents
        environmentId={EnvironmentId.make("remote")}
        projectId={ProjectId.make("p")}
        projectTitle="Project"
        onOpen={() => {}}
      />,
    );
  });
  const text = JSON.stringify(view.toJSON());
  expect(text).toContain("SEO analyst");
  expect(text).not.toContain("Merely project-owned");
  expect(text).not.toContain("Message-only helper");
  expect(text).not.toContain("Suggested agent");
  await act(() => view.unmount());
});
```

Use this complete link fixture for the mocked project-list response, alongside scoped shell stubs for the four named titles:

```ts
const assigned = {
  id: "wl_00000000-0000-0000-0000-000000000001",
  item: { ref: { type: "thread", threadId: "t1" }, title: "Stale title" },
  status: "confirmed",
  source: { type: "user" },
  updatedAt: "2026-10-13T09:00:00.000Z",
};
const projectList = { linked: [assigned], suggested: [], truncated: false };
```

The message list response contains only t3; t2 has no relation; t4 belongs only in `suggested`. Return a live t1 shell title `SEO analyst`. These are fake query-boundary data, not new production fixtures. For shell type-checked fixtures, reuse the nearest existing shell fixture constructor rather than asserting a partial object as a full shell.

- [ ] Run from `apps/web`: `vp test run src/components/workspace/WorkspaceAgents.test.tsx`. Expected red: the extracted module does not exist. After extraction the test must continue to prove the correct project-list query, not pass by hardcoded rows.

- [ ] Implement the body using the resource project and current environment only:

```tsx
const projectEndpoint: WorkspaceLinkEndpoint = {
  ref: { type: "project", projectId },
  title: projectTitle,
};
const capability = useMailCapabilities(environmentId);
const links = useEnvironmentQuery(
  capability.workspaceLinks
    ? workspaceLinks.list({ environmentId, input: { item: projectEndpoint.ref } })
    : null,
);
const threads = useThreadShells().filter((thread) => thread.environmentId === environmentId);
const byId = new Map(threads.map((thread) => [thread.id, thread]));
const connected = useConnectedEnvironmentIds().includes(environmentId);
const assignments = (links.data?.linked ?? []).filter(
  (view) => view.status === "confirmed" && view.item.ref.type === "thread",
);
```

Import `useConnectedEnvironmentIds` from `apps/web/src/state/environments.ts:108-110`. Derive the row title from `byId.get(threadId)?.title`, then endpoint title. Keep missing rows, reason and unlink action. Respect `links.data.truncated`; say `Some project assignments are not shown.` Do not walk all project threads or load their histories to fill the list. Missing live capability must override any cached supported-state UI.

- [ ] Derive initials and state in this feature component or private helpers. The shell has runtime/latestRun/pending flags, not a fine-grained activity text field. Use the following state rule, with environment connection readiness checked first:

```ts
function agentState(thread: EnvironmentThreadShell | undefined, connected: boolean) {
  if (!connected || !thread) return "Status unavailable";
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return "Waiting for your input";
  const status = thread.runtime?.status ?? thread.latestRun?.status;
  if (status === "waiting") return "Waiting for your input";
  if (status === "running") return "Working";
  if (status === "queued") return "Queued";
  if (status === "starting" || status === "preparing") return "Starting";
  if (status === "failed") return "Last run failed";
  if (status === "cancelled" || status === "interrupted" || status === "rolled_back") {
    return "Not running";
  }
  return status === "idle" || status === "completed"
    ? "Ready for your next instruction"
    : "Status unavailable";
}

function agentInitials(title: string) {
  const words = title.trim().split(/\s+/u);
  const first = Array.from(words[0] ?? "")[0] ?? "?";
  const second = Array.from(words[1] ?? "")[0] ?? "";
  return first.toLocaleUpperCase() + second.toLocaleLowerCase();
}
```

Use a static blue dot for known active starting/queued/working state; a static neutral dot for known idle; a text reason for error/unavailable/waiting. Do not label a stale/disconnected shell Ready. The fixture-only activity string must enter through W4-T7's dev/test fixture adapter, not a hardcoded thread-title conditional or a new runtime contract.

- [ ] Wire WorkspaceAgents into the Agents case of WorkspaceResourceBody.tsx and test actual switch dispatch with canonical scoped props, retaining the Browser and all earlier cases.
- [ ] Complete dev/agentsMockupModule.tsx with createWorkspaceMockupModule: CreateWorkspaceMockupModule returning WorkspaceMockupModule. Export pure WorkspaceAgentsView from WorkspaceAgentsView.tsx, taking projectTitle, rows: ReadonlyArray<{ key: string; title: string; initials: string; status: string; active: boolean; unavailableReason?: string }>, onOpen(key), onAssign and onUnassign(key). Live container derives those rows from scoped links/shells; the fixture adapter supplies sample rows and inert callbacks without importing a live container. Set readyRegions: ["resource"] for 06 only after actual view rendering and settled()/dispose cover fake commands. Test adapter readiness/isolation in WorkspaceAgents.test.tsx. No registry registration, live thread subscription or provider launch.
- [ ] Render the flat 85px-pitch rows. Reserve 29px tile plus 9px gap, title x991, status at the far right, link aligned with the tile's left edge and divider at each row bottom. Use the exact appearance reference. Keep unavailable rows focusable for their menu while disabling unusable Open. An archived conversation can still open through its existing Code path; distinguish archive from deletion.

- [ ] Route `Open conversation →` using the existing environment-scoped opener. Extend its test with a mocked router boundary and verify the resulting `/$environmentId/$threadId` params contain the captured environment/thread, even when an identical thread ID exists elsewhere. Assert no new-thread/turn command or provider launch was emitted. Add `updates title and state from shells without reading histories`: publish the existing shell update, assert the displayed title/status changes, and assert history/detail/LLM boundaries were never called.

- [ ] Reuse the W4 shared picker for `Link existing thread`, restricting its candidates to scoped threads and excluding already assigned refs. Capture the project before opening it. Explicit selection calls `linkItem(projectEndpoint, threadEndpoint)` and awaits acknowledgement. Cancel creates no link. `Unassign from project` calls existing `unlink(view.id)` and awaits success; the thread and any message links remain. Failed assignment/unassignment retains the row/picker and error for retry. A second client's change event updates only the matching environment list.

- [ ] Use `<WorkspaceItemActions environmentId={environmentId} item={projectEndpoint} onlyStartThread />` behind the restrained project-agent menu for a general new agent. Preserve the existing removable project context chip. Opening/canceling that draft creates no assignment or turn. Submitting with the project chip confirms it before the run and the subscribed assignment list then updates. Removing the chip does not create assignment by project ownership. For work on a selected message/page, keep its own shared action and endpoint, rather than relabeling it as a general project agent.

- [ ] Add explicit tests for no links, suggested-only, unavailable thread, archived thread, reconnect, old-server capability absence, denied operate permission, unassign preserving thread/message links, canceled picker/new-thread draft, and successful assignment after retained project-chip submission. Reuse the existing link/context service tests for grant semantics. No new provider adapter is introduced.

- [ ] Run from `apps/web`:

```text
vp test run src/components/workspace/WorkspaceAgents.test.tsx src/components/workspace/WorkspaceToolsPanel.test.tsx src/components/workspace/useWorkspaceItemOpener.test.ts src/components/workspace/WorkspaceItemActions.test.tsx src/components/workspace/WorkspaceResourceBody.test.tsx
vp lint src/components/workspace/WorkspaceAgents.tsx src/components/workspace/WorkspaceAgents.test.tsx src/components/workspace/WorkspaceToolsPanel.tsx src/components/workspace/WorkspaceToolsPanel.test.tsx src/components/workspace/useWorkspaceItemOpener.test.ts src/components/workspace/WorkspaceResourceBody.tsx src/components/workspace/WorkspaceResourceBody.test.tsx src/components/workspace/dev/agentsMockupModule.tsx src/components/workspace/WorkspaceAgentsView.tsx
vp run typecheck
```

Expected green: only explicit project links appear, live shell updates change labels without transcripts, unavailable links remain actionable, Open is scoped and free of new paid work, and unlink only removes assignment.

- [ ] Surface checklist: resource Agents, item-linked threads in Linked context, row menus, general project Start thread, selected-item work actions, palette/keybindings and touch menus retain their different captured targets; web/desktop share rows and phone uses the same W4 sheet; no new native screen or decoder change; all configured providers use thread-shell state with no adapter-specific UI/model call; no contract changes; assign/unassign/reassign, open/back, close/reopen and reconnect preserve links/origin; old-server and local/direct/relay/tunnel/multiple-environment cases remain explicit. The gate below owns final docs and integrated evidence.

- [ ] Visual acceptance: W4-T7 fixture 06, Agents selected under D03. Compare PNG 06 `[953,149,314,309]`: heading/subtitle, 29x30 tiles, Sa/Ce/Wd, three role titles, fixture activity, 85px pitch, dots, link baselines and full-width separators. V1 allows only corrected selection and W4 chrome substitutions in fixtures. Live allows actual thread title/initials/status and project name, never generated activity. Review empty/error/overflow/picker and 390px proposed captures separately.

#### W10-T4 wave gate: documentation, integration and final proof

This gate is part of W10-T4, not a fifth implementation task or a dependency on a W9 account. The primary implementation controller performs one integrated pass after assembling all four units. Implementation subagents do not launch servers or browsers.

- [ ] Rewrite the existing Projects and Browser paragraphs in `docs/user/workspace-spaces.md` to distinguish resource project, selected-item Linked context, project agent assignment and external-tab Link target. Add concise guidance for choosing a Browser thread, linking/unassigning an agent, and the fact that opening a conversation starts no work. Preserve the warning that URLs provide addresses/metadata, not page content, and linked thread transcripts cannot currently be read through workspace tools.

- [ ] Review `docs/internals/overview.md` for the cross-component constraint that Code and Workspace reuse a session while presentation ownership moves. Add one concise decision paragraph only if the current overview lacks it, linking to the relevant source. Review `docs/internals/glossary.md`; define Project agent as a confirmed project-thread link, and distinguish presentation lease from browser session if not already defined. Do not create a feature catalog. If W4 already documented resource frame/selection, use that definition and record a specific no-change reason instead of duplicating it.

- [ ] Run the combined focused gate from `apps/web`:

```text
vp test run src/components/workspace/WorkspaceBrowser.test.tsx src/components/workspace/workspaceBrowser.logic.test.ts src/components/workspace/WorkspaceAgents.test.tsx src/components/workspace/WorkspaceToolsPanel.test.tsx src/components/workspace/WorkspaceEngagement.test.tsx src/components/workspace/useWorkspaceItemOpener.test.ts src/components/workspace/WorkspaceItemActions.test.tsx src/components/preview/PreviewView.test.tsx src/components/preview/openPreviewSession.test.ts src/browser/browserSurfaceStore.test.ts src/localApi.test.ts src/components/workspace/WorkspaceResourceBody.test.tsx
vp run typecheck
```

Run targeted lint on the final changed web files as in each owning task. Do not repeat passed server/contract suites unless the integrated diff changed those behaviors or new failures justify it. Verify the preserved server package typecheck receipt from the current controller baseline; if absent, run `vp run typecheck` from `apps/server`, never a recursive check. No changed wire schema means no new native build is implied.

- [ ] Check entry-point parity through the delivered W4 dispatch: resource menu/header, existing command palette and keybindings, row context menu, touch/long-press and drag where supported. Cancel before mutation must create nothing. Link/unlink/relink preserves origin. A stale selected item and resource project in different environments must never cross-link. Old servers show a useful capability state without attempting missing RPCs. Verify no timers/polling/history fanout were introduced.

- [ ] After explicit authorization, use `test-t3-app` for the controller's single integrated web/desktop/phone-web pass. Resolve its prerequisites and keep state isolated. Use fixture 05 and 06 routes exactly as supplied by W4-T7, pinned V1 and open Resources at fixture-synkek. Capture controlled desktop Browser, Agents, external card, 1024px and 390x844 sheet states. Capture settled state from receipts/events, not arbitrary waits. Record selected item, resource project/tab, environment, clock, theme, font, viewport, scale and allowed D03/D25 corrections. PR-only screenshots follow the repository's evidence policy; no screenshot asset is staged by this plan's commit lists.

- [ ] Compare full placement plus Browser `[953,149,314,354]` and Agents `[953,149,314,309]` crops to the two PNGs using side-by-side and overlay/difference. Confirm 2px geometry/1px type tolerance, reference copy/wrap, corrected selected tab, footer outside scroll, native page clip/radius and no extra frame. Review proposed search/menu/external/error/compact captures on their own merits. Batch discovered repairs, rerun only affected tests, then make one confirmation pass.

- [ ] Verify desktop navigation/title/redirect, resource tab hide/show, resize, enlargement/return if included, and Code/Workspace round-trip retain the same preview session and exactly one visible guest. Verify web paste/open/retry never observes the external tab. Verify agent assign/open/unassign, retained/removed context chips, missing targets and no paid run on tab/open. Keep the center chat draft/scroll/selection throughout resource changes.

- [ ] Record transport evidence separately: fake-boundary local/direct/relay/tunnel and two environments with colliding IDs are required automated cases; an authorized second-client mutation/reconnect verifies subscription behavior. A remote desktop/client page is rendered on the requesting desktop's browser path, with existing reachability errors and explicit external fallback. Packaged desktop, real provider/account, physical other-device tailnet access and human pilot are separate witnessed outcomes. Mark unrun ones unrun, never infer them from HTTP 200, a viewport or a mocked bridge.

- [ ] Commit T4 plus its gate with an explicit changed-file list. Do not stage the ledger, lockfile, other writers' plans or unrelated documentation changes. If internals/glossary review produced a no-change decision, omit the unchanged file from this command and retain its reason in the controller's evidence record.

```text
git add -- apps/web/src/components/workspace/WorkspaceAgents.tsx apps/web/src/components/workspace/WorkspaceAgents.test.tsx apps/web/src/components/workspace/WorkspaceToolsPanel.tsx apps/web/src/components/workspace/WorkspaceToolsPanel.test.tsx apps/web/src/components/workspace/useWorkspaceItemOpener.test.ts docs/user/workspace-spaces.md docs/internals/overview.md docs/internals/glossary.md apps/web/src/components/workspace/WorkspaceResourceBody.tsx apps/web/src/components/workspace/WorkspaceResourceBody.test.tsx apps/web/src/components/workspace/dev/agentsMockupModule.tsx apps/web/src/components/workspace/WorkspaceAgentsView.tsx
git commit -m "feat(web): show assigned project agents and state"
```

## Self-review and unresolved acceptance

**Decisions assumed for planning, not new implementation/account consent:**

- D01/D02: W4 supplies one resource frame and independent project selection; selected-item Linked context remains separate. No second Browser/Agents project selector.
- D03: Browser selected in 05 and Agents in 06. Names, role activity and sample connection claims are fixture-only.
- D05: environment-owner identity only where configured; no directory, project role, invented coworker or implied permission grant.
- D21: desktop inline preview reuses the existing thread/profile/session/lease, optional existing enlargement; web and phone external card; local linked-page title/URL search and valid URLs only.
- D22: project agent is an explicit project-thread link. Title/state comes from shells. Opening starts no run. URLs remain metadata-only and linked-thread transcript reads unsupported. No custom role metadata, persona store or activity-generating model call.
- D24: responsive web/shared desktop/phone web; no new RN screen; older servers and transport/environment isolation have explicit checks. Native/package/account/device/pilot claims require separate evidence.
- D25/D26/D27: W4's live brand/mode and truthful chrome substitutions apply; W9 owns counts/DM scope. A W9 connector cannot block the Browser/Agents functional units.

**Source findings and deviations:**

1. The map names interface responsibilities but does not publish exported W4 TypeScript type names. This plan consumes the exact named responsibilities and supplies structural W10 boundary types. The implementation controller must bind the actual parallel W4 exports before dispatch, preserving one shell state. This is an interface handoff check, not permission to guess imports.
2. Current `WorkspaceToolsPanel.tsx:170-330` embeds the Browser function and a mandatory dialog. `PreviewPanel` has no compact/custom chrome prop today. T1 owns the minimal optional renderer and preserves the default Code path. The map's expected inline implementation therefore requires the read preview files, not just moving the existing dialog.
3. Current `WorkspaceToolsPanel.tsx:73,135-164` reads selected-item thread links. T4 must issue the direct resource-project link query and retain item-linked threads in Linked context. Project ownership alone is deliberately insufficient.
4. `EnvironmentThreadShell` has no `Reviewing keyword opportunities` field. Preserve that line only in the isolated fixture adapter. Live generic status text is an explicit D22 substitution. If a separately editable role/activity description is requested, return for a new decision rather than adding link metadata.
5. `localApi.ts:30` ignores `window.open`'s return value and uses `noopener,noreferrer`, whose null return is ambiguous. T2 tests a usable unknown/blocked-open retry state without claiming detection or success. This avoids a global browser helper rewrite and preserves opener protection. A requirement for reliable popup-outcome detection needs a separate platform decision.
6. The gap report's old scratch `W` alias is historical. Every source/mockup path in this plan uses the tracked `docs/superpowers/workspace-mockups` bundle. B-C1 and the response log already resolved that provenance issue.
7. The parent plan's blanket one-at-a-time RPC warning is satisfied by this wave's UI chain; W10 introduces no RPC/migration/context writer. Keep the global exclusive slot rule if an unexpected shared test edit is admitted later.

**Open evidence and review gates:** The W4 resource interfaces and W4-T7 controlled-site/native capture adapter are planned prerequisites, written in parallel and not verified implementations here. The external card, search popup, assignment menu/picker, compact layout, failure/unavailable states and optional enlargement require reviewed proposed captures. Packaged/native compositing, actual remote-session reachability, real accounts, physical second device and pilot remain unrun. None is silently waived by this planning document.

**Planning verification:** Source and both PNGs inspected locally. No product tests, server, browser, network, provider CLI, staging or commit run. The writer owns only this file. Four implementation task IDs are preserved; the final documentation/integration gate stays inside W10-T4. No unresolved product choice prevents writing the bounded default plan; D-ID defaults still require the maintainer's existing planning/admission process before execution.

## Review response log

Plan fix round 1, 2026-10-16. Inputs: review-w9-w11.md and review-cross-wave.md in .superpowers/sdd/2026-10-14-unified-workspace/plan-reviews, plus W4's Canonical seams for Waves 5-11.

| Finding                   | Response                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W9-W11 I-5                | Global Constraints use the agreed implementer/controller attribution sentence; the historical fixed-trailer discussion is removed.                                                                                    |
| W9-W11 M-2                | Removed the undefined ProductOps Build and Ponytail instruction; the concrete reuse and scope rules remain.                                                                                                           |
| Cross R1 / C1             | T1 owns dev/browserMockupModule.tsx, resource for 05; T4 owns dev/agentsMockupModule.tsx, resource for 06. Both appear in Files and git add -- and render pure shared views with fake commands before readiness.      |
| Cross R2 / C2             | T1/T4 wire only Browser/Agents cases in WorkspaceResourceBody.tsx, list/stage its test, and follow the canonical serial chain. WorkspaceToolsPanel changes are extraction/removal only; the W4 frame stays the frame. |
| Cross R3 / I1, R5, R6, R8 | Consumers retain WorkspaceResourceBodyProps/request and context-owned openResource, WorkspaceHeaderModel, workspaceRailItems and the single view key. No competing handoff or shell state.                            |
| Cross M5                  | Shared docs use the admitted wave-number chain through W9-T8 -> W10-T4 -> W11 gate; T2 holds the same docs slot when needed.                                                                                          |

W9 and W11 findings are resolved in their owning plans. No finding is disputed. Runtime checks and rendered acceptance remain future implementation work; this revision stages and commits nothing.
