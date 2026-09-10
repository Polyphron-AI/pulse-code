# Office and mailbox UI handoff

Implemented in the existing `pulse-mail` worktree. This extends its earlier mail implementation; it does not merge that work into the main checkout.

## Available in this slice

- `/office` shows real environment-owned accounts, the five latest saved drafts, and send operations requiring attention or confirmation.
- `/mail` retains real account setup, folders, reading, composition, annotations, draft recovery and mail actions. Folder icons use provider special-use metadata, including localized Sent folders. Message rows show sender, compact date, flags, tags and reference counts.
- Office, Mail and Code share navigation. The sidebar and command palette expose Office.
- Office draft, account and Outbox links preserve environment/account scope. Unavailable explicit environments or accounts do not silently select another source. A draft cannot open under a different sending identity.
- The existing composer navigation blocker handles draft persistence. No additional navigation confirmation was introduced.
- Stored inferred links are labelled Suggested and remain editable/removable. This UI does not implement automatic inference.

## Verification

- Web-scoped `tsgo --noEmit`: passed after integration and final fixes.
- `vp test run --project unit src/components/mail/mailNavigation.test.ts src/components/mail/mailPresentation.test.ts`: 2 files, 6 tests passed.
- Targeted `vp lint` over the 10 changed UI/route/helper files: passed.
- Impeccable detector over Office components and mailbox workspace/reader: empty findings.
- `git diff --check` on the changed scope: passed.
- Node 22 requires `NODE_OPTIONS=--experimental-strip-types` for this checkout's TypeScript Vite config and lint plugin. This was set only in the verification processes.
- Independent source review found environment/account shortcut issues. Named findings were fixed and the reviewer confirmed them in source.

The user authorised browser/server verification on 6 September. The app ran against the isolated `.t3/office-ui-review` base, with synthetic browser-only mailbox query fixtures. Inspected Office, account setup, drafts, folders and reading at desktop and 390px widths. Confirmed the second-account draft and Outbox shortcuts, draft edit/save/close returning to Office, removal of a suggested link surviving reopening, retained manual context, and visible keyboard focus. Setup, draft and reader had no document-level horizontal overflow. Fixed the mobile folder chooser to occupy the mailbox width while open, with `aria-expanded`; selecting a folder restores the reader/list. Final web typecheck and targeted mailbox lint passed.

The collaborative preview became unreliable during inspection. A separate isolated Playwright/Edge browser completed the checks and produced sharp captures in `apps/web/.impeccable/review/`: `desktop.png`, `mobile.png`, `folders-mobile.png`, and `office-desktop.png`. Provider update notices were dismissed without updating providers. The populated checks prove client interactions using in-memory fixtures, not server persistence, mail delivery or Sent-copy recovery. No live mailbox was connected and no email was sent.

A fresh visual reviewer requested one mobile density correction. Below the medium breakpoint, Account actions now groups infrequent account administration behind a disclosure; Linked context starts collapsed with tag, link and suggested counts. Expanded states preserve all controls. The message body begins at y=588 instead of approximately y=814 in the 390×844 fixture. Both disclosures and all four deferred account actions were checked. Final captures include `account-actions-mobile.png` and `context-mobile.png`. The reviewer's verdict was **ship**, scoring the listed density finding **resolved**; this is a finding-specific verdict, not certification of every product or backend behavior. Final scoped web typecheck and lint passed.

## Boundaries

### Follow-up: Office and Mail workspace width

The user's highlighted screenshot exposed an unrelated 255px Code project sidebar in Mail. `AppSidebarLayout` now omits that sidebar, its resize rail, and its toggle/keybinding handler on Office/Mail routes and descendants. `SidebarProvider`, its open state, the saved width state, and project projection retention remain mounted; returning to Code restores its normal layout. Settings retains its existing sidebar. `OfficeHeader` removes the duplicate sidebar toggle and uses the existing fullscreen-aware window-control insets, with desktop drag-region behavior. The top Office/Mail/Code links remain the route between spaces.

Scoped web typecheck, targeted lint and diff checks passed. The layout detector returned no findings. Following renewed user permission, Playwright/Edge captured the corrected layout under apps/web/.impeccable/review/full-width/. Mail spans the entire 1440px viewport with no project sidebar or toggle; the 390px reader has no horizontal overflow, and folders occupy the full mobile width. Expanded and collapsed Code sidebar states and its 256px width survive Office navigation. The Code sidebar and command palette Office entry points were exercised. The reviewer inspected all six current captures and returned ship with no material findings in the shell scope. Mac Electron window-control clearance is implemented from the existing shell variables but has not been exercised on a Mac.

Web and Electron share this UI. Responsive web behavior is retained in source; native mobile keeps its existing separate Mail screens. Native Office overview is not part of this slice.

Calendar, Meetings, universal Tasks, SOPs, Relationships and Explorer are disclosed as planned. The full PRD also requires richer mailbox features and automatic discovery not established by this pass. Sending/Sent-copy behavior remains owned by the existing mail engine; presentation changes do not certify delivery or Sent-copy recovery.

## Retained review environment

The isolated dev server remains on web port 5968 / server port 14008, captured process session 81117. State stays in `.t3/office-ui-review`; never point this server at live Pulse state. The browser-only fixtures live in ignored `.t3/office-ui-fixtures.mjs` and reset on reload. Remaining integration work includes live sandbox IMAP/SMTP and Sent-copy recovery, multiple environments, native clients, and the unimplemented PRD services. This verification does not certify those behaviors.
