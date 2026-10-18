# Glossary

Terms whose meaning matters across T3 Code. Architecture and lifecycle constraints belong in the
[overview](./overview.md), not in these definitions.

## Workspace and conversation

| Term                    | Meaning                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment             | One running server and the machine, credentials, workspace access, and state it owns.                                                                                                                |
| Client                  | A web, desktop, or mobile UI connected to an environment. The desktop app can also host a server.                                                                                                    |
| Project                 | An environment-local workspace record rooted at a directory.                                                                                                                                         |
| Workspace root          | The project's base filesystem directory on the environment.                                                                                                                                          |
| Worktree                | A separate Git checkout a thread can use instead of the project's main checkout.                                                                                                                     |
| Thread                  | The durable conversation and work history for a project. It survives provider process exits.                                                                                                         |
| Project agent           | A conversation assigned through a confirmed project-thread link. Project ownership alone is not an assignment; unassigning retains the conversation and run.                                         |
| Browser session         | The existing thread/profile browser state, retained while Code and Workspace exchange presentation ownership.                                                                                        |
| Presentation lease      | One visible host's ownership of a browser session's native surface. Releasing it does not close the session.                                                                                         |
| Captured page           | Page address/title metadata frozen with an environment and selected target for an action by `captureWorkspacePage`. External tabs supply entered metadata only.                                      |
| Linked-page search      | Local title/address matching of confirmed direct project page links. `hasExplicitScheme` separates addresses from search text; it does not query the Internet.                                       |
| Turn                    | One user-to-agent cycle, a V2 run. Provider work can end before checkpoint and diff work settles.                                                                                                    |
| Activity                | A non-message timeline item, such as a tool action, approval, or failure.                                                                                                                            |
| T3 home                 | The base data directory. Runtime state normally lives under its `userdata` directory.                                                                                                                |
| Link                    | A user-confirmed connection between two items, such as a message and a project. See [workspace links](./workspace-links.md).                                                                         |
| Linked items            | The confirmed items linked to a thread or its project. Turns name a bounded list; exact direct grants authorize supported item reads, including Calendar occurrences.                                |
| Item key                | The stable string a link stores for an item. A mail item is keyed by account and Message-ID when it has one.                                                                                         |
| Workspace note          | One environment-owned revisioned native text or Markdown item with independent links and exact direct read grants.                                                                                   |
| Calendar occurrence     | An event instance keyed by connection, calendar, provider event and original recurrence key. Its ID survives moves and cancellation. Calendar and Meetings share it. Due tasks retain task identity. |
| Resource frame          | The selected environment/project's Files, Browser, Agents, Tasks, Docs and PRs container. Browsing it does not confirm links.                                                                        |
| Drive root              | The explicitly designated, confirmed project-folder link and chosen Drive connection used for browsing. It grants no access to unlinked descendants.                                                 |
| Linked context          | The explicitly opened view of a selected item's confirmed links, suggestions, origins and labelled project discovery.                                                                                |
| Held item               | The environment/item captured when Linked context or an item action opens, retained until explicitly replaced or invalidated.                                                                        |
| Auto project            | A resource project inferred from the current item's owner or confirmed project links when exactly one project resolves.                                                                              |
| Resource footer         | Project-source health and scoped settings below the resource body's independent scroll area. Unknown health is not connected.                                                                        |
| Item mutation signal    | `WorkspaceItemMutationContext` invalidates the matching held environment/item capture after successful deletion.                                                                                     |
| Completed column        | The project column that defines task completion. Other columns are open; an undesignated project has no completed tasks.                                                                             |
| Lane                    | A Board column within one project, using that project's configured task column name and order.                                                                                                       |
| Lane total              | The full number of tasks in one project's lane that match the current filters, including tasks not yet loaded.                                                                                       |
| Partial totals          | Lane counts that are incomplete because the server capped its totals response. An omitted lane has an unknown total, not zero; loaded card counts remain visible.                                    |
| Date-only task due date | A Gregorian calendar date attached to a workspace task, with no time or scheduled job. The environment display timezone determines Today; it does not change the stored date.                        |
| Fixture recipe          | An isolated DEV sample defining a space, selection, resource project/tab and required presentation regions for capture.                                                                              |

## Orchestration

| Term                    | Meaning                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Command                 | A request to change domain state. Accepting it does not mean its side effects have finished.              |
| Event                   | A persisted fact produced by a command.                                                                   |
| Orchestrator            | The service that serializes commands and decides their events from current state, without I/O.            |
| Projection / read model | A persisted view of current state, committed in the same transaction as the events that change it.        |
| Command receipt         | A durable record of a command's result, used to make retries idempotent.                                  |
| Outbox effect           | Side-effect intent committed with the events, such as starting a provider turn or capturing a checkpoint. |
| Effect worker           | The worker that runs outbox effects after commit and feeds their results back as commands.                |

## Providers and checkpoints

| Term                | Meaning                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Provider            | The agent runtime T3 Code controls, such as Codex or Claude Code.                                            |
| Driver              | The integration for a provider kind.                                                                         |
| Provider instance   | One configured provider, with its own settings and lifecycle. Multiple instances can use the same driver.    |
| Adapter             | The boundary translating a provider's native protocol into T3 Code operations and events.                    |
| Session             | The provider runtime attached to a thread. A session can be stopped and resumed without deleting the thread. |
| Runtime mode        | The thread's permission policy. See [permission modes](../user/permission-modes.md).                         |
| Interaction mode    | How the agent approaches the task, such as planning. Separate from permission policy.                        |
| Checkpoint          | A saved workspace state used for diffs and restore, stored as a hidden Git ref.                              |
| Checkpoint baseline | The workspace state captured before the work being compared.                                                 |
| Turn diff           | The workspace changes attributed to one turn.                                                                |

## Pull requests

| Term                 | Meaning                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull request link    | A persisted thread association identified by host, repository, and number. Links can cross projects within an environment and carry a server-maintained snapshot.                        |
| Pull request sync    | The worker that refreshes each distinct linked review once per cadence and discovers native stack layers. Explicit refreshes and failed stack reads trigger another read.                |
| Current pull request | The link used by single-review controls and older clients. Open work takes precedence; a completed single chain points at its top layer. Unrelated terminal links use the latest update. |

## Composer context

| Term                 | Meaning                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Context record       | The typed payload behind a composer chip, keyed by `contextId` in `message.context.records`. It never holds bytes.                  |
| Context reference    | One occurrence of a record in message text: `[label](t3-context://v1/<kind>/<contextId>)`. Several references can share one record. |
| Attachment binding   | The link from an image or file record to its server-owned attachment. Its attachment ID can change without changing `contextId`.    |
| Attachment inventory | The ordered image records shown as thumbnails above the prose, including images with no inline references.                          |

See [composer context references](./composer-context-references.md) for the contract and lifecycle.
