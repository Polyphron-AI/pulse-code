# Project communications workspace

Approved intent: extend existing Pulse projects with connected conversations and Google Drive. Communications remains the central view. General conversations and one expanded project's linked channels occupy the left navigation. Selecting a project conversation opens its Drive by default. Settings, documents, browser, agents, and PR reviews occupy the right panel. No mock messages, people, files, or activity ship in this view.

## Merge Danger

**Door:** two-way
**Blast Radius:** medium

Additive project metadata must decode older events and snapshots. Office credentials remain encrypted on the desktop host. Existing mail, calendar, chat sending, and code-project behaviour must remain intact. No installer or external account mutation is part of local verification.

## Tasks

- T1: Google Drive account capability, bounded listing and document reads through the existing Office service. Verify provider parsing, scopes, failures, and account persistence with focused tests.
- T2: Persist project resource associations through the existing project command/event/read model. Verify backward compatibility and update/clear behaviour.
- T3: Make the existing live chat view accept project navigation and selected conversations. Move provider thread replies into the central column, preserve drafts and send acknowledgements, and route shared links to the project panel.
- T4: Integrate project navigation, name-only creation, connection settings, Drive browsing, and existing browser/agent/PR components. Depends on T1, T2, and T3. Verify focused tests, scoped typechecks, and one integrated client pass.
- T5: Build the dedicated Office Projects layout requested in the follow-up. Reuse project creation and the right settings panel; add searchable real project rows and navigation into project communications. No new project model, backend, or mock records. Verify selection, search and empty states with focused tests and inspect the integrated layout.
- T6: Email becomes Inbox plus central reader, with global Files grouped by actual project folders and explicit file-link insertion into drafts.
- T7: Shared, server-persisted tasks with optional projects, list and board views, due dates, subtasks, dependencies and recurrence. Reuse the same task records in Office and resource sidebars.
- T8: Explicit Gmail/Microsoft send and reply workflows with separate write consent. Keep drafts on failed or uncertain sends; never automatically retry sending.
- T9: Dedicated Calendar and Meetings surfaces with source event creation/editing, attendees, agenda and provider meeting links. Reuse local recording/transcript support.
- T10: One accountable assignee plus followers from linked project channels; shared statuses plus project-specific columns; source link and editable excerpt on captured tasks.
- T11: Pulse-owned meeting notes with optional project and reviewed task suggestions. No automatic task creation from transcript text.
- T12: Explicit Drive export of meeting notes with least-scoped write consent and visible permission failures.
- T13: Capture tasks from email/chat with working Pulse source links and editable excerpts.
- T14: Use the shared narrow Office submenu in Communications, Email, Tasks, Projects, Calendar and Meetings, preserving working filters and navigation.
- T15: Share resource module navigation and refine Drive search, breadcrumbs, rows and file-type filtering. Provide an explicitly labelled development-only SynKEK visual preview for populated screenshots.

## Confirmed Office decisions

The six Office areas share projects, files and tasks. Communications keeps general and project channels in navigation and the active conversation in the centre. Projects has a dedicated searchable layout with right-side settings. Email uses Inbox plus reader and global Files/Tasks on the right. Calendar manages source events; Meetings combines preparation, scheduling, join links, recordings, transcripts and reviewed action items.

Task assignees and followers come only from linked project channels. Unprojected tasks remain unassigned. Shared statuses are To do, In progress, Review and Done; custom project columns map to those statuses. Dependencies warn but do not block completion. Recurrence supports fixed dates and intervals after completion. Fixed recurrence keeps one outstanding occurrence and skips missed dates when completed. Source links retain an excerpt editable before task creation.

Agendas and notes live in Pulse with optional project links and explicit Drive export. Meeting scheduling uses a selected Google or Outlook calendar, invitations and a provider conference link where supported. Email and calendar mutations require explicit user actions and provider consent.

Pulse Activity is the agreed default notification destination, with optional desktop, Slack/Discord and email delivery. This is a separate delivery workstream: existing transient renderer notifications do not provide durable activity history. Historical events, per-device read state, explicit destination preferences and a single desktop-host outbox with deduplication are required before external notification delivery can be claimed. No notification delivery is enabled by these decisions alone.

