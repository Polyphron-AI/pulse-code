# Argo

Argo is a standing manager. You give it a mission, and it keeps working on that
mission in the background, opening child threads when there is something to do
and closing them when there is not. You stay in charge of the mission, the pace,
and the permissions its children run under.

## Create an Argo

In the sidebar, the **Argo** section sits above your projects. Choose **New
Argo** to create one. A new Argo starts with no mission, so nothing runs yet,
and its pill reads **No mission**.

## Write the mission

Open the Argo to reach its own thread. A control panel is pinned above the
transcript, and it is the only place Argo is configured:

- **Name**, which is what the sidebar and every badge show.
- **Interval**, how often the Argo wakes up and reconsiders its work.
- **Max children**, the largest number of threads it may keep open at once.
- **Child model**, the model its children run on. Leave it unset to follow the
  project default.
- **Child permissions**, the permission mode its children get.
- **Mission**, a plain description of the standing job. It saves when you click
  away.

An Argo starts watching as soon as the mission has text.

## Mention records in the mission

Type `@` in the mission to name something specific instead of describing it.
The picker lists the projects, threads, schedules, and other Argos in the
environment you are connected to; keep typing to narrow it, then press Enter or
click a row to insert it. Arrow keys move through the list and Escape closes it.

An inserted mention shows as a named chip in the line beneath the mission box.
Chips are how you read the mission back; the box itself holds the plain text
that gets saved.

Mentions are stored by identity, not by name, so they follow the record:

- Rename a project and the mission still points at the same project.
- Every cycle, Argo reads the record's current name alongside its exact id, so
  it can act on the right thing without you pasting ids by hand.
- Mention another Argo and this Argo reads that Argo's mission too, one level
  deep. Two Argos that mention each other do not loop; the second mention is
  marked as already covered.
- A chip turns red when the record is gone or belongs to another environment.
  Argo reports it as missing on its next cycle rather than guessing.

A very large mission is trimmed at the point it gets too long to send, and Argo
is told the rest was cut. Mentioning a handful of records keeps well inside
that.

Mission editing is on web and desktop. On mobile you can read the mission,
pause the Argo, and send it a directive.

## Pause and resume

The pill next to the name is the toggle. **Watching** means the Argo is live;
click it to pause. **Paused** means it is stopped and its children stay where
they are; click it to resume. The same pill appears on the sidebar row, in the
command palette as **Pause Argo** and **Resume Argo**, and as a banner at the
top of the Argo's thread on mobile.

## Cycle now

An Argo normally wakes up on its interval. **Cycle now** asks it to wake up on
the next sweep instead of waiting. It is on the sidebar row menu, next to the
name in the Argo's control panel, in the command palette as **Cycle Argo now**,
and on the mobile banner. It is only available while the Argo is watching, and
it reads **Cycle queued** once a cycle has been asked for and has not run yet.

## Children

Threads an Argo opens are ordinary threads. You can read them, reply in them,
and take them over at any time. They nest under their Argo in the sidebar, and
they carry an **Argo: <name>** badge that links back to the Argo that opened
them. A paused Argo starts collapsed, since nothing under it is moving.

## Fleet view

The fleet view lists every thread across your environments. It has an **Argo**
filter and an **Argo** column, so you can narrow the list to managed work and
see which Argo owns each thread. Select exactly one Argo and a cycle log appears
beneath the list, showing each wake-up: the time, what happened, which child it
concerned, and a one-line summary. Open it from the command palette with **Open
fleet view**.

## Delete

Right-click an Argo row and choose **Delete**. Pulse asks what to do with its
live children:

- **Keep children** deletes the Argo and leaves its threads open for you.
- **Close children** deletes the Argo and closes the threads it opened.

Deleting an Argo never deletes your history.
