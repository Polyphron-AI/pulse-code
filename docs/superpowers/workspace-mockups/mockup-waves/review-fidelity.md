# Mockup fidelity review of the wave map

Reviewer lens: mockup fidelity. Read-only review of `wave-map.md`, the plan Wave 2+ sections (`docs/superpowers/plans/2026-10-14-unified-workspace.md:6469-6680`), spec amendment A13 (`docs/superpowers/specs/2026-10-14-unified-workspace-design.md:382` onward) and the seven `gap-*.md` reports, checked against `mockups/01-email-files.png` to `mockups/08-calendar-tasks.png` (1280 x 800).

Shared geometry used below: left sidebar x0-207, sub-rail x207-259, center x259-940 (Email/Comms list split at x429), right resource panel x940-1280 with tabs Files, Browser, Agents, Tasks, Docs, PRs.

## Critical

### C1. "+ Schedule" is wrongly removed from 08 (Calendar)

- Evidence: `08-calendar-tasks.png`, header toolbar, blue "+ Schedule" button at about x847 y102 (w76 h24). It sits in the same place as in 07.
- The wrong reading is repeated in:
  - `wave-map.md:81` (D03: "Schedule in 07 rather than 08 despite the Tasks report's 08 inventory")
  - `wave-map.md:264` (Wave 6 acceptance)
  - `wave-map.md:321` (W6-T6 "08: Join only")
  - plan `:6545` ("Schedule is pictured in 07, not 08")
  - `gap-shell.md:57` ("Calendar ... no Schedule button")
- `gap-tasks-calendar.md:75` had it right, and D03 overrode the correct report.
- Effect: a visible primary action is dropped from the Calendar space without being listed as a decision.
- Fix: in D03, W6-T4, W6-T6, the Wave 6 acceptance, plan :6545 and gap-shell :57, state that Schedule appears in both 07 and 08. W6-T6 acceptance becomes "07 and 08: Schedule plus Join".

### C2. No task owns the deterministic sample/fixture mode that every screenshot acceptance relies on

- Evidence: every PNG shows fixed SynKEK sample content pinned to Tue 13 Oct 2026, including:
  - 07/08 date strip
  - the 04 "Sample project connections" area
  - the "Design preview · sample data" footer
- Acceptance text assumes such a mode exists: `wave-map.md:58`, `:166`, `:231`, `:446`; `gap-shell.md:142`, `:196`, `:253`. Yet no W4 to W12 task builds it, marks it, or isolates it from live data.
- Effect: a reviewer cannot capture a screenshot that is comparable to the PNG, so every per-wave visual acceptance cannot be run.
- Fix: add a W4 task, for example W4-T0, "Sample workspace fixture mode", that delivers:
  - a pinned clock
  - seeded data for the eight states
  - a visible "sample data" marker
  - no writes to live state
  - a documented capture recipe per PNG (route, viewport 1280 x 800, theme, selected item, active tab)

  Make every visual acceptance depend on it.

## Important

### I1. Visual acceptance checks are boilerplate and cannot be judged

- Evidence: most tasks use the same "visual acceptance compares this task's named region" line, with no tolerance, method, theme, font or authoritative inventory reference. `wave-map.md:9` defers to the gap-report inventories, which contain errors (see C1 and the Minor items).
- Vague region names include:
  - W4-T5 "all: resource actions/footer"
  - W6-T1 "07/08: date/day/cards data"
  - W9-T3 "02/05/06 layout with honest Discord bot identity"
- Fix: for each task, give:
  - the PNG and a region box in pixels
  - the authoritative gap-report line range, corrected where wrong
  - pass criteria, for example boundaries within 2px, same copy, same control set and order, and an allowed-substitution list for live data
  - a pinned light theme and system font

### I2. The live (non-sample) look of fixture-only chrome is unspecified

- Evidence (all PNGs):
  - footer status dot, text and gear (W4-T5)
  - breadcrumb segment "SynKEK workspace"
  - header "MC" avatar
  - brand "Pulse Next" versus Pulse Code
  - mode switch "Office | Code" versus A12's Workspace/Code naming
  - the Drive sharing sentence in the Files body (W7 only says "neutral live sharing copy")
- A grep of `wave-map.md` for "Pulse Next", "Office", "Code" switch labels and "SynKEK workspace" returns no hits.
- Fix: add a short "sample chrome to live chrome" table to W4 that says, per element, what is rendered with real data, or that the element is hidden. It must also state the brand and mode-switch labels, and that decision must be logged as a D-item.

### I3. Mockup-visible items downgraded without a listed decision

- (a) Channel header member count:
  - Evidence: `02/05/06`, center header, "SynKEK · Slack · 8 members".
  - `wave-map.md:575` (W9-T8) says "unsupported member counts remain absent", but D18 does not list this.
  - Fix: add it to D18, or a new D-item, with the default "show only when the provider reports it".
- (b) DIRECT MESSAGES group:
  - Evidence: `02-*.png`, list column x259-429 at about y427-520, a "DIRECT MESSAGES" header with MC, LM and NP rows.
  - No default-wave task renders it. The only mention is the conditional `wave-map.md:815` (W12-T10). `gap-communications.md` COMM-04 lists "GENERAL/project/DM groups" as in scope.
  - Fix: add the DM group to W9-T4 for providers that supply DMs, and add a D-item that decides Slack DM scope (bot-only Discord and Telegram show none).

