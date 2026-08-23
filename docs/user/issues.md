# Work with Issues

Issues brings Pulse reports and engineering work into the places where you already work in Pulse
Code. It is a native Issues layer: the inbox, evidence, triage controls, and fix threads use Pulse
Code's existing workspace, Preview, side-panel, and thread patterns.

Pulse calls captured feedback a bug and its engineering work item a ticket. Pulse Code presents
those as a **Report** and an **Issue** respectively.

## Connect Pulse and map a project

Each Pulse Code server has its own Pulse connection. This keeps local and remote environments
independent and makes an Issue open against the machine that owns its workspace.

1. Open **Settings → Integrations → Pulse Issues**.
2. Select the environment you want to configure.
3. Enter the Pulse base URL and a personal access token, then choose **Connect**.
4. Map each Pulse Code workspace to the matching Pulse project.

The token is stored by the selected Pulse Code server and is never shown again or sent to another
client. Repeat these steps for each local or remote environment that should expose Issues.

Use **Remap** to change a workspace's Pulse project or **Unmap** to stop showing that project's
Issues. Origin allowlists and other advanced project administration remain in Pulse.

## Open and triage Issues

Open **Issues** from the Pulse Code sidebar. The inbox combines mapped projects from every capable,
connected environment. Search or filter by status, severity, assignee, server, or project. If one
environment is offline or unavailable, results from the others remain visible.

Selecting a row opens a referenced Issue tab in the shared right panel. You can keep several Issue
tabs open alongside files and pull requests. The detail view includes:

- the Issue summary, status, severity, assignee, and labels;
- linked Report summaries and their captured media, description, errors, console, network,
  breadcrumbs, page data, environment, and backend context; and
- Issue activity and lifecycle changes.

From a project thread, open the right panel and choose **Issues** to keep the conversation visible
while browsing. This compact list uses the current directory's Pulse project mapping, shows the
matching tickets and each ticket's linked bug-report count, and opens a selected ticket as a peer
panel tab. The **Issues** button in the main sidebar still opens the full cross-environment workspace.

Use the native controls to move an Issue through triage, assign or unassign it, edit labels, resolve
it, reopen it, or mark it as won't fix. If another client changed the Issue first, Pulse Code loads
the current version and asks you to apply your change again.

## File an Issue from Preview

Preview capture is available in the web and desktop clients:

1. Open Preview for a mapped workspace and reproduce the problem.
2. Add any useful annotation, screenshot, or recording.
3. Choose **File issue** in the Preview chrome.
4. Review the title, description, severity, labels, and attached media. Remove anything you do not
   want to send.
5. Submit the Report. Pulse Code opens the resulting Issue only after Pulse accepts it.

Capture uses the origin of the page actually open in Preview. That `http` or `https` origin must be
allowed by the mapped Pulse project. If Pulse rejects the origin, the dialog shows the required
origin so you can add it in Pulse. Failed captures keep the local evidence and review fields for a
retry. Each attached media item is limited to 25 MB.

## Start or resume a fix

From an Issue, choose **Start fix** to open a draft in the mapped workspace. The draft contains a
focused Issue-aware prompt; full evidence stays in the native Issue panel instead of being copied
into every message. The Issue is linked only after the first message successfully creates a server
thread.

Once linked, **Resume fix** opens that thread on the correct environment. From a thread in the same
environment and workspace, you can also choose **Link this thread**. **Unlink** removes the
relationship without deleting the Issue or thread.

Linked threads show the Issue reference, title, status, and severity above the composer. Use that
strip to reopen the Issue panel while you work.

## Mobile support

Mobile provides the remote triage subset: open the Issues inbox from the home chrome, filter across
servers, inspect Report summaries and selected evidence, change status or severity, and resume a
valid linked fix thread in its owning environment.

Connect or map Pulse, capture from Preview, and start, link, or unlink fix threads in the web or
desktop client. Mobile never receives the Pulse token and does not recreate the Pulse dashboard.

## Disconnect Pulse

Choose **Disconnect** in **Settings → Integrations → Pulse Issues** for the selected environment.
This removes its stored token, endpoint, and workspace mappings. Historical Issue-to-thread links
remain so continuity can be restored after reconnecting and remapping the environment.

## Troubleshooting

- **Authentication or permission error:** create or select a Pulse token that can read the project
  and perform the requested update, then reconnect it.
- **Project unavailable:** confirm the token can access the Pulse project, then remap the workspace.
- **Origin not allowed:** add the exact origin shown by Pulse Code to the project's origin policy in
  Pulse, then retry the preserved capture.
- **Upload failed:** keep the dialog open, confirm the environment can reach Pulse and its upload
  storage, then retry. Media larger than 25 MB must be removed or reduced.
- **Environment offline:** reconnect that Pulse Code environment. Other environments continue to
  show their Issues.
- **Issues unavailable on this server:** update Pulse Code Server and reconnect the client so it can
  advertise native Issues support.
- **Issue changed elsewhere:** review the refreshed values and repeat the lifecycle change.

---

**Created:** 2026-08-20 . **Last opened:** 2026-08-23 . **Last edited:** 2026-08-23 . **Status:** stable . **Owner:** Product