The user chose linked Slack/Discord membership. The implementation reads Slack channel membership and Discord server membership with source roles when available. Source permissions remain authoritative; no separate Pulse invitations or role enforcement.

## Verification boundaries

Tests use isolated provider responses. Actual OAuth login and source access require credentials entered by the user in Pulse. Desktop-local Office connections remain unavailable from remote web/mobile clients; shared project associations remain server-owned. Native mobile layout is outside this web/desktop view change, but shared contracts must remain compatible.

## Implementation and verification

T14–T15: live views now use OfficeSubnav and resource panels use OfficeModuleTabs. Drive and global Files have rounded search, clearer rows and useful panel widths. The development-only `demo=synkek` Office route uses those shared navigation components with in-memory illustrative content. It never invokes provider services or writes task/project records. Browser screenshots exercised Email, Communications, Tasks, Projects, Files, Browser and Agents. The preview host disconnected before the Meetings/Calendar captures. Those views are implemented but their populated screenshots remain unavailable in this pass. Scoped web typecheck passed; focused navigation/task/calendar/Drive tests passed. The design detector returned no findings. Targeted lint has no errors, with existing route effect warnings and a preview append-only message key warning.

T5–T13 are implemented with bounded first-version behavior. Projects has dedicated management rows and right-side settings. Email has Files/Tasks, native Gmail/Microsoft sending, and source capture. Tasks persist on the server with recurrence, people, sources and custom project columns. Calendar has a seven-day agenda and provider write operations; Meetings has saved notes, explicit reviewed action lines and plaintext Drive export. Durable Activity/external notifications remain pending.

The final integration runs passed 55 tests across 13 focused suites covering task persistence/recurrence, notes, source capture, route parsing, project selection, column conflict handling and email/chat/calendar components. Additional focused provider and membership runs passed during implementation. Scoped web and desktop typechecks passed after integration; server/contracts checks passed during implementation. Targeted integration lint has no errors, with React effect warnings. Diff whitespace checks passed.

The retained local browser pass created a real task in isolated state, completed it, reopened it and found the same record in Calendar's Tasks sidebar. Projects rendered real folders and connection state with settings beside the list. Calendar correctly showed its desktop-account boundary. No real email, invitation or Drive write occurred. Provider mutations use synthetic transport tests; real desktop OAuth and account-specific behavior remain unverified. The preview is local-only. These additions are uncommitted and have not been merged or packaged into an installer.

Task and note mutations have revision checks. Project column editing preserves local edits when another client's update arrives and requires explicit reload, but existing project metadata updates do not have server revision compare-and-swap. A simultaneous project settings save can still race.

T1–T4 are implemented. Added source membership reads after the user's linked-membership decision. No mock records ship. User and architecture documentation describe the desktop account boundary and source permissions.

Focused test runs passed: 117 Office/project persistence tests, 35 web/chat/resource tests, 36 membership/chat backend tests, and four additional project settings tests. An initial combined run lost a worker; rerunning the selected tests with two workers passed. Scoped web, server, desktop and contracts typechecks passed. Targeted lint has no errors, with existing-style React effect warnings on the integrated views. Git diff whitespace checks passed.

One integrated local web pass used isolated environment state. Name-only creation persisted a real project and directory. Settings and Drive opened beside the central workspace. Assigning and unassigning an existing agent updated `office.agentThreadIds` in the server's shell snapshot; no agent work was started. No client console errors appeared during that pass. Google OAuth, loaded provider data and native document/browser editing remain unverified with real desktop credentials. Source transport fixtures cover those read APIs without contacting customer services.

Surface review: Office Projects and Communications entry points share the implementation; Code project records are reused. Web shows an explicit desktop-account boundary, desktop hosts the actual connectors, and native mobile has no new view. Contracts remain backward compatible. Unlink, unassign and panel close/reopen are supported. No CLI provider adapter changed. The local sharing route was unavailable; verification was local-only. This branch has not been merged or packaged into a new installer.
