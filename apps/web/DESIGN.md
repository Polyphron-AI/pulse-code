---
name: Pulse Office and Mail
description: Familiar mailbox controls within Pulse's existing theme system.
colors:
  primary: "var(--primary)"
  primary-foreground: "var(--primary-foreground)"
  secondary: "var(--secondary)"
  secondary-foreground: "var(--secondary-foreground)"
  background: "var(--background)"
  foreground: "var(--foreground)"
  muted: "var(--muted)"
  muted-foreground: "var(--muted-foreground)"
  accent: "var(--accent)"
  card: "var(--card)"
  card-foreground: "var(--card-foreground)"
  popover: "var(--popover)"
  border: "var(--border)"
  input: "var(--input)"
  ring: "var(--ring)"
  destructive: "var(--destructive)"
typography:
  headline:
    fontFamily: "var(--font-sans)"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-sans)"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
  body:
    fontFamily: "var(--font-sans)"
    fontSize: "0.875rem"
    lineHeight: "1.5rem"
  label:
    fontFamily: "var(--font-sans)"
    fontSize: "0.75rem"
    lineHeight: "1rem"
rounded:
  control: "var(--control-radius)"
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  2xl: "calc(var(--radius) + 8px)"
spacing:
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
  button-outline:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  workspace-navigation:
    rounded: "{rounded.md}"
    height: "2.25rem"
  context-tag:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    padding: "0.25rem 0.5rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.2xl}"
  message-row:
    textColor: "{colors.foreground}"
    padding: "1rem"
  planned-disclosure:
    textColor: "{colors.foreground}"
    padding: "1rem 0"
---

# Design System: Pulse Office and Mail

## Overview

**Creative North Star: "Familiar Outlook-style mailbox"**

Office and Mail extend Pulse's existing visual system. Compact controls, readable message rows, and restrained dividers keep everyday email actions easy to find. The confirmed direction is familiar and predictable. It introduces no separate Office brand.

This document records the web implementation, which the desktop client also wraps. Its scope is the Office and Mail composition, plus shared controls used there. It does not redefine unrelated Pulse screens or the separate React Native mobile UI. Product commitments live in `PRODUCT.md`; the Office and Mail brief lives in `.impeccable/surfaces/office-mail.md`.

Design values and behavior in this document are extracted from source. Sources are `src/index.css`, `src/components/ui/button.tsx`, `input.tsx`, `card.tsx`, `src/components/office/OfficeHeader.tsx`, `OfficeWorkspace.tsx`, `src/components/mail/MailWorkspace.tsx`, `MailReader.tsx`, and `MailSetup.tsx`. Breakpoints and the base spacing unit come from the installed Tailwind theme. Authorised Playwright/Edge inspection covered desktop Office and Mail, mobile setup, drafts, list, folders, reader, expanded account actions, and expanded linked context. Captures from the earlier mobile review are in `.impeccable/review/`: `desktop.png`, `mobile.png`, `folders-mobile.png`, `office-desktop.png`, `account-actions-mobile.png`, and `context-mobile.png`. At 390 by 844px, the reader body now begins at y=588 rather than y=814, with no horizontal overflow in the inspected state. Expanded account controls and context removal controls were checked. Earlier fixture checks passed for the exact second-account draft link, draft save/close and exact-account Outbox navigation, link retention, and keyboard operation. Final scoped typecheck and lint pass. These fixture checks do not verify real provider receiving or sending, backend integration, the separate native mobile clients, or contrast across all themes. After inspecting all six final captures, the visual reviewer returned a "ship" disposition for the single mobile density finding, which was resolved. This is a scoped UI verdict, not backend approval. The six captures predate the subsequent removal of the Code project sidebar from Office and Mail. Scoped typecheck and lint pass for that shell correction, and the layout detector returned no findings. The source reviewer confirmed all three implementation findings resolved and requested recapture only for fresh visual and runtime evidence. The user renewed browser permission, and Playwright/Edge verified the full-width shell. Current captures are in .impeccable/review/full-width/: mail-desktop.png, mail-mobile.png, office-desktop.png, office-mobile.png, folders-mobile.png, and code-return.png. Mail spans 1440px with no project sidebar or toggle; mobile has no horizontal overflow. Code retains both expanded and collapsed sidebar states and its 256px width through Office navigation. The sidebar and command palette Office entry points were exercised. The reviewer inspected all six current captures and returned a ship verdict for the Office/Mail shell correction, with no material findings in that scope. Mac Electron window-control clearance remains source-verified only on this Windows host.

**Key Characteristics:**

- Theme and font preferences remain live through CSS custom properties.
- Shared Office, Mail, and Code navigation keeps workspace identity visible.
- Office and Mail use their own shell width without the Code project sidebar.
- Folder, list, and reader regions adapt to available width.
- Below the medium breakpoint, account actions and linked context start collapsed.
- Dividers and selected rows organize work without decorative panels.
- Pending, disabled, disconnected, error, and empty states use distinct copy.

## Colors

