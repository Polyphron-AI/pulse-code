# Pulse Talq text fields

Implemented on `feat/voice-text-fields` in the `office-mailbox-merge` worktree, based on the merged Office/mailbox commit. Preserve other worktrees and the unrelated `.grok` directory.

## Behavior

Web and Electron use the same local Parakeet controller for editable inputs, textareas and contenteditable editors. A transient field microphone, the configured shortcut, and the command palette select the destination. The palette captures its destination before opening; dictating directly into palette search remains supported. Chat retains its existing microphone.

Insertion captures the field and selection, preserves prose word boundaries, honors character limits, supports browser editor undo, and updates React forms and Lexical state. Changed, unavailable or incompatible fields retain a recoverable transcript. Dictation does not submit forms. Passwords, read-only and disabled controls, shortcut capture, non-text controls, embedded third-party pages and terminal sessions are excluded. Native mobile continues to use keyboard dictation.

The microphone sits at the field's trailing edge with 48px reserved text space. Its DOM parent keeps it in local Tab order, including dialogs and ShadowRoot editors. Coarse-pointer size is 44×44px. The status panel accounts for the mobile visual viewport. No server, wire contract or provider adapter changes were needed; audio stays on the capturing device.

## Verification

- Web typecheck and targeted voice/command-palette lint passed.
- Ten focused tests passed across VoiceController and dictation word boundaries.
- Real Edge browser with synthetic mail and simulated transcripts verified subject/body insertion and saved drafts, shortcut routing, command-palette destination restoration, modal search dictation, changed-field recovery and Escape cancellation.
- DOM checks covered selection replacement, read-only/password/disabled exclusions, character limits, incompatible number recovery, removed targets, editor undo and ShadowRoot selections.
- Actual ComposerPromptEditor test replaced selected text and confirmed both Lexical's onChange model and rendered text updated.
- Final Tab/Enter check reached the Mail microphone and inserted speech. Modal search Tab access passed. A coarse-pointer mobile browser at 390×844 measured a 44×44px control and no horizontal overflow.
- Impeccable reviewer scored keyboard access and touch target findings resolved, with a ship verdict for those fixes. Screenshots are temporary `talq-desktop.png`, `talq-mobile.png`, and `talq-dialog.png` in the Windows temporary directory.

Real microphone/audio quality, Electron global dictation and native mobile were not retested. Browser fixtures block outbound mail and use no real correspondence.

## Retained test environment

Disposable state: `.t3/voice-fields-review`. Web port 6803; server port 14843. The server was restarted for the final checks. Use the test-t3-app skill to reconnect; do not use live Pulse state. Browser fixture source is the ignored `.t3/office-ui-fixtures.mjs` and must be installed explicitly in a review page.
