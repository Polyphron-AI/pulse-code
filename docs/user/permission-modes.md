# Permission Modes

A permission mode controls how much the agent does on its own and when it stops to ask you.

The mode is set per thread, from the mode control in the message composer. Changing it in one
thread does not change any other thread. A thread created from inside another thread keeps that
thread's mode; otherwise new threads start in **Full access** unless you pick something else
before sending.

## The Modes

**Supervised**: ask before commands and file changes. The agent pauses and shows you what it
wants to run or edit, and waits for approval. Work outside the workspace is restricted.

**Auto-accept edits**: auto-approve edits, ask before other actions. File changes go through
without prompting; commands and anything else still stop for approval.

**Auto**: routine actions proceed without you; risky ones still ask. How this is enforced depends
on the provider: Codex delegates routine approvals to an AI reviewer, Claude uses its own auto
permission mode, and providers without an equivalent (such as OpenCode) fall back to asking, like
Supervised.

**Full access**: allow commands and edits without prompts. The default. The agent runs
unattended until it finishes or asks a question of its own.

Approvals appear inline in the conversation. Approve or reject one and the agent continues from
there.

## Choosing a Mode

Use **Full access** for work in a worktree or a sandbox you can throw away.

Use **Supervised** on a repository where an unwanted command is expensive, or the first time you
run an unfamiliar task.

**Auto-accept edits** suits refactors where the edits are the point and you only care about the
shell commands.

## Provider Behavior

Each provider maps these modes onto its own approval and sandbox settings. Codex, for example,
translates the mode into its approval policy and sandbox level, so **Supervised** runs the CLI
with prompting enabled and a restricted workspace while **Full access** disables both. The
labels above describe what you get; the exact per-provider translation is internal and may
change.

Mobile offers the same four modes with the same labels and descriptions.

## Watchdog

A watchdog is a second agent that sits on one thread and answers on your behalf. When the thread
stops for a permission approval or a question, the watchdog reads your rules and either responds
or hands the thread back to you. It is the way to leave a **Supervised** thread running while you
are away without approving everything in advance.

Turn it on from the eye button in the thread header, from the thread's right-click menu in the
sidebar, or from the command palette with "Toggle watchdog". The Watchdog tab in the right panel
holds the rules: plain sentences such as "Approve safe read-only commands. Ask me before anything
that deletes files or pushes." You can also give the watchdog its own model; leave it on the
default text model if you have no preference. Rules save when you click away from the box.

Threads with a watchdog show an eye marker in the sidebar, and the panel counts how many times the
watchdog has stepped in.

**Watchdog stuck** means the watchdog reached something your rules do not cover and stopped rather
than guess. The thread waits for you, the sidebar marker turns amber, and the Watchdog tab shows
the reason it gave. Press **Take action** to clear the escalation and put the cursor back in the
composer so you can answer the agent yourself. The watchdog stays on and picks up again from the
next question.

On mobile the watchdog works the same way, minus the model picker: tap the eye in the thread header
to switch it on or off, press and hold it to edit the rules, and use the **Take action** button on
the "Watchdog stuck" banner in the thread.
