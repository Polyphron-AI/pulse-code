# Wave 11: Email reading and reply polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch W11-T1 through W11-T7 separately. The primary implementation controller owns the final wave gate.

**Goal:** Match the inbox, reader and reply composition in 01-email-files.png while preserving stable mail references, conversations, bounded reads, explicit links and human approval of the exact outgoing message.

**Architecture:** Extend the existing MailImapRead and MailRpc paths with optional presentation metadata and shared typed filters. Resolve flags through the same stable-reference algorithm used by reads, then use the existing IMAP writer. Consume WorkspaceSavedItems from W9-T7 for Later and ProjectDriveExplorer/useOpenFiles from W7-T3 for folder navigation and link insertion. Manual replies derive recipients and reply headers on the server and call MailSendService.prepare. The existing thread approval subscription, digest, SMTP claim and accepted-link recovery remain authoritative on web and React Native.

**Tech Stack:** TypeScript, React, React Native approval components, Effect/effect-smol, Effect Schema/RPC/reactivity, SQLite approval/link storage, imapflow 2.2.1, mailparser, nodemailer, lucide-react, TanStack Router, vite-plus/test, @effect/vitest and react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-10-14-unified-workspace-design.md`, including A12 and A13; `docs/superpowers/workspace-mockups/mockup-waves/wave-map.md`, shared contracts and all W11 records. Main plan: `docs/superpowers/plans/2026-10-14-unified-workspace.md`, Global Constraints and Wave 11 outline. Source report: `docs/superpowers/workspace-mockups/mockup-waves/gap-email-files.md`, EF-01 through EF-04 and EF-08 through EF-12. Read both reviews in the same directory, then the map's Review response log, which corrects their historical findings.

**Mockups:** `docs/superpowers/workspace-mockups/mockups/01-email-files.png`. Read this PNG as an image before implementing. Coordinates below are CSS pixels at 1280x800.

**Build worktree:** `C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace`, branch `qb/feat-unified-workspace`. Source anchors were read on 2026-10-16 against `6363a7913b` and the uncommitted B-2026-10-16-001 correction. Earlier-wave plans are written in parallel. Their proposed interfaces are prerequisites, not claims of implemented code. Reread current files at task admission and preserve other owners' edits.

**Planning boundary:** This document authorizes no implementation, send, provider connection, browser, server, staging or commit operation. Commit commands below are future implementation steps. Only this plan file was written during this planning pass.

## Global Constraints

The following main-plan constraints apply with the controller's attribution decision below:

- Never use an em dash (U+2014) in anything you write: code comments, docs, UI copy, commit messages. Use a comma, a full stop or a spaced hyphen.
- Run commands from the build worktree. In Git Bash, prefix each command with `cd "C:/Users/qblaa/.t3/worktrees/Pulse Code/unified-workspace" &&` because the shell's directory resets between calls.
- Tests: `vp test run <files>` from the package directory (`apps/server`, `apps/web`, `packages/contracts`, `packages/client-runtime`). Typecheck: `vp run typecheck` from the package directory. Never run repo-wide checks (`vp check`, `vp run -r test`, `vp run -r typecheck`).
- Never stage `pnpm-lock.yaml`. `vp i` rewrites it because develop's lockfile is stale; that churn is not part of this feature.
- Never start a dev server (subagents), never open a browser, never touch `~/.t3/userdata`, never set `VITE_HTTP_URL` or `VITE_WS_URL`, never kill a process found by name.
- Never use `--no-verify`, bare `git stash`, or `git add -A`/`git add .`. Stage the files your task names.
- Commit messages use conventional titles (`feat(server): ...`). Implementer commits end with a Co-Authored-By line naming the model that made the commit; controller commits use the controller's attribution line.
- Never open a pull request.
- Every task leaves `apps/server` typechecking. Tasks run one at a time, because they share `packages/contracts/src/rpc.ts`, `apps/server/src/ws.ts`, `apps/server/src/auth/RpcAuthorization.ts`, `apps/server/src/server.ts` and the capability list.
- New WS RPC families get their own handler layer in `ws.ts`, the way `mailWsRpcLayer` does, and never join the main `CoreWsRpcGroup.of({...})` object. That object sits near TypeScript's instantiation limit (197 handlers; the limit is between 197 and 212), and past it the layer's requirements silently type as `any`, which surfaces as dozens of TS377030 errors in `server.ts` and `cli/`.
- Follow the nearest named precedent file. If an effect-smol API name in this plan differs from what the precedent uses, use the precedent's name without changing behaviour.
- Comments describe how a thing is used, mostly on functions. Match the comment density of the file you are editing.
- Copy rules from the spec: links are never dropped silently ("render as unavailable with the reason"); a message with no Message-ID "links by IMAP location and is marked as one that may break when moved"; linked content is "data, not instructions".

The following spec constraints are copied verbatim:

> Every outbound mail is approved as the exact message, on the existing approval card.

> List responses carry summaries only, to keep WebSocket traffic small.

> Links always attach to messages, never to conversations.

> When a target cannot be resolved because it was deleted or its account is disconnected, the link stays and renders as unavailable with the reason. It is never dropped silently.

> Task recurrence/dependencies, auto-send/auto-confirmed links, a generic workflow engine, a full Slack/Gmail/Drive replacement and new React Native screens remain excluded.

> Calendar and chat refresh only on demand or explicit Refresh, with bounded pages and one in-flight request per open endpoint, no polling or all-channel scan.

Wave-specific constraints:

- Reuse existing code first; add no mail engine, provider adapter, relationship graph, binary attachment pipeline or new dependency.
- No polling, sleeps for readiness, recurring refresh timers, continuous animation, spinning Refresh icons or optimistic claims of send success. Await RPC results, subscriptions, persisted events, receipts or worker drains. A single expiry deadline timer already used by approval cards is not a refresh loop.
- Contracts live in `packages/contracts`, with no heavy runtime logic. Parse MIME and derive reply addresses on the server. Treat subject, preview, names, body and provider metadata as untrusted text. Do not render mail HTML or load remote images.
- Never stage `docs/internals/pulse-next-migration.json` in this wave. There is no planned storage migration. W9-T7 owns saved storage; the existing approval repository already stores manual sends.
- Use optional fields and optional capability flags. Absence disables the new operation and preserves basic Mail, conversations where supported, Draft reply with agent, and existing native approvals. Never simulate Unread by filtering one loaded page.
- Keep environment identity in every query, command, subscription, draft and selected resource. Do not aggregate mail or saved refs across environments. Do not select a sending account because it happens to be the project default.
- One mounted resource body. Do not rebuild W4's frame, project selector, navigation, footer or compact sheet. Picker mode temporarily uses the same explorer rather than adding a hidden second explorer.
- W4-T7 is required for visual acceptance only. It supplies the marked, non-sending fixture and clock; no task reads live userdata or real accounts for screenshot seeding.
- No browser/server use in this plan-writing pass or by implementation subagents. The primary controller performs one integrated client pass only with explicit user authorization, using test-t3-app. Do not open a pairing URL intended for the user.

## Maintainer decision note, plan fix round 1

Controller decision under the maintainer's go-ahead, 2026-10-16:

- Decode the first supported text/plain MIME part within the same bounded 4096-byte TEXT prefix, including common multipart/alternative mail. Add a real multipart fixture and regression; do not fetch the full MIME body to fill a preview.
- Choose review I-2 option (b): conversation mode keeps the at-most-500-UID header scan, selects the current page, then issues one additional batched BODY.PEEK[TEXT]<0.4096> FETCH for only that page's representative UIDs. Both batches stay inside the same list RPC/session. At the current 50-row page ceiling this bounds preview input to 204,800 bytes, rather than 500 x 4096 bytes. Message mode retains its one header-plus-prefix batch for at most 50 returned UIDs. This clarifies the wave map's "in that same request": one list RPC, with a page-sized second batch, never per-message round trips.
- The mail change feed carries accountId and exact message identity plus confirmed seen/flagged fields. Clients patch loaded rows and the open reader in place without resetting cursor, loaded pages, selection or scroll. Full list refresh is explicit Refresh or a scoped partial-failure recovery, never a normal star/read event.

These defaults settle preview and invalidation design for this plan. They do not grant account, send, server or browser authority.

## Review Focus

1. A partial preview accidentally becomes one full-source read per row or marks mail seen. W11-T1 pins a public MailReadRpc test to the recorded UID FETCH command, one message batch or one header batch plus one page-representative conversation preview batch, `BODY.PEEK[TEXT]<0.4096>`, no `BODY[]`, unchanged flags and a bounded response. T2 proves a second subscribed client makes no list FETCH after a successful flag event and retains its page-3 cursor.
2. Star hits an unrelated message at a reused UID after archive or UIDVALIDITY changes. W11-T2 pins moved-reference and foreign-message tests to the public setFlags RPC and fake IMAP STORE log.
3. A union of links puts one mail's project chip on another mail. W11-T3 pins `listMany` keyed attribution and a row/chip action test, including suggested and one-hop links that must not become direct chips.
4. Manual reply uses forged recipients or sends during preparation. W11-T5 pins trusted Reply-To/reply-all parsing, zero SMTP connections during prepare, stale digest, duplicate approval and accepted-link-only recovery tests. The same approval must decode and act through shared runtime and the RN card.
5. Editing or changing selection leaves a previous approval usable or inserts a Drive URL into the wrong draft. W11-T6 pins server decline before editing; W11-T7 pins captured-draft picker return, exact visible URL, removal and no writes or new read grants.

## Rendered look reference

### Capture contract and shared chrome

Use W4-T7's `/workspace?space=mail&fixture=01` recipe on the future isolated preview origin. Start at Inbox, `maya@synkek.com`, resource project `fixture-synkek`, Files selected at its designated root. Seed the five mails and select Nina's stable launch-review message. Correct only the first row sender from Maya Chen to Nina Patel under D03. Keep the original PNG unchanged and record this correction in the capture manifest. The fixture uses an empty reply and zero external writes.

Pin dark theme, 1280x800 CSS viewport, device scale 1, zoom 100%, en-GB, Africa/Johannesburg, and Tuesday 13 October 2026 from W4-T7. Pin Segoe UI on Windows with system-ui fallback and record resolved font/OS. The reference font is estimated, so a different capture font/host requires reviewed rebaseline. Light theme is a separate smoke check. Compare side-by-side crops plus an overlay/difference. Boundaries, insets, baselines, pitch and controls must be within 2 CSS px; type size within 1px. Preserve wrapping, control order, icons, selection and corrected fixture copy. Do not mask whole controls as antialiasing.

The shell owns x0..259 and x940..1279; Mail content occupies x260..939. Global navigation is x0 y0 w207 h800, `#050505`, with separators near `#1c1c1c`. The 52px space rail occupies [207,26,52,774]. The header is [260,26,680,52]. Message list [260,78,170,722], divider x429, reader [430,78,510,722], resource divider x939, resource panel [940,26,340,774]. Respect W4's sizing contract and stored divider behavior; these are default fixture dimensions, not absolute positioning for all viewports.

| Shared element                       | Marked fixture                                           | Live substitution                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0,0,207,44] brand                   | Pulse Next and static blue artwork                       | Pulse Code, same static geometry, D25.                                                                                                                         |
| [7,44,193,26] mode and section label | Office / Code and Office                                 | Workspace / Code and Workspace, preserving Code project/thread controls.                                                                                       |
| [220,0,585,26] breadcrumb            | SynKEK workspace / Email                                 | Selected environment display name / Email, fallback Workspace when unnamed.                                                                                    |
| [1149,0,118,26] marker               | Design preview · sample data                             | Hidden outside isolated fixture mode.                                                                                                                          |
| [904,42,19,19] avatar                | MC in blue on dark blue                                  | Configured environment-owner initials and accessible name; hide when unset.                                                                                    |
| [940,768,340,32] footer              | Static blue dot, Sample project connections, gear        | Connected only with known supported health, Unavailable on known failure, otherwise neutral dot and Connection status unavailable. Gear opens scoped settings. |
| [953,654,314,22] Files sentence      | Shared with the SynKEK team. Files stay in Google Drive. | Files stay in Google Drive. unless complete supported provider metadata justifies more.                                                                        |

The header shows `Inbox` at x275 baseline 45, 13px semibold, address at x275 baseline 63, 10px muted. `Resources` is 11px semibold with a 12px Folder icon near x823; W4's reviewed Linked context entrance remains reachable without overlap. No extra chrome belongs to mail components.

### W11-T1 and W11-T3: rail, search and rows

Use near `#eeeeee` primary text, `#858585` secondary text, `#1c1c1c` separators, `#3474ff` interactive ink, `#111a2c` selected row and `#151515` search background. Consume existing semantic tokens and W4's fixture palette; do not globally change theme tokens to correct one mail region. No raised shadows.

- Inbox icon pill [215,38,35,28], radius 14, dark blue `#12203b`, 15px Inbox glyph; `Inbox` at y74, 8px semibold white. Unread target [211,89,44,45], 15px Bell glyph near [227,98], label `Unread` y126, 8px muted. Later target [211,143,44,45], 15px Bookmark glyph near [228,151], `Later` y179. No badges or snooze copy. Retain real account/folder/settings navigation in W4's accessible disclosure, not by adding projects back to MailNav.
- Search capsule [269,87,150,31], radius 16, Search 12px near [280,96], SlidersHorizontal 11px near [398,98]. `Search inbox`, 10px muted. Enter submits; clear resets pages immediately in both modes. Filters, mode toggle, Refresh and Load more remain reachable through the existing list controls/disclosure without an extra toolbar occupying the pictured rows. Their unpictured expanded state requires review.
- Row width 169 with 12px horizontal inset. Sender 10px weight 600/700, time 9px muted, subject 11px semibold with 16px line-height and up to two lines, preview 10px one-line ellipsis, project chip 8px. Chip approximately [272,214,35,16], radius 3, quiet gray fill. Selected row is blue-tinted; unread weight and `aria-label` are independent of selected state.