The palette follows the selected Pulse theme. The frontmatter deliberately records semantic variables, not a snapshot of the default light or dark palette. `src/index.css` maps theme roles into these variables, including action, accent, canvas, text, border, and focus roles.

The sidecar's tonal ramps are generated preview strips using relative OKLCH colors derived from the active variables. They are not extracted application scales or new theme tokens. Its HTML/CSS examples are static control previews; they require the host's Pulse variables and do not perform mail operations.

### Primary

`primary` and `primary-foreground` identify actions such as New message and Open mailbox. Flagged messages also use the primary color. The action color can differ from the accent surface in a chosen theme.

### Secondary

`secondary` and `secondary-foreground` mark selected Drafts and Outbox controls. They inherit the existing button variant rather than introducing a mail-specific color.

### Neutral

`background` and `foreground` form the workspace canvas. `muted-foreground` carries dates, descriptions, account status, and secondary labels. `muted` supports tags and lightly tinted folder or context regions. `accent` marks active navigation, opened messages, and hover states. Borders divide panes and rows; input borders and focus rings retain their own semantic roles. Shared cards and popovers use their existing theme surfaces. Request errors use `destructive` alongside explanatory text.

**The Theme Inheritance Rule.** Keep semantic colors and runtime font variables intact. Do not replace them with fixed Office colors or a fixed font stack.

## Typography

All interface text inherits `--font-sans`. Its default system stack comes from `src/index.css`, and Appearance can override it at runtime. Plain-text email also uses this sans family; its preformatted container preserves line breaks and wraps content. Formatted email preserves basic structure in a sandboxed iframe; sanitization strips sender-authored attributes and styles.

The Office headline uses the frontmatter headline role. Section headings use the title role, while setup headings use the existing larger heading steps. The reader subject is 1.25rem, semibold, with tight line height and word wrapping. Supporting prose commonly uses the body role; compact controls and list rows use the same size with their component's line height. Dates, recipients, and folder labels use the label role. Tag summaries in message rows are 11px. There is no display-font role in this UI.

Unread sender names are semibold and unread subjects are medium weight. Dates use tabular numerals. Sender names, subjects, and draft titles truncate in lists; reader content wraps. Do not introduce a fixed reading-column width that conflicts with the flexible reader pane.

## Layout

The workspace occupies the dynamic viewport height. AppSidebarLayout omits the Code project sidebar, its resize rail, the shell toggle, and its keyboard listener on routes matching `/^\/(office|mail)(\/|$)/`. The sidebar provider and lightweight project retention stay mounted, preserving Code and Settings sidebar width and open state. Office and Mail use the reclaimed width for their own content.

The shared header has a minimum height from `--workspace-topbar-height`, which defaults to 52px. It uses the existing fullscreen-aware `--workspace-controls-left` and `--workspace-controls-right` insets and the desktop drag region. Header content wraps. Office, Mail, and Code links remain at the top, followed by Alpha; the environment selector sits at the trailing edge. There is no sidebar toggle in OfficeHeader.

Office uses a centered container with a 72rem maximum width, 1.25rem horizontal padding, and 2rem vertical padding. Horizontal padding grows to 2rem at `sm`. Activity and accounts stack until `lg`, then use `minmax(0, 1fr)` and `minmax(16rem, 0.65fr)` columns with a 2rem gap. The account column gains a left divider. Planned disclosures become two columns at `sm`.

Mail has separate workspace and account controls, then the New message, Folders, Drafts, Outbox, and Refresh toolbar. Below `md`, Folders toggles a full-width folder view and exposes its state through `aria-expanded`. While folders are shown, the main mailbox content hides. Composing takes precedence: the composer stays visible and folders hide below `md`. Choosing a folder closes navigation and restores the mailbox content. From `md`, the folder region remains a visible 12rem rail beside the main content. The folder region scrolls independently.

Below `lg`, the message list fills the remaining width. Opening a message hides the list and displays the reader; Back returns to the list. From `lg`, both remain visible, with a reader empty state when no message is open. The list width grows from 18rem at `lg` to 20rem at `xl` and 24rem at `2xl`. The reader takes the remaining width. Message rows and reader content scroll within their panes; toolbar and pagination regions remain outside those scroll containers.

