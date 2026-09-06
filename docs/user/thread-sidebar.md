# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
Pinned threads are shown independently of their project, including when you connect to more than
one environment.

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
destination boundary highlights. When you cross into another section, the dragged thread shows
its destination, such as **→ Active**. Reordering within the same section does not show a destination badge. When there are no
pins, drag to the top edge to pin a thread. Section labels also identify empty sections and a
collapsed settled shelf.

Change auto-settlement preferences in General settings. Changes apply to connected environments that support server auto-settlement. Older environments retain this device's local preferences and classification. Offline environments keep their saved settings until you reconnect and apply shared preferences.

Pull-request links are discovered by an updated server even when no client is open. An explicitly linked pull request takes priority over the branch's automatically discovered link. The sidebar and PR panel share status updates, including merges and reopened requests. Older servers continue using checkout-based discovery until upgraded.

## Arrange threads on mobile

Open a thread's menu and choose **Move up** or **Move down** to arrange active or pinned threads. Home and the navigation sidebar share the saved order, and search or project filters do not change what a move means. New and reopened threads appear above the saved active arrangement; ordinary activity does not reorder the list.

The connected environment must support arrangement. When a participating older environment still settles threads locally, active arrangement becomes available after updating it to server-owned settlement. Pinned arrangement remains available on environments that support it.
