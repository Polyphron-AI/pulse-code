# Unified dictation settings and deferred meeting transcription

Settings > Dictation owns local enablement, model installation, dictation history and meeting defaults. Office contains meeting capture and saved recordings, with a link to Settings. One enabled preference persists before model readiness. Recording is independent of the speech model; transcription is queued until a verified Parakeet model is available. A notes model is not a recording dependency.

Meetily references: [capture and speech recognition](https://github.com/Zackriya-Solutions/meetily), [separate summary providers](https://docs.meetily.ai/features/summary-providers), and [retranscription](https://docs.meetily.ai/features/retranscription). Speech transcription and generated notes remain separate outputs.

The desktop adapter persists the every-meeting preference and pending recording IDs with its existing atomic preferences file. Download completion and app startup trigger the serialized processing queue. No recording starts automatically. Processing pauses during live capture. Failed jobs retain their recording and require retry; users can keep audio only instead. Native saved transcripts prevent duplicate transcription after a crash between transcript save and queue acknowledgement.

The native worker already captures microphone and system audio without a model, so this change reuses its packaged implementation. Dictation remains its existing hold-to-talk interaction. This delivery does not implement live streaming transcripts, speaker diarization, alternate speech models, or a meeting-notes generation service.

Web and mobile show device capability boundaries. The desktop bridge always addresses the capturing desktop, including while a remote coding environment is selected. Settings navigation, search and command palette reach the same page. Browser-control initialization failed in this session; visual verification is not claimed.
