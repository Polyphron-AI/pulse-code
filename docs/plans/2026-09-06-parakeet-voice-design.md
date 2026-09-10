# Parakeet voice capture

Capture speech from a mic button above Send or an editable Ctrl+Shift+Space shortcut. Recording is explicit and the transcript is inserted into the draft without sending it. Cancel and errors preserve existing text. Load Parakeet lazily on the capturing device and keep inference off the UI thread.

Desktop adds an optional floating control matching Pulse Talk: compact at the bottom of the screen, expanded during recording. A global shortcut and the control can dictate into another application's focused input. Remember the target before capture; never deliver to a different target after focus changes. Windows modifier-only Ctrl+Windows requires a native keyboard hook. Hover visibility is independent of the shortcut.

Web supports composer dictation, including remote environments; system-wide capture belongs to desktop. Mobile keeps its native keyboard dictation for this iteration. All coding providers receive ordinary text. Luna cleanup remains a separate follow-up.

Verify recording lifecycle, draft ownership, shortcut parsing, desktop settings and target delivery with focused tests and scoped typechecks. Browser and live desktop interaction require separate user authorization.