| Row box           | Sender and time                   | Subject                                   | Preview and chip                            |
| ----------------- | --------------------------------- | ----------------------------------------- | ------------------------------------------- |
| [260,126,169,118] | Nina Patel, 10:24, D03 correction | SynKEK · October launch review, two lines | Thanks team, sharing the latest ...; SynKEK |
| [260,244,169,116] | Leo Martins, Yesterday            | Your updated homepage designs, two lines  | Same fixture preview; SynKEK                |
| [260,360,169,117] | Nina Patel, Yesterday             | SEO report: September results, two lines  | Same fixture preview; SynKEK                |
| [260,477,169,100] | Alex Morgan, Yesterday            | Product shoot · final selects             | Same fixture preview; SynKEK                |
| [260,577,169,101] | Maya Chen, Yesterday              | Weekly marketing catch-up                 | Same fixture preview; SynKEK                |

Remaining list space y678..800 stays empty. No fabricated extra messages, counters or unread dots. Use actual structured sender, date, preview availability and confirmed project chips in live mode. A missing snippet leaves a reserved quiet line, with an accessible explanation where useful, rather than sample copy. Long names truncate with their full text accessible. Hover stays within row bounds. Keyboard focus uses existing visible focus tokens. On phone, enlarge hit areas to at least 44px without pretending the narrow fixture rail is the phone design.

### W11-T2 and W11-T4: reader

The reader content has x449..920, 19px left and 20px right inset. Its resting view contains no expanded metadata table or block of workspace buttons.

| Element         | Box/style                                                 | Copy and behavior                                                                                                                                                      |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project chip    | [449,98,44,20], radius 6, dark blue, blue 10px            | SynKEK. Live chips require direct confirmed message-project links.                                                                                                     |
| Star and more   | [884,99,37,20], Star 12px, MoreHorizontal 10px, gray      | Unfilled at rest. Buttons have names Star message/Unstar message and Message actions. Hidden hit-area growth must not overlap.                                         |
| Subject         | x449 y142, available 450px, 16px semibold, line-height 20 | SynKEK · October launch review                                                                                                                                         |
| Avatar          | [449,175,29,29], radius 8, `#111c34`, blue 10px           | NP, derived from the same sender as selected row.                                                                                                                      |
| Sender line     | x488 baseline 182, 10px                                   | Nina Patel in bold, then muted <nina@synkek.com>.                                                                                                                      |
| Recipients/time | x488 baseline 199, 9px muted                              | to Maya, Leo, me · 10:24 AM                                                                                                                                            |
| Body            | [449,234,471,255], 11-12px, line-height 22px              | Plain text below, paragraph gaps about 18px. Preserve newlines and wrap long tokens.                                                                                   |
| Related folder  | [449,518,185,48], border `#1d1d1d`, radius 9              | Blue Folder 20px at [463,533], Marketing · SynKEK at x495 baseline 540, 10px semibold; Open project folder baseline 552, 10px muted; ChevronRight 11px near [612,538]. |

Exact body with paragraph breaks:

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

Live bodies wrap naturally at the same measure. Do not store screenshot wrapping as hard line breaks in live mail. Keep Show more, attachment metadata, source-truncation notice and the no-Message-ID warning when applicable. Missing sender uses `Unknown sender`, missing subject uses existing `Message with no subject`. Missing, deleted or disconnected originals stay visible with reason and retry where appropriate. No auto-mark-read on list selection; read/unread is explicit in this wave. The reader's read-only BODY.PEEK path remains non-mutating.

Only a confirmed direct related-folder association justifies the Marketing card. A project root alone, suggestion, shared subject word or saved ref does not. Multiple associations get real labelled choices in a reviewed expanded state. Clicking activates Files at the captured folder through openFiles while keeping the original reader and persistent root unchanged. The card remains with a reason when its confirmed target is unavailable.

### W11-T5 through W11-T7: reply and picker

Reply container [449,591,471,143], radius12, 1px border near `#1d1d1d`, near-black fill, padding12. Label at x462 baseline613 is `Reply to Nina, Maya and Leo`, 10px muted. Placeholder x462 baseline 637 is `Write your reply...`, 12px muted. No formatting toolbar. Textarea expands for typed text and approvals; do not pin later states to143px or clip the approval.

Primary action [462,697,88,24], radius 6, blue near `#346bfa`, 11px semibold white and small Send outline. The fixture can retain `Send demo` only through W4-T7's non-sending fake. Live uses `Review reply`, with natural width sufficient for the label. It prepares a snapshot and never sends. Existing full approval card appears below the composer with every recipient, subject, body, attachment summary and Approve once/Decline. These expanded states are reviewed additions, not pixels present in the PNG.

Drive action occupies [798,697,109,24], muted10px, no pictured paperclip. Keep fixture copy `Attach from project Drive`. Live copy `Insert link from project Drive` makes D16 clear, with helper `Inserts a link. Files stay in Google Drive.` A reviewed picker offers `Insert link` and `Cancel`, uses the existing explorer's root/account and returns to the captured draft. Selected links appear as removable named rows; the actual canonical URL is visible in textarea/approval text. No MIME/download/export/upload or local path.

Use the existing RN MailSendApprovalCards layout: rounded20px opaque bordered card, padding16, Email approval label, subject, Account/From/To/CC/BCC, selectable scrollable body, attachment name/size/hash and existing action buttons. Manual approvals carry the existing MailSendApproval schema. Do not design a native inbox or composer. RN display, approve/decline and reconnect need focused component/hook tests; packaged-device visual acceptance remains separate.

Unpictured filter, menu, empty/error, reply-target choice, approval, declined/edit, unknown-outcome, picker, 1024px and 390px states require proposed captures reviewed at the future gate. Use existing popover/dialog/alert/button primitives, visible focus, keyboard dismissal, focus return and touch access. Do not claim original-PNG parity for these states.

## Interface and scheduling handoff

Consume earlier-wave names from wave-map.md. Do not replace them because their implementation has not landed yet:

| Owner         | Interface consumed here                                                                                                                     | Binding and admission check                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W4-T0         | Committed B-2026-10-16-001 baseline                                                                                                         | Required before implementation isolation. This writer does not commit it.                                                                                                                                                                                                                                                |
| W4-T4a/T4b/T6 | WorkspaceEngagement, WorkspaceResourcesPanel, WorkspaceResourceBodyProps, useWorkspaceResourceState, named Linked context and compact sheet | WorkspaceResourceBodyProps from components/workspace/WorkspaceResourceBody.tsx carries environmentId, projectId, selectedItem: WorkspaceLinkEndpoint or null, request: WorkspaceItemRef or null and onOpen. Environment/project stay independent of selected mail; no duplicate frame.                                   |
| W4-T7         | Fixture 01 and V1 capture recipe                                                                                                            | Non-writing seed, pinned clock and corrected Nina selection. Required for every visual claim.                                                                                                                                                                                                                            |
| W7-T3         | ProjectDriveExplorer, OpenFilesInput, OpenFiles and useOpenFiles from components/workspace/openFiles.ts                                     | OpenFilesInput is `{ environmentId: EnvironmentId, projectId: ProjectId, folderId?: string, fileId?: string }`. Preserve originating mail in caller state, not an extra handoff property. Picker callback returns `{ endpoint: WorkspaceLinkEndpoint, connectionId: string }` after explicit choose.                     |
| W9-T7         | WorkspaceSavedItems, WorkspaceSavedItem, WorkspaceSavedItemPage, createWorkspaceSavedItemAtoms(runtime), web workspaceSavedItems binding    | add(ref), remove(key), list({cursor?,limit?}), changes. WorkspaceSavedItem is `{ key, ref, savedAt }`; page is `{ items, nextCursor? }`. Consume optional workspaceSavedItems capability and pulse.workspaceSavedItems.add/remove/list/subscribeChanges. No title/body store, localStorage replacement or new saved RPC. |
| Existing Mail | MailMessageRef, MailReplyTarget, MailSendApproval, MailSendService.prepare/respond/status/subscribeThread                                   | Their current types below remain the compatibility contract. Manual composition does not add a provider/tool prerequisite.                                                                                                                                                                                               |

Wave-local signatures to introduce, with schema-derived wire types:

```ts
type MailListFilters = {
  readonly from?: string;
  readonly to?: string;
  readonly subject?: string;
  readonly since?: string;
  readonly before?: string;
  readonly unseen?: boolean;
  readonly flagged?: boolean;
};
type MailAddresses = {
  readonly from: ReadonlyArray<MailAddress>;
  readonly to: ReadonlyArray<MailAddress>;
  readonly cc: ReadonlyArray<MailAddress>;
  readonly replyTo: ReadonlyArray<MailAddress>;
};
type MailPreview = { readonly text: string; readonly truncated: boolean };
type MailPrepareReplyInput = {
  readonly threadId: ThreadId;
  readonly original: MailReplyTarget;
  readonly mode: "reply" | "reply-all";
  readonly text: string;
};
```

MailMessageListItem gets optional `addresses`, `preview`, `previewUnavailable`. MailMessageContent gets optional `addresses`, `addressMetadataTruncated`, `inReplyTo`, `references`. `previewUnavailable` is `missing | unsupported | malformed`. Set addressMetadataTruncated when trusted raw recipient arrays exceed the presentation limit, so manual preparation can reject incomplete metadata rather than silently omit recipients. Keep old `from/to/cc/query/cursor` fields and cursor formats. Filters apply before paging; UI resets cursors on filter changes. Existing cursors still pin UIDVALIDITY, plus conversation snapshot bounds; do not reinterpret old cursors as a different format.

New optional live capabilities are `mailPresentation`, `mailFlags`, `mailManualReply`. Declare them at `packages/contracts/src/server.ts:618-620`, advertise only when handlers exist, and read only from live config in useMailCapabilities. Lack of mailPresentation means no typed-filter request or fabricated preview; lack of mailFlags disables mutations; lack of mailManualReply leaves agent drafting reachable. Shared runtime accepts old snapshots without optional replyOriginal/messageId.

Retain the canonical chain `W11-T1 -> W11-T2 -> W11-T3 -> W11-T5` for the shared Mail/links RPC slot and `W11-T3 -> W11-T4 -> W11-T6 -> W11-T7` for Mail UI. W11-T3 also needs a narrow shared links RPC slot for optional keyed listMany output because the current union cannot attribute chips. Serialize that work after W11-T2 and before W11-T5, and after any admitted earlier-wave links/ws owner. This is a scheduling edge, not a new product prerequisite. No two admitted tasks may edit the same file concurrently. Implementation order in this document is T1, T2, T3, T4, T5, T6, T7, gate.

Each task gets a new failing behavioral assertion, the named package-local command, minimal implementation, the same passing command, affected package typecheck and targeted lint. `vp lint` takes the task's explicit source/test paths; do not pass a package directory or the repo root. Run `vp run typecheck` in apps/server after each integration as required by the main plan. Do not claim a red/pass result until actually executed.

### Task W11-T1: Bounded presentation metadata and typed mail filters

**Files**

- Modify `packages/contracts/src/pulseMail.ts:147-199,419-467`, `packages/contracts/src/server.ts:618-620`, and `packages/contracts/src/pulseMail.test.ts:1-59`.
- Modify `apps/server/src/mail/MailImapRead.ts:142-179,242-316,352-381,607-702`, `apps/server/src/mail/MailRpc.ts:62-88,159-236`, `apps/server/src/ws.ts:2008-2014` and `apps/web/src/components/workspace/mail/useMailCapabilities.ts:25-40`.
- Modify `apps/server/src/mail/testing/MailTestPeers.ts:213-220,282-288,328-355` for truthful TEXT sections, byte partials and filter fixtures. Do not alter unrelated SMTP behavior.
- Tests: `apps/server/src/mail/MailImapRead.test.ts`, `MailReadRpc.test.ts`, `packages/contracts/src/pulseMail.test.ts`. Existing fake helpers `inbox`, `serve`, `setup`, `archived` are local to their respective tests.

**Interfaces**

Consumes existing listMessages/listConversations with text query, UID cursors, MailAddress and MailSearchQuery. Produces optional metadata and MailListFilters described above, both RPC payloads' optional `filters`, and mailPresentation capability. MailRpc clips and projects new fields explicitly. No new RPC family or body-reader API.

**Depends on:** W4-T0. **Serial slot:** first W11 Mail RPC owner, after admitted earlier-wave shared wiring owners. No shell dependency for functional work. Visual acceptance waits for W4-T7.

- [ ] In MailReadRpc.test.ts, reuse setup/archived and add a public-boundary regression. Add a separate MailImapRead test for filtering before page selection using a fake with seen/flagged/sender/date variants.

```ts
it.effect("fetches preview bytes in the header batch without reading full source", () =>
  Effect.gen(function* () {
    const { account, peer, rpc } = yield* setup(archived());
    const page = yield* rpc.listMessages({ accountId: account.id, mailbox: "INBOX" });
    const fetches = peer.received.filter(({ line }) => /UID FETCH /i.test(line));
    expect(fetches).toHaveLength(1);
    expect(fetches[0]!.line).toMatch(/BODY\.PEEK\[TEXT\]<0\.4096>/i);
    expect(fetches[0]!.line).not.toMatch(/BODY(?:\.PEEK)?\[\]/i);
    expect(page.messages[0]!.preview?.text).toBe("Body of Hello");
    expect(page.messages[0]!.seen).toBe(false);
  }).pipe(Effect.scoped, Effect.provide(testLayer())),
);
```

- [ ] Run from apps/server: `vp test run src/mail/MailReadRpc.test.ts src/mail/MailImapRead.test.ts`. Expect the new preview assertion to fail because the FETCH is currently header-only. From packages/contracts run `vp test run src/pulseMail.test.ts` after adding old/new payload decode tests; expect typed metadata/filter assertions to fail before schema changes.
- [ ] Move the existing MailAddress declaration above list schemas so new references do not hit declaration order. Add bounded schemas, deriving exported types with `typeof Schema.Type` as existing contracts do. Use 200-character filter text, max 50 addresses per header field, max 280 preview characters, max 100 normalized References. Make fields optional with Schema.optionalKey.

