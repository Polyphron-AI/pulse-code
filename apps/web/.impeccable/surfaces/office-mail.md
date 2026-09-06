# Office and Mail

Mode: Operate. Extension of Pulse's established visual system.

## Direction

The user's prior brief specifies a familiar Outlook-style mailbox, simple and predictable actions, and a shared Office overview. Preserve the existing theme tokens, sans typography, Base UI controls and Lucide icon family. No new brand, decorative motion, or invented data.

## Composition

- Shared Office, Mail and Code navigation with explicit alpha status and environment selection. Office and Mail omit the far-left Code project sidebar, resize rail, shell toggle, and shell keyboard listener. Their header uses existing fullscreen-aware control insets and the desktop drag region; it has no sidebar toggle. The sidebar provider and lightweight project retention stay mounted, preserving Code and Settings sidebar width and open state.
- Office uses a wide activity column and a narrower account column, stacking on small screens. Draft rows open the exact source account and environment.
- Mail keeps folders, message list and reader. Below `md`, Folders opens a full-width folder view and exposes `aria-expanded`; the main content hides while folders are shown. Composing takes precedence and keeps the composer visible. Choosing a folder closes navigation. From `md`, folders remain a 12rem rail. Below `lg`, opening a message replaces the list with the reader, and Back restores the list.
- Below `md`, the account selector stays visible while Account actions hides Add, account settings, Disconnect, and Disable until expanded. Desktop keeps those actions inline.
- Context belongs with the message. Below `md`, Linked context starts collapsed with tag, link, and suggested-link counts; expanding reveals the existing controls, removal actions, and explanatory copy. Desktop keeps context visible. Both new disclosure buttons expose `aria-expanded` and `aria-controls`.
- Unsupported Office spaces are labelled planned. Setup, pending, error, disconnected and disabled states are distinct from empty results.

## Verification boundary

Browser permission was granted. Earlier authorised Playwright/Edge captures in `.impeccable/review/` cover desktop Mail and Office, mobile reader and folders, expanded account actions, and expanded linked context. The reader body begins at y=588 at 390 by 844px, compared with y=814 before the compact disclosures, with no horizontal overflow. Expanded account controls and context removal controls were checked. Earlier isolated fixture checks covered setup, drafts, the message list, the exact second-account draft link, draft save/close and exact-account Outbox navigation, link retention, and keyboard operation. Final scoped typecheck and lint pass.

After inspecting all six final captures, the visual reviewer returned a "ship" disposition for the single mobile density finding, which was resolved. This is a scoped UI verdict, not backend approval. The six captures predate the subsequent removal of the Code project sidebar from Office and Mail. Scoped typecheck and lint pass for that shell correction, and the layout detector returned no findings. The source reviewer confirmed all three implementation findings resolved and requested recapture only for fresh visual and runtime evidence. The user renewed browser permission, and Playwright/Edge verified the full-width shell. Current captures are in .impeccable/review/full-width/: mail-desktop.png, mail-mobile.png, office-desktop.png, office-mobile.png, folders-mobile.png, and code-return.png. Mail spans 1440px with no project sidebar or toggle; mobile has no horizontal overflow. Code retains both expanded and collapsed sidebar states and its 256px width through Office navigation. The sidebar and command palette Office entry points were exercised. The reviewer inspected all six current captures and returned a ship verdict for the Office/Mail shell correction, with no material findings in that scope. Mac Electron window-control clearance remains source-verified only on this Windows host. Fixture checks do not establish real provider receiving or sending, backend integration, or contrast across all themes. Native mobile has separate Mail screens and is outside this web composition change.
