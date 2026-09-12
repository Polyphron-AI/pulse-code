# Pulse Preview installer

> For maintainers. Using Pulse Code? See [docs/user](../user/).

Pulse Preview is the unsigned Windows x64 prerelease of Pulse Code. It installs beside the stable
Pulse Code (Alpha) app under the product name **Pulse Preview**, gets its own Start Menu and Desktop
shortcuts, and does not auto-update. Each new preview build is installed by hand.

## Current preview

| Item                         | Value                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag                          | `pulse-preview-20260911.1`                                                                                                                  |
| Release page                 | https://github.com/Polyphron-AI/pulse-code/releases/tag/pulse-preview-20260911.1                                                            |
| Installer                    | https://github.com/Polyphron-AI/pulse-code/releases/download/pulse-preview-20260911.1/Pulse-Preview-0.0.33-pulse-preview.20260911.1-x64.exe |
| Package version              | `0.0.33-pulse-preview.20260911.1`                                                                                                           |
| Installer SHA-256            | `846c0571f2c1f02eb9b2f3cb8e7b8db7d3449b28d0bd494b9b164162a4f35b25`                                                                          |
| Source                       | `272873acc5fe1bfd4f5e1d5027487d8746d7115e` (`refactor/upstream-compatibility`)                                                              |
| Installed on the dev machine | 11 September 2026                                                                                                                           |

Update this table whenever a new preview is published or installed.

## Where installers live

- **GitHub Releases.** Every preview is a prerelease tagged `pulse-preview-<YYYYMMDD>.<n>` in
  `Polyphron-AI/pulse-code`. The tag deliberately avoids the `v*.*.*` pattern so the full release
  workflow (npm, hosted web, AUR) never runs for a preview. Each release carries the installer, its
  `.blockmap`, `SHA256SUMS.txt`, and `verification.json`.

  ```powershell
  gh release list --repo Polyphron-AI/pulse-code --limit 10
  gh release view <tag> --repo Polyphron-AI/pulse-code --json url,assets --jq '.url, (.assets[] | select(.name|endswith(".exe")) | .url)'
  ```

- **Local archive.** Built installers are filed under `F:\Dev Ops\Pulse\output\windows-preview\`,
  one folder per build named after the preview suffix, for example `20260911.1-compatibility-refactor\`.
- **Build output.** `dist:desktop:win:x64` writes to the `--output-dir` you pass (default `release/`
  in the checkout). With `--keep-stage`, the packaged files also remain in the temporary stage
  directory `%TEMP%\t3code-desktop-win-stage-*\app\dist\` until you delete it. Copy the installer and
  blockmap into the local archive before the stage directory is cleaned up.

## Build a preview

1. Check out the release branch for the preview and run `vp i`.
2. If the build must include the Talk worker, build it from the PulseTalk repository with
   `native-worker/package.ps1`, run `native-worker/smoke-package.ps1`, and point
   `PULSE_TALK_WORKER_DIR` at the resulting `native-worker/dist/windows-x64` directory.
3. Run the focused tests for the surfaces the preview changes, then package:

   ```powershell
   vp run dist:desktop:win:x64 --build-version 0.0.33-pulse-preview.<YYYYMMDD>.<n> --output-dir "F:\Dev Ops\Pulse\output\windows-preview\<YYYYMMDD>.<n>-<short-label>" --keep-stage
   ```

   The `-pulse-preview.` version suffix is what switches the product name, app ID, protocol scheme,
   and data directories to the preview identity. See `scripts/build-desktop-artifact.ts`.

4. Record the SHA-256 of the installer:

   ```powershell
   Get-FileHash -Algorithm SHA256 "<output-dir>\Pulse-Preview-*-x64.exe"
   ```

## Publish a preview

1. Commit the source changes and push the branch so the release can target the exact built commit.
2. Create a draft prerelease with `gh release create <tag> --draft --prerelease --latest=false
--target <commit>` and upload the installer, blockmap, `SHA256SUMS.txt`, and `verification.json`.
3. Compare the uploaded asset digests (`gh release view <tag> --json assets`) with the local hashes.
   Publish only when they match.
4. Update the **Current preview** table above and hand the release link to the maintainer.

## Install a preview locally

The installer is a one-click, per-user NSIS package. It replaces whatever is in
`%LOCALAPPDATA%\Programs\pulsecode\` and rewrites the **Pulse Preview** uninstall entry.

1. Verify the file hash against the release's `SHA256SUMS.txt`.
2. Make sure no `pulsecode.exe` process is running (`Get-Process pulsecode`).
3. Install silently:

   ```powershell
   Start-Process -Wait -FilePath "<path>\Pulse-Preview-<version>-x64.exe" -ArgumentList '/S'
   ```

   Drop `/S` to see the normal installer window instead.

4. Confirm what is installed:

   ```powershell
   Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
     Where-Object { $_.DisplayName -like 'Pulse*' } |
     Select-Object DisplayName, DisplayVersion
   ```

   The packaged version is also readable from `resources\app.asar` in the install folder.

The installer is unsigned, so Windows SmartScreen may warn on first launch. Preview state lives in
`%APPDATA%\pulse-preview` and `%USERPROFILE%\.pulse-preview\userdata`; stable Pulse Code state is
not touched.

## Known limitations

- The packaged WSL backend cannot start because the Linux `pty.node` prebuild is not bundled
  (`G-2026-08-21-windows-wsl-node-pty-prebuild` in `project/known-gaps.md`).
- Google and Microsoft OAuth app registrations for Office are not configured.
- Only Windows x64 is built. No ARM64, macOS, or Linux preview exists.
- The stable **Pulse Code (Alpha)** uninstall entry shares the same install folder as the preview,
  so installing a preview overwrites the stable binaries in that folder.

## History

- `pulse-preview-20260911.1`, 11 September 2026: compatibility refactor. Installed locally.
- `pulse-preview-20260910.8`, 10 September 2026: T3 v0.0.40 compatibility and Warden.
- `pulse-preview-20260910.4`, `20260910.3`, `20260910.2`, `20260910.1`: V40 batches, file downloads,
  MCP search, skill search.
- `pulse-preview-20260909.3`, 9 September 2026: first 11 T3 correctness fixes. Source
  `7669022658792a8314cc773091552c09ccbb8ceb`, SHA-256
  `666d37eaaee151784d21103e5402b83223d4ad8cf854e6ff32c14c7bdbd98b87`.
- `v0.0.33-pulse-preview.20260908.2`, 8 September 2026: first combined Code, Talk, and Office preview.
  Desktop source `78c81b8fa686b01af939d62c56da2f56244685ed` on `feat/pulse-talk-office`, Talk worker
  `c52cdf8f8a0ecbe3bad9e2e3995f9ba99a262d7a` on `feature/P-2026-09-08-talk-worker`, SHA-256
  `1c3820e7ae495aa9167339231da03049c66eb29d7658dde5013ea729aa1fe60a`.
