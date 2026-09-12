# Luna, your assistant

Luna is the assistant that comes with every Pulse Code environment. She reads
your projects and answers questions about them. She never edits files, runs
commands, or touches your git history, so you can ask her anything without
watching what she does.

There is one Luna per environment, and she keeps one conversation. Open her,
ask, come back tomorrow, and the thread is still there.

## Open Luna

- In the sidebar, her row sits above your projects. Select it to open the panel
  beside whatever thread you are already in.
- From the command palette, choose **Open Luna**.
- The **Assistants** tab in the right panel also sends you to the panel.

The panel stays open while you move between threads, so you can keep a question
going while you work.

## Ask her something

The first time you open Luna, the panel is a single box. Type a question and
press Enter. She creates her conversation on that first message; from then on
the panel shows the full thread, with the same composer, transcript, and
controls as any other chat.

Good first questions: what changed in this project today, where a piece of
behavior lives, what a thread ended up deciding, what is still open.

## Rename her

Select her name in the panel header and type a new one. The name is what the
sidebar, the panel, and the command palette show. Renaming keeps the
conversation.

## Start over

**Reset** in the panel header closes the current conversation and starts a
fresh one. Her name and settings survive a reset; only the history goes. The
old conversation is archived, not deleted.

Reset is available once there is something to reset. On a brand new Luna the
button is inactive.

## On your phone

The mobile app shows Luna above the thread list. Tap her to read the
conversation and reply; tap **Reset** on the row to start a new one. Renaming
and settings live in the desktop and web apps.

## What she can and cannot do

Luna reads. She can look through files, search your projects, and fetch pages
on the web. She cannot edit files, run terminal commands, or make commits.

How strictly that is enforced depends on the provider behind her:

- **Claude** and **OpenCode** enforce the read-only tool list directly. Writes
  are refused by the provider, not just discouraged.
- **Codex**, **Cursor**, **Grok**, and **OMP** have no tool allow-list. Luna
  runs there with every write gated behind an approval prompt, so nothing
  happens without you saying yes.

If you want work done rather than answered, hand it to a thread or to Argo.
Luna is for asking.
