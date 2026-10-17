# Workspace shell ownership

The web and desktop renderer share the workspace shell. React Native keeps its existing screens.
Resource browsing and linked-item access are separate decisions. A resource project can differ
from the project or task selected in the center, including across remote environments with equal
project IDs. Never infer a read grant from a selected project, a suggestion or one-hop discovery.

## Resource continuity and handoff

[WorkspaceEngagement](../../apps/web/src/components/workspace/WorkspaceEngagement.tsx) composes
the shared header and split or full center. Viewport width chooses the resource dock at 1280px
and above, or a modal sheet below it. Under 768px the list/detail center uses one pane and the
navigation becomes a menu. Observed center width only bounds its resizable divider.

One stable portal container moves exactly one WorkspaceResourceBody instance between hosts. It may
stay mounted while CSS-hidden under Linked context or compact layouts, retaining its draft and
subscriptions. While hidden it starts no timers, polling or animations, and portaled UI must respect
the hidden state. `WorkspaceResourcesBodyContext` exposes visibility and explicit-close focus return. The Browser dialog
closes when hidden and stays closed until explicitly reopened. Do not mount a second Browser to
handle a breakpoint. Explicit resource close unmounts the tool; a viewport transfer
must keep visibility in one state transition. Initial compact entry is closed. Compact dismissal
does not overwrite the saved wide preference. An environment change drops transient captures and
remounts environment-owned content.

[WorkspaceResourceBody](../../apps/web/src/components/workspace/WorkspaceResourceBody.tsx) is the
sole lazy tab switch. Later modules replace their own case and consume the existing resource state.
`useWorkspaceResources().openResource` selects project, tab, optional request and visibility
atomically. It throws for invalid project/tab inputs, malformed refs and refs that do not belong
in the requested tab. UI wrappers validate before calling it; module readers still check capability,
reachability and permissions. `resetProject` returns to Auto inference without confirming a link.

## Captured actions and held context

An action host captures environment, item and confirmed endpoints when a menu, chooser or editor
opens. It keeps those targets while center selection changes. Session revalidation uses the last
resolved permissions, keeping inputs focused and editable. Permission loss disables writes without
remounting the host or discarding text and errors. Mutations recheck current permission. If project
creation finishes after permission loss, its completion still records the
created project and attempts the captured link. A failed link leaves a truthful retry against that
project, preventing duplicate creation.

Linked context separately holds its opened item and render scope. Show current item replaces that
capture explicitly. X restores prior Resources visibility; Back opens Resources and focuses its
selected tab inside a compact sheet. `WorkspaceItemMutationContext` invalidates only the matching
environment/item capture after successful deletion. A failed mutation or task column change preserves
context. Item identity and links survive a column change.

One-hop discovery appears once in Linked context. For a task it reads the task's actual owning
project and labels the results as project discovery. Resource selection cannot retarget this read.
The center retains threads, tasks and settings. Missing tasks keep their unavailable reason.

## Completion and older clients

Task completion follows the owning project's designated completed column. Custom column lists
remain undesignated after upgrade; a lane named Done alone does not establish completion.
Changing the designation updates affected task revisions in the same transaction, so pending
moves cannot silently use an earlier completion rule. Tasks and their links keep their identity.

Removing or renaming the designated column clears its designation to null on legacy and new
saves unless the request explicitly selects another valid column. Used-column protection runs
first, so tasks must move out before this normalization and no task changes as a side effect.
The service does not infer a rename from column order or names.

The optional `workspaceTasksV2` flag is trusted only from live server configuration. Decode
support remains additive. The server advertises it only with task transition, patch and paged
query handlers installed. Servers without it retain the legacy project task and settings paths.
Rollback disables the capability and controls while preserving
the forward migration and its data. After an older binary renames a designated column, config
reads treat its dangling designation as null without rewriting stored settings or tasks.

## Paged task summaries

All-task discovery uses the read-scoped `workspaceQueryTasks` RPC on the existing WorkspaceTools
service. It does not grant agents discovery or linked-content access. Pages contain at most 100
summaries, default 50, including owner and project title. Search, state, owner and inclusive civil
date bounds apply before paging and before total, open-total and lane counts. A Done filter has
zero open tasks. Undated tasks sort last and do not match date bounds.

Keyset cursors bind the due-date/project/task tuple to normalized filters, the service instance
and the database generation. Migration 068 adds date, project/column and owner indexes plus
transactional generation triggers for task, config and project changes. Restarting the service,
changing filters or changing that generation rejects the cursor. Substring search still scans
matches; the indexes do not make arbitrary substring search indexed.