```ts
export const MailListFilters = Schema.Struct({
  from: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
  to: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
  subject: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
  since: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
  before: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
  unseen: Schema.optionalKey(Schema.Boolean),
  flagged: Schema.optionalKey(Schema.Boolean),
});
export type MailListFilters = typeof MailListFilters.Type;
```

- [ ] Validate actual date values and since < before at the server boundary before network use. Retain query as text. Merge trimmed query into the existing MailSearchQuery in both handlers, without replacing from/date/flag predicates. Handle explicit false with `query.unseen === undefined ? {} : { seen: !query.unseen }` and `query.flagged === undefined ? {} : { flagged: query.flagged }` in toSearchObject. Do not confuse false with absent.
- [ ] Extend the search FETCH options with headers and bounded TEXT below. For conversations use the same header subset without bodyParts for the existing scan, then add bodyParts only in one batch for the representative UIDs on the selected current page. Reuse those header results; do not fetch them again. Use the installed option verified in `node_modules/.pnpm/imapflow@2.2.1/node_modules/imapflow/dist/esm/types.d.ts:466-501` and `commands/fetch.js:118-145`:

```ts
headers: [
  "subject", "from", "to", "cc", "reply-to", "date", "message-id",
  "references", "in-reply-to", "content-type", "content-transfer-encoding",
],
bodyParts: [{ key: "TEXT", start: 0, maxLength: 4096 }],
```

No source, fetchOne, download or per-row second request. Search fetches at most 50 returned UIDs in one header-plus-TEXT batch. Conversations scans at most 500 UIDs in one header-only batch, groups and applies the existing snapshot cursor/page limit, then fetches TEXT for only the newest representative UID of each conversation on that returned page. One additional batch covers at most 50 UIDs, at most 204,800 preview-input bytes; empty pages perform no TEXT batch. Returned previews remain 280 characters each. Preserve the 500 scan cap, incomplete and snapshot cursors; never fetch off-page representatives or missing ancestors. Add command-log tests for 500 scanned headers and a two-row page: exactly two preview UIDs in one bounded batch, none of the other 498. Test page 2 and empty results.

- [ ] Parse structured address objects through mailparser, including group members; never split a display address on commas. Project at most 50 entries each and strip unsafe control characters from names. Derive detail reply metadata from the same trusted parsed message. Return safe bounded text only. A concrete preview core for simple text/plain mail is:

```ts
const previewText = (text: string) =>
  text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280)
    .replace(/[\uD800-\uDBFF]$/, "");

const prefix = message.bodyParts?.get("text") ?? message.bodyParts?.get("TEXT");
const bounded = prefix?.subarray(0, 4096);
```

Read Content-Type, charset and transfer encoding from the fetched headers. For multipart/alternative or multipart/mixed, read its boundary parameter and find the first text/plain part within the same bounded prefix, using that part's MIME headers. Decode supported charset and quoted-printable/base64 with existing mailparser/installed MIME helpers; trim an incomplete base64 tail to a multiple of 4, drop an incomplete quoted-printable escape or UTF-8 character, and mark truncated. Parse only the bounded chosen text part, with no attachment/HTML processing or remote content. For single-part text/plain keep the same bounded decoding path. HTML-only, unsupported charset/encoding, and nested MIME structures that cannot yield safe text within the prefix return previewUnavailable unsupported. Missing prefix is missing; invalid content is malformed. A full 4096-byte prefix or decoded text beyond 280 characters sets truncated true. Never display boundaries/base64 as prose or retry a partial request with full source. Add MailTestPeers multipart/alternative fixtures with plain plus HTML parts, both quoted-printable and base64 variants, and assert decoded preview text through the public list RPC. Keep an HTML-only multipart fixture as the unsupported case.

- [ ] Fix fake sectionOf so TEXT returns bytes after the header separator and HEADER.FIELDS returns headers; partial slicing must operate on Buffer bytes and literal byte counts, not JS character indexes. Keep fake search predicates small and explicit for the criteria under test. Use a scripted SEARCH response for compound dates rather than implementing an IMAP parser in tests.
- [ ] Add cases for comma/quoted names, UTF-8 cut at the 4096 boundary, supported multipart/alternative and unsupported HTML-only multipart, malformed encoding, missing TEXT, malicious text, empty page, long headers, and old payloads without metadata. Assert no STORE and no sequence-number identity. In both list modes prove unseen/from/date/flag criteria reach SEARCH before limiting; page 2 retains them. Preserve the current 64KB per-message header limit and apply it to messages as well as conversations.
- [ ] Rerun the named tests, then package-local typechecks for contracts/server/web and explicit-path lint for changed files. Expected pass: old text/cursor callers still work, both modes filter server-side, one message batch or two bounded conversation batches within one RPC, no per-row round trip, no full MIME and bounded metadata.
- [ ] Surface checklist: folder/search/conversation entry points share filters; web/desktop consume optional fields; RN old approval decoding stays unchanged; manual metadata is provider-independent for Codex/Claude/Cursor/Grok/OpenCode/ACP; schemas are optional; clear filters and Refresh restore default query; transport is environment-scoped on local/direct/relay/tunnel; user docs wait for W11-T7 gate.
- [ ] Visual acceptance: fixture 01, [259,87,170,591], gap-email-files lines 35-50. Five rows must show safe sender/date/preview data under V1 with corrected Nina selection. This backend task introduces no new resting controls. Live safe metadata/project labels are permitted substitutions. Rendered proof is deferred to the primary wave gate, not inferred from tests.
- [ ] Future commit, explicit files only:

```text
git add -- packages/contracts/src/pulseMail.ts packages/contracts/src/pulseMail.test.ts packages/contracts/src/server.ts apps/server/src/mail/MailImapRead.ts apps/server/src/mail/MailRpc.ts apps/server/src/mail/MailImapRead.test.ts apps/server/src/mail/MailReadRpc.test.ts apps/server/src/mail/testing/MailTestPeers.ts apps/server/src/ws.ts apps/web/src/components/workspace/mail/useMailCapabilities.ts
git commit -m "feat(mail): add bounded previews and shared list filters"
```

### Task W11-T2: Stable-reference mail flag mutation

**Files**

- Modify `packages/contracts/src/pulseMail.ts:209-222,308-326,469-486`, `rpc.ts:361-380,1772-1774`, `server.ts:618-620` and their focused mail/authorization tests.
- Modify `apps/server/src/mail/MailImapRead.ts:83-135,395-524`, `MailImapWrite.ts:145-183`, `MailRpc.ts:90-95,219-237`, `apps/server/src/ws.ts:588-603,1307-1409,2008-2014`, `apps/server/src/server.ts:677-682`, `apps/server/src/auth/RpcAuthorization.ts:84-91`.
- Create `apps/server/src/mail/MailChanges.ts` and `MailChanges.test.ts`, one environment-owned in-memory typed event stream for scoped message changes. Reuse the existing subscription transport; no durable flag cache, global counter invalidation or replay store.
- Create `packages/client-runtime/src/state/mailRead.ts` and `mailRead.test.ts`; add explicit `./state/mail-read` export in `packages/client-runtime/package.json`. Modify `packages/client-runtime/src/rpc/client.ts:36-76`, `apps/web/src/mail/mailReadState.ts:1-34`, and useMailCapabilities.
- Tests: MailImapRead.test.ts, MailImapWrite.test.ts, MailReadRpc.test.ts, RpcAuthorization.test.ts, contract mail tests and the new state tests.

**Interfaces**

Consumes MailReplyTarget stable identity. Produces `pulse.mail.setFlags({ target: MailReplyTarget, seen?: boolean, flagged?: boolean }) -> { ref: MailMessageRef }`, `pulse.mail.subscribeChanges({}) -> Stream<MailChange>`, optional mailFlags, and `createMailReadAtoms(runtime)` with folders/messages/conversations/message/setFlags/changes. MailChange is schema-derived `{ accountId: string; ref: MailReplyTarget; seen?: boolean; flagged?: boolean; requiresRefresh?: boolean }`. ref contains the verified resolved Message-ID/location within that account. requiresRefresh is reserved for scoped uncertain/partial failure; confirmed events contain only successfully applied flag fields. Keep web export names pulseMailFolders, pulseMailMessages, pulseMailConversations, pulseMailMessage as aliases of the shared implementation.

**Depends on:** W11-T1. **Serial slot:** Mail RPC/mutation/state, after T1, before T3's shared batch extension and T5. No UI styling changes in this task.

- [ ] Add a MailReadRpc test to the existing setup. Use the archived Q3 brief at an old INBOX UID occupied by Hello and assert desired-state STORE only targets the re-found All Mail UID.

```ts
it.effect("stars the moved original and never the occupant of its old UID", () =>
  Effect.gen(function* () {
    const { account, peer, rpc } = yield* setup(archived());
    const result = yield* rpc.setFlags({
      target: {
        accountId: account.id,
        messageId: "<brief@example.com>",
        location: { accountId: account.id, mailbox: "INBOX", uidValidity: 7, uid: 1 },
      },
      flagged: true,
    });
    expect(result.ref).toMatchObject({ mailbox: "[Gmail]/All Mail", uid: 30 });
    const stores = peer.received.filter(({ line }) => /UID STORE /i.test(line));
    expect(stores).toHaveLength(1);
    expect(stores[0]!.line).toMatch(/UID STORE 30 /i);
    expect(stores[0]!.line).toContain("\\Flagged");
  }).pipe(Effect.scoped, Effect.provide(testLayer())),
);
```

- [ ] Run in apps/server: `vp test run src/mail/MailReadRpc.test.ts src/mail/MailImapWrite.test.ts src/auth/RpcAuthorization.test.ts`. Expect missing setFlags handler/contract. Add auth tests asserting orchestration read alone cannot call the operation.
- [ ] Extract the stable-reference traversal already in fetchByReference into an in-session helper in MailImapRead. Preserve its SCAN_MAX = 50, scanOrder, exact normalized Message-ID verification, location-only warning, UIDVALIDITY checks, incomplete-folder unavailable result and no sequence IDs. Make the helper accept readOnly and a verified-ref callback so read and write reuse one algorithm. Header verification must not request whole message source. A returned reference never crosses into a different account.
- [ ] Refactor setFlags' current inner session body into a same-client operation and expose setFlagsByReference. Resolve and STORE in the same session. Reopen with readOnly false and openChecked immediately before STORE. Verify identity at the chosen location in that writable session; on mismatch return stale-reference, never write or retry an uncertain STORE. Keep existing direct setFlags tool behavior and system-flag limits intact.

```ts
Effect.gen(function* () {
  const add = [
    ...(input.seen === true ? ["\\Seen"] : []),
    ...(input.flagged === true ? ["\\Flagged"] : []),
  ];
  const remove = [
    ...(input.seen === false ? ["\\Seen"] : []),
    ...(input.flagged === false ? ["\\Flagged"] : []),
  ];
  if (add.length > 0)
    yield* imapCall(() => client.messageFlagsAdd(String(ref.uid), add, { uid: true }));
  if (remove.length > 0)
    yield* imapCall(() => client.messageFlagsRemove(String(ref.uid), remove, { uid: true }));
});
```

- [ ] Reject empty changes and foreign target.location.accountId before opening a socket. Accept desired booleans rather than toggle requests. The handler calls withAccount and the shared writer, then publishes MailChange only after confirmed STORE success with the verified account/ref and desired flags. Reuse that publication in the shared flag writer so existing tool-based flag writes also notify clients without duplicate RPC events. If a multi-flag command partially fails, return an error and publish the same account/ref with requiresRefresh true so only affected active queries re-read actual state with their current cursors; never claim atomic success. Keep errors redacted.
- [ ] Add PulseMailFlagRpcs to the existing MailWsRpcGroup and CoreWsRpcGroup omissions, WS_METHODS and client subscription tag union. SetFlags uses AuthOrchestrationOperateScope, subscribeChanges uses read. Provide MailChanges exactly once in MailLayerLive; its typed changes stream delivers scoped events after writes, with no synthetic counter event on subscribe. Subscribe before loading active queries to avoid an initial gap. A reconnect resubscribes without resetting cursors or automatically listing every page; mark possibly stale state honestly until explicit Refresh. No account health probing or timer.
- [ ] Move read atoms to createMailReadAtoms using createEnvironmentRpcQueryAtomFamily/SubscriptionAtomFamily. Use the changes atom to patch already-loaded keyed records, not as a global query-family refreshTrigger. Match environment, accountId and canonical message key, accepting a verified moved-location hint only for the same Message-ID. Patch matching message rows, loaded conversation members/representatives and the open reader using the confirmed seen/flagged fields. Derive conversation aggregates only from known loaded members; mark incomplete aggregate state unknown rather than guessing. In an Unread/flag filter, remove a row that no longer matches without fetching a replacement. Preserve page cursors, loaded pages, selection and scroll even on page 3. Never fetch an unseen row to apply an event. Gate subscriptions by live mailFlags; old servers receive no new method. Events in another account/environment do nothing. Only explicit Refresh or requiresRefresh partial-failure recovery can re-list affected active queries. Recovery retains each current cursor and loaded pages; explicit Refresh alone may reset to page 1 under the existing UI contract.
- [ ] Test star/unstar/read/unread, idempotent desired state, moved archive, changed UIDVALIDITY, forged account, deleted/no-ID original, revoked operate scope and STORE rejection. Test two atom clients receiving the same account/ref-scoped change, patching the row and reader in place, with a second client already on page 3. Record the fake IMAP command log and prove successful setFlags issues no list FETCH from either subscriber, cursor/pages/selection/scroll are retained, and other accounts/environments make zero calls. Cover loaded conversation members, filtered-row removal, partial-failure recovery limited to the affected account/ref with preserved cursors, and reconnect resubscription without polling or global re-list. Await stream queue items and RPC completions, not sleeps.
- [ ] Run named server tests plus `vp test run src/mail/MailChanges.test.ts`; from client-runtime run `vp test run src/state/mailRead.test.ts`; from contracts run `vp test run src/pulseMail.test.ts`. Run affected package typechecks, required server typecheck and targeted lint. Expected pass includes all existing stable-reference read tests.
- [ ] Surface checklist: row/reader/menu mutation entrances later consume the same command; web/desktop use shared atoms; RN can decode flags capabilities without new screens; no provider adapter change; wire identity uses MailReplyTarget; reverse desired states all tested; cross-environment/local/direct/relay/tunnel updates share the stream; documentation belongs to gate.
- [ ] Visual acceptance: fixture 01 [884,99,37,20], gap-email-files 58-62. Unfilled Star at rest, filled only after confirmed success. Error preserves actual state and exposes retry. Seen/unseen stays independent of selection. V1; actual flag/sender state and W4 chrome are allowed substitutions. Future capture only.
- [ ] Future commit, explicit files only, including new files:

