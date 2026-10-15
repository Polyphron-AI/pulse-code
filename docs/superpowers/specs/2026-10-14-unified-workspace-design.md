<!-- Copied from prd/18-unified-workspace.md at 39d719ee51 (branch t3code/unified-messaging-research-design). Relative links point into prd/. The Amendments section at the end overrides the body where they disagree. -->

# Unified workspace

Status: proposed (see CR-2026-10-14-unified-workspace)
Roadmap: `R-2026-08-19-collaboration-notifications`
Builds on: [Pulse integrations](10-pulse-integrations.md), which owns connections, secrets, mutation
rules and the link record contract. This document owns the workspace experience built on them.

## Problem and outcome

People who run a business, not a codebase, spread their work across a mail client, a file store, a
browser, chat tools and now coding agents. Each lives in its own window. The connections between them
(this mail is about that project, this file answers that mail, this thread drafted that reply) exist
only in the person's head. Category leaders do each piece well. None of them connects the pieces to
agent work.

The desired outcome is:

> In one full-screen window, a user reads mail, sees everything linked to the selected item, and
> turns any item into agent work with one right-click, without leaving the app.

The moat is unification, not any single feature. Judged one piece at a time against Gmail, Drive or
Slack, every piece loses. That is not the comparison this product invites.

### Who it is for

- **Buyer:** laypeople. Owners and operators who do not live in Slack or a terminal and do not know
  how to use each tool well.
- **First user:** the maintainer, on their own mailboxes.
- **First pilot:** Polyphron, the maintainer's own company, including at least one non-technical
  person. This is a usability rehearsal, not a buying signal.

### Goals

- <a id="everything-is-a-link"></a>**Everything is a link.** Mail messages, files, web pages, threads,
  projects and tasks link to each other through one server-owned record.
- <a id="one-window"></a>**One window.** Reading, linking and acting happen inside Pulse Code. Provider
  deep links are the exit, not the workflow.
- <a id="one-right-click"></a>**One right-click to agent work.** Any item becomes a thread, a project or
  an automation, with T3 orchestration doing the work.
- <a id="human-approves-sends"></a>**Agents draft, humans send.** Every outbound mail is approved as the
  exact message, on the existing approval card.
- <a id="calm"></a>**Calm.** Suggestions are few, explained and never promoted without the user.
- <a id="remote-ready"></a>**Remote ready.** The same workspace works in a remote browser and on a
  phone through the web app.

### Non-goals

- Slack, Discord and Telegram. They stay parked; the next connector ships only when the pilot asks.
- Rebuilding a whole Gmail, Drive or Slack (see the [Pulse integrations](10-pulse-integrations.md)
  non-goals).
- Auto-triage, auto-send and auto-confirmed links.
- Task recurrence, task dependencies, meeting scheduling, and roles or permissions inside a project.
- New React Native screens. Mobile is served through the web app this cycle.
- Drive sync and Drive writes.
- A people and organisation directory, CRM reconciliation or SOP library.
- A generic workflow engine. Automations are [Scheduled Chats](12-scheduled-chats.md).

## Experience contract

### Layout

<a id="layout"></a>One full-screen window, four columns, left to right:

1. **Rail.** Switch spaces. Day one: Mail, Projects, Code.
2. **Nav bar.** Structure inside the space. Mail: Inbox, Sent, Junk and the folders the server syncs.
   Projects: the project list.
3. **Engagement zone.** List and detail, split 20 / 80 by a draggable divider. The split is remembered
   per space on that device.
4. **Side panel.** What is linked to the selected item, then the tools: Browser, Files and Agents.

On a phone-width browser the workspace collapses to one column at a time. Rail and nav become a
menu, the list opens the detail, and the side panel opens as a sheet from the detail. The draggable
divider exists only on wide layouts.

### Side panel

<a id="side-panel"></a>Two sections, always in this order.

