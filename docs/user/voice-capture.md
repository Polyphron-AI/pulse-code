# Voice capture

Use the microphone above Send to dictate into your current draft. Click again to stop. Parakeet transcribes your speech on the device you are using and adds the text to the draft. Review or edit it, then send it yourself.

The first recording downloads Parakeet's speech model. Later recordings reuse its local cache. The model loads when you use voice capture, not when you open a chat. Recordings stop after two minutes. Cancel discards the recording and leaves your draft alone. Navigating away from its composer cancels that composer's capture.

The default shortcut is **Ctrl+Shift+Space**. Press once to record and again to stop. Change it in **Settings → General → Voice capture**. For example, Windows desktop supports `ctrl+windows` without another key. The Keybindings page also links to these controls. The command palette includes **Start or stop voice capture**.

In the Windows desktop app, enable **Use voice shortcut outside Pulse Code** to dictate into another app's focused text field. Enable **Show floating voice control (hover mode)** for a small control near the bottom of the screen. These switches are independent: hiding the control leaves the global shortcut available.

Click the target text field before starting. Keep that field focused until transcription finishes. If the field changes or Windows cannot insert text, Pulse Code keeps the transcript available to copy. Some apps do not expose accessible text fields or accept simulated typing. Voice capture does not press Enter or submit another app's form.

In the browser, voice capture works within Pulse Code and needs microphone permission on HTTPS or localhost. Remote server connections work because audio is processed on the capturing device. Desktop-wide dictation currently requires Windows. The native mobile app continues to use its keyboard's dictation feature.

Voice preferences are saved on this device. Turning off both desktop switches stops the desktop voice helper. Voice capture uses Parakeet's transcript directly; Luna cleanup is not part of this version.
