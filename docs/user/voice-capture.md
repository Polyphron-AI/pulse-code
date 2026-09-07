# Pulse Talq voice input

Focus an editable text field in Pulse and click its Pulse Talq control, or use your voice shortcut. This works in email recipients, subjects and messages, task and feedback forms, searches, settings, and text editors. Chat keeps its microphone above Send. Parakeet transcribes on your device. Review or edit the result before submitting it yourself.

The first recording downloads Parakeet's speech model. Later recordings reuse its local cache. The model loads when you use voice capture, not when you open a chat. Recordings stop after two minutes. Cancel discards the recording and leaves your draft alone. Leaving a chat composer cancels capture started with its microphone. For other fields, a transcript remains available to copy if its destination closes or changes.

The default shortcut is **Ctrl+Shift+Space**. Press once to record and again to stop. Change it in **Settings → General → Voice capture**. For example, Windows desktop supports `ctrl+windows` without another key. The Keybindings page also links to these controls. The command palette includes **Start or stop Pulse Talq**. Focus the destination field before opening the palette; this action returns the transcript to that field.

In the Windows desktop app, enable **Use voice shortcut outside Pulse Code** to dictate into another app's focused text field. Enable **Show floating voice control (hover mode)** for a small control near the bottom of the screen. These switches are independent: hiding the control leaves the global shortcut available.

Click the target text field before starting. Keep that field focused until transcription finishes. If the field changes or Windows cannot insert text, Pulse Code keeps the transcript available to copy. Some apps do not expose accessible text fields or accept simulated typing. Voice capture does not press Enter or submit another app's form.

In the browser, voice capture works within Pulse Code and needs microphone permission on HTTPS or localhost. Remote server connections work because audio is processed on the capturing device. Desktop-wide dictation currently requires Windows. The native mobile app continues to use its keyboard's dictation feature.

Voice preferences are saved on this device. Turning off both desktop switches stops the desktop voice helper. Voice capture uses Parakeet's transcript directly; Luna cleanup is not part of this version.

## Field behavior

Dictation inserts at the captured caret or replaces the selected text. Prose receives word spacing when needed. If you edit the field, close it, or navigate away while speech is being processed, Pulse keeps the transcript for recovery instead of overwriting your work. It never presses Enter or submits a form. Character limits still apply.

Password, disabled and read-only fields, file pickers, date controls, and shortcut-recording controls do not accept dictation. Embedded third-party pages and terminal sessions do not participate in Pulse's text-field routing. The native mobile app uses the system keyboard's dictation; the Pulse Talq field control is available in the web client, including mobile browsers, and the desktop client.
