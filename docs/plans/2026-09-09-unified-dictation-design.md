# Unified dictation settings and deferred meeting transcription

Settings > Dictation owns local enablement, model installation, dictation history and meeting defaults. Office contains meeting capture and saved recordings, with a link to Settings. One enabled preference persists before model readiness. Recording is independent of the speech model; transcription is queued until a verified Parakeet model is available. A notes model is not a recording dependency.

Meetily references: [capture and speech recognition](https://github.com/Zackriya-Solutions/meetily), [separate summary providers](https://docs.meetily.ai/features/summary-providers), and [retranscription](https://docs.meetily.ai/features/retranscription). Speech transcription and generated notes remain separate outputs.

The desktop adapter persists the every-meeting preference and pending recording IDs with its existing atomic preferences file. Download completion and app startup trigger the serialized processing queue. No recording starts automatically. Processing pauses during live capture. Failed jobs retain their recording and require retry; users can keep audio only instead. Native saved transcripts prevent duplicate transcription after a crash between transcript save and queue acknowledgement.

The native worker already captures microphone and system audio without a model, so this change reuses its packaged implementation. Dictation remains its existing hold-to-talk interaction. This delivery does not implement live streaming transcripts, speaker diarization, alternate speech models, or a meeting-notes generation service.

Web and mobile show device capability boundaries. The desktop bridge always addresses the capturing desktop, including while a remote coding environment is selected. Settings navigation, search and command palette reach the same page. Browser-control initialization failed in this session; visual verification is not claimed.

## Published and installed

[Windows preview 20260909.2](https://github.com/Polyphron-AI/pulse-code/releases/tag/v0.0.33-pulse-preview.20260909.2) was built from `4c600a0aac8051b4e9b0a893baa9642a1d92f2ca`. Installer SHA-256: `47abf74abaabfe4605f6aa2d18bf21ff755ca87c16005049d5e31ded7ff22bf1`.

The focused Talk, model, worker packaging and Settings search checks passed, as did scoped desktop/web typechecks and targeted lint. A native integration check read synthetic audio-only metadata through the packaged worker without recording personal audio. The packaged desktop, Office dependencies, server payload and Dictation route passed their checks. All seven uploaded assets matched local hashes and sizes before publication. Stable release `v0.0.37` remains latest.

The installer completed with exit code 0. Windows registered preview version `0.0.33-pulse-preview.20260909.2`. Installed desktop/server archives and Talk worker hashes match the release payload; installed code reports the expected source commit and contains the Dictation page and queue controls. The app was not launched against personal state during verification.