Each query reads one transaction. Configs and grouped lane totals cover only projects represented
on that page, plus an explicit project scope even when empty. Global consumers cannot infer all
empty projects from a page. The shared environment/query atom reuses one change subscription,
invalidates active pages on change and hides old values during refresh or cursor failure.
Consumers restart pagination instead of appending a new generation to old pages. Reconnects use
the session generation without polling. The legacy project list keeps its 200-task limit and
incomplete flag until its UI replacement ships.

## Task dates and environment timezone

Task due dates are Gregorian calendar days, stored as `YYYY-MM-DD` text by migration 066.
They must never pass through device-local midnight or become timestamps. The shared
[formatter](../../packages/client-runtime/src/state/workspaceTaskDates.ts) uses the environment
zone to determine today and UTC to format the civil day. Its clock stops while the retained
resource body is hidden and resyncs on reopening.

`workspaceDisplayTimeZone` belongs to server settings, independently of `workspaceTasksV2`.
Trusted first load materializes the host zone once through the existing atomic settings writer.
The host zone must pass the name schema and the server's Intl check, otherwise it uses UTC.
Null resets to the current host zone with the same validation. Malformed files and dangling
settings links must not be rewritten for this default. Unchanged watcher reloads do not publish
another config update.

Decode timezone names as bounded strings. Calling Intl during contract decoding would let an
older phone's timezone database reject an entire ServerConfig. Validate timezone writes against
the server's Intl data; the web form warns when its own data does not recognize a name but still
submits it. Server timezone rejections retain their specific reason. An unsupported stored name
stays in the settings cache and on disk, while server read responses expose null for display.
Formatting falls back to UTC on RangeError and the client shows a notice. Loading settings must
not produce a silent UTC label. Locale follows the existing web timestamp locale resolution.

The operate-scoped `workspacePatchTask` RPC shares the task transition policy and applies its
revision check and metadata update in one transaction. Omitted metadata preserves existing
values; null clears them. Legacy upsert uses the same presence rule so an older client's title
save cannot erase a due date, area or owner.

Task ownership is the environment-local `environment-owner` literal or null, not an authenticated
identity. Migration 067 keeps legacy rows unassigned; only new inserts default to the environment
owner. Profile renames never rewrite task IDs, ownership or revisions. The nullable
`workspaceOwnerProfile` uses the existing server settings stream, independently of the task
capability. Clearing it restores the Me display fallback, without unassigning tasks.

Owner profiles decode as complete objects with bounded trimmed strings, so device Unicode or
locale support cannot reject ServerConfig. Both settings write paths validate names without
control characters, line/paragraph separators, bidi controls or zero-width space. They normalize to NFC and merge
the decoded profile. ZWNJ and ZWJ are allowed in names; initials contain one to three letters or
digits, each followed by optional combining marks. The decoded initials string has an 80-unit
bound so combining marks do not count as extra initials.
A partial profile is rejected before deep merge can retain an omitted field. Profile saves require
operate scope and create no access grants. The form blocks schema failures and retains specific
server rejections, as with timezone settings. The scoped settings writer compares returned values
with submitted timezone/profile values, accounting for NFC and trim. Older servers can strip
unknown keys and still return success; a mismatch reports the unsupported field and retains the
draft. Reset accepts the materialized host timezone instead of comparing it with null.

## Shared entrances and status

`WorkspaceHeaderContext` supplies shell-owned environment and space labels to
`useWorkspaceHeaderModel`; modules own title, subtitle and optional owner. This prevents the
breadcrumb and module header from disagreeing after navigation or an environment change.

Palette and keybinding commands click the mounted header action through `data-workspace-action`.
They reuse its capture, toggle and focus behavior. A detached or disabled target aborts. Only the
selected-item action host owns item shortcuts; resource-row menus disable them.

The resource footer consumes known project-source observations without probing or polling.
`resourceConnectionLabel` returns Connected only for a nonempty all-connected set, Unavailable
when any known source failed, and Connection status unavailable for empty or otherwise unknown
sets. Live observations remain empty until Wave 10 connects supported source health. A live socket
does not establish project-source health. Settings captures its environment/project on opening.

## Isolated fixture recipes

The DEV bootstrap recognizes `?fixture=NN` before importing auth, connections or the live app.
Recipes 01 through 08 use an in-memory session, frozen clock, fresh preferences and fake module
boundaries. A throwing request guard counts attempted application network calls and blocks
external opens. Only allowed dev assets and Vite transport are exempt. Production excludes the
fixture modules; an invalid DEV recipe fails closed.

An adapter's `readyRegions` certifies actual mounted presentation, and `settled()` covers its
pending fake work. The capture API waits for the committed generation and active adapters, then
rejects any attempted application request. Empty adapters cannot certify a complete PNG.
`shell.responsive` stays incomplete until the controller's authorized rendered acceptance, even
when deterministic behavior tests pass. See the [capture recipes](../superpowers/workspace-mockups/capture-recipes.md)
for pinned host metadata and the separate shell/module evidence gates.