### I4. Visible elements with no task

- Meeting-card Video icon:
  - Evidence: `07`/`08` agenda cards, a blue Video icon at about x897-903 on y229, y376 and y552.
  - A grep for "Video" in `wave-map.md` returns 0 hits.
  - Fix: add it to W6-T4, and define whether it is a conferencing-link indicator or the Join affordance.
- Blue "Marketing" folder emphasis in the Files explorer:
  - Evidence: `01-04`, right panel, y about 356.
  - The meaning (selected, linked or project folder) and the owning task are undefined.
  - Fix: define it in W7, for example as "folder linked to the selected item", and add it to the acceptance.
- Week-strip navigation:
  - Evidence: the `07`/`08` week strip has no previous or next arrows, yet Wave 6 acceptance requires "date navigation".
  - Fix: name the control, either day-chip click only, or arrows as an explicit addition logged as a D-item.
- 07 and 08 header subtitles:
  - These are covered only as "space-owned toolbar copy" (W6-T4).
  - Fix: quote the exact subtitle strings in W6-T4.

### I5. W5-T4 asks for counts the mockup does not show

- Evidence: `wave-map.md:221` (W5-T4) asks for "All/Open/Done counts". The `03-*.png` sub-rail shows the labels with no counts.
- Fix: either remove the counts, or state that they are a deliberate addition and not part of the pixel target.

## Minor

- `gap-shell.md:44` and `:53` say 01 shows Inbox only. The 01 sub-rail shows Inbox, Unread and Later. D03 already corrects this; fix the report so it cannot be cited again.
- `gap-shell.md:76` drops the comma from "Thoughtful products, made for everyday life." (05 Browser). `gap-browser-agents.md:64` has the comma right. Fix gap-shell.
- `gap-meetings-notes.md:56` and `gap-tasks-calendar.md:81` write "SynKEK - Launch review". The PNG uses a middle dot, "SynKEK · Launch review". Fix both.
- `gap-tasks-calendar.md` (03 view-toggle row, about line 64) names the Board icon PanelsTopLeft/Columns2. The PNG shows a 2x2 grid icon (LayoutGrid). Fix the icon name.
- Verified correct, no action needed: the D03 tab corrections (Files for 02, Browser for 05, Agents for 06) match the bodies shown. The 01 sender mismatch (row Maya Chen, reader Nina Patel) is a mockup inconsistency, and the gap report already flags it.

## Coverage map

| PNG      | Region / control                                             | Task(s)                     | Status                                           |
| -------- | ------------------------------------------------------------ | --------------------------- | ------------------------------------------------ |
| all      | Sidebar, sub-rail, breadcrumb, header, resource tabs, footer | W4-T1 to W4-T6              | Covered; live look of sample chrome missing (I2) |
| all      | Deterministic sample state                                   | none                        | Missing (C2)                                     |
| 01       | Mail sub-rail, search, rows, chips                           | W11-T1, W11-T3              | Covered                                          |
| 01       | Star, more menu                                              | W11-T2, W11-T4              | Covered                                          |
| 01       | Reader, Marketing card                                       | W11-T4                      | Covered                                          |
| 01       | Reply, Send demo, Attach                                     | W11-T5 to W11-T7 (D15, D16) | Covered with decisions                           |
| 01-04    | Files explorer, Marketing folder emphasis                    | W7                          | Emphasis undefined (I4)                          |
| 02/05/06 | Comms sub-rail and channel list                              | W9-T4, W9-T7, W9-T8         | DM group missing (I3b)                           |
| 02/05/06 | Channel header and member count                              | W4-T3, W9-T4                | Member count dropped silently (I3a)              |
| 02/05/06 | Stream, doc card, replies                                    | W9-T5                       | Covered                                          |
| 02/05/06 | Composer                                                     | W9-T6 (D18)                 | Covered with decision                            |
| 03       | Task list, rail                                              | W5-T1 to W5-T5              | Covered; counts added (I5)                       |
| 03       | Board toggle                                                 | W5-T6                       | Covered                                          |
| 03       | Footer                                                       | D06, W12-T8                 | Covered with decision                            |
| 04       | Project cards, search, New project, Linked                   | W8-T1, W8-T2                | Covered                                          |
| 04       | Roster                                                       | W12-T6 (D05, held)          | Conditional, listed                              |
| 05       | Browser panel                                                | W10-T1 to W10-T3            | Covered                                          |
| 06       | Agents panel                                                 | W10-T4                      | Covered                                          |
| 07       | Agenda, Join, Notes                                          | W6-T4, W6-T6, W6-T8         | Covered; Video icon missing (I4)                 |
| 07       | Docs card, comments                                          | W8-T3 to W8-T6              | Covered                                          |
| 07       | Recordings                                                   | W6-T4, W12-T4, W12-T5       | Covered, partly conditional                      |
| 07/08    | Week strip navigation                                        | W6-T5                       | Control unnamed (I4)                             |
| 08       | Agenda, Week view                                            | W6-T4, W6-T5                | Covered                                          |
| 08       | "+ Schedule"                                                 | none                        | Wrongly removed (C1)                             |
| 08       | Tasks panel body                                             | W5-T7                       | Covered                                          |
| none     | PRs tab body                                                 | W8-T7                       | Not pictured in any PNG; no visual target        |