- **Linked.** Always user-confirmed: the user linked it, or accepted a suggestion. Each row shows the
  item type, title, source, an open action and an unlink action. Existing thread links to pull
  requests and issues also appear here.
- **Suggested.** At most three AI-suggested links, each with a one-line reason. Accept moves the
  suggestion to Linked. Dismiss hides it, and that pair is never suggested again. Linking the pair by
  hand later reverses a dismissal.

Each section header has an info button that explains it in plain words. It opens on hover, keyboard
focus or tap, because phones have no hover.

- Linked: "Things you connected to this item. Agents working on it can read them."
- Suggested: "AI thinks these may be related. Nothing is linked until you accept. Dismissed
  suggestions do not come back."

Hovering or focusing a row shows how, when and where the link was made: "You linked this on 14 Oct
while viewing 'Re: Q3 brief'", "Accepted suggestion" with its reason, or the action that made it,
such as "Start thread". The place is clickable and opens that item, so the user can return to the
view where the link was made. On touch screens the same line sits in the row's long-press menu.

Below the sections sit the tools. **Browser** opens pages inside the desktop app; web and phone open a
new tab. **Files** shows linked Drive files. **Agents** lists threads linked to the item and starts a
new one.

A user links by hand in three ways: drag one item onto another, use "Link to..." with a search
picker, or paste a URL into the Linked section.

If the text generation model is not set up or fails, Suggested says so in one line and everything
else keeps working.

### Right-click actions

<a id="actions"></a>Available on any item in any list. The same actions sit in the item's detail header
and have keyboard shortcuts. On touch screens, long-press opens the same menu.

| Action                  | Applies to                | Result                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start thread            | any item                  | A new agent thread in the item's linked project, or a project the user picks. The composer is pre-filled with the item and its confirmed links; the user can remove any of them, then presses send. Sending links the thread to the item and to each link left in the composer, so the agent can read them. |
| Start or add to project | any item except a project | Create a project from the item, or link the item to an existing one.                                                                                                                                                                                                                                        |
| Draft reply with agent  | mail                      | Starts or reuses the thread linked to the message, which drafts the reply. The user approves the exact send on the approval card. The sent message links to the thread and to the original.                                                                                                                 |
| Start automation        | any item                  | Opens the Scheduled Chat editor with a prompt that references the item and the project taken from its links. The schedule's thread links to the item.                                                                                                                                                       |

A project created from an item gets a new folder under the user's Pulse Code projects directory, so
its agent threads have a workspace to write into. The user is not asked to pick one.

### Projects as link hubs

<a id="projects"></a>A project is a link target like any other item. Its page lists its threads, the
items linked to it, and the items linked to either of those one hop away, each labelled with the item
it came through. One hop is the limit, and it is display only: one-hop items are not linked to the
project and are not agent context.

The per-project slots on the parked Office branch become links: the Drive folder, chat
conversations and agent thread IDs. Task columns and the browser thread stay project settings,
because they configure the project rather than point at something else. The slots never shipped, so
no data migration is needed.

### Mail

<a id="mail"></a>The Mail space is a view onto server mail. It replaces the Office Email view and
retires the desktop-only SMTP sender; that sender's wording and tests carry over. The server adds
read RPCs: list folders, list messages or conversations in a folder (paged), read one message, and
search. Message bodies load on demand and are bounded. List responses carry summaries only, to keep
WebSocket traffic small.

The Mail list has a toggle between conversations and single messages, remembered per device.
Conversations are the default, because most users come from Gmail. The server groups them, using
Gmail's thread ID where the account offers it and the reply headers otherwise. Links always attach
to messages, never to conversations. In conversation view the side panel shows the links of every
message in the conversation, and linking or a right-click acts on the newest message unless the user
picks another one in the detail.

### Files