```text
git add -- packages/contracts/src/pulseMail.ts packages/contracts/src/pulseMail.test.ts packages/contracts/src/rpc.ts packages/contracts/src/server.ts packages/client-runtime/package.json packages/client-runtime/src/rpc/client.ts packages/client-runtime/src/state/mailRead.ts packages/client-runtime/src/state/mailRead.test.ts apps/server/src/mail/MailChanges.ts apps/server/src/mail/MailChanges.test.ts apps/server/src/mail/MailImapRead.ts apps/server/src/mail/MailImapRead.test.ts apps/server/src/mail/MailImapWrite.ts apps/server/src/mail/MailImapWrite.test.ts apps/server/src/mail/MailRpc.ts apps/server/src/mail/MailReadRpc.test.ts apps/server/src/ws.ts apps/server/src/server.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts apps/web/src/mail/mailReadState.ts apps/web/src/components/workspace/mail/useMailCapabilities.ts
git commit -m "feat(mail): update flags through stable message references"
```

### Task W11-T3: Inbox/Unread/Later rail and enriched mail rows

**Files**

- Modify `apps/web/src/components/workspace/mail/MailNav.tsx:24-130`, `MailSpace.tsx:46-82,122-129,157-179,219-285`, `MailMessageList.tsx:14-207`, `MailConversationList.tsx:10-155`, `mailItemRef.ts:66-80`, `apps/web/src/mail/mailReadState.ts` from T2 and `useMailCapabilities.ts`.
- Modify `apps/web/src/components/workspace/WorkspaceViewRail.tsx` only for mail WorkspaceRailItem[] entries in the exported workspaceRailItems registry, under its serial slot; no ReactNode rail slot exists. Consume W4's validated view: inbox/unread/later from workspaceNavigation.ts and W9-T7 saved atoms. Extend `apps/web/src/components/workspace/WorkspaceViewRail.test.tsx` for the mail registry items and `apps/web/src/routes/-_chat.workspace.test.ts` for direct URLs and back/forward; modify `_chat.workspace.tsx` only for caller binding, never add a second view URL key.
- Modify `apps/web/src/components/workspace/dev/mailMockupModule.tsx`, owned by T3 and completed by the gate. Create `apps/web/src/components/workspace/mail/MailCenterView.tsx` for shared pure mail presentation, with no live Mail container/query/approval subscription imports. T3 owns the initial list view; T4 and T6 extend this same file under the Mail UI chain for reader/reply.
- Extend `packages/contracts/src/pulseLinks.ts:193-198,252-258`, `apps/server/src/ws.ts:1417-1442`, `apps/server/src/workspace/WorkspaceLinks.ts:65-81,187-207`, and shared links atoms only if keyed output is not already supplied by an earlier admitted task. Reuse the existing repository confirmedFor query at `apps/server/src/persistence/WorkspaceLinks.ts:235-244,397-403` without modifying it. Preserve an earlier owner's keyed signature if supplied.
- Tests: existing MailMessageList.test.tsx, MailConversationList.test.tsx, MailSpace.test.tsx, mailItemRef.test.ts, linkedItems.test.ts; create MailNav.test.tsx. Extend pulseLinks.test.ts and WorkspaceLinks.test.ts for keyed output. No new link store or repository query.

**Interfaces**

Consumes W11-T1 filters/presentation, T2 shared mail atoms, W9-T7 WorkspaceSavedItems add/remove/list/change, W4 workspaceRailItems/WorkspaceRailItem data, frame/actions and WorkspaceHeaderModel via WorkspaceEngagement.header. Produces Inbox/Unread/Later navigation, shared `MailRow` rendering and optional `WorkspaceLinkList.byItem: ReadonlyArray<{ key: string; linked: ReadonlyArray<WorkspaceLinkView>; truncated: boolean }>` on listMany. Existing union linked/suggested/truncated remains for ConversationLinked and old callers. An absent byItem means omit row chips rather than guess ownership.

**Depends on:** W11-T1, W11-T2, W9-T7, W4-T6. **Serial slot:** first W11 UI owner; links/ws/schema extension after T2 and earlier-wave links owners, before T5. Later UI chain T3 -> T4 -> T6 -> T7.

- [ ] Add a mailItemRef.test.ts failing assertion for stable filter serialization and false values. Keep fixed field order for atom keys.

```ts
it("keeps false filters and resets paging when the caller clears its cursor", () => {
  expect(
    mailMessagesInput({
      accountId: "acct_1",
      mailbox: "INBOX",
      query: "  launch  ",
      filters: { unseen: true, flagged: false },
    }),
  ).toEqual({
    accountId: "acct_1",
    mailbox: "INBOX",
    query: "launch",
    filters: { unseen: true, flagged: false },
  });
});
```

- [ ] Add user-action tests using the existing react-test-renderer/act setup in MailMessageList.test.tsx and MailConversationList.test.tsx. Select Unread and assert query input has filters.unseen true before any page renders. Enter/clear search in each mode, append a page, change filters and assert cursor pages reset. Select Later, remove an unavailable original, and assert the underlying saved reference and environment are passed to W9-T7's remove command. Run from apps/web: `vp test run src/components/workspace/mail/mailItemRef.test.ts src/components/workspace/mail/MailMessageList.test.tsx src/components/workspace/mail/MailConversationList.test.tsx src/components/workspace/mail/MailSpace.test.tsx src/components/workspace/mail/MailNav.test.tsx`. Expect missing view/filter/preview behavior.
- [ ] Keep MailNav's real account/folder/settings controls in the shell's disclosure; supply the three named WorkspaceRailItem entries through workspaceRailItems for the shell-owned 52px rail. Use the single view key for both URL parsing and selection; test Inbox/Unread/Later direct links, palette and history, including rejection of invalid views. Pass title/subtitle as WorkspaceHeaderModel via WorkspaceEngagement.header, without rendering a second Mail header. Account/environment/folder/view changes reset selected message/conversation and cursor pages. Unread means selected folder's true IMAP unseen filter, with Inbox as its initial folder. Saved Later consumes createWorkspaceSavedItemAtoms and the optional workspaceSavedItems capability, filters loaded refs by selected account and environment, and preserves the service's bounded cursor paging. A page with no matching mail still offers Load more when nextCursor exists; do not scan every saved page to fill the view. WorkspaceSavedItem has no title or body, so use already-loaded keyed mail metadata when available and otherwise a stable-reference label. Resolve body/availability only on open, retain unavailable/removable refs and never fetch all saved bodies to decorate rows.
- [ ] Refactor both list modes to share query/filter controls. Existing search/Refresh/mode actions remain accessible through a compact options menu; use no timer debounce that polls the service. Refresh is static and disabled while one request is pending. Keep conversation newest-message action semantics, expanded-member selection, incomplete warning and Load more.
- [ ] Render MailRow with a row container and sibling selection/chip/menu buttons, never nested interactive elements. Use structured addresses first, raw from fallback for old servers. Clip subjects to two lines, preview to one and reserve the chip area. Example selection content:

```tsx
<button
  type="button"
  onClick={onSelect}
  aria-current={active ? "true" : undefined}
  aria-label={`${senderLabel}, ${mailItemTitle(message.subject)}, ${message.seen ? "read" : "unread"}`}
  className={cn("w-full min-w-0 px-3 pt-4 text-left", active && "bg-accent")}
>
  <span className="flex items-baseline gap-2 text-[10px]">
    <span className="min-w-0 flex-1 truncate font-semibold">{senderLabel}</span>
    <span className="shrink-0 text-[9px] text-muted-foreground">{timeLabel}</span>
  </span>
  <span className="mt-1 block line-clamp-2 text-[11px] leading-4 font-semibold">
    {mailItemTitle(message.subject)}
  </span>
  <span className="mt-1 block truncate text-[10px] text-muted-foreground">
    {message.preview?.text ?? ""}
  </span>
</button>
```

senderLabel/timeLabel are derived from the current message and pinned fixture clock, never from sample literals. Tune token-backed selected fill and vertical padding to the look table. Project chips are sibling buttons that open the captured project, leaving selection unchanged. WorkspaceItemMenu still wraps the captured endpoint, supports right-click/keyboard/touch and exposes Save for later/Remove from Later using the shared saved service. Do not add a custom keybinding merely for screenshot parity.

- [ ] Fix keyed batch attribution at existing listMany only. Add optional byItem to WorkspaceLinkList and preserve the old union fields. For up to 50 visible mail endpoints, deduplicate by workspaceItemKey and issue one listMany RPC. In WorkspaceLinks expose listMany over existing repository.confirmedFor(keys), which already runs one bounded confirmed-edge query and returns links/truncated. Map each stored edge's opposite endpoint back to its requested key using the existing service conversion. Return the same union of up to 100 confirmed views and suggested empty, preserving current response semantics. If the shared 100-edge cap truncates the batch, conservatively mark every byItem entry truncated. Do not issue more queries to fill chips. Keep the existing 500-item RPC input limit for old conversation callers. Do not call `.list` once per rendered row or run suggestions/models. A direct mail-project confirmed edge creates a chip; suggested, one-hop and unrelated edges do not. Reuse keyed output if earlier waves have added it, rather than adding another batch API.
- [ ] Pin the keyed regression with two mails A/B and projects P/Q: link A-P, B-Q and a suggested A-Q, call one listMany, assert byItem[A] contains only P as confirmed and byItem[B] only Q. Assert one bounded repository read. On old response without byItem omit chips while keeping the conversation union working. Observe W4/W9 shared links changes for refresh; saving Later itself does not create a link or agent context.
- [ ] Test selected Nina consistency, unknown sender/date/preview, chip click not selecting row, menu action after selection changes, query reset on account switch, duplicate Message-ID in different accounts, conversation mode/newest action, old server capability absence, unavailable saved item removable and two clients seeing save/remove. Tests operate through UI actions or RPCs, not CSS snapshots alone.
- [ ] Rerun named web tests and affected links service/repository/contracts tests from their packages. Run affected package typechecks, required server typecheck and explicit-path lint. Expected pass: no per-row network/model calls and no accidental cross-account row chips.
- [ ] Surface checklist: inbox/folder/search/toggle/row/menu/palette shared actions retained; web/desktop share rendering; phone uses one pane and 44px controls, RN no inbox added; all providers retain captured mail context; no heavy contract logic; save/remove, filters clear, switch/back/reset work; environment caches isolate local/direct/relay/tunnel; docs at gate.
- [ ] Update dev/mailMockupModule.tsx with createWorkspaceMockupModule: CreateWorkspaceMockupModule returning WorkspaceMockupModule. Extract/export pure MailRow and MailCenterView from mail/MailCenterView.tsx, taking rows: ReactNode and reader: ReactNode as the split body, with no rail or header rendering of its own. MailSpace passes view data to workspaceRailItems and header: WorkspaceHeaderModel to WorkspaceEngagement separately. Move actual list/detail/reply markup to pure exports in that file. MailRow takes message metadata, selected, project chips and onSelect/onOpenProject/onAction; MailReaderView takes message, trusted addresses, projects, relatedFolders and onStar/onAction/onOpenFolder; MailInlineReplyView takes text, pending/error, selectedLinks and onChange/onReview/onDiscard/onPickDrive. MailCenterView composes these controlled ReactNode children. Keep query/draft/approval hooks in live containers. Live MailSpace maps real reads to the same components; adapter supplies fake list, reader and reply props through the seven tasks. T3 renders the actual row/list view but leaves center absent from readyRegions until the gate verifies recipients, SynKEK chip, Marketing card and reply. Extend MailSpace.test.tsx for adapter isolation and readiness, with no live MailSpace container or provider imports in the adapter.
- [ ] Visual acceptance: fixture 01 [207,26,222,774], gap-email-files35-50. Match three rail actions, search capsule, five exact row boxes/chips and corrected Nina selection under V1. Live actual folders/unseen/saved/sender/time/preview and supported project chips are allowed. Filter/menu/Later empty/error expansions require reviewed proposed captures.
- [ ] Future commit, explicitly stage the implementation's used subset of this list, never other owners' files:

```text
git add -- apps/web/src/components/workspace/mail/MailNav.tsx apps/web/src/components/workspace/mail/MailNav.test.tsx apps/web/src/components/workspace/mail/MailSpace.tsx apps/web/src/components/workspace/mail/MailSpace.test.tsx apps/web/src/components/workspace/mail/MailMessageList.tsx apps/web/src/components/workspace/mail/MailMessageList.test.tsx apps/web/src/components/workspace/mail/MailConversationList.tsx apps/web/src/components/workspace/mail/MailConversationList.test.tsx apps/web/src/components/workspace/mail/mailItemRef.ts apps/web/src/components/workspace/mail/mailItemRef.test.ts apps/web/src/components/workspace/mail/linkedItems.test.ts apps/web/src/components/workspace/mail/useMailCapabilities.ts apps/web/src/mail/mailReadState.ts apps/web/src/routes/_chat.workspace.tsx apps/web/src/routes/-_chat.workspace.test.ts packages/contracts/src/pulseLinks.ts packages/contracts/src/pulseLinks.test.ts apps/server/src/ws.ts apps/server/src/workspace/WorkspaceLinks.ts apps/server/src/workspace/WorkspaceLinks.test.ts apps/web/src/components/workspace/WorkspaceViewRail.tsx apps/web/src/components/workspace/dev/mailMockupModule.tsx apps/web/src/components/workspace/WorkspaceViewRail.test.tsx apps/web/src/components/workspace/mail/MailCenterView.tsx
git commit -m "feat(mail): add unread and saved views with compact rows"
```

