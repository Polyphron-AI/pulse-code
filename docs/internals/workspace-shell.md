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
the hidden state. The existing resource close-focus context exposes that state. The Browser dialog
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
