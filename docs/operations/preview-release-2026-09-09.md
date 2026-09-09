# Pulse preview .3, 9 September 2026

[Preview installer and verification receipts](https://github.com/Polyphron-AI/pulse-code/releases/tag/pulse-preview-20260909.3)

The Windows x64 preview incorporates the first 11 T3 correctness fixes and preserves the previous preview's Office, Talk, dictation settings, queued transcription, and durable session outputs. It is an unsigned prerelease; the stable release was not changed.

- Source: `7669022658792a8314cc773091552c09ccbb8ceb`, branch `release/pulse-preview-20260909-3`.
- Package version: `0.0.33-pulse-preview.20260909.3`.
- Previous preview source: `4c600a0aac8051b4e9b0a893baa9642a1d92f2ca`.
- Correctness integration: `05ee9e7ab408ff2c047d5500a51370b06177e67c`.
- Reconciled develop: `3f18c538c87f03c67c7122a85517221c8f7f6472`, retaining newer Office/voice commits from origin.
- Installer SHA-256: `666d37eaaee151784d21103e5402b83223d4ad8cf854e6ff32c14c7bdbd98b87`.

The packaged desktop, client, and actual server CLI report the same preview version. Packaged source metadata matches the release commit. Native payload checks, Office dependency resolution, dictation/queue checks, and Talk worker hello/status/list/shutdown passed. The Talk worker was reused from the verified previous build; it was not rebuilt.

Focused candidate checks passed 312 tests, with one skip and one previously reproduced Windows-invalid newline-path fixture failure. Server and web typechecks passed. Desktop passed with `--composite false`; its standard check retains baseline TS6307 file-list errors. Public receipts record the exact checks. All eight uploaded files matched their local sizes and SHA-256 digests before publication.

The tag `pulse-preview-20260909.3` deliberately avoids the generic workflow's `v*.*.*` trigger. That workflow can publish npm and hosted services; draft and prerelease flags do not restrict it to installers. The preview was uploaded as a draft, verified, then published with prerelease enabled and latest disabled. No workflow run existed for the release source at publication.

The missing Linux PTY prebuild still prevents the packaged WSL backend from starting. Google/Microsoft OAuth app registrations remain unconfigured. No live transcript, diarization, or meeting-notes generation is included. Hardware audio, browser acceptance, and local installation were not performed. Publication does not mean an existing desktop process was restarted or upgraded.

This remains a partial upstream sync. The recorded T3 baseline was not advanced to v0.0.40.