### Task W11-T4: Compact reader and explicit related-folder handoff

**Files**

- Modify `apps/web/src/components/workspace/mail/MailCenterView.tsx` under the Mail UI chain to extract pure reader presentation. Modify `apps/web/src/components/workspace/mail/MailMessageView.tsx:19-117,119-183`, `MailSpace.tsx:157-214,308-369`, `linkedItems.ts:1-105`, `useWorkspaceItemOpener.ts:31-94` only at the W7 shared openFiles entrance.
- Consume confirmed link and folder metadata from the earlier-wave explorer/binding helpers. Do not copy their root/account state. Reuse `WorkspaceItemMenu` and W4's discreet action entrance from `apps/web/src/components/workspace/WorkspaceItemActions.tsx:44-93,245-310,540-569`; modify only if an existing compact option is missing, holding its UI slot.
- Tests: MailMessageView.test.tsx, MailSpace.test.tsx, linkedItems.test.ts, WorkspaceItemActions.test.tsx, and W7 openFiles/explorer tests only where adding a mail case.

**Interfaces**

Import useOpenFiles, type OpenFilesInput and type OpenFiles from apps/web/src/components/workspace/openFiles.ts. Obtain openFiles = useOpenFiles() inside W4's WorkspaceResourcesProvider. The W7 folder/file XOR wrapper validates the captured environment/project and delegates to useWorkspaceResources().openResource from workspaceResourceState.ts. Do not instantiate another useWorkspaceResourceState or invent an exported openFiles singleton.

Consumes T2 setFlags, T3 keyed direct links, W4 Linked context/actions and W7-T3 useOpenFiles from apps/web/src/components/workspace/openFiles.ts. Produces compact reader rendering and a mail caller of the existing openFiles request, with original item retained. No new folder route or persistent root write.

**Depends on:** W11-T2, W7-T3, W11-T3. **Serial slot:** W11 UI after T3, before T6; shared opener/actions after their earlier-wave owners.

- [ ] Extend MailMessageView.test.tsx with actual rendered content and captured Star/card actions. Keep the existing cached-data error/retry test. Add a pure confirmed-link classification test beside linkedItems.test.ts. For one project link and a suggested folder, assert no folder card; after confirming the exact folder association assert it appears; unlink removes the card but does not change root.
- [ ] Add an interaction test using react-test-renderer, mocked useOpenFiles returning the OpenFiles spy openFiles, and a reader fixture with actual trusted addresses. Click the button by accessible name and assert the captured request:

```ts
expect(openFiles).toHaveBeenCalledWith({
  environmentId,
  projectId,
  folderId: "folder_marketing",
});
expect(setProjectRoot).not.toHaveBeenCalled();
expect(onBack).not.toHaveBeenCalled();
```

Use W7's OpenFilesInput exactly; openFiles/setProjectRoot are test spies on that shared boundary. Seed environmentId/projectId with existing branded constructors and original with canonicalMailRef. Assert the caller's selected original and draft remain unchanged. Test the same behavior when the request opens the compact Resources sheet.

- [ ] Run in apps/web: `vp test run src/components/workspace/mail/MailMessageView.test.tsx src/components/workspace/mail/MailSpace.test.tsx src/components/workspace/mail/linkedItems.test.ts src/components/workspace/WorkspaceItemActions.test.tsx`. Expect missing compact sender/star/card behavior; do not accept an unrelated rendering failure as the red assertion.
- [ ] Replace the resting metadata dl with project chips, subject, compact avatar/name/address and recipient/time line. Use optional structured fields from T1, no comma splitting. Put full metadata behind Message actions/details. Preserve the body chunks, attachment list, no-Message-ID and sourceTruncated warnings, and cached-body error ordering. Use a text pre/span renderer with whitespace-pre-wrap, not dangerouslySetInnerHTML.

```tsx
<header className="flex flex-col">
  <h1 className="text-base leading-5 font-semibold">{mailItemTitle(data.subject)}</h1>
  <div className="mt-4 flex items-center gap-[10px]">
    <span
      aria-hidden
      className="flex size-[29px] shrink-0 items-center justify-center rounded-lg bg-accent text-[10px] text-primary"
    >
      {senderInitials}
    </span>
    <div className="min-w-0 text-[10px]">
      <p className="truncate">
        <strong>{senderName}</strong> <span className="text-muted-foreground">{senderAddress}</span>
      </p>
      <p className="mt-1 truncate text-[9px] text-muted-foreground">{recipientTimeLabel}</p>
    </div>
  </div>
</header>
```

Derive senderName/senderAddress/initials from the same message as the list. The project-chip/top-action row precedes this header with spacing specified above. Keep the first body baseline near234, not a fixed body height for arbitrary messages.

- [ ] Wire Star to desired flagged state through T2. Disable while in flight; retain old state on failure and display a redacted error. Expose explicit Mark as read/Mark as unread in Message actions using the same command. Do not make reading or opening the card a flag write.
- [ ] Render the related-folder card only from confirmed direct association and supported folder metadata. Do not select the first project or folder from a union. For several candidates show a reviewed chooser with project/folder labels. Retain unavailable cards with reason. Call the existing openFiles action, preserve selected message, draft, resource project/root account and back focus. Browsing never links or replaces root.
- [ ] Keep Draft reply with agent, Start thread, Add to project, Start project, Start automation, link/unlink and provenance reachable through shared menus/shortcuts/palette/touch. If a compact actions prop is required, preserve the existing shortcut registration and captured endpoint; do not CSS-hide a toolbar's duplicate accessible controls. Explicit menu button must work without right-click.
- [ ] Test no/one/multiple projects, missing addresses, stale read response after item/environment switch, older metadata fallback, star/unstar failure, unavailable folder, and focus/selection preservation. Conversation detail passes the actually expanded message to actions, not always newest. Run named tests again, web/server typechecks and targeted lint. Expected pass includes old read-more/attachment/errors and shared action regressions.
- [ ] Surface checklist: reader/header/row/menu/palette/keybinding/touch use captured original; web/desktop compact reader and phone Back/Resources sheet work; RN reader out of scope; provider adapters unchanged and shared linked data remains data; contract fields optional; read/unread, star/unstar, folder/back, close/reopen keep context; all connection modes use environment-bound actions; docs at gate.
- [ ] Visual acceptance: fixture 01 [449,98,471,468], gap-email-files54-85. Match chip, subject y142,29px avatar y175, body y234, paragraph spacing and 185x48 Marketing card. Match star/more [884,99,37,20]. V1 and W4 chrome apply. Live real sender/body/project/confirmed folder are allowed; unavailable and multiple-choice states require review.
- [ ] Future commit, used explicit files only:

```text
git add -- apps/web/src/components/workspace/mail/MailMessageView.tsx apps/web/src/components/workspace/mail/MailMessageView.test.tsx apps/web/src/components/workspace/mail/MailSpace.tsx apps/web/src/components/workspace/mail/MailSpace.test.tsx apps/web/src/components/workspace/mail/linkedItems.ts apps/web/src/components/workspace/mail/linkedItems.test.ts apps/web/src/components/workspace/useWorkspaceItemOpener.ts apps/web/src/components/workspace/WorkspaceItemActions.tsx apps/web/src/components/workspace/WorkspaceItemActions.test.tsx apps/web/src/components/workspace/mail/MailCenterView.tsx
git commit -m "feat(mail): match the compact reader and open confirmed folders"
```

### Task W11-T5: Manual prepare-reply entrance to exact approval

**Files**

- Modify `packages/contracts/src/pulseMail.ts:209-274,469-486`, `rpc.ts:376-380,1772-1774`, `server.ts:618-620`, and pulseMail.test.ts. Add prepareReply to existing PulseMailReplyRpcs, not CoreWsRpcGroup.
- Modify `apps/server/src/mail/MailReply.ts:1-65`, `MailReply.test.ts:1-76`, `MailRpc.ts:90-95,148-152`, `MailSendService.ts:253-409,422-475` only where shared preparation/recovery needs a correction, and `MailSendService.test.ts:175-213,781-891` for public manual-reply cases.
- Modify `apps/server/src/ws.ts:588-603,1307-1320,2008-2014` and `apps/server/src/auth/RpcAuthorization.ts:84-91`, with auth tests. Use T1 trusted structured metadata and T2 stable resolver, never client-supplied recipients.
- Inspect and retain `packages/client-runtime/src/mail/mailApprovals.ts:14-63`; extend `mailApprovals.test.ts:1-116` for old/manual snapshots and existing response/subscription behavior. Production changes are needed only if these tests reveal a compatibility defect.
- Inspect and retain `apps/mobile/src/features/threads/MailSendApprovalCard.tsx:12-188`; create adjacent `MailSendApprovalCard.test.tsx`. Modify the card only for a supported missing manual-reply display state or truthful terminal copy. Extend `apps/mobile/src/state/use-selected-thread-requests.test.tsx`; inspect its production hook at `use-selected-thread-requests.ts:371-487` for thread/environment binding.
- Modify web useMailCapabilities to expose live mailManualReply. No native Mail screen or provider CLI.

**Interfaces**

Consumes `MailPrepareReplyInput` above, existing durable ThreadId, exact original MailReplyTarget, project sending grant, trusted fetchByReference detail, and MailSendService.prepare. Produces `pulse.mail.prepareReply(input) -> MailSendApproval` and mailManualReply. `MailSendApproval`, `MailSendSnapshot`, respondApproval and subscribeThreadApprovals remain unchanged. No required discriminator or new native-only approval type.

**Depends on:** W11-T1, W11-T2. **Serial slot:** Mail RPC after T2 and T3's narrow links/ws slot. T4 has no service prerequisite on T5. Shared approval/mobile files have one owner here; T6 later owns web card extraction.

- [ ] Add trusted recipient tests to MailReply.test.ts using the existing Effect style. Export `replyContent` from MailReply.ts for this focused value test, with production use through prepareReply. The server detail's optional addresses come from T1, not from request JSON.

```ts
it("derives reply-all from parsed addresses and excludes the sending account", () => {
  const original = {
    subject: "Launch review",
    messageId: "<original@test>",
    references: ["<ancestor@test>"],
    addresses: {
      from: [{ name: "Patel, Nina", address: "nina@example.com" }],
      replyTo: [{ name: "Patel, Nina", address: "reply@example.com" }],
      to: [{ address: "ME@mail.test" }, { name: "Maya", address: "maya@example.com" }],
      cc: [{ address: "MAYA@example.com" }, { address: "leo@example.com" }],
    },
  };
  expect(replyContent(original, "me@mail.test", "reply-all", "Ready.")).toEqual({
    to: [
      { name: "Patel, Nina", address: "reply@example.com" },
      { name: "Maya", address: "maya@example.com" },
    ],
    cc: [{ address: "leo@example.com" }],
    bcc: [],
    subject: "Re: Launch review",
    text: "Ready.",
    inReplyTo: "<original@test>",
    references: ["<ancestor@test>", "<original@test>"],
  });
});
```

- [ ] Add a public service test in MailSendService.test.ts, reusing its real in-memory repository/WorkspaceLinks/config, fake IMAP/SMTP and setup helper. Extend setup's return only to expose the existing options or peer needed for assertions. Link the exact original to the owning thread before preparing, using existing WorkspaceLinks.link with viewing/source. Call the new prepareReply helper used by MailRpc and assert:

```ts
expect(prepared.status).toBe("pending");
expect(prepared.threadId).toBe(threadId);
expect(prepared.snapshot.text).toBe("Ready.");
expect(prepared.snapshot.to.map((entry) => entry.address)).toEqual(["reply@example.com"]);
expect(prepared.snapshot.replyOriginal?.messageId).toBe("<original@test>");
expect(smtp.connections()).toBe(0);
expect(dataCommands(smtp)).toBe(0);
```

Seed original raw headers including Reply-To in a FakeImapMailbox; do not mock away derivation. Add moved-original test and a forged account/location case with zero SMTP. Run apps/server `vp test run src/mail/MailReply.test.ts src/mail/MailSendService.test.ts src/mail/MailReadRpc.test.ts src/auth/RpcAuthorization.test.ts`. Expect new helper/RPC assertions to fail before implementation.

- [ ] Add the schema with required threadId/original/mode/text. Bound text to24,000 characters and reject blank replies. The contract has no client recipient/account override fields; they must never influence derivation, whether the existing RPC decoder rejects or ignores excess properties. Preserve MailReplyTarget's cross-account check. Advertise mailManualReply only with handler/auth wiring. Define WS_METHODS.pulseMailPrepareReply and include it in existing reply family, aggregate group and Core omissions. Use AuthOrchestrationOperateScope.

```ts
export const MailPrepareReplyInput = Schema.Struct({
  threadId: ThreadId,
  original: MailReplyTarget,
  mode: Schema.Literals(["reply", "reply-all"]),
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(24_000)),
});
export type MailPrepareReplyInput = typeof MailPrepareReplyInput.Type;
```

- [ ] Implement prepareReply in MailReply.ts beside replyReadiness. Pass config/oauth/send explicitly, following mailRpcHandlers' existing dependency injection. Resolve the durable thread and exact account with config.resolveAccount, then login and read the original using fetchByReference. Let the existing send.prepare revalidate grant, exact retained-original link, account generation and outgoing MIME/digest.

