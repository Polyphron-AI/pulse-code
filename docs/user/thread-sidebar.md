# Organizing threads

On web and desktop, selecting a thread while the app is opening keeps that thread selected, even if the initial project settings finish loading later. **New Thread** still opens a draft when you choose it.

Pin a thread from its context menu to keep it in the pinned section above your active work.
`mod+shift+p` pins or unpins the thread you have open. Pinned threads are shown independently of
their project, including when you connect to more than one environment.

To require confirmation before unpinning, enable **Settings → General → Unpin confirmation**. The
confirmation applies to the sidebar controls, thread menus, and the `mod+shift+p` shortcut.

When you un-settle a thread, it returns to the top of the active list so you can find it right
away. Its original creation time does not change. Other threads keep their positions.

Right-click a pull request link in a thread and choose **Link to thread** to show that pull request
in the sidebar. Right-click the same link and choose **Unlink from thread** to remove it.

On web and desktop, drag a pinned thread to change its position. On mobile, open the thread's menu
and choose **Move up** or **Move down**. The order is stored by the server and appears on your
other connected devices.

If reordering is unavailable for one environment, update the Pulse Code server running in that
environment. Older servers can still pin and unpin threads, but do not understand synced ordering;
their pinned threads keep the default newest-first order below the ones you have arranged.

## Environment icons

When you are connected to more than one environment, every thread that lives somewhere other than
the machine you are on wears a small icon for that machine at the end of its row: a server, a cloud
VM, a desktop, a laptop, a Mac mini, or a Mac Studio. In the hosted web app and the mobile app,
where every environment is remote, each row wears its machine so you can tell them apart at a
glance. The same icon appears in the thread tooltip, the "Run on" picker, the pull request server
filter, and the environment lists under **Settings → Connections**.

Servers pick the icon themselves from the hardware they run on. A Mac reports its model, a Linux
machine reports its chassis type and whether it is a virtual machine, and anything without a usable
signal shows a generic server. To override it, open **Settings → Connections** and choose an icon
for that environment; **Automatic** goes back to what the server detected. The choice is stored on
that server, so every device that connects to it sees the same icon.

## Panel motion

The main sidebar, right panel, and terminal drawer open and close immediately by default. Under
**Settings → Appearance → Motion**, move the **Panel animations** slider above 0 ms to add motion.
The duration can be set up to 400 ms. Clicking the preview replays all three panel transitions; at
0 ms, it snaps between the same open and closed states.

## Environment artwork

Dev and Nightly environments can identify themselves with artwork at the top of the sidebar and in
the send button. Choose **Artwork**, **Version pill**, or **None** in Settings under environment
identification. Artwork is recolored to match each built-in theme. Custom themes use the **Version
pill** fallback because their colors are not controlled by Pulse Code.

To generate a fresh title from the conversation, open a thread's context menu and choose
**Regenerate title**. While Pulse Code is generating it, the action reads **Regenerating…** and cannot
be selected again. The option is hidden when the connected environment needs a server update.

### Server auto-settlement

Updated environments settle inactive threads and threads with merged or closed pull requests on the server, even when every client is closed. Web, desktop and mobile show the same saved settlement state. Manual settlement is handled by the server and can interrupt active work; requests that still require a native provider answer must be resolved first.

On web and desktop, drag a thread between sections to change its state. Drag a thread up into
the pinned section to pin it at the spot you drop it; drag a pinned thread down into the active
list to unpin it. Dragging a thread onto the **Settled** header settles it, and dragging a settled
thread into the active list un-settles it. A snoozed thread can be dragged out of the snoozed
shelf, which wakes it, but threads cannot be dragged into the shelf because snoozing needs a wake
time. Dragging a pinned thread out of the pinned section does not ask for unpin confirmation.
Pinned and active boundary labels appear only while dragging, without moving the rows. The
other rows slide aside to show where the thread will land. When you cross into another section,
the dragged thread shows the action the drop performs, with its icon: **Pin**, **Unpin**,
**Settle**, **Un-settle**, or **Wake**. Reordering within the same section shows no badge. When there are no pins, drag to the top
edge to pin a thread. Section labels stay readable for the whole drag, and the section the
thread is over takes the accent color. Section labels also
identify empty sections and a collapsed settled shelf.

Change auto-settlement preferences in General settings. Changes apply to connected environments that support server auto-settlement. Older environments retain this device's local preferences and classification. Offline environments keep their saved settings until you reconnect and apply shared preferences.

Pull-request links are discovered by an updated server even when no client is open. An explicitly linked pull request takes priority over the branch's automatically discovered link. The sidebar and PR panel share status updates, including merges and reopened requests. Older servers continue using checkout-based discovery until upgraded.

## Arrange threads on mobile

Open a thread's menu and choose **Move up** or **Move down** to arrange active or pinned threads. Home and the navigation sidebar share the saved order, and search or project filters do not change what a move means. New and reopened threads appear above the saved active arrangement; ordinary activity does not reorder the list.

The connected environment must support arrangement. When a participating older environment still settles threads locally, active arrangement becomes available after updating it to server-owned settlement. Pinned arrangement remains available on environments that support it.