<a id="files"></a>Drive files are links. The first cut is a pasted Drive URL. The second is Drive
search: "Link to..." and suggestions both search Drive, and agents can read linked files. This needs
the read-only Drive scope (`drive.readonly`), granted through the user's own Google client
registration, the same way server mail signs in to Gmail. Google rates this scope as restricted, as
it does mail's Gmail scope. On a Google client owned by Pulse Code it would need Google's security
assessment; on the user's own registration it carries the same terms as mail. Pulse Code never writes
to Drive. Opening a file uses the provider deep link, or the Browser panel on desktop.

### Tasks

<a id="tasks"></a>Basic task lists inside a project: a title, a column from the project's task
columns, and links. Nothing more this cycle.

## Platform contract

### Link record

<a id="link-record"></a>One record type, owned by the server, event-sourced like other orchestration
records.

- **Endpoints.** Two item references, each typed: thread, project, task, mail, file, URL or provider
  resource. Links are symmetric: there is no direction, and a link shows on both items. There is at
  most one record per unordered pair.
- **Status.** `confirmed`, `suggested` or `dismissed`. Only a user action moves a link out of
  `suggested`. A dismissed pair is kept so it is not suggested again; this mirrors how dismissed
  stacked pull request links are kept today.
- **Source.** Who made it: the user, an action (Start thread, Draft reply and so on) or the model. A
  suggestion carries its reason.
- **Origin.** When the link was first confirmed and the item the user was viewing at the time. Kept
  when the link is unlinked and made again. There is no free-text note this cycle.
- **Reverse states.** Unlink removes a confirmed link and can be undone by linking again.
- **Context.** A confirmed link is context. An agent in a thread gets a short list of the items
  linked to that thread and to the thread's project (type, title, reference), so a project works as
  a shared briefing for its threads. It reads full content on demand through Pulse
  Code's tools, so a long list does not bloat every turn. The link lets the agent read that one item
  even when its mail account is not granted to the project; searching a whole mailbox still needs the
  project's account grant. Suggested and dismissed links are never context. Unlinking removes the
  item from later turns but does not erase what earlier turns read. Context is read-only: sends and
  changes still go through approval.

Existing thread-to-pull-request and thread-to-issue links keep their own records this cycle and are
shown in the side panel alongside general links. Folding them into the link record is a later
decision.

### Stable references

<a id="stable-references"></a>A link must survive its target moving.

| Item                  | Stable key                     | Notes                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mail                  | Message-ID header plus account | The IMAP location (mailbox, UIDVALIDITY, UID) is a cache, re-found by Message-ID when it misses. Archiving in Gmail keeps the link. A message with no Message-ID links by IMAP location and is marked as one that may break when moved. |
| Drive file            | file ID                        | Not the URL path.                                                                                                                                                                                                                       |
| Web page              | normalised URL                 |                                                                                                                                                                                                                                         |
| Thread, project, task | their IDs                      |                                                                                                                                                                                                                                         |

When a target cannot be resolved because it was deleted or its account is disconnected, the link
stays and renders as unavailable with the reason. It is never dropped silently.

### Suggestions

<a id="suggestions"></a>The server computes suggestions through a new method on the text generation
service, using the user's text generation model setting (default `gpt-5.6-luna`, or Claude Haiku when
chosen) and structured output.

- **Candidates:** items Pulse Code already knows (recent projects, threads and linked files), plus
  a bounded server-side search of the user's mail and Drive built from the item's sender, subject and
  file names. Each search returns at most 20 results.
- **Input:** the opened item's title, sender and a bounded snippet, plus each candidate's title,
  sender or owner, and date. Candidate bodies and file contents are never sent to the model.
- **Output:** validated. At most three, each pointing at an existing candidate, each with a reason.
- **When:** computed when an item is opened, then cached. Recomputed only when the item changes or
  the user asks.
- **Visibility:** the panel names the model in use.

### Compatibility

<a id="compatibility"></a>The link record, mail read RPCs and suggestion method are optional server
capabilities, as described in [Pulse integrations](10-pulse-integrations.md). Clients hide the
workspace on servers that do not advertise them. Local, direct-remote, relay and tunnel connections
behave the same, because links and mail are server-owned.

