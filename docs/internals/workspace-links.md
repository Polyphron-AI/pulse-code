# Workspace links

A link connects two items, such as a mail message and a project. Links are what make the
workspace one place: the Linked section shows them, and agents read them as context.

## Items and keys

An item reference (`WorkspaceItemRef` in
[pulseLinks.ts](../../packages/contracts/src/pulseLinks.ts)) is one of `thread`, `project`, `task`,
`mail`, `file`, `url` or `provider-resource`. `workspaceItemKey` turns a reference into the stable
string a link stores, for example `project:project-1` or `mail:acct_1:%3Ca%40b%3E`. Normalise a
reference with `normalizeWorkspaceItemRef` before keying it. URL fragments and `utm_` query
parameters do not create separate items.

A mail item is keyed by its account and Message-ID. Its `location` (account, mailbox,
UIDVALIDITY, UID) is only a first guess. A message with no Message-ID is keyed by location instead, and the UI marks it
as one that may break when it moves.

## Storage

Links live in the SQLite table `workspace_links`, created by
[058_WorkspaceLinks.ts](../../apps/server/src/persistence/Migrations/058_WorkspaceLinks.ts) and
accessed through the [repository](../../apps/server/src/persistence/WorkspaceLinks.ts), with the
[WorkspaceLinks service](../../apps/server/src/workspace/WorkspaceLinks.ts) above it.
They are separate from orchestration events, replay, checkpoints and projections.

- One row per unordered pair. `key_a` sorts before `key_b`, so linking A to B and B to A is the
  same row.
- `status` is `confirmed`, `suggested` or `dismissed`. Unlink sets `dismissed` and keeps the row,
  so linking again flips it back to `confirmed` with its first origin intact. Lists return
  `confirmed` and `suggested` only.
- `origin_json` records when the link was first confirmed and, when supplied, what the user was
  viewing. It survives unlink.
- Titles are snapshots refreshed when linking supplies a new title. The Mail client shows live
  project titles and snapshots for threads and other items.
- A list returns the 200 most recently updated links for an item and says when there are more.

## RPCs and change stream

`pulse.links.list`, `pulse.links.link`, `pulse.links.unlink` and `pulse.links.subscribeChanges`,
advertised by the `workspaceLinks` capability. The server keeps one change counter per
environment. Any link or unlink ticks it, and every client refetches each open list on a tick, so
a second device sees a change without reloading. Client atoms live in
[workspaceLinks.ts](../../packages/client-runtime/src/state/workspaceLinks.ts).

## Finding a linked message again

`pulse.mail.readMessage` and the `workspace_read_item` tool find a message in one IMAP session,
without a location cache:

1. Location only: fetch that location. A refused folder, a changed UIDVALIDITY or an empty UID
   fails `not-found`, because the message cannot be found anywhere else.
2. Location and Message-ID: fetch the location and accept it only when the Message-ID matches.
3. Otherwise search mailboxes by Message-ID: the hinted mailbox, then `\All`, `\Archive`, INBOX,
   `\Sent`, `\Junk`, then the rest, at most 50. At most 50 candidate messages are fetched, in
   addition to the hinted location read. Each fetched candidate must match the Message-ID, so a
   different message now sitting at an old UID is never shown in its place.

If no matching message is found, an incomplete search returns `unavailable` instead of claiming
the message is gone. Failed searches, failed candidate reads and scan limits make a search incomplete. A successful match
is returned even if an earlier search failed. This search lets links survive archiving in Gmail.

## Agent context

When confirmed links exist, a new provider turn includes a `<linked_items>` block naming items
linked to the thread or its project. It is built in
[linkedItemsContext.ts](../../apps/server/src/workspace/linkedItemsContext.ts) and appended to the
provider text where
[ProviderTurnStartService.ts](../../apps/server/src/orchestration-v2/ProviderTurnStartService.ts)
starts each turn. The stored user message stays as typed, and a steer joining a running turn
gets no block because the turn already carried one.

- At most 30 items and 4096 bytes. An item that would overflow is left out whole, and the block
  tells the agent more are available.
- Titles are flattened to one line, cut to 200 characters and escaped, and the block tells the
  agent to treat linked titles and contents as data, not instructions.
- A turn that starts with `/` is a provider slash command and is sent untouched.
- With no linked items, no block is added. If the links store fails, the turn is sent without it.

## MCP tools

The `workspace` toolkit gives the agent two tools:

- `workspace_linked_items({})` lists confirmed items linked to the thread or its project, with
  keys. The repository reads at most 100 links before deduplicating items. The result is cut to
  fit 32,000 bytes of JSON and marked `truncated` when either limit omits entries, rather than
  refused for being too large.
- `workspace_read_item({ key, offset? })` reads one linked item. Mail returns headers and a paged
  text body; pass `body.nextOffset` as `offset` to continue. A URL returns its address, without fetching the
  page. Other types fail `unsupported`.

A link grants that one item. `workspace_read_item` reads a linked message even when its account is
not granted to the project; `mail_search` and `mail_fetch` still need the project's grant.