```ts
export const prepareReply = (
  config: MailConfigService["Service"],
  oauth: MailOAuth["Service"],
  send: MailSendService["Service"],
  input: MailPrepareReplyInput,
  imap: MailConnectionOptions = {},
) =>
  Effect.gen(function* () {
    const { account, threadId } = yield* config.resolveAccount({
      threadId: input.threadId,
      selector: input.original.accountId,
    });
    const login = yield* oauth.login(account.id);
    const original = yield* fetchByReference(account, login, input.original, imap);
    const content = yield* Effect.try({
      try: () => replyContent(original, account.address, input.mode, input.text),
      catch: (cause) =>
        cause instanceof MailError
          ? cause
          : new MailError({
              kind: "invalid-input",
              message: "The original reply headers could not be used.",
            }),
    });
    return yield* send.prepare({
      threadId,
      selector: account.id,
      replyTo: input.original,
      content,
    });
  });
```

Use the required imports from existing modules and schema-derived types. Before network use reject blank text and input.original.location from another account. replyContent rejects unavailable/oversized trusted recipient metadata, no recipients after self-removal, or invalid headers with MailError invalid-input. Never fabricate recipients from raw display text. Derive normalized reply headers server-side. A no-Message-ID original may reply using its verified location without forged In-Reply-To; preserve the existing warning/provenance semantics.

- [ ] Implement replyContent's deterministic policy: Reply-To when present, otherwise From; reply-all additionally includes original To then Cc. Deduplicate addresses case-insensitively across To/Cc, remove account.address, preserve parsed names, never copy Bcc. Respect existing 50 total-recipient limit and fail visibly on overflow instead of dropping recipients. Normalize References, deduplicate in order, append original Message-ID, cap the chain at 100 valid IDs, and retain one existing `Re:` prefix. Do not parse with `split(',')`.
- [ ] Handler calls prepareReply through redact. It must not invoke provider readiness, a provider CLI, saveDraft/APPEND or SMTP. It cannot create a thread or original link implicitly. User must explicitly choose a persisted owning thread or explicitly create one through existing orchestration, then explicitly retain the original. If absent, return the existing access-denied explanation. Recheck grant in send.prepare; browsing, project chips and Later do not grant send permission.
- [ ] Keep MailSendService's stored MIME, messageId, digest, beginSubmit claim, approve once, acceptance status and recoverAcceptedLinks. Test stale digest rejected, concurrent approvals produce one DATA, decline produces zero, account removal invalidates, deleted thread rejected, accepted-link persistence recovery never resends, and outcome_unknown never offers a fresh send automatically. Use Queue/Deferred from the existing tests, no polling.
- [ ] Extend contract/shared-runtime tests with a complete old snapshot without optional messageId/replyOriginal and the new manual snapshot with them. Decode using Schema.decodeUnknownSync(MailSendApproval), feed both into visibleMailApprovals and assert unchanged order/terminal retention. Existing respondToMailApproval must send the exact displayed digest to the selected environment. Test resubscribe, stale pushed pending after a local answer and a second environment with same threadId.
- [ ] Add an RN card interaction test. Mock react-native/AppText/RequestActionButton as host elements using the existing mobile test conventions, but mount the actual MailSendApprovalCards and render the full snapshot. Mock only useSelectedThreadMailApprovals for the card unit; separately test the actual hook's thread subscription and response routing in use-selected-thread-requests.test.tsx. Core action assertion:

```tsx
const { root } = renderer;
const approve = root.findAll((node) => node.props.label === "Approve once")[0]!;
await act(() => approve.props.onPress());
expect(onRespond).toHaveBeenCalledWith(manualApproval, "approve");
const decline = root.findAll((node) => node.props.label === "Decline")[0]!;
await act(() => decline.props.onPress());
expect(onRespond).toHaveBeenLastCalledWith(manualApproval, "decline");
```

renderer is the ReactTestRenderer created inside act from `<MailSendApprovalCards />`; onRespond is a vi.fn in the hook mock and manualApproval is a complete decoded schema fixture. Make each action test start with a fresh pending card. Assert selectable exact body/URL and all recipient fields; submitting/terminal cards have no approval buttons. Never merely search source text for button labels. Existing production card may need no changes when this passes.

- [ ] From client-runtime run `vp test run src/mail/mailApprovals.test.ts`. From apps/mobile run `vp test run --config ../../vite.config.ts src/features/threads/MailSendApprovalCard.test.tsx src/state/use-selected-thread-requests.test.tsx`. From contracts run `vp test run src/pulseMail.test.ts`. Rerun server tests, affected typechecks including apps/mobile, and explicit-path lint. Native packaged/device acceptance is not established by these tests.
- [ ] Surface checklist: existing and explicitly created owning threads receive the same approval subscription; manual path requires no provider, while Draft reply with agent retains readiness checks for Codex/Claude/Cursor/Grok/OpenCode/ACP individually by supportsMcpTools; web/desktop and existing RN card decode the same shape; no new native screen; prepare/respond use operate and read subscriptions use read; decline/reprepare/recover are explicit; old/local/direct/relay/tunnel/multi-environment cases tested; docs at gate.
- [ ] Visual acceptance: no additional resting controls, fixture 01 [449,591,471,143], gap-email-files65-85. Expanded existing approval is a reviewed state, full exact message visible and Approve once/Decline reachable. RN card has a separately reviewed proposed state, not an invented PNG01 crop. Live Review reply/trusted addressing/actual content and W4 chrome are allowed substitutions.
- [ ] Future commit, used explicit files only; retain unchanged production files without staging them:

```text
git add -- packages/contracts/src/pulseMail.ts packages/contracts/src/pulseMail.test.ts packages/contracts/src/rpc.ts packages/contracts/src/server.ts apps/server/src/mail/MailReply.ts apps/server/src/mail/MailReply.test.ts apps/server/src/mail/MailRpc.ts apps/server/src/mail/MailSendService.ts apps/server/src/mail/MailSendService.test.ts apps/server/src/mail/MailReadRpc.test.ts apps/server/src/ws.ts apps/server/src/auth/RpcAuthorization.ts apps/server/src/auth/RpcAuthorization.test.ts packages/client-runtime/src/mail/mailApprovals.ts packages/client-runtime/src/mail/mailApprovals.test.ts apps/mobile/src/features/threads/MailSendApprovalCard.tsx apps/mobile/src/features/threads/MailSendApprovalCard.test.tsx apps/mobile/src/state/use-selected-thread-requests.test.tsx apps/web/src/components/workspace/mail/useMailCapabilities.ts
git commit -m "feat(mail): prepare manual replies with exact send approval"
```

### Task W11-T6: Inline composer and shared approval card

**Files**

- Modify `apps/web/src/components/workspace/mail/MailCenterView.tsx` under the Mail UI chain for pure controlled reply presentation; live MailInlineReply maps draft/approval state to it.

- Create `apps/web/src/components/workspace/mail/MailInlineReply.tsx` and adjacent MailInlineReply.test.tsx.
- Create `apps/web/src/mail/mailReplyDrafts.ts` and mailReplyDrafts.test.ts, a bounded per-message draft store using the incumbent client state convention, not server mail drafts or a second approval repository.
- Modify `apps/web/src/components/workspace/mail/MailMessageView.tsx:49-114`, `MailSpace.tsx:157-179,308-369`, `apps/web/src/components/chat/MailSendApprovalPanel.tsx:32-45,100-162,170-182` and its new focused MailSendApprovalPanel.test.tsx.
- Modify `apps/web/src/components/workspace/mail/MailDraftReply.tsx:33-188` only to reuse a proven owning-thread chooser if useful; retain agent path. Tests include MailDraftReply.test.tsx. Inspect `apps/web/src/hooks/useHandleNewThread.ts:59-220` before offering Create thread, because it returns a local draft, not guaranteed durable storage.
- Consume `apps/web/src/state/threads.ts:20-23` threadEnvironment.create and its existing shared implementation at `packages/client-runtime/src/state/threadCommands.ts:140-160,406-409` and `packages/client-runtime/src/operations/commands.ts:68-78,399-418`. No edits to these shared modules are planned. They already provide durable thread.create dispatch without a provider turn.

**Interfaces**

Consumes T5 prepareReply, existing `createThreadMailApprovalsAtomFamily`, `respondToMailApproval`, `visibleMailApprovals`, MailSendApproval and W4 shared action entrance. Produces exported `MailSendApprovalCard({ environmentId, approval, onAnswered })` from the existing web panel, and `MailInlineReply({ environmentId, original, onOpenThread })` using the same card.

Draft key is `JSON.stringify([environmentId, original.accountId, workspaceItemKey(original)])`. State contains exact text, explicit threadId when chosen, mode, monotonically increasing local revision and prepared approvalId/digest. Stable Message-ID keys survive folder moves; account/environment do not collide. Bound unsent drafts to50 entries and 24,000 characters each, never evict a nonempty draft silently. Show an explicit capacity/discard choice. Keep draft text in memory for this wave rather than adding an unrequested plaintext persisted mail cache. Preserve it across selection, sheet and account disconnect in the running app. Server approval state survives reconnect via subscription.

**Depends on:** W11-T4, W11-T5. **Serial slot:** W11 UI after T4 and completed T5 web capability changes, before T7. Sole web approval-panel owner in this slot.

- [ ] Add a real store test, using a small factory export `createMailReplyDrafts()` to keep tests isolated. Implement `get/setText/setThread/setPrepared/clear` on that instance and expose one web singleton. Test stable identity and environment isolation:

```ts
it("keeps unsent text with the stable original across moves and selection changes", () => {
  const drafts = createMailReplyDrafts();
  const original = canonicalMailRef({ accountId: "acct", messageId: "<launch@test>" });
  const moved = canonicalMailRef({
    accountId: "acct",
    messageId: "<launch@test>",
    location: { accountId: "acct", mailbox: "Archive", uidValidity: 9, uid: 30 },
  });
  drafts.setText("env_a", original, "Keep this reply.");
  expect(drafts.get("env_a", moved)?.text).toBe("Keep this reply.");
  expect(drafts.get("env_b", original)).toBeUndefined();
});
```

Use EnvironmentId.make in typed implementations/tests if the factory accepts the branded type. No message bytes or typed text go to the mail service during this test.

- [ ] Add MailInlineReply interaction tests with react-test-renderer/act and mocked RPC command boundaries. Typing into textarea leaves prepare/respond call counts0. Click Review reply, explicitly choose the owning thread and retain the original, then assert prepare input contains exactly visible text, original, mode and threadId, and no recipient/account override. Rerender with originalB before resolving the deferred prepareA; A's result must not appear beneath B or replace B's draft. Resolve through a controlled Promise/Deferred, not sleeps.
- [ ] Run apps/web `vp test run src/mail/mailReplyDrafts.test.ts src/components/workspace/mail/MailInlineReply.test.tsx src/components/chat/MailSendApprovalPanel.test.tsx src/components/workspace/mail/MailDraftReply.test.tsx`. Expect new component/store behavior absent.
- [ ] Export the existing memoized MailSendApprovalCard from MailSendApprovalPanel without cloning its status, digest, recipients/body/attachment rendering or response commands. Keep existing chat MailSendApprovals behavior. Reuse one environment/thread subscription family for both entrances; filter the inline card to its exact approvalId and original, not every pending thread approval.
- [ ] Render the compact composer geometry and placeholder from the look reference. Use a real textarea with accessible name Reply text, a 24,000-character limit and whitespace-preserving value. Review reply is disabled for empty text, no connected owning account, missing capability or in-flight preparation. Inline account errors retain the text. Show a simple explicit reply/reply-all choice in reviewed expanded controls; initial reply-all matches fixture recipients. Do not infer a thread from the resource project's currently selected tab.

```ts
const captured = {
  environmentId,
  original,
  text: draft.text,
  revision: draft.revision,
  threadId: draft.threadId,
  mode: draft.mode,
};
const result = await prepare({
  environmentId: captured.environmentId,
  input: {
    threadId: captured.threadId,
    original: {
      accountId: captured.original.accountId,
      ...(captured.original.messageId ? { messageId: captured.original.messageId } : {}),
      ...(captured.original.location ? { location: captured.original.location } : {}),
    },
    mode: captured.mode,
    text: captured.text,
  },
});
```

Run this only after threadId is narrowed to a chosen durable ThreadId. On success assign the approval to captured draft key/revision, never the current selection. On failure keep text and show a redacted message. Do not automatically reissue prepare or approve after a transport failure. If preparation's response was lost, recover its pending approval by owning thread subscription and exact original/content before permitting another review.

- [ ] Offer explicit existing-thread selection scoped to the current environment/project and account grant. Create thread calls useAtomCommand(threadEnvironment.create) with a stable commandId and the configured project/default model selection. Model selection is stored thread metadata, not a requirement for a connected provider or a request to start one. Preserve project runtime/interaction defaults and explicit branch/worktree choice. Use the returned dispatch receipt and existing projection event subscription to confirm durable thread creation, followed by explicit exact-original retention using WorkspaceLinks.link and action provenance. No provider turn/session starts. A local useNewThreadHandler draft alone is insufficient for server config.resolveAccount. Creating/retaining is a visible confirmed user action; cancelling the chooser creates nothing. Handle a thread removed while choosing as unavailable, preserving draft.

```ts
const created = await createThread({
  environmentId,
  input: {
    commandId,
    threadId,
    projectId,
    title: "Mail reply",
    modelSelection,
    runtimeMode,
    interactionMode,
    branch: null,
    worktreePath: null,
  },
});
```

createThread is the hook command bound to threadEnvironment.create. Generate commandId/threadId once when the explicit Create action begins and retain them across an uncertain transport outcome. Tests inspect that no turn.start/provider command is dispatched and wait on the existing thread.created projection event before prepareReply. No polling or automatic duplicate create.

- [ ] Lock text while an approval is pending. Edit reply first calls existing respondApproval with decision decline and the displayed digest, awaits the result and only then enables editing. If already submitting/accepted/outcome_unknown, refresh the thread state and show outcome guidance; never enable a fresh send automatically. Decline retains text. Explicit Discard clears only after pending approval cancellation succeeds. No client-only invalidation that leaves another device's old card usable.

```ts
const result = await respond({ environmentId, input: { approval, decision: "decline" } });
if (result._tag === "Success" && result.value.status === "declined") {
  drafts.setPrepared(environmentId, original, undefined);
  setEditing(true);
}
```