Draft reply works with any provider that can call Pulse Code's mail tools. Providers that cannot are
left out of Draft reply as a stated decision, per adapter.

## Demo

<a id="demo"></a>The cycle is done when this runs end to end on real accounts:

1. A real client mail arrives in Inbox on server mail and is opened from a remote browser.
2. The side panel shows an empty Linked section and Suggested links, such as "SynKEK project" and
   "brief.pdf (Drive)", each with a reason. The user accepts both.
3. Right-click, Start thread. The thread is seeded with the mail and its links.
4. The agent drafts a reply. The user approves the exact send on the approval card.
5. On a phone, through the web app, the user opens SynKEK. It lists the mail, the file, the thread
   and the sent reply.

## Delivery

<a id="delivery"></a>Six weeks, fixed time, variable scope.

| Weeks | Build                                                                                                                                                                                                                      | Acceptance                                                                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1-2   | Merge server mail (`qb/feat-imap-mail`). Add the mail read RPCs, including conversations and search. Add the link record with stable mail references and origin. Turn project slots into links.                            | In a remote browser over Tailscale, read Inbox from a real account, link a message to a project, archive the message in Gmail, and the link still opens it.  |
| 3-4   | Rail, nav bar and 20 / 80 layout with the phone collapse. Mail list with the conversations toggle. Linked section. Start thread, Start or add to project, Draft reply with agent. Projects as hubs. Drive as pasted links. | Demo steps 1, 3 and 4 pass on desktop and in a remote browser, with links made by hand. The project page shows the mail, a pasted Drive link and the thread. |
| 5-6   | Suggested links first. Then Drive search, Start automation, Browser panel on desktop and basic tasks. Start the pilot.                                                                                                     | All five demo steps pass, including step 5 on a phone. The pilot has started.                                                                                |

- **Cut order if late:** Browser panel, then basic tasks, then the conversations toggle (single
  messages stay), then Drive search (pasted links stay, and suggestions search mail only), then
  Start automation.
- **Never cut:** links, mail, Start thread, Draft reply, Suggested links.

## Pilot metrics

<a id="metrics"></a>No targets yet. Baselines come from the maintainer's own use in week 1. Telemetry
never records message bodies.

| Metric                 | Measures                                                                                              | Direction |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| Right-click conversion | opened items that lead to a thread, project or automation started from the item                       | maximize  |
| Draft approved as sent | agent drafts approved and sent, with the share sent without edits                                     | maximize  |
| Window displacement    | how often the user leaves for Gmail or Drive to finish a task (weekly check-in plus deep-link clicks) | minimize  |
| Suggestion acceptance  | accepted suggestions divided by shown suggestions                                                     | maximize  |

## Risks

<a id="risks"></a>

- **Link rot.** Links that break when mail is archived would sink the thesis. Stable references are
  the mitigation, and the week 2 acceptance tests it.
- **No mail read RPCs today.** Server mail has account, access and approval RPCs only. Nothing else in
  this plan works until weeks 1-2 add reading.
- **Noisy suggestions.** At most three, with reasons, and dismissed pairs never return. If acceptance
  stays low in the pilot, the inputs are reviewed with pilot users before any tuning.
- **Links widen what agents read.** Because a confirmed link is context, linking a message lets an
  agent read it without an account grant. Links stay user-confirmed, and the info button on Linked
  says so in plain words.
- **More than one link model.** This record, pull request links and issue links coexist this cycle.
  No new feature may add a fourth.
- **Layperson setup gap.** Installing and signing in to a provider CLI is still developer-shaped, so a
  layperson cannot finish setup alone. Mail and Drive both need the user's own Google client
  registration, which adds to the gap. The pilot runs on a prepared machine. Solving setup is a
  separate roadmap item, not this cycle's scope.
