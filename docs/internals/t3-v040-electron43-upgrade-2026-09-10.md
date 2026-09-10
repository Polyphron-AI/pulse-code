# Electron 43.4.1 dependency upgrade

This separate post-.6 batch implements fixed-target source 4a9d2d0ce. It pins the desktop dependency to Electron 43.4.1, updates its resolved lockfile dependency graph, and removes the obsolete WebSQL value from BrowserSession.clearStorageData and its test. Pulse package identity, Office/Talk dependencies, updater rollback feeds and release channels are retained.

The frozen .6 build used Electron 41.5.0. Earlier ledger wording about "Electron 43 recording" describes the adapted recording fixes from ef7014d85, not an already completed runtime upgrade. Those fixes use setDisplayMediaRequestHandler and WebFrameMain capture; Electron 41.5.0 already declares those APIs. The old package version was a dependency parity gap, not evidence that all recording failed on 41.

Verification for this dependency batch:

- Frozen dependency installation and desktop typechecking passed against Electron 43.4.1.
- 128 tests passed across BrowserSession, PreviewManager, ElectronProtocol, browserRecording, browserRecordingScope and hostedBrowserWebviewStyle.
- An isolated Electron process using disposable worktree user/session paths created no windows. It reported Electron 43.4.1, Chromium 150.0.7871.224 and Node 24.18.1; a custom protocol handled an in-process net.fetch response, and a display-media handler registered and cleared successfully.
- Scoped lint passed for the changed BrowserSession files.

This does not verify capture of a real page or microphone, macOS rendering, packaged startup, native sidecar loading, signing, installer updates or publication. The primary agent owns those later .7 packaging and client checks. No .6 files or artifacts were changed by this worktree.
