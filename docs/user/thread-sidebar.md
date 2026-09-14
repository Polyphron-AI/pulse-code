# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
Pinned threads are shown independently of their project, including when you connect to more than
one environment.

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

## Continuing in another provider

A thread stays with the provider it started on, because each provider keeps its own session. To
move the work, open the thread's context menu and choose **Continue in…**, then pick a provider.
The same action is in the command palette as **Continue in another provider…** for the thread you
are viewing.

The thread's current provider writes a short handoff brief covering the goal, what is done, the
current state, and what is next. Pulse Code opens a new thread on the provider you chose with that
brief already in the composer. Nothing is sent until you review it and hit send, so you can edit or
add to the brief first. Very long threads are summarized from their beginning and their most recent
work, and Pulse Code tells you when earlier content was left out.
