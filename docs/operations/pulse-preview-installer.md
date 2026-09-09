# Combined Pulse preview installer

The first Code, Talk and Office Windows x64 preview is published at:

https://github.com/Polyphron-AI/pulse-code/releases/tag/v0.0.33-pulse-preview.20260908.2

Desktop source commit: `78c81b8fa686b01af939d62c56da2f56244685ed` on `feat/pulse-talk-office`.

Native source: `c52cdf8f8a0ecbe3bad9e2e3995f9ba99a262d7a` on `feature/P-2026-09-08-talk-worker` in https://github.com/Qblaauw/PulseTalk.

The installer SHA-256 is `1c3820e7ae495aa9167339231da03049c66eb29d7658dde5013ea729aa1fe60a`. GitHub's uploaded asset digest matched before publication. The release includes the installer, blockmap, checksums and a public verification manifest.

## Build and publish

Build the native worker using its `native-worker/package.ps1`, then run `native-worker/smoke-package.ps1`. Set `PULSE_TALK_WORKER_DIR` to the resulting `native-worker/dist/windows-x64` directory when building this desktop checkout. Install workspace dependencies with `vp i` and run the focused Office, Talk and installer tests before packaging.

```powershell
vp run dist:desktop:win:x64 --build-version <new-pulse-preview-version> --output-dir <fresh-output-directory> --keep-stage
```

Commit relevant source changes, push the reviewed component branches, create a GitHub draft prerelease targeting the exact built desktop commit, and upload the installer, blockmap and verification files. Check the uploaded asset's SHA-256 against the local candidate before publishing. Keep `--prerelease --latest=false`; a preview must not replace the existing stable release. Return the published GitHub link to the maintainer.

This commit adds publication documentation only and does not change the published executable. The preview is unsigned, Google/Microsoft registration remains pending, and real account/audio/installation acceptance has not been completed. The existing stable Pulse Code v0.0.37 is a separate release.