Breakpoints use the installed Tailwind defaults: `sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem, and `2xl` 96rem. These are CSS viewport breakpoints. Office and Mail no longer reserve width for the Code project sidebar. The main mailbox toolbar wraps its controls as space narrows. Below `md`, account actions and linked context start collapsed so the reader body appears earlier. The inspected mobile states, including the corrected folders and reader, had no horizontal overflow. The final visual review marked the mobile density finding resolved.

## Elevation & Depth

Office and Mail rely on borders, muted regions, and selected-row fills. The overview uses divided sections rather than a grid of elevated cards. The shared component library still supplies shallow shadows and inset highlights for solid buttons, outline buttons, inputs, and cards. Do not remove those treatments when reusing the controls, and do not introduce large shadows around mailbox panes.

Focus rings describe interaction, not persistent elevation. Shared buttons use a two-pixel focus ring with a one-pixel background offset. Shared inputs change border color and show a three-pixel translucent ring. Native mail selects use a two-pixel ring. The sidecar records these state treatments without creating new application tokens.

## Shapes

Controls inherit `--control-radius`; shared inputs inherit the larger base radius. Navigation links, folders, selects, and status containers use the medium radius derived from `--radius`. Divided rows are mostly flat rectangles. Tags use a small rounded shape, and shared cards retain the larger card radius when a card is appropriate. Do not wrap every overview section in a card merely because the shared Card component exists.

## Components

### Buttons and fields

New message is the primary mailbox action. Office presents Open mailbox as a primary link. Enable Mail alpha and account setup actions use the shared primary button when applicable. Reply, Reply all, Forward, refresh, and secondary message actions reuse compact ghost controls. Supporting actions use outline controls. Drafts and Outbox switch between ghost and secondary variants according to selection.

Shared buttons adapt height and typography at `sm` and extend coarse-pointer hit areas to at least 2.75rem. Disabled shared controls reduce opacity and prevent pointer interaction. Native fields retain their labels; icon-only controls carry accessible names. Search submits through a form and searches the current folder. Mail's native select class is a full-width, 2.25rem-high control; individual selectors constrain their maximum widths.

Below `md`, the account selector remains visible while Account actions hides Add, account settings, Disconnect, and Disable until expanded. Its button exposes `aria-expanded` and `aria-controls`. Expanding it reveals the existing controls in a wrapping row; collapsing restores the compact account bar. From `md`, those actions remain inline without the disclosure.

### Shared navigation

OfficeHeader contains workspace navigation, Alpha, and the environment selector. Its sidebar trigger is removed; the Code project sidebar and shell toggle are absent on Office and Mail routes. Office and Mail links preserve the active environment and mark the active destination with `aria-current="page"`, an accent fill, and medium weight. Code returns to the root route. Links have explicit focus-visible rings. Mail folders use the same active-state vocabulary and expose their full path through accessible names and tooltips.

### Message list and reader

Each message row separates the selection checkbox from the button that opens the message. Opening an unread message requests the read action. The open row has an accent fill and `aria-current`; hover adds a lighter accent fill to other rows. Bulk actions appear when messages are selected. Existing update receipts can expose Undo. Search, filters, and pagination remain distinct from selection.

The reader groups reply actions above message actions. Read/unread and flag/unflag labels reflect current state. Archive and Trash remain named actions. Attachments have explicit download controls. Forwarding a message with attachments opens a selection step with a Cancel action. Plain text is the default; Formatted message is an explicit toggle with a remote-content disclosure. Links in the message are listed separately.

Keyboard evidence includes the completed fixture checks, native controls, form submission, accessible names, and explicit focus-visible rings on workspace links, folders, message buttons, disclosures, and shared controls. Account actions and mobile Linked context expose their expanded state and controlled region. The source does not establish arrow-key list navigation, automatic reader focus, or focus restoration on Back. Do not infer those behaviors from the completed keyboard checks.

### Linked context

The reader places Linked context between message metadata and the body. Below `md`, it starts collapsed and shows tag, link, and suggested-link counts. The disclosure button exposes `aria-expanded` and `aria-controls`; expanding it reveals the existing context controls and explanatory copy. From `md`, context stays visible without the disclosure.

Tags and references use muted inline chips with named removal buttons. Inferred references carry Suggested text and a persistence explanation. Add tags or link opens the editor; Close collapses that editor. The editor explains that references do not create tasks or start coding work. Keep this context attached to the message rather than introducing a separate global context panel.

### Office activity and planned spaces

Office shows up to five recent saved drafts, preserving their source account and environment when opened. Accounts show disconnected, paused, receiving-and-sending configured, or sending-setup-needed states. Outbox attention links lead to the relevant account. Pending text, query errors with Retry, disabled Mail guidance, and empty results remain separate presentations.

Tasks, Calendar, Meetings, SOPs, Relationships, and Explorer are native `details` disclosures. Closed summaries say Planned. Open summaries say Close, and their descriptions explicitly say the environment does not support that space yet. These rows disclose intent; they are not links to working tools. They must remain reversible by collapsing the disclosure.

## Do's and Don'ts

### Do:

- Do inherit the active Pulse theme and font variables.
- Do reuse shared controls and preserve their keyboard focus states.
- Do keep account and environment context when linking to drafts or Outbox.
- Do retain separate loading, empty, disabled, disconnected, and error messages.
- Do expose the way back from a reader or expanded disclosure.
- Do keep planned capabilities visibly labelled as unavailable.

### Don't:

- Don't fix Office to a separate palette or font.
- Don't turn the overview into a grid of elevated decorative cards.
- Don't claim working tools, successful operations, or populated data from placeholders.
- Don't add continuously repainting decorative motion.
- Don't treat code inspection as visual or keyboard verification.