respond here is the existing shared-card response command, not a second direct SMTP path. Reprepare creates a new digest through T5 and keeps the exact edited text. Keep terminal cards visible until explicit dismissal/navigation. Unknown outcome copy says check Sent and offers owning-thread/history navigation, never Retry send. Accepted-link recovery calls recoverSentLinks only.

- [ ] Test prepare error, decline, edit cancellation race with another device's approval, double click, stale digest, account disconnect/reconnect, switching environment/selection while pending, restoring approval on resubscribe, full recipients/body display and retained text after error. Assert existing agent Draft reply remains in the more menu and its current readiness test passes. New manual reply never needs a live model/provider.
- [ ] Rerun named tests plus `vp test run src/components/workspace/mail/MailMessageView.test.tsx src/components/workspace/mail/MailSpace.test.tsx`; run web and required server typechecks, targeted lint. Expected pass: no SMTP without explicit approve, no stale approval after edit, and no draft misrouting.
- [ ] Surface checklist: inline/manual review and chat/native approval are the same service; existing shared menu/palette/keybindings and agent Draft reply retained; web/desktop use one card; phone textarea/keyboard can scroll actions into view without page-wide overflow; RN card already covered by T5; contracts/provider decisions unchanged; decline/edit/reprepare/discard/recover/back/reopen explicit; old/local/direct/relay/tunnel/multi-environment preserve draft identity; docs at gate.
- [ ] Visual acceptance: fixture 01 [449,591,471,143], gap-email-files65-67. Empty composer matches label, textarea and action geometry. Live Review reply and link-only wording are documented substitutions, Send demo only non-sending fixture. Approval/edit/error/unknown states require proposed capture review. At390px, keyboard must not hide reachable Review/Decline/Back controls;1024px one-body resource sheet remains intact.
- [ ] Future commit, explicit owned files only:

```text
git add -- apps/web/src/components/workspace/mail/MailInlineReply.tsx apps/web/src/components/workspace/mail/MailInlineReply.test.tsx apps/web/src/mail/mailReplyDrafts.ts apps/web/src/mail/mailReplyDrafts.test.ts apps/web/src/components/workspace/mail/MailMessageView.tsx apps/web/src/components/workspace/mail/MailMessageView.test.tsx apps/web/src/components/workspace/mail/MailSpace.tsx apps/web/src/components/workspace/mail/MailSpace.test.tsx apps/web/src/components/chat/MailSendApprovalPanel.tsx apps/web/src/components/chat/MailSendApprovalPanel.test.tsx apps/web/src/components/workspace/mail/MailDraftReply.tsx apps/web/src/components/workspace/mail/MailDraftReply.test.tsx apps/web/src/components/workspace/mail/MailCenterView.tsx
git commit -m "feat(mail): compose inline replies through the shared approval card"
```

### Task W11-T7: Project Drive link picker and Email integration

**Files**

- Modify T6 `apps/web/src/components/workspace/mail/MailInlineReply.tsx`, MailInlineReply.test.tsx and mailReplyDrafts.ts/test.ts only for captured link selections and removal.
- Consume W7-T3 `apps/web/src/components/workspace/ProjectDriveExplorer.tsx` browse/pick union and existing onChoose/onCancel callbacks as read-only prerequisites. Reuse its loaded DriveFile metadata, canonical provider URL helper and confirmed connection/root types. Default scope makes no explorer source/test changes. If W7 lands without pick mode, hold this task and obtain a narrow amendment under the explorer file slot, with literal Files/staging paths, before editing that earlier owner's file.
- Extend `apps/web/src/components/workspace/mail/MailSpace.test.tsx:1-151`, MailMessageView.test.tsx and MailConversationList.test.tsx for return/recovery; create MailReplyDrive.integration.test.tsx.
- Gate documentation owns `docs/user/workspace-spaces.md`, `docs/user/google-drive.md`, `docs/internals/overview.md`, `docs/internals/glossary.md`. Inspect current text at gate admission because earlier waves own these files in parallel. Do not rewrite their resource-frame/Later/Drive-root definitions.

**Interfaces**

Consumes W7 ProjectDriveExplorer with explicit environmentId/projectId/root/connection, W11-T6 captured draft identity and exact text, T5 preparation. Consume W7's existing mode: "pick" and onChoose/onCancel callbacks, preserving W7's exact chosen value `{ endpoint: WorkspaceLinkEndpoint, connectionId: string }`. Its endpoint.ref must be a file before insertion. Define the local display subset `PickedDriveLink = { fileId: string; title: string; url: string }` in mailReplyDrafts, not as a new wire contract. Convert the chosen file using the existing DriveFile metadata `{ id, name, mimeType, url }` from that account's selected browse page. Use its validated canonical provider URL; reuse W7's canonical URL helper if supplied. W11 owns insertion and may add the small conversion in its draft module. Do not add a field to W7's callback just to carry mail state. Picker accepts accessible non-folder files only.

**Depends on:** W11-T6, W7-T3. **Serial slot:** W11 UI after T6; explorer changes after all admitted W7/W8 explorer consumers. Docs slot at wave gate after earlier-wave documentation owners. Do not add a new explorer/root model.

- [ ] Add MailReplyDrive.integration.test.tsx with actual MailInlineReply and the explorer's picker entry, faking only provider/transport boundaries. Seed the real W7 fake root/connection and an accessible Google Doc. Open Insert link from project Drive, navigate a folder, select file, Insert link, then Review reply. Assert the canonical URL is visible in draft and reaches prepare exactly once, and no link/root/Drive write occurs. Use actual W7 fixture exports at admission; do not invent a separate fake explorer service.
- [ ] Add pure helper regressions in mailReplyDrafts.test.ts for URL insertion/removal and duplicate file IDs:

```ts
it("inserts one visible canonical URL and removes only its inserted text", () => {
  const link = {
    fileId: "doc_strategy",
    title: "Q4 marketing strategy",
    url: "https://docs.google.com/document/d/doc_strategy/edit",
  };
  const once = insertDriveLink("Please review.", [], link);
  const twice = insertDriveLink(once.text, once.links, link);
  expect(twice).toEqual(once);
  expect(once.text).toBe(`Please review.\n\n${link.url}`);
  expect(removeDriveLink(once.text, once.links, link.fileId)).toEqual({
    text: "Please review.",
    links: [],
  });
});
```

Implement these pure functions in the owned draft module with stored insertion spans/revision, not a blind `replace(url, '')` that deletes user-authored text. If the user edited the inserted span, removing the selection asks explicitly whether to remove the remaining URL; preserve other text. Duplicate pick does not add another URL or grant. A manually typed duplicate URL is kept without a second insertion.

- [ ] Run apps/web `vp test run src/components/workspace/mail/MailReplyDrive.integration.test.tsx src/components/workspace/mail/MailInlineReply.test.tsx src/mail/mailReplyDrafts.test.ts src/components/workspace/ProjectDriveExplorer.test.tsx`. Expect missing mail dialog/link insertion; W7 pick mode is already a prerequisite. Fake provider logs assert zero POST/PATCH/DELETE, zero download/export and no local file read.
- [ ] Consume W7-T3's existing discriminated browse/pick mode; do not re-specify or implement that union or its callbacks. Picker mode uses the same root/account/cursor/filter/sort/navigation logic and W7's chosen `{ endpoint, connectionId }` callback; it does not call onOpen for a file or WorkspaceLinks.link. Resolve the chosen endpoint against the already loaded selected DriveFile to obtain its URL, with no body read. Folder activation still navigates. Use existing dialog/sheet primitive with title `Insert link from project Drive`, helper `Inserts a link. Files stay in Google Drive.`, primary `Insert link`, secondary `Cancel`. Explicitly reject inaccessible file/missing canonical URL, disable submission while pending, and give a retryable reason.
- [ ] Capture `{ environmentId, projectId, root, connection, original, draftKey, revision }` when opening. Closing/reopening resources, selecting another message/project or changing account must not retarget an already-open picker. Either cancel it with clear retained-draft guidance or return the chosen URL to its original captured draft. If root/account generation changes, reject stale selection and preserve text. Do not silently bind a connection or replace root.
- [ ] One explorer is mounted. Use W4's resource-body/sheet host to enter picker mode or transfer explorer ownership into its dialog while suspending the resource Files body. Restore browse mode, breadcrumb, filters, scroll and focus to the triggering reply action on Insert/Cancel. A mount-count/subscription test must stay 1 through sheet resize and picker entry. Do not add a second hidden desktop explorer for the picker.
- [ ] Insert canonical URL in actual editable text with a blank-line separator and record the inserted span. Require T6's successful pending-approval decline before changing prepared text. A minimal insertion core is:

```ts
const separator = text.length === 0 ? "" : text.endsWith("\n\n") ? "" : "\n\n";
const start = text.length + separator.length;
const nextText = `${text}${separator}${picked.url}`;
const inserted = { ...picked, start, end: nextText.length };
```

Keep fileId as duplicate identity and require canonical HTTPS provider URL from the current file metadata. Do not insert local paths, attachment tokens, Markdown whose hidden href differs from visible text, or exports. Full URL appears in approval.snapshot.text. `attachments` stays empty for these selected links. The picker action never changes Drive ACLs or gives recipients access.

- [ ] Test wrong account/root, revoked connection, ownerless/shared-drive file, inaccessible/deleted file, duplicate pick/removal, manual URL editing, empty draft, cancel, selection/environment change while awaiting metadata, and keyboard focus return. Test old server hides picker and keeps basic text reply. Test both message and conversation reply paths, accepted-link recovery and Unread/Later flags after returning. Unavailable related-folder links remain visible, not deleted.
- [ ] Rerun named web tests plus `vp test run src/components/workspace/mail/MailSpace.test.tsx src/components/workspace/mail/MailMessageView.test.tsx src/components/workspace/mail/MailConversationList.test.tsx`. Run web and required server typechecks and explicit-path lint. Expected pass includes exact URL in prepared approval and no Drive writes/body download/local paths.
- [ ] Surface checklist: reader/reply picker/resource folder opens use one shared explorer; menus/palette/keybindings/touch preserve original endpoint; web/desktop/phone web share link-only flow, RN only reads approval text; all providers receive only confirmed linked context, no new grants by browsing; contracts optional and no binary changes; insert/remove/cancel/edit/decline/reopen return to same draft; local/direct/relay/tunnel/old-server/multi-environment tests isolated; docs and screenshots are mandatory gate below.
- [ ] Visual acceptance: fixture 01 [798,697,109,24], gap-email-files 67-85. Match lower-right attachment-entry alignment without paperclip. Live link-only label is an approved D16 departure with enough width and no overlap with Review reply. Picker and selected-link/approval states require reviewed proposed captures, not a claimed original design. V1 plus W4 chrome applies. Actual canonical URL and real account/root/title are allowed substitutions.
- [ ] Future commit, explicit implementation files only; documentation is committed by the gate after its review:

```text
git add -- apps/web/src/components/workspace/mail/MailInlineReply.tsx apps/web/src/components/workspace/mail/MailInlineReply.test.tsx apps/web/src/mail/mailReplyDrafts.ts apps/web/src/mail/mailReplyDrafts.test.ts apps/web/src/components/workspace/mail/MailReplyDrive.integration.test.tsx apps/web/src/components/workspace/mail/MailSpace.test.tsx apps/web/src/components/workspace/mail/MailMessageView.test.tsx apps/web/src/components/workspace/mail/MailConversationList.test.tsx
git commit -m "feat(mail): insert project Drive links into reviewed replies"
```

### Wave gate: documentation, focused verification and PNG comparison

**Owner:** primary implementation controller, one integrated pass after W11-T1 through W11-T7. This is the documentation/integration gate of W11-T7, not an eighth independently dispatchable W11 feature task.

**Files:** `apps/web/src/components/workspace/dev/mailMockupModule.tsx`, completed after T3 under its adapter slot; `docs/user/workspace-spaces.md`, `docs/user/google-drive.md`, `docs/internals/overview.md`, `docs/internals/glossary.md`; focused tests already owned by the seven tasks for integration repairs. Future evidence manifest/screenshots use W4-T7's agreed artifact directory, with explicit paths recorded before staging. Never stage the migration ledger or lockfile.

**Consumes:** all seven task test receipts; W4-T7 fixture readiness; W4/W7/W9 interfaces and decision defaults. **Produces:** source-backed user guidance, architecture/glossary update or specific no-change reasons, focused verification receipt, screenshot comparison and separate unrun outcomes. **Depends on:** W11-T7 and all predecessors, T5 RN/shared-runtime tests, W4-T7 for pictures. **Serial slot:** docs by wave number, admitted only, W4 -> W5 -> W6 -> W7 -> W8 -> W9-T8 -> W10-T4 -> W11 gate, splicing cuts; integrated client owned only by primary.

- [ ] Complete dev/mailMockupModule.tsx with actual shared pure row, reader and inline-reply presentation and local fake reads/commands. Set readyRegions: ["center"] for 01 only when recipients, chip, folder and reply all render and settled() covers pending fake commands. Keep any unfinished subregion incomplete; dispose releases state. Gate test MailSpace.test.tsx asserts center readiness and no live account, SMTP or provider access.
- [ ] Read current docs before editing. Update workspace-spaces for Inbox/true IMAP Unread/Later saved refs, account/folder preservation, stable move-safe star/read actions, manual Review reply, explicit owning thread/original retention, approve once/decline/edit/discard and unknown-outcome recovery. State unsent text survives navigation/disconnect in the current app session, not a promised durable offline cache.
- [ ] Update google-drive for the same designated root/account explorer, confirmed related-folder handoff and link insertion. Say recipients still need provider access and files stay in Drive. Do not claim upload, attachment bytes, permission changes, sync or binary export. User docs use product voice without source paths/tooling.
- [ ] Review overview/glossary against changed architecture. Add mail presentation/filter capability, stable-reference flag mutation/change subscription, manual prepared reply/exact approval and link-only selection only where durable meaning changed. Later, Drive root and resource frame already have owning-wave definitions; link to those rather than writing rival definitions. If either file needs no change, record a specific reason naming the existing section and what already covers this wave in the gate receipt. No generic `no docs needed` waiver.
- [ ] Run one focused package-local regression set after integration, using these explicit commands and workdirs. Do not repeat earlier tests unless integration changed them or a failure needs investigation.

