# Brand icons

The three Icon Composer projects are the source of truth for full application icons:

- `dev/app-icon.icon`
- `nightly/app-icon.icon`
- `prod/app-icon.icon`

Each project uses `text.svg` for the Pulse mark and `background.svg` when the background is a vector layer. Additional layers use semantic names that describe their role and placement.

Run `vp run icons:export` from the repository root to regenerate the tracked iOS, Linux, Windows, and web assets. The development web exports are also copied to `apps/web/public` for the browser favicon and splash screen. Run `vp run icons:check` to verify that the generated assets and public copies match their sources without changing files.

Exporting requires Icon Composer 1.2 or newer on macOS. The script selects the newest compatible exporter from Xcode or a standalone Icon Composer installation. Icon Composer 1.x renders generation 26 natively; version 2 and newer are explicitly pinned to design generation 26. Set `ICON_COMPOSER_TOOL` to the full path of `Icon Composer.app/Contents/Executables/ictool` to override automatic discovery.

## macOS exports

The command-line exporter exposes the classic `macOS pre-Tahoe` body through its native preview command, but it returns only the 824×824 body. The export script places that native body at a 100-pixel inset on the tracked 1024×1024 native shell. Copy compositing replaces the complete center—including transparent pixels—so no previous mark can survive, while the original Icon Composer shadow outside the body remains byte-for-byte intact.

The result is a 1024×1024 PNG with the classic macOS safe area: the opaque icon body is 824×824, inset 100 pixels on every side, with only the native Icon Composer shadow extending into the surrounding transparent canvas. The native shell PNG must already exist for a new variant; subsequent exports are deterministic and idempotent.

Do not edit the generated PNG or ICO files directly. Use `vp run icons:export` locally on macOS or dispatch the `Export Pulse Code icons` workflow.