- **The pilot is a rehearsal.** Polyphron feedback tests usability, not demand.
- **Scope creep.** Each piece invites its category leader's feature list. The non-goals above and the
  no-whole-provider rule in [Pulse integrations](10-pulse-integrations.md) are the guard.

## Surfaces

<a id="surfaces"></a>

- **Entry points:** right-click, detail header, keyboard shortcuts and long-press.
- **Clients:** web and desktop. Desktop adds the Browser panel. Phones use the web app.
- **Providers:** agent threads run on any provider. Suggestions use the text generation setting.
  Draft reply support is decided per adapter.
- **Contracts:** link record, mail read and search RPCs, Drive search and the suggestion method, all
  optional capabilities.
- **Reverse states:** unlink, re-link after dismiss, and unavailable links that render with a reason.
- **Docs:** a user page for the workspace replaces the Office workspace page in `docs/user/`.

### Cross-references

- Platform: [Pulse integrations](10-pulse-integrations.md)
- Automations: [Scheduled Chats](12-scheduled-chats.md)
- Roadmap: `R-2026-08-19-collaboration-notifications` in [roadmap](../project/state/shards/roadmap.yaml)
- Change request: [CR-2026-10-14-unified-workspace](change-requests/CR-2026-10-14-unified-workspace.md)

---

**Created:** 2026-10-14 . **Last opened:** 2026-10-14 . **Last edited:** 2026-10-14 . **Status:** proposed . **Owner:** Product . **Layer:** tactical

## Amendments for implementation

Agreed while planning on 2026-10-14. Where these disagree with the body above, these win.

- **A1. Link storage is not event-sourced.** The link record is one SQLite table owned by a
  `WorkspaceLinks` server service, with a change counter that clients subscribe to and refetch on.
  Links have no replay, checkpoint or projection consumer, and the pull request "files viewed" table
  already sets this precedent. Everything else in [Link record](#link-record) stands.
- **A2. Suggestion model wording.** Suggestions use the user's text generation model setting. The
  body's named default is dropped, because the default changes with the build.
- **A3. Project slots.** The parked Office slots never landed on the build base, so "turn project
  slots into links" needs no work.
- **A4. Conversations move to weeks 3-4.** Weeks 1-2 list single messages. The conversations RPC and
  the toggle ship with the Mail list in weeks 3-4. Links still attach to messages only.
- **A5. Sent Message-ID moves to weeks 3-4.** Capturing the sent message's Message-ID ships with
  Draft reply, which is the first feature that needs it.
- **A6. Search is a filtered list.** "Search" is the list-messages RPC with a query, not a separate
  RPC.
- **A7. Context every turn.** The bounded "Linked items" list is sent with every turn (at most 30
  items and 4 KB). There is no change detection.
- **A8. A thin Mail screen in weeks 1-2.** The weeks 1-2 acceptance needs a remote browser, so a
  plain Mail screen (folders, list, message, Linked section) ships first. The full layout follows
  in weeks 3-4.

Agreed with the maintainer on 2026-10-15.

- **A9. Telegram joins as a bot.** Telegram connects through a bot token on the server, never by
  taking over a personal account session, so the user's account is not at risk of a ban. The bot
  sees its own direct messages and the groups it is added to. The server stores what the bot
  receives, so those chats open on any device, link to projects, and an agent can read a linked
  chat. The desktop personal-account Telegram login is retired when the bot lands. Slack and
  Discord stay as they are. This overrides the Telegram part of the first non-goal and ships in
  weeks 3-4.
- **A10. Automations are upstream scheduled tasks.** develop takes upstream T3 Code's scheduled
  tasks through an upstream sync instead of porting main's Scheduled Chats. Start automation opens
  a scheduled task.
- **A11. Build on the synced base.** Weeks 1-2 start after develop is synced with upstream nightly
  `v0.0.46-nightly.20261004.2644`, which carries the orchestrator rewrite. Fork migrations take the
  next free numbers after upstream's on the synced base. The six-week clock starts when the sync
  lands.