```text
# packages/contracts
vp test run src/pulseMail.test.ts src/pulseLinks.test.ts
vp run typecheck

# apps/server
vp test run src/mail/MailImapRead.test.ts src/mail/MailImapWrite.test.ts src/mail/MailReadRpc.test.ts src/mail/MailReply.test.ts src/mail/MailSendService.test.ts src/mail/MailChanges.test.ts src/auth/RpcAuthorization.test.ts src/workspace/WorkspaceLinks.test.ts src/persistence/WorkspaceLinks.test.ts
vp run typecheck

# packages/client-runtime
vp test run src/mail/mailApprovals.test.ts src/state/mailRead.test.ts
vp run typecheck

# apps/web
vp test run src/components/workspace/mail/mailItemRef.test.ts src/components/workspace/mail/MailNav.test.tsx src/components/workspace/mail/MailMessageList.test.tsx src/components/workspace/mail/MailConversationList.test.tsx src/components/workspace/mail/MailMessageView.test.tsx src/components/workspace/mail/MailSpace.test.tsx src/components/workspace/mail/MailDraftReply.test.tsx src/components/workspace/mail/linkedItems.test.ts src/components/workspace/mail/MailInlineReply.test.tsx src/components/workspace/mail/MailReplyDrive.integration.test.tsx src/components/chat/MailSendApprovalPanel.test.tsx src/mail/mailReplyDrafts.test.ts src/components/workspace/ProjectDriveExplorer.test.tsx src/routes/-_chat.workspace.test.ts src/components/workspace/WorkspaceViewRail.test.tsx
vp run typecheck

# apps/mobile
vp test run --config ../../vite.config.ts src/features/threads/MailSendApprovalCard.test.tsx src/state/use-selected-thread-requests.test.tsx
vp run typecheck
```

If earlier-wave file names differ, update only this gate's exact commands after reading their admitted plan/current code; do not pass a wildcard or repo-wide test command. Run `vp lint` against the explicit changed source/test files in each owning package. Record command, exit and findings. Do not claim provider/network/native checks from static tests.

- [ ] Verify the five review-focus cases through their public UI/RPC tests. Walk reverse states: search clear/filter reset, Inbox/Unread/Later/account/folder switch, star/unstar/read/unread, save/remove, link/unlink/relink preserving origin, Resources close/reopen, folder/back, create-thread/cancel, review/decline/edit/reprepare/discard and accepted-link recovery. Confirm a removed account/thread/folder remains an honest unavailable state without an automatic retry/send.
- [ ] Confirm optional-server behavior with config flags absent and old payloads. Local/direct/relay/tunnel tests use existing fake session transport and shared environment runtime without hardcoded origins. Two environment fixtures with identical account/thread/file IDs must not share state. Provider matrix records Codex/Claude/Cursor/Grok/OpenCode/configured ACP as manual composition independent; agent Draft reply is offered only when the installed adapter reports live supportsMcpTools. Unsupported choices retain their explicit reason.
- [ ] Only when the user has authorized client verification, load test-t3-app and run one primary-owned isolated pass. Use no live userdata. Start with W4-T7 fake fixture 01, pinned V1 setup. Read each task's pixel box. Capture whole 1280x800, list [207,26,222,774], reader [449,98,471,468], star [884,99,37,20], reply [449,591,471,143], Drive action [798,697,109,24]. Compare before/after, side-by-side crops and overlay/difference against the actual PNG. Record bounding boxes, line wraps, icon/control order, font/OS, clock, selected ref, resource project/tab and authorized D03/D15/D16/D25 substitutions.
- [ ] Capture proposed expanded states: filters, Later empty/unavailable, reader metadata/actions, pending/declined/edit/error/unknown approval, owning-thread selection, Drive picker/link removal and 1024/390px layouts. Check 44px touch targets, keyboard menu activation/Escape/focus return, textarea keyboard scroll, no horizontal page overflow and exactly one resource/explorer subscription. Review these states before design acceptance. No original target exists for them.
- [ ] Capture compact 390x844 and 1024px, return to 1280x800, and prove original message, draft, resource project, filters and folder return correctly. Inspect both Messages and Conversations. Use non-sending fake approve outcomes to exercise acceptance/recovery. A real SMTP send requires separately authorized account testing; synthetic success is not delivery proof.
- [ ] Record evidence statuses separately: deterministic fake/service tests; local responsive web; shared desktop code versus packaged Electron; RN component/hook tests versus packaged iOS/Android; real IMAP/SMTP/Drive account; physical other-device access; human pilot. Absent authorization or account/device is `unrun`, never `passed`. A local HTTP 200 or viewport resize does not prove other-device access. Do not block the planning artifact on these future runtime gates.
- [ ] For any future shared preview URL follow AGENTS and test-t3-app: resolve current Tailscale/MagicDNS, bind the preview as the repository workflow prescribes, and share the full pairing URL with token. Never manually add Tailscale Serve routes for this dev runner. No such server or URL is created by this writer.
- [ ] Future documentation commit, after review, with actual screenshots/manifest paths named explicitly if committed:

```text
git add -- docs/user/workspace-spaces.md docs/user/google-drive.md docs/internals/overview.md docs/internals/glossary.md apps/web/src/components/workspace/dev/mailMockupModule.tsx
git commit -m "docs(workspace): explain mail review and Drive link replies"
```

Stage only docs with real changes. If overview/glossary already cover the behavior, their concrete no-change reasons belong in the gate receipt and those unchanged paths need not be staged. Never use git add . or -A. No PR is part of this wave unless the developer explicitly requests it later.

## Self-review

### Decisions consumed

All are default assumed, confirm for future implementation. This plan is not account consent or send authority.

| Decision | Assumed default and consequence                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D01      | Six-destination W4 shell, Projects landing, Workspace/Code and real Mail folders remain. Wave11 does not rebuild navigation.                                                         |
| D02      | Resource project independent of selected item. Confirmed direct folder card uses openFiles; browsing never links or grants.                                                          |
| D03      | Fixture01 selected sender is Nina Patel to match reader; live names/previews/chips are actual data.                                                                                  |
| D05      | Environment-owner identity or unset; no invented coworkers/access roles. Sending identity is actual mail account, not avatar.                                                        |
| D11      | Provider-backed sharing claims only; neutral live Files stay in Google Drive. No permission-management model.                                                                        |
| D14      | Read-only designated root/account explorer, filters/sort, explicit replace/clear; no Drive writes or silent account binding.                                                         |
| D15      | Manual typed replies use trusted server addressing, explicit owning thread and exact approval. Live Review reply; Send demo only non-sending fixture.                                |
| D16      | Picker inserts canonical visible provider URLs in approval text. Binary MIME/export/download/upload is a held separate task.                                                         |
| D17      | Later is shared environment-owned saved refs; Unread is IMAP unseen before paging. No snooze/wake job or read grant from saving.                                                     |
| D24      | Responsive web/shared desktop/phone web and existing RN approval compatibility. No new RN screens; real accounts, packaged clients, other device and pilot remain separate evidence. |
| D25      | Live Pulse Code, Workspace / Code and truthful connection health; fixture Pulse Next/Office/sample labels retain recorded geometry.                                                  |
| D29      | Blue Marketing folder means confirmed project-folder link, not focus/open state. Picker browsing does not confer it.                                                                 |

### Source corrections and admission checks

- The installed imapflow API uses bodyParts with key/start/maxLength. T1 keeps message header-plus-TEXT batching and conversation header scanning at MailImapRead.ts:650, then adds one bounded batch for current-page representatives. It does not attach TEXT to all 500 scan UIDs.
- Current MailMessageDetail already carries inReplyTo/references internally, while MailMessageContent and toContent omit them. T1 projects them and trusted address arrays; T5 must not read reply headers back from the client's display payload.
- Current listMany returns one WorkspaceLinkList union. T3 explicitly owns optional keyed output and the shared slot it requires. If an earlier wave supplies keyed output, consume its existing name/type and omit the duplicate extension. Never infer attribution from an unkeyed union.
- W4/W7/W9 detailed plans are concurrent inputs. Their current published contracts were checked: WorkspaceResourceBodyProps/useWorkspaceResourceState from W4; OpenFilesInput/OpenFiles/useOpenFiles from components/workspace/openFiles.ts and the existing pick-mode endpoint/connection callback from W7; WorkspaceSavedItem/Page and createWorkspaceSavedItemAtoms from W9. At admission bind their landed exports and reconcile subsequent owner edits without renaming/reimplementing their APIs. If absent, hold only the consuming task; T1/T2/T5 server work can proceed independently.
- Current useNewThreadHandler creates a client draft. T6 uses existing threadEnvironment.create and its durable orchestration receipt before preparing, as verified in the shared command implementation. It cannot send a provider prompt merely to persist a manual-reply owner. No new thread service is authorized.
- Editing reuses existing decline and waits for success before unlocking text. This prevents a second device from approving an obsolete snapshot without adding another cancellation RPC. Submitting/accepted/unknown outcomes never unlock an automatic resend path.
- Current shared mailApprovals and RN card already accept optional replyOriginal/messageId. T5 tests both old/manual snapshots and exercises the actual card/hook; production files may remain unchanged if those tests prove compatibility. This is preservation work, not a reason to omit their test ownership.
- No graphify-out/graph.json exists in this worktree. Building it would violate the one-file brief, so source inspection was used. Taskfile.yml contains upstream maintenance tasks, not this wave's local checks; the main plan's package-local vp commands govern verification here.
- No new storage migration is required by this plan. Saved collection and root designation are earlier-wave responsibilities; current approval storage already accepts manual content. If implementation discovers a durable schema gap, stop that expansion and return a narrow amendment instead of assigning a migration number during parallel planning.

### Open evidence and scope

No runtime tests, lint/typecheck, browser, server, provider CLI, network, real account, native device, external send, screenshot candidate or human pilot ran in this planning pass. The PNG was opened locally and the named current code, spec, map and reviews were read. Functional code snippets are implementation instructions, not execution receipts.

The five review-focus risks have owning tests. All seven W11 IDs are retained, with W11-T7's primary-owned documentation/visual gate explicit. EF-05 through EF-07 stay in W7; Later storage stays in W9-T7; shell/fixtures stay in W4. Missing proposed-state design review, earlier-wave exact exported signatures, real-account API behavior and future integration authorization remain open inputs with the controller as owner. No ticket was selected by this brief, so no Pulse tracker operation is implied.

## Surfaced gaps

- Earlier-wave interface binding is an admission check for T3/T4/T6/T7, not permission to duplicate those implementations.
- Expanded approval/picker/filter/compact states have no original PNG. They require reviewed proposed captures at the authorized gate.

## Review response log

Plan fix round 1, 2026-10-16. Review inputs: review-w9-w11.md and review-cross-wave.md in .superpowers/sdd/2026-10-14-unified-workspace/plan-reviews, with W4's Canonical seams for Waves 5-11.

| Finding                    | Response                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W9-W11 I-1                 | T1 extracts the first supported text/plain part inside the same bounded prefix. MailTestPeers and public RPC tests include multipart/alternative, quoted-printable/base64 and HTML-only fallback.                         |
| W9-W11 I-2                 | Maintainer decision selects one current-page representative TEXT batch, at most 50 x 4096 bytes. Typed account/ref-scoped flag events patch rows/readers; second-client command-log tests forbid a list FETCH on success. |
| W9-W11 M-5                 | Flag changes retain page-3 cursor, loaded pages, selection and scroll. Only explicit Refresh resets to page 1; partial-failure recovery retains cursors and is scoped.                                                    |
| W9-W11 I-5                 | The agreed attribution sentence is in Global Constraints. Removed the fixed Claude trailer and conflicting admission notes.                                                                                               |
| W9-W11 M-1                 | Delegated yield uses yield* inside Effect.gen.                                                                                                                                                                            |
| W9-W11 M-2                 | Removed the undefined ProductOps Build and Ponytail phrase; concrete reuse and scope constraints remain.                                                                                                                  |
| W9-W11 M-3                 | MailImapWrite.setFlags anchor corrected to 145-183.                                                                                                                                                                       |
| W9-W11 M-4                 | Restored numeric spacing, including 4096 boundary, page 2, SCAN_MAX 50 and existing 50 recipients; obsolete 500-preview budget text is replaced.                                                                          |
| Cross R1 / C1              | T3 and gate own dev/mailMockupModule.tsx in Files/git add --. Actual pure fake-backed center rendering, including reply, is required before center readiness for 01.                                                      |
| Cross R3 / I1              | T4 imports useOpenFiles/OpenFilesInput/OpenFiles from components/workspace/openFiles.ts, using the existing W4 context and request handoff.                                                                               |
| Cross R5, R6 / I3, R8 / I4 | Header is WorkspaceHeaderModel via WorkspaceEngagement.header; mail contributes WorkspaceRailItem[] to workspaceRailItems. The single view key covers inbox/unread/later, with route/history tests.                       |
| Cross R10 / I7             | T7 consumes W7-T3 pick mode and onChoose/onCancel unchanged. It owns only the mail dialog, loaded-file URL resolution and draft insertion; explorer source/test staging is removed by default.                            |
| Cross M5                   | Shared docs gate is ordered by admitted wave number through W9-T8 -> W10-T4 -> W11 gate.                                                                                                                                  |
| Cross M6                   | Shared RPC slot explicitly includes T3: W11-T1 -> W11-T2 -> W11-T3 -> W11-T5.                                                                                                                                             |

W9 staging/admission findings are resolved in W9, and W10 extraction findings in W10. No finding is disputed. Map and other producer plans remain controller-owned and were not edited. This revision claims plan checks only, with runtime acceptance pending authorized implementation.
