# Pulse Next Windows installer

How to assemble a Pulse Next Windows installer from `develop`, and why its
identity is deliberately separate from T3 Code's.

## Why a separate identity

Pulse Next showed a Pulse name while telling Windows it was T3 Code. An
installer built from that state would have written into an installed T3 Code's
program folder, registered the `t3code://` scheme, read `%APPDATA%\t3code` and
used `%USERPROFILE%\.t3`, which is the developer's live database. A machine has
to be able to hold Pulse Next, T3 Code, Pulse Code (Alpha) and Pulse Preview at
the same time without any of them touching another's files.

Everything the operating system uses to tell the two apart now comes from one
module, `packages/shared/src/productIdentity.ts`:

| What                    | Pulse Next                        | T3 Code                |
| ----------------------- | --------------------------------- | ---------------------- |
| appId / AppUserModelId  | `ai.polyphron.pulsenext`          | `com.t3tools.t3code`   |
| Executable and WM class | `pulsenext`                       | `t3code`               |
| URL schemes             | `pulsenext`, `pulsenext-dev`      | `t3code`, `t3code-dev` |
| Product name            | `Pulse Next (Alpha)`              | `T3 Code (Alpha)`      |
| Installer file          | `Pulse-Next-<version>-<arch>.exe` | `T3-Code-...`          |
| Electron user data      | `%APPDATA%\pulsenext`             | `%APPDATA%\t3code`     |
| Home base dir           | `%USERPROFILE%\.pulse-next`       | `%USERPROFILE%\.t3`    |

Development variants carry the `-dev` / `.dev` suffix of the same names.

Pulse Next does not look for, adopt or migrate a T3 Code user-data directory.
Installing it beside T3 Code starts from empty Pulse Next state. That is the
intended behaviour, not a missing migration.

`T3CODE_HOME` still overrides the base dir, and still wins over the default. The
environment variable names are unchanged on purpose: renaming them would break
every existing launcher, scheduled task and script without buying isolation.

Two things stay on T3's names because they are not desktop install identity: the
server CLI's own default home (`apps/server/src/os-jank.ts`), and the WSL
backend's Linux-side runtime cache under `$HOME/.t3/wsl-runtime` inside the WSL
distro.

## Build the installer

Build on Windows x64. The preflight needs Rust with the `x86_64-pc-windows-msvc`
target, Python 3, and VS 2022 Build Tools with the C++ workload, a Windows SDK
and the **MSVC v143 x64/x86 Spectre-mitigated libs** component. Without the
Spectre libraries the build stops before staging with a prerequisites error.
Artifacts land in `release/` unless `--output-dir` says otherwise. Use a `-pulse-next.` version suffix so the file is never mistaken for
a T3 build, and keep the stage directory so the packaged config can be read back.

```powershell
vp run dist:desktop:win:x64 --build-version 0.1.0-pulse-next.20260913.1 --output-dir release\pulse-next --keep-stage
```

The underlying script is `scripts/build-desktop-artifact.ts`; run
`node scripts/build-desktop-artifact.ts --help` for the full flag list. If the
task runner swallows the extra flags, invoke the script directly with
`--platform win --target nsis --arch x64` and the same flags.

Record the artifact so a later install can be traced to a revision:

```powershell
$installer = Get-ChildItem release\pulse-next\Pulse-Next-*.exe | Select-Object -First 1
Get-FileHash $installer -Algorithm SHA256 | Format-List
git rev-parse HEAD
```

Keep the version, commit and SHA-256 together with whatever state the install was
tested against. An installer with no recorded hash is not evidence.

## Where state lives after installing

- `%APPDATA%\pulsenext` holds the Electron user data, including the Clerk
  session and the single-instance lock.
- `%USERPROFILE%\.pulse-next\userdata` holds the database, settings and logs.
- The Start menu entry, taskbar grouping and `pulsenext://` OAuth callbacks all
  resolve to `ai.polyphron.pulsenext`.

To remove a test install, uninstall it and delete those two directories. Neither
path is shared with any T3 Code or Pulse Code install, so removing them cannot
damage another application's state.

## Side-by-side notes

- Install T3 Code first if you want to confirm coexistence; the Pulse Next
  installer uses its own program folder and leaves the other entry alone.
- Only one application can hold a given URL scheme. The two register different
  schemes, so OAuth callbacks reach the app that issued them.
- Both apps can run at once. The single-instance lock is scoped to the user-data
  directory, which differs.
- Running the repo's dev launcher registers `ai.polyphron.pulsenext.dev.<repo>`,
  which is distinct again from an installed Pulse Next.

## No publication, no update feed, no signing yet

None of this is authorised yet, and the build reflects that:

- **No update feed.** `createBuildConfig` only emits an electron-builder
  `publish` block when `T3CODE_DESKTOP_UPDATE_REPOSITORY` or
  `GITHUB_REPOSITORY` is set. With neither set, electron-builder writes no
  `app-update.yml` into the package, and `DesktopUpdates` treats a missing or
  provider-less file as "no update feed is configured" and disables automatic
  updates. A locally built installer therefore cannot reach T3's GitHub releases.
  Do not set either variable for a Pulse Next build until a Pulse feed exists.
- **No publication.** Nothing here pushes a release, tags a commit, or uploads an
  artifact. Hand the installer over as a file.
- **No signing.** The build is unsigned, so Windows SmartScreen will warn on
  first run. Signing needs its own credentials and its own decision.
- **No Pulse icon yet.** The packaged app still carries T3's mark. The icon
  pipeline exports from an Icon Composer project through macOS-only `ictool`,
  and no Pulse source artwork exists in the repository. Replacing the icon is a
  separate task.

## Reference build

The first Pulse Next installer built from `develop`:

| Field   | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| Date    | 2026-09-13                                                         |
| Commit  | `d0f41fb958a951779330b7456b85bbe0bdabe2ed`                         |
| Version | `0.1.0-pulse-next.20260913.1`                                      |
| File    | `Pulse-Next-0.1.0-pulse-next.20260913.1-x64.exe`                   |
| SHA-256 | `98afe7b0919503493705852b64d53407d15520c8d3323e87e4c8a6954e537b9f` |

Unsigned, no WSL prebuild, not installed, not published.
